import type { MediaStatus } from '../../types';

/**
 * Minimal RFC4180-ish CSV parser: handles quoted fields with embedded commas, newlines and
 * escaped ("") quotes. Goodreads' "Export Library" file (My Books -> Import/Export) is the only
 * format this needs to read.
 */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    const pushField = (): void => { row.push(field); field = ''; };
    const pushRow = (): void => { pushField(); rows.push(row); row = []; };

    const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"') { inQuotes = true; continue; }
        if (ch === ',') { pushField(); continue; }
        if (ch === '\n') { pushRow(); continue; }
        field += ch;
    }
    if (field.length > 0 || row.length > 0) pushRow();
    return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export type GoodreadsRow = Record<string, string>;

/** Parses a Goodreads export CSV's rows into header-keyed records. */
export function parseGoodreadsCsv(text: string): GoodreadsRow[] {
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const header = rows[0].map((h) => h.trim());
    const out: GoodreadsRow[] = [];
    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i];
        if (!cols.length) continue;
        const record: GoodreadsRow = {};
        header.forEach((key, idx) => { record[key] = (cols[idx] ?? '').trim(); });
        out.push(record);
    }
    return out;
}

/** Goodreads wraps some fields (ISBN, ISBN13) as ="12345" so spreadsheet apps don't mangle them. */
function unwrapExcelText(value: string): string {
    const match = value.match(/^="(.*)"$/);
    return match ? match[1] : value;
}

function normalizeGoodreadsDate(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const slash = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (slash) return `${slash[1]}-${slash[2]}-${slash[3]}`;
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) return '';
    const date = new Date(parsed);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

const SECONDARY_SHELF_STATUS: Array<{ match: RegExp; status: MediaStatus }> = [
    { match: /\b(dnf|did-?not-?finish|abandoned|dropped)\b/, status: 'dropped' },
    { match: /\b(on-?hold|paused|hiatus)\b/, status: 'paused' },
];

const STATUS_SHELVES = new Set(['read', 'to-read', 'currently-reading']);

/** Maps Goodreads' "Exclusive Shelf" (and custom shelves, for dnf/on-hold) to our book status. */
export function mapExclusiveShelfToStatus(exclusiveShelf: string, bookshelves: string): MediaStatus {
    const shelves = bookshelves.toLowerCase();
    for (const rule of SECONDARY_SHELF_STATUS) {
        if (rule.match.test(shelves)) return rule.status;
    }
    const shelf = exclusiveShelf.trim().toLowerCase();
    if (shelf === 'read') return 'completed';
    if (shelf === 'currently-reading') return 'watching';
    return 'planned';
}

export interface GoodreadsImportedBook {
    title: string;
    frontmatter: Record<string, unknown>;
    review: string;
    warnings: string[];
}

/** Converts one Goodreads export row into book frontmatter, or null if the row has no title. */
export function mapGoodreadsRow(row: GoodreadsRow): GoodreadsImportedBook | null {
    const title = (row['Title'] ?? '').trim();
    if (!title) return null;
    const warnings: string[] = [];

    const author = (row['Author'] ?? '').trim();
    const additionalAuthors = (row['Additional Authors'] ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
    const authors = [author, ...additionalAuthors].filter(Boolean);
    if (!authors.length) warnings.push('No author listed.');

    const isbn13 = unwrapExcelText(row['ISBN13'] ?? '').trim();
    const isbn = unwrapExcelText(row['ISBN'] ?? '').trim();

    const myRating = Number.parseFloat(row['My Rating'] ?? '');
    const status = mapExclusiveShelfToStatus(row['Exclusive Shelf'] ?? '', row['Bookshelves'] ?? '');
    const finished = normalizeGoodreadsDate(row['Date Read'] ?? '');
    const pages = Number.parseInt(row['Number of Pages'] ?? '', 10);
    const year = Number.parseInt(row['Original Publication Year'] || row['Year Published'] || '', 10);
    const publisher = (row['Publisher'] ?? '').trim();

    const tags = (row['Bookshelves'] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && !STATUS_SHELVES.has(s.toLowerCase()));

    const frontmatter: Record<string, unknown> = { type: 'book', name: title, status };
    if (authors.length) frontmatter.authors = authors;
    if (publisher) frontmatter.publisher = publisher;
    if (Number.isFinite(year) && year > 0) frontmatter.year = year;
    if (Number.isFinite(pages) && pages > 0) frontmatter.pages = pages;
    if (Number.isFinite(myRating) && myRating > 0) frontmatter.userRating = myRating;
    if (finished) frontmatter.finished = finished;
    if (tags.length) frontmatter.tags = tags;
    if (isbn13) frontmatter.isbn13 = isbn13;
    else if (isbn) frontmatter.isbn = isbn;

    return { title, frontmatter, review: (row['My Review'] ?? '').trim(), warnings };
}
