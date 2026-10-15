import type { App } from 'obsidian';
import type { Companion, CompanionStatus } from '../../types';

/**
 * Helpers for case-preserving name lists such as `watched_with` and `franchise`.
 * Unlike tags (which are lower-cased), these hold display names like "Isita" or
 * "Studio Ghibli", so the original casing is kept and duplicates are removed
 * case-insensitively.
 */

export const WATCHED_WITH_KEYS = ['watched_with', 'watchedWith'] as const;
export const FRANCHISE_KEYS = ['franchise', 'franchises'] as const;
export const PLATFORM_KEYS = ['platform', 'platforms'] as const;

/** Accepts an array or a comma/semicolon/newline separated string. */
export function parseNameList(value: unknown): string[] {
    let raw: unknown[] = [];
    if (Array.isArray(value)) {
        raw = value;
    } else if (typeof value === 'string') {
        raw = value.split(/[,;\n]+/);
    } else if (typeof value === 'number') {
        raw = [String(value)];
    }
    const seen = new Set<string>();
    const result: string[] = [];
    for (const entry of raw) {
        const text = String(entry ?? '').trim();
        if (!text) continue;
        const key = text.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(text);
    }
    return result;
}

/** Reads the first non-empty key from a frontmatter-like record as a name list. */
export function readNameList(source: Record<string, unknown>, keys: readonly string[]): string[] {
    for (const key of keys) {
        const list = parseNameList(source[key]);
        if (list.length) return list;
    }
    return [];
}

/** Adds names to an existing list without duplicating (case-insensitive). */
export function addNames(existing: string[], toAdd: string[]): string[] {
    return parseNameList([...existing, ...toAdd]);
}

/** Removes names from an existing list (case-insensitive). */
export function removeNames(existing: string[], toRemove: string[]): string[] {
    const drop = new Set(parseNameList(toRemove).map((name) => name.toLocaleLowerCase()));
    return existing.filter((name) => !drop.has(name.toLocaleLowerCase()));
}

/** Unique, alphabetically sorted values across items for the given accessor. */
export function collectUniqueNames<T>(items: T[], accessor: (item: T) => string[] | undefined): string[] {
    const seen = new Map<string, string>();
    for (const item of items) {
        for (const name of accessor(item) ?? []) {
            const key = name.toLocaleLowerCase();
            if (!seen.has(key)) seen.set(key, name);
        }
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Collects distinct values of a list-like frontmatter key from every note in the
 * vault. Used to suggest previously used names in editors.
 */
export function collectVaultNames(app: App, keys: readonly string[]): string[] {
    const seen = new Map<string, string>();
    for (const file of app.vault.getMarkdownFiles()) {
        const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) continue;
        for (const name of readNameList(frontmatter, keys)) {
            const key = name.toLocaleLowerCase();
            if (!seen.has(key)) seen.set(key, name);
        }
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Today's date as YYYY-MM-DD in the local time zone. */
export function todayDateInput(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

/** Text to store back in frontmatter: a list, or null when empty (removes the key). */
export function serializeNameList(values: unknown): string[] | null {
    const list = parseNameList(values);
    return list.length ? list : null;
}

export const COMPANION_STATUSES: CompanionStatus[] = ['planned', 'watching', 'completed', 'dropped', 'paused'];

/** Frontmatter key prefix for a person: "Isita" -> "isita", "Ana María" -> "ana_maria". */
export function personSlug(name: string): string {
    return name
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '_')
        .replace(/^_+|_+$/g, '');
}

const COMPANION_STATUS_ALIASES: Record<string, CompanionStatus> = {
    planned: 'planned', plan: 'planned', todo: 'planned', 'to do': 'planned', wishlist: 'planned',
    watching: 'watching', reading: 'watching', 'in progress': 'watching', playing: 'watching',
    completed: 'completed', complete: 'completed', done: 'completed', finished: 'completed',
    dropped: 'dropped', dopped: 'dropped', abandoned: 'dropped',
    paused: 'paused', 'on hold': 'paused', hold: 'paused',
};

export function parseCompanionStatus(value: unknown): CompanionStatus | null {
    const key = String(value ?? '').trim().toLocaleLowerCase();
    return key ? (COMPANION_STATUS_ALIASES[key] ?? null) : null;
}

/** Parses a 0..5 rating, snapping to the nearest 0.5. Returns null when empty/invalid/zero. */
export function parseHalfRating(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.min(5, Math.round(parsed * 2) / 2);
}

/** Builds the per-person data for each listed name from `<slug>_status` / `<slug>_rating`. */
export function readCompanions(source: Record<string, unknown>, names: string[]): Companion[] {
    return names.map((name) => {
        const slug = personSlug(name);
        return {
            name,
            status: slug ? parseCompanionStatus(source[`${slug}_status`]) : null,
            rating: slug ? parseHalfRating(source[`${slug}_rating`]) : null,
        };
    });
}

/** Frontmatter updates for a set of companions. Empty values are `null` so the key is removed. */
export function companionFrontmatter(companions: Companion[]): Record<string, unknown> {
    const updates: Record<string, unknown> = {};
    for (const companion of companions) {
        const slug = personSlug(companion.name);
        if (!slug) continue;
        updates[`${slug}_status`] = companion.status ?? null;
        updates[`${slug}_rating`] = companion.rating ?? null;
    }
    return updates;
}

export function areCompanionsEqual(left?: Companion[], right?: Companion[]): boolean {
    const a = left ?? [];
    const b = right ?? [];
    if (a.length !== b.length) return false;
    return a.every((entry, index) => (
        entry.name === b[index].name && entry.status === b[index].status && entry.rating === b[index].rating
    ));
}
