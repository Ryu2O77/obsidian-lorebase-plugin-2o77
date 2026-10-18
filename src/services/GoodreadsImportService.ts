import { App, TFile, TFolder } from 'obsidian';
import type { LorebaseSettings } from '../types';
import { ensureFolder } from './integrations/shared';
import { sanitizeFileName } from './integrations/templateUtils';
import { upsertMarkdownSection } from './markdownSections';
import { getAllMarkdownFiles } from './media/serviceUtils';
import { parseGoodreadsCsv, mapGoodreadsRow, type GoodreadsImportedBook } from './integrations/goodreadsImport';

export interface GoodreadsPreview {
    books: GoodreadsImportedBook[];
    /** 'notFound' | 'empty', for the modal to show a localized message. */
    error: 'notFound' | 'empty' | null;
}

export interface GoodreadsImportResult {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
}

/**
 * Imports a Goodreads "Export Library" CSV (My Books -> Import/Export, on goodreads.com) into
 * book notes. Existing notes are matched by title and updated in place; everything else is
 * created fresh. Goodreads has no public API (retired in Dec 2020), so this is a one-time/
 * re-runnable import rather than a live sync.
 */
export class GoodreadsImportService {
    constructor(private readonly app: App) {}

    async preview(vaultPath: string): Promise<GoodreadsPreview> {
        const file = this.app.vault.getAbstractFileByPath(vaultPath.trim());
        if (!(file instanceof TFile)) return { books: [], error: 'notFound' };
        const text = await this.app.vault.read(file);
        const rows = parseGoodreadsCsv(text);
        const books = rows.map(mapGoodreadsRow).filter((b): b is GoodreadsImportedBook => b !== null);
        return { books, error: books.length ? null : 'empty' };
    }

    async import(vaultPath: string, settings: LorebaseSettings): Promise<GoodreadsImportResult> {
        const result: GoodreadsImportResult = { created: 0, updated: 0, skipped: 0, failed: 0 };
        const { books, error } = await this.preview(vaultPath);
        if (error) return result;

        const folderPath = settings.books.folderPath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (folderPath) await ensureFolder(this.app, folderPath);

        const existingByTitle = this.indexExistingBooks(folderPath);
        const reservedPaths = new Set<string>();

        for (const book of books) {
            try {
                const existing = existingByTitle.get(book.title.trim().toLowerCase());
                if (existing) {
                    await this.updateExisting(existing, book);
                    result.updated++;
                } else {
                    await this.createNew(folderPath, book, reservedPaths);
                    result.created++;
                }
            } catch (error_) {
                console.error('[LOREBASE Goodreads Import] Failed to import:', book.title, error_);
                result.failed++;
            }
        }

        return result;
    }

    private indexExistingBooks(folderPath: string): Map<string, TFile> {
        const index = new Map<string, TFile>();
        const entry = folderPath ? this.app.vault.getAbstractFileByPath(folderPath) : this.app.vault.getRoot();
        const files = entry instanceof TFolder ? getAllMarkdownFiles(entry) : entry instanceof TFile ? [entry] : [];
        for (const file of files) {
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const raw = frontmatter?.name ?? frontmatter?.title ?? file.basename;
            const name = String(raw ?? '').trim().toLowerCase();
            if (name) index.set(name, file);
        }
        return index;
    }

    private async updateExisting(file: TFile, book: GoodreadsImportedBook): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(book.frontmatter)) {
                if (value === null || value === undefined || value === '') delete frontmatter[key];
                else frontmatter[key] = value;
            }
        });
        if (book.review) {
            const content = await this.app.vault.read(file);
            const next = upsertMarkdownSection(content, undefined, book.review);
            if (next !== content) await this.app.vault.modify(file, next);
        }
    }

    private async createNew(folderPath: string, book: GoodreadsImportedBook, reservedPaths: Set<string>): Promise<void> {
        const path = this.resolveCreatePath(folderPath, book.title, reservedPaths);
        reservedPaths.add(path);
        const body = book.review ? upsertMarkdownSection(`# ${book.title}\n`, undefined, book.review) : `# ${book.title}\n`;
        await this.app.vault.create(path, body);
        const created = this.app.vault.getAbstractFileByPath(path);
        if (created instanceof TFile) {
            await this.app.fileManager.processFrontMatter(created, (frontmatter: Record<string, unknown>) => {
                Object.assign(frontmatter, book.frontmatter);
            });
        }
    }

    private resolveCreatePath(folderPath: string, title: string, reserved: Set<string>): string {
        const safeName = sanitizeFileName(title) || 'Untitled';
        let candidate = folderPath ? `${folderPath}/${safeName}.md` : `${safeName}.md`;
        let index = 2;
        while (reserved.has(candidate) || this.app.vault.getAbstractFileByPath(candidate)) {
            candidate = folderPath ? `${folderPath}/${safeName} ${index}.md` : `${safeName} ${index}.md`;
            index++;
        }
        return candidate;
    }
}
