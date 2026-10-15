import type { Companion } from '../../types';

/** Minimal shape these helpers need, so they are easy to test and reuse. */
export interface ItemLike {
    filePath: string;
    displayName: string;
    status: string;
    year?: number | null;
    finished?: string | null;
    dateCompleted?: number | null;
    userRating?: number | null;
    companions?: Companion[];
    rawFields?: Record<string, unknown>;
}

const PENDING_STATUSES = new Set(['planned', 'watching', 'paused']);
const closedCompanion = (status: Companion['status']): boolean => status === 'completed' || status === 'dropped';

// ---------------------------------------------------------------------------
// Title matching for automatic metadata linking
// ---------------------------------------------------------------------------

export function normalizeTitle(value: string): string {
    return value
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLocaleLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\b(the|a|an|el|la|los|las|un|una|le|les|der|die|das)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** 0..1 similarity between two titles (1 = identical once normalized). */
export function titleSimilarity(left: string, right: string): number {
    const a = normalizeTitle(left);
    const b = normalizeTitle(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const tokensA = new Set(a.split(' '));
    const tokensB = new Set(b.split(' '));
    let shared = 0;
    for (const token of tokensA) if (tokensB.has(token)) shared++;
    const union = tokensA.size + tokensB.size - shared;
    const jaccard = union ? shared / union : 0;
    const contains = (a.includes(b) || b.includes(a)) ? 0.15 : 0;
    return Math.min(0.99, jaccard + contains);
}

export interface MatchCandidate { title: string; year?: string | number | null }
export interface MatchResult<T> { candidate: T | null; confident: boolean; score: number }

export const CONFIDENT_MATCH_SCORE = 0.8;

/**
 * Picks the search result that best matches a note's title (and year when known).
 * `confident` is false when nothing is close enough, so callers can ask the user
 * or fall back to the first result only when explicitly allowed.
 */
export function pickBestMatch<T extends MatchCandidate>(
    title: string,
    year: number | string | null | undefined,
    candidates: T[]
): MatchResult<T> {
    let best: T | null = null;
    let bestScore = 0;
    const wantedYear = year ? Number(year) : NaN;
    for (const candidate of candidates) {
        let score = titleSimilarity(title, candidate.title);
        const candidateYear = candidate.year ? Number(String(candidate.year).slice(0, 4)) : NaN;
        if (Number.isFinite(wantedYear) && Number.isFinite(candidateYear)) {
            if (wantedYear === candidateYear) score = Math.min(1, score + 0.1);
            else if (Math.abs(wantedYear - candidateYear) > 1) score -= 0.15;
        }
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return { candidate: best, confident: bestScore >= CONFIDENT_MATCH_SCORE, score: bestScore };
}

// ---------------------------------------------------------------------------
// "What do we watch today?"
// ---------------------------------------------------------------------------

/** Items that are still pending for me and for everyone they are shared with. */
export function isPendingTogether(item: ItemLike): boolean {
    const companions = item.companions ?? [];
    if (!companions.length) return false;
    if (!PENDING_STATUSES.has(String(item.status))) return false;
    return companions.every((companion) => !closedCompanion(companion.status));
}

export function pickRandom<T>(items: T[], random: () => number = Math.random): T | null {
    return items.length ? items[Math.min(items.length - 1, Math.floor(random() * items.length))] : null;
}

// ---------------------------------------------------------------------------
// Franchise progress
// ---------------------------------------------------------------------------

export interface FranchiseProgress<T> { done: number; total: number; next: T | null }

/** Completed count of a group and the next item not yet completed (oldest first). */
export function franchiseProgress<T extends ItemLike>(items: T[]): FranchiseProgress<T> {
    const done = items.filter((item) => item.status === 'completed').length;
    const pending = items
        .filter((item) => item.status !== 'completed' && item.status !== 'dropped')
        .sort((left, right) => {
            const byYear = (left.year ?? 9999) - (right.year ?? 9999);
            return byYear || left.displayName.localeCompare(right.displayName, undefined, { numeric: true });
        });
    return { done, total: items.length, next: pending[0] ?? null };
}

// ---------------------------------------------------------------------------
// Completed per month
// ---------------------------------------------------------------------------

export interface MonthBucket { key: string; year: number; month: number; count: number }

function finishedKey(item: ItemLike): string | null {
    if (item.status !== 'completed') return null;
    const text = typeof item.finished === 'string' ? item.finished.trim() : '';
    const match = /^(\d{4})-(\d{2})/.exec(text);
    if (match) return `${match[1]}-${match[2]}`;
    if (typeof item.dateCompleted === 'number' && item.dateCompleted > 0) {
        const date = new Date(item.dateCompleted);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    return null;
}

/** Completed items per month for the last `months` months (oldest first, zero months included). */
export function completedPerMonth(items: ItemLike[], months = 12, now: Date = new Date()): MonthBucket[] {
    const counts = new Map<string, number>();
    for (const item of items) {
        const key = finishedKey(item);
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const buckets: MonthBucket[] = [];
    for (let offset = months - 1; offset >= 0; offset--) {
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const key = `${year}-${String(month).padStart(2, '0')}`;
        buckets.push({ key, year, month, count: counts.get(key) ?? 0 });
    }
    return buckets;
}

// ---------------------------------------------------------------------------
// Stats for the two of you
// ---------------------------------------------------------------------------

export interface Disagreement { name: string; mine: number; theirs: number }
export interface PersonStats {
    name: string;
    shared: number;
    bothCompleted: number;
    bothRated: number;
    avgMine: number | null;
    avgTheirs: number | null;
    disagreements: Disagreement[];
}

function myExactRating(item: ItemLike): number | null {
    const exact = item.rawFields?.rating_exact;
    const parsed = typeof exact === 'number' ? exact : typeof exact === 'string' ? parseFloat(exact) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return item.userRating ? Number(item.userRating) : null;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Per-person comparison: how many items are shared, both completed, average ratings and biggest gaps. */
export function computeCompanionStats(items: ItemLike[], topDisagreements = 5): PersonStats[] {
    const byPerson = new Map<string, PersonStats & { mineSum: number; theirsSum: number }>();
    for (const item of items) {
        for (const companion of item.companions ?? []) {
            const key = companion.name.toLocaleLowerCase();
            let entry = byPerson.get(key);
            if (!entry) {
                entry = { name: companion.name, shared: 0, bothCompleted: 0, bothRated: 0, avgMine: null, avgTheirs: null, disagreements: [], mineSum: 0, theirsSum: 0 };
                byPerson.set(key, entry);
            }
            entry.shared++;
            if (item.status === 'completed' && companion.status === 'completed') entry.bothCompleted++;
            const mine = myExactRating(item);
            if (mine !== null && companion.rating !== null) {
                entry.bothRated++;
                entry.mineSum += mine;
                entry.theirsSum += companion.rating;
                entry.disagreements.push({ name: item.displayName, mine, theirs: companion.rating });
            }
        }
    }
    return Array.from(byPerson.values())
        .map(({ mineSum, theirsSum, ...rest }) => ({
            ...rest,
            avgMine: rest.bothRated ? round1(mineSum / rest.bothRated) : null,
            avgTheirs: rest.bothRated ? round1(theirsSum / rest.bothRated) : null,
            disagreements: rest.disagreements
                .filter((entry) => entry.mine !== entry.theirs)
                .sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs) || a.name.localeCompare(b.name))
                .slice(0, topDisagreements),
        }))
        .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Related media suggestions (shared director or franchise)
// ---------------------------------------------------------------------------

export interface RelatedCandidateLike {
    path: string;
    title: string;
    type: string;
    imageUrl?: string | null;
    director?: string | null;
    franchise?: string[];
}

/**
 * Candidates that likely belong with the current item: same director (trimmed,
 * case-insensitive) or at least one shared franchise. Already-linked paths are
 * excluded by the caller before calling this (pass only the remaining pool).
 */
export function findRelatedSuggestions<T extends RelatedCandidateLike>(
    current: { path: string; director?: string | null; franchise?: string[] },
    pool: T[],
    limit = 6
): T[] {
    const myDirector = (current.director ?? '').trim().toLocaleLowerCase();
    const myFranchise = new Set((current.franchise ?? []).map((entry) => entry.trim().toLocaleLowerCase()).filter(Boolean));
    if (!myDirector && !myFranchise.size) return [];
    const matches = pool.filter((candidate) => {
        if (candidate.path === current.path) return false;
        const sameDirector = Boolean(myDirector) && (candidate.director ?? '').trim().toLocaleLowerCase() === myDirector;
        const sharedFranchise = (candidate.franchise ?? []).some((entry) => myFranchise.has(entry.trim().toLocaleLowerCase()));
        return sameDirector || sharedFranchise;
    });
    return matches.slice(0, limit);
}
