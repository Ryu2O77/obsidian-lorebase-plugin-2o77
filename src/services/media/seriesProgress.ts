/**
 * Series are tracked per season ("part"): every part has its own episode_current / episode_total.
 * Completing a series must therefore fill each season with its OWN total (e.g. 50/50 and 50/50),
 * never one combined number.
 */
export interface ProgressPart {
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: string;
}

/** Copies of the parts with every season of known length filled to its total and marked completed. */
export function completePartsProgress<T extends ProgressPart>(parts: T[]): T[] {
    return parts.map((part) => {
        const total = part.episodeTotal ?? 0;
        return {
            ...part,
            episodeCurrent: total > 0 ? total : part.episodeCurrent,
            status: 'completed',
        };
    });
}

/** Sums across seasons. `total` is only reported when every season has a known length. */
export function sumEpisodes(parts: ProgressPart[]): { current: number; total: number | null } {
    let current = 0;
    let total = 0;
    let allKnown = parts.length > 0;
    for (const part of parts) {
        current += part.episodeCurrent ?? 0;
        if (part.episodeTotal && part.episodeTotal > 0) total += part.episodeTotal;
        else allKnown = false;
    }
    return { current, total: allKnown ? total : null };
}

function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/**
 * Same rule applied to raw note frontmatter (used right after a note is created).
 * Returns true when something changed.
 */
export function completeSeriesFrontmatter(frontmatter: Record<string, unknown>): boolean {
    let changed = false;
    const rawParts = frontmatter.series_parts;
    if (Array.isArray(rawParts) && rawParts.length) {
        const view: ProgressPart[] = [];
        for (const raw of rawParts) {
            if (!raw || typeof raw !== 'object') continue;
            const part = raw as Record<string, unknown>;
            const total = toNumber(part.episode_total);
            if (total && total > 0 && toNumber(part.episode_current) !== total) {
                part.episode_current = total;
                changed = true;
            }
            if (part.status !== 'completed') {
                part.status = 'completed';
                changed = true;
            }
            view.push({ episodeCurrent: toNumber(part.episode_current), episodeTotal: toNumber(part.episode_total), status: 'completed' });
        }
        const sums = sumEpisodes(view);
        if (sums.total) {
            frontmatter.episode_current = sums.current;
            frontmatter.episode_total = sums.total;
        }
        return changed;
    }
    const total = toNumber(frontmatter.episode_total);
    if (total && total > 0 && toNumber(frontmatter.episode_current) !== total) {
        frontmatter.episode_current = total;
        changed = true;
    }
    return changed;
}
