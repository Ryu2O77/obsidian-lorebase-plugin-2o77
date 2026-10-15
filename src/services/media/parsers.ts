import type { RelatedMediaLink, UserRating } from '../../types';

export function parseNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

export function parseYear(value: unknown): number | null {
    const parsed = parseNumber(value);
    if (parsed !== null) {
        const rounded = Math.trunc(parsed);
        if (rounded > 0) return rounded;
    }

    const text = typeof value === 'string' ? value : '';
    const match = text.match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
}

export function parseUserRating(value: unknown): UserRating {
    const parsed = parseNumber(value);
    if (parsed === null) return null;
    const rating = Math.round(parsed * 2) / 2;
    return rating >= 0.5 && rating <= 5 ? rating : null;
}

/**
 * Notes created before half stars existed (or by the Notion converter) keep the whole
 * star in the rating field and the exact value in `rating_exact`. When both agree
 * (within one star) the exact half-star value wins.
 */
export function resolveExactRating(rating: UserRating, exact: unknown): UserRating {
    const parsed = parseUserRating(exact);
    if (parsed !== null && rating !== null && Math.abs(parsed - rating) < 1) return parsed;
    return rating;
}

/** Rating bucket (1..5) used by emoji badges and distribution charts. */
export function ratingBucket(rating: number): 1 | 2 | 3 | 4 | 5 {
    return Math.min(5, Math.max(1, Math.round(rating))) as 1 | 2 | 3 | 4 | 5;
}

export function parseRelatedMedia(raw: unknown): RelatedMediaLink[] {
    if (!Array.isArray(raw)) return [];

    const related: RelatedMediaLink[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const source = entry as Record<string, unknown>;
        const type = typeof source.type === 'string' ? source.type.trim().toLowerCase() : '';
        if (type !== 'anime' && type !== 'movie' && type !== 'series' && type !== 'book' && type !== 'manga' && type !== 'game') continue;
        const path = typeof source.path === 'string' ? source.path.trim() : '';
        if (!path || seen.has(path)) continue;
        const title = typeof source.title === 'string' && source.title.trim()
            ? source.title.trim()
            : path.split('/').pop()?.replace(/\.md$/i, '') || path;
        related.push({ type, path, title });
        seen.add(path);
    }
    return related;
}

export function serializeRelatedMedia(related: RelatedMediaLink[] | undefined): Array<Record<string, unknown>> | null {
    if (!related?.length) return null;
    return related.map((item) => ({
        type: item.type,
        path: item.path,
        title: item.title,
    }));
}

export function getRandomItem<T>(items: T[]): T | null {
    if (!items.length) return null;
    return items[Math.floor(Math.random() * items.length)] ?? null;
}
