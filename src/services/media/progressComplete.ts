/**
 * "Mark everything as done" for manga volumes: every volume is filled with its OWN chapter total
 * (never one combined number) and marked completed. Volumes with an unknown length keep their
 * current chapter and are only marked completed.
 */
export interface ChapterPart {
    chapterCurrent: number | null;
    chapterTotal: number | null;
    status: string;
}

export function completeMangaParts<T extends ChapterPart>(parts: T[]): T[] {
    return parts.map((part) => {
        const total = part.chapterTotal ?? 0;
        return {
            ...part,
            chapterCurrent: total > 0 ? total : part.chapterCurrent,
            status: 'completed',
        };
    });
}
