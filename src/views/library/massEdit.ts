import type { Companion, CompanionStatus, MediaItem } from '../../types';
import { addNames, parseNameList, removeNames, todayDateInput } from '../../services/media/people';

/** What the user chose to change for every selected item. `undefined` means "leave as is". */
export interface MassEditChanges {
    status?: string;
    /** 1-5 sets the rating, null clears it */
    rating?: number | null;
    favorite?: boolean;
    /** When status becomes "completed" and the item has no finish date, use today */
    finishToday?: boolean;
    /** YYYY-MM-DD sets the finish date, null clears it */
    finished?: string | null;
    tagsAdd?: string[];
    tagsRemove?: string[];
    watchedWithAdd?: string[];
    watchedWithRemove?: string[];
    franchiseAdd?: string[];
    franchiseRemove?: string[];
    platformsAdd?: string[];
    platformsRemove?: string[];
    /** Set one person's own status / rating (also adds them to "watched with") */
    person?: { name: string; status?: CompanionStatus | null; rating?: number | null };
}

/** Types with franchises and the other "people" fields (movies, series, books). Half-star ratings are available for every type. */
export function supportsPeopleFields(type: MediaItem['type']): boolean {
    return type === 'movie' || type === 'series' || type === 'book';
}

/** "Status for" (people with their own status and rating) is available for every media type. */
export function supportsCompanions(_type: MediaItem['type']): boolean {
    return true;
}

export function hasMassChanges(changes: MassEditChanges): boolean {
    return changes.status !== undefined
        || changes.rating !== undefined
        || changes.favorite !== undefined
        || changes.finished !== undefined
        || Boolean(changes.tagsAdd?.length || changes.tagsRemove?.length)
        || Boolean(changes.watchedWithAdd?.length || changes.watchedWithRemove?.length)
        || Boolean(changes.franchiseAdd?.length || changes.franchiseRemove?.length)
        || Boolean(changes.platformsAdd?.length || changes.platformsRemove?.length)
        || Boolean(changes.person && changes.person.name.trim()
            && (changes.person.status !== undefined || changes.person.rating !== undefined));
}

function normalizeTag(value: string): string {
    return value.trim().replace(/^#+/, '').toLocaleLowerCase();
}

/**
 * Builds the partial update to send to the media service for one item.
 * Returns an empty object when nothing applies to this item.
 */
export function buildMassUpdates(item: MediaItem, changes: MassEditChanges): Record<string, unknown> {
    const updates: Record<string, unknown> = {};

    if (changes.status !== undefined) {
        updates.status = changes.status;
        if (changes.status === 'completed' && changes.finishToday && !item.finished && changes.finished === undefined) {
            updates.finished = todayDateInput();
        }
    }
    if (changes.rating !== undefined) updates.userRating = changes.rating;
    if (changes.favorite !== undefined) updates.favorite = changes.favorite;
    if (changes.finished !== undefined) updates.finished = changes.finished;

    const tagsAdd = (changes.tagsAdd ?? []).map(normalizeTag).filter(Boolean);
    const tagsRemove = (changes.tagsRemove ?? []).map(normalizeTag).filter(Boolean);
    if (tagsAdd.length || tagsRemove.length) {
        updates.tags = removeNames(addNames(item.tags ?? [], tagsAdd), tagsRemove);
    }

    const platformsAdd = parseNameList(changes.platformsAdd ?? []);
    const platformsRemove = parseNameList(changes.platformsRemove ?? []);
    if (platformsAdd.length || platformsRemove.length) {
        updates.platforms = removeNames(addNames(item.platforms ?? [], platformsAdd), platformsRemove);
    }

    if (supportsPeopleFields(item.type)) {
        const franchiseAdd = parseNameList(changes.franchiseAdd ?? []);
        const franchiseRemove = parseNameList(changes.franchiseRemove ?? []);
        if (franchiseAdd.length || franchiseRemove.length) {
            updates.franchise = removeNames(addNames(item.franchise ?? [], franchiseAdd), franchiseRemove);
        }
    }

    if (supportsCompanions(item.type)) {
        let names = item.watchedWith ?? [];
        const namesAdd = parseNameList(changes.watchedWithAdd ?? []);
        const namesRemove = parseNameList(changes.watchedWithRemove ?? []);
        const person = changes.person && changes.person.name.trim()
            && (changes.person.status !== undefined || changes.person.rating !== undefined)
            ? changes.person
            : undefined;
        if (person) namesAdd.push(person.name.trim());

        if (namesAdd.length || namesRemove.length) {
            names = removeNames(addNames(names, namesAdd), namesRemove);
            updates.watchedWith = names;
        }
        if (namesAdd.length || namesRemove.length || person) {
            const existing = new Map<string, Companion>(
                (item.companions ?? []).map((entry) => [entry.name.toLocaleLowerCase(), entry])
            );
            updates.companions = names.map((name) => {
                const base: Companion = { ...(existing.get(name.toLocaleLowerCase()) ?? { name, status: null, rating: null }), name };
                if (person && name.toLocaleLowerCase() === person.name.trim().toLocaleLowerCase()) {
                    if (person.status !== undefined) base.status = person.status;
                    if (person.rating !== undefined) base.rating = person.rating;
                }
                return base;
            });
        }
    }
    return updates;
}
