import { AnimeItem, BookItem, MangaItem } from '../../types';
import { stepProgress } from '../../utils/progress';
import { completeMangaParts } from '../../services/media/progressComplete';
import { completePartsProgress } from '../../services/media/seriesProgress';

export interface ProgressMutation<T> {
    updates: Partial<T>;
    changedFields: string[];
}

export function incrementAnimeEpisode(item: AnimeItem): ProgressMutation<AnimeItem> {
    const parts = item.parts?.length ? item.parts.map((part) => ({ ...part })) : [];
    const activePart = parts.find((part) => part.id === item.activePartId) ?? parts[0] ?? null;
    const current = normalizeCount(activePart?.episodeCurrent ?? item.episodeCurrent) ?? 0;
    const total = normalizeCount(activePart?.episodeTotal ?? item.episodeTotal);
    const nextEpisode = stepProgress(current, 1, total) ?? 0;
    const updates: Partial<AnimeItem> = { episodeCurrent: nextEpisode };
    const changedFields = new Set<string>(['episodeCurrent']);

    item.episodeCurrent = nextEpisode;
    if (activePart) {
        activePart.episodeCurrent = nextEpisode;
        if (total && nextEpisode >= total) {
            activePart.status = 'completed';
        } else if (activePart.status === 'planned') {
            activePart.status = 'watching';
        }
        item.parts = parts;
        item.activePartId = activePart.id;
        item.seasonCurrent = activePart.seasonNumber;
        item.episodeTotal = activePart.episodeTotal;
        updates.parts = parts;
        updates.activePartId = activePart.id;
        updates.seasonCurrent = activePart.seasonNumber;
        updates.episodeTotal = activePart.episodeTotal;
        changedFields.add('parts');
        changedFields.add('activePartId');
        changedFields.add('seasonCurrent');
        changedFields.add('episodeTotal');
    }

    if (item.status === 'planned') {
        item.status = 'watching';
        updates.status = 'watching';
        changedFields.add('status');
    }

    if (total && nextEpisode >= total) {
        const allPartsCompleted = parts.length > 0 && parts.every((part) => part.status === 'completed');
        if (parts.length === 0 || allPartsCompleted) {
            item.status = 'completed';
            updates.status = 'completed';
            changedFields.add('status');
        }
    }

    return { updates, changedFields: Array.from(changedFields) };
}

export function incrementMangaChapter(item: MangaItem): ProgressMutation<MangaItem> {
    const parts = item.parts?.length ? item.parts.map((part) => ({ ...part })) : [];
    const activePart = parts.find((part) => part.id === item.activePartId) ?? parts[0] ?? null;
    const current = normalizeCount(activePart?.chapterCurrent ?? item.chapterCurrent) ?? 0;
    const total = normalizeCount(activePart?.chapterTotal ?? item.chapterTotal);
    const nextChapter = stepProgress(current, 1, total) ?? 0;
    const updates: Partial<MangaItem> = { chapterCurrent: nextChapter };
    const changedFields = new Set<string>(['chapterCurrent']);

    item.chapterCurrent = nextChapter;
    if (activePart) {
        activePart.chapterCurrent = nextChapter;
        if (total && nextChapter >= total) {
            activePart.status = 'completed';
        } else if (activePart.status === 'planned') {
            activePart.status = 'watching';
        }
        item.parts = parts;
        item.activePartId = activePart.id;
        item.chapterTotal = activePart.chapterTotal;
        item.volumeCurrent = activePart.volumeNumber;
        updates.parts = parts;
        updates.activePartId = activePart.id;
        updates.chapterTotal = activePart.chapterTotal;
        updates.volumeCurrent = activePart.volumeNumber;
        changedFields.add('parts');
        changedFields.add('activePartId');
        changedFields.add('chapterTotal');
        changedFields.add('volumeCurrent');
    }

    if (item.status === 'planned') {
        item.status = 'watching';
        updates.status = 'watching';
        changedFields.add('status');
    }

    const allPartsCompleted = parts.length > 0 && parts.every((part) => part.status === 'completed');
    if ((parts.length === 0 && total && nextChapter >= total) || allPartsCompleted) {
        item.status = 'completed';
        updates.status = 'completed';
        changedFields.add('status');
    }

    return { updates, changedFields: Array.from(changedFields) };
}

function normalizeCount(value: number | null | undefined): number | null {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value as number)) : null;
}

function todayInput(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Marks every episode of every season/part as watched and the title as completed. */
export function completeAllAnime(item: AnimeItem): ProgressMutation<AnimeItem> {
    const parts = completePartsProgress((item.parts ?? []).map((part) => ({ ...part })));
    const active = parts.find((part) => part.id === item.activePartId) ?? parts[0] ?? null;
    const total = normalizeCount(active?.episodeTotal ?? item.episodeTotal);
    const episodeCurrent = active?.episodeCurrent ?? (total ? total : item.episodeCurrent);
    const updates: Partial<AnimeItem> = { status: 'completed', episodeCurrent };
    const changedFields = new Set<string>(['status', 'episodeCurrent']);
    item.status = 'completed';
    item.episodeCurrent = episodeCurrent;
    if (parts.length) {
        item.parts = parts;
        updates.parts = parts;
        changedFields.add('parts');
    }
    if (!item.finished) {
        item.finished = todayInput();
        updates.finished = item.finished;
        changedFields.add('finished');
    }
    return { updates, changedFields: Array.from(changedFields) };
}

/** Marks every chapter of every volume as read and the manga as completed. */
export function completeAllManga(item: MangaItem): ProgressMutation<MangaItem> {
    const parts = completeMangaParts((item.parts ?? []).map((part) => ({ ...part })));
    const active = parts.find((part) => part.id === item.activePartId) ?? parts[0] ?? null;
    const total = normalizeCount(active?.chapterTotal ?? item.chapterTotal);
    const chapterCurrent = active?.chapterCurrent ?? (total ? total : item.chapterCurrent);
    const updates: Partial<MangaItem> = { status: 'completed', chapterCurrent };
    const changedFields = new Set<string>(['status', 'chapterCurrent']);
    item.status = 'completed';
    item.chapterCurrent = chapterCurrent;
    if (parts.length) {
        item.parts = parts;
        updates.parts = parts;
        changedFields.add('parts');
    } else if (item.volumeTotal && item.volumeTotal > 0) {
        item.volumeCurrent = item.volumeTotal;
        updates.volumeCurrent = item.volumeTotal;
        changedFields.add('volumeCurrent');
    }
    if (!item.finished) {
        item.finished = todayInput();
        updates.finished = item.finished;
        changedFields.add('finished');
    }
    return { updates, changedFields: Array.from(changedFields) };
}

/** Marks a book as fully read: pages and chapters go to their totals when those are known. */
export function completeAllBook(item: BookItem): ProgressMutation<BookItem> {
    const updates: Partial<BookItem> = { status: 'completed' };
    const changedFields = new Set<string>(['status']);
    item.status = 'completed';
    const pageTotal = normalizeCount(item.pageTotal);
    if (pageTotal) {
        item.pageCurrent = pageTotal;
        updates.pageCurrent = pageTotal;
        changedFields.add('pageCurrent');
    }
    const chapterTotal = normalizeCount(item.chapterTotal);
    if (chapterTotal) {
        item.chapterCurrent = chapterTotal;
        updates.chapterCurrent = chapterTotal;
        changedFields.add('chapterCurrent');
    }
    if (!item.finished) {
        item.finished = todayInput();
        updates.finished = item.finished;
        changedFields.add('finished');
    }
    return { updates, changedFields: Array.from(changedFields) };
}
