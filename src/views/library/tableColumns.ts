import type { Companion, CompanionStatus, MediaItem, SortField, TableViewConfig } from '../../types';
import { COMPANION_STATUSES, personSlug } from '../../services/media/people';

export type TableCellKind = 'name' | 'status' | 'rating' | 'text' | 'number' | 'date' | 'list' | 'boolean' | 'personStatus' | 'personRating';

export interface TableColumnDef {
    key: string;
    label: string;
    kind: TableCellKind;
    /** Person name for `p:` columns */
    person?: string;
    defaultWidth: number;
    group: 'builtin' | 'people' | 'properties';
}

export const DEFAULT_TABLE_COLUMNS = ['b:name', 'b:status', 'b:rating', 'b:year', 'b:finished', 'b:tags'];
export const MIN_COLUMN_WIDTH = 60;

/** Built-in table columns that map directly onto an existing sort field, so their header can be made clickable. */
const SORTABLE_COLUMNS: Partial<Record<string, SortField>> = {
    'b:name': 'name',
    'b:year': 'year',
    'b:rating': 'rating',
    'b:started': 'dateStarted',
    'b:finished': 'dateFinished',
};

export function sortFieldForColumn(column: TableColumnDef): SortField | null {
    return SORTABLE_COLUMNS[column.key] ?? null;
}

export interface TableLabels {
    name: string; status: string; rating: string; year: string; started: string; finished: string;
    tags: string; genres: string; favorite: string; community: string; progress: string; franchise: string;
    people: string; platforms: string; creators: string; artists: string; personStatus: string; personRating: string;
}

const BUILTINS: Array<{ key: string; label: keyof TableLabels; kind: TableCellKind; width: number }> = [
    { key: 'b:name', label: 'name', kind: 'name', width: 280 },
    { key: 'b:status', label: 'status', kind: 'status', width: 130 },
    { key: 'b:rating', label: 'rating', kind: 'rating', width: 110 },
    { key: 'b:year', label: 'year', kind: 'number', width: 80 },
    { key: 'b:started', label: 'started', kind: 'date', width: 120 },
    { key: 'b:finished', label: 'finished', kind: 'date', width: 120 },
    { key: 'b:tags', label: 'tags', kind: 'list', width: 200 },
    { key: 'b:genres', label: 'genres', kind: 'list', width: 200 },
    { key: 'b:favorite', label: 'favorite', kind: 'boolean', width: 90 },
    { key: 'b:community', label: 'community', kind: 'number', width: 100 },
    { key: 'b:progress', label: 'progress', kind: 'text', width: 120 },
    { key: 'b:franchise', label: 'franchise', kind: 'list', width: 180 },
    { key: 'b:people', label: 'people', kind: 'list', width: 180 },
    { key: 'b:platforms', label: 'platforms', kind: 'list', width: 160 },
    { key: 'b:creators', label: 'creators', kind: 'list', width: 200 },
    { key: 'b:artists', label: 'artists', kind: 'list', width: 160 },
];

/** "release_date" -> "Release date" */
export function humanizeKey(key: string): string {
    const text = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
}

/** Every column the user can pick for these items: built-ins, one pair per person and every note property. */
export function getAvailableColumns(items: MediaItem[], labels: TableLabels): TableColumnDef[] {
    // The Artists column only makes sense for manga, where authors and artists are separate fields.
    const hasManga = items.some((item) => item.type === 'manga');
    const result: TableColumnDef[] = BUILTINS
        .filter((entry) => entry.key !== 'b:artists' || hasManga)
        .map((entry) => ({
            key: entry.key, label: labels[entry.label], kind: entry.kind, defaultWidth: entry.width, group: 'builtin',
        }));

    const people = new Map<string, string>();
    const properties = new Map<string, 'text' | 'number' | 'boolean' | 'list' | 'date'>();
    for (const item of items) {
        for (const name of item.watchedWith ?? []) {
            const key = name.toLocaleLowerCase();
            if (!people.has(key)) people.set(key, name);
        }
        for (const [key, value] of Object.entries(item.rawFields ?? {})) {
            if (properties.has(key) || value === null) continue;
            if (Array.isArray(value)) properties.set(key, 'list');
            else if (typeof value === 'boolean') properties.set(key, 'boolean');
            else if (typeof value === 'number') properties.set(key, 'number');
            else properties.set(key, /^\d{4}-\d{2}-\d{2}/.test(value) ? 'date' : 'text');
        }
    }
    for (const name of Array.from(people.values()).sort((a, b) => a.localeCompare(b))) {
        result.push({ key: `p:${name}:status`, label: `${name} \u00B7 ${labels.personStatus}`, kind: 'personStatus', person: name, defaultWidth: 130, group: 'people' });
        result.push({ key: `p:${name}:rating`, label: `${name} \u00B7 ${labels.personRating}`, kind: 'personRating', person: name, defaultWidth: 110, group: 'people' });
    }
    for (const key of Array.from(properties.keys()).sort((a, b) => a.localeCompare(b))) {
        result.push({ key: `r:${key}`, label: humanizeKey(key), kind: properties.get(key) ?? 'text', defaultWidth: 150, group: 'properties' });
    }
    return result;
}

/** Resolves the saved config against the available columns (drops columns that no longer exist). */
export function resolveTableColumns(config: TableViewConfig | undefined, available: TableColumnDef[]): TableColumnDef[] {
    const byKey = new Map(available.map((entry) => [entry.key, entry]));
    const keys = config?.columns?.length ? config.columns : DEFAULT_TABLE_COLUMNS;
    const out: TableColumnDef[] = [];
    for (const key of keys) {
        let def = byKey.get(key);
        // A column for a property or person that no item has yet is still shown, as plain text.
        if (!def && key.startsWith('r:')) def = { key, label: humanizeKey(key.slice(2)), kind: 'text', defaultWidth: 150, group: 'properties' };
        if (def) out.push(def);
    }
    return out.length ? out : DEFAULT_TABLE_COLUMNS.map((key) => byKey.get(key)).filter((entry): entry is TableColumnDef => Boolean(entry));
}

export function columnWidth(config: TableViewConfig | undefined, def: TableColumnDef): number {
    const saved = config?.widths?.[def.key];
    return Math.max(MIN_COLUMN_WIDTH, Number.isFinite(saved) ? (saved as number) : def.defaultWidth);
}

export function findCompanion(item: MediaItem, person: string): Companion | undefined {
    return (item.companions ?? []).find((entry) => entry.name.toLocaleLowerCase() === person.toLocaleLowerCase());
}

export function getProgressText(item: MediaItem): string {
    const pair = (current: number | null | undefined, total: number | null | undefined): string => {
        if (current === null || current === undefined) return total ? `0 / ${total}` : '';
        return total ? `${current} / ${total}` : String(current);
    };
    switch (item.type) {
        case 'anime': case 'series': return pair(item.episodeCurrent, item.episodeTotal);
        case 'book': return pair(item.pageCurrent, item.pageTotal);
        case 'manga': return pair(item.chapterCurrent, item.chapterTotal);
        default: return '';
    }
}

/** Directors, authors, artists, studios or developers, depending on the type. */
export function getCreators(item: MediaItem): string[] {
    const split = (value: string | undefined): string[] => (value ?? '').split(/[,;]+/).map((entry) => entry.trim()).filter(Boolean);
    switch (item.type) {
        case 'movie': case 'series': return split(item.director);
        case 'book': return item.authors ?? [];
        case 'manga': return [...(item.authors ?? []), ...(item.artists ?? [])];
        case 'anime': return item.studios ?? [];
        case 'game': return split(item.developer);
        default: return [];
    }
}

export type CellValue = string | number | boolean | string[] | null;

/** Plain value for sorting, copying and rendering simple cells. */
export function getCellValue(item: MediaItem, def: TableColumnDef): CellValue {
    if (def.key.startsWith('r:')) return item.rawFields?.[def.key.slice(2)] ?? null;
    if (def.key.startsWith('p:')) {
        const entry = def.person ? findCompanion(item, def.person) : undefined;
        return def.kind === 'personStatus' ? (entry?.status ?? null) : (entry?.rating ?? null);
    }
    switch (def.key) {
        case 'b:name': return item.displayName;
        case 'b:status': return item.status;
        case 'b:rating': return item.userRating;
        case 'b:year': return item.year;
        case 'b:started': return item.started ?? null;
        case 'b:finished': return item.finished ?? null;
        case 'b:tags': return item.tags ?? [];
        case 'b:genres': return 'genres' in item ? (item.genres ?? []) : [];
        case 'b:favorite': return item.favorite;
        case 'b:community': return item.communityRating ?? null;
        case 'b:progress': return getProgressText(item) || null;
        case 'b:franchise': return item.franchise ?? [];
        case 'b:people': return item.watchedWith ?? [];
        case 'b:platforms': return item.platforms ?? [];
        case 'b:creators': return getCreators(item);
        case 'b:artists': return item.type === 'manga' ? (item.artists ?? []) : [];
        default: return null;
    }
}

export function isCompanionStatus(value: unknown): value is CompanionStatus {
    return typeof value === 'string' && (COMPANION_STATUSES as string[]).includes(value);
}

export { personSlug };
