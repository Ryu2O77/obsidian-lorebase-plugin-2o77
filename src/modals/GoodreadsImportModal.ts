import { App, Modal, Notice } from 'obsidian';
import { t } from '../localization';
import type { LorebaseSettings } from '../types';
import { GoodreadsImportService } from '../services/GoodreadsImportService';
import type { GoodreadsImportedBook } from '../services/integrations/goodreadsImport';
import { FileSuggest } from '../components/FileSuggest';

/**
 * Lets the user point at a Goodreads "Export Library" CSV they've dropped into the vault,
 * preview what it contains, and import it as book notes. Goodreads has no live API (it was
 * retired for new/third-party access in Dec 2020), so this is a one-time (but re-runnable)
 * import rather than a sync.
 */
export class GoodreadsImportModal extends Modal {
    private readonly service: GoodreadsImportService;
    private path = '';
    private preview: GoodreadsImportedBook[] | null = null;
    private summaryEl: HTMLElement | null = null;
    private importBtn: HTMLButtonElement | null = null;

    constructor(app: App, private readonly settings: LorebaseSettings, private readonly onDone: () => void) {
        super(app);
        this.service = new GoodreadsImportService(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('goodreadsImportTitle') });
        contentEl.createEl('p', { cls: 'lorebase-modal-desc', text: t('goodreadsImportDesc') });

        const field = contentEl.createDiv({ cls: 'lorebase-add-option-field' });
        field.createDiv({ cls: 'lorebase-editmode-field-label', text: t('goodreadsImportPathLabel') });
        const input = field.createEl('input', {
            cls: 'lorebase-editmode-input',
            attr: { type: 'text', placeholder: t('goodreadsImportPathPlaceholder') },
        });
        input.addEventListener('input', () => {
            this.path = input.value;
            this.preview = null;
            this.updateSummary('');
            if (this.importBtn) this.importBtn.disabled = true;
        });
        new FileSuggest(this.app, input, ['csv'], (path) => {
            this.path = path;
            this.preview = null;
            this.updateSummary('');
            if (this.importBtn) this.importBtn.disabled = true;
        });

        this.summaryEl = contentEl.createDiv({ cls: 'lorebase-modal-desc' });

        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        const cancel = actions.createEl('button', { text: t('goodreadsImportCancelBtn'), cls: 'lorebase-btn' });
        const previewBtn = actions.createEl('button', { text: t('goodreadsImportPreviewBtn'), cls: 'lorebase-btn' });
        const importBtn = actions.createEl('button', { text: t('goodreadsImportBtn'), cls: 'lorebase-btn lorebase-btn-primary' });
        importBtn.disabled = true;
        this.importBtn = importBtn;

        cancel.addEventListener('click', () => this.close());
        previewBtn.addEventListener('click', () => { void this.runPreview(); });
        importBtn.addEventListener('click', () => { void this.runImport(); });

        window.setTimeout(() => input.focus(), 0);
    }

    private updateSummary(text: string): void {
        if (this.summaryEl) this.summaryEl.setText(text);
    }

    private async runPreview(): Promise<void> {
        if (!this.path.trim()) return;
        const { books, error } = await this.service.preview(this.path);
        if (error === 'notFound') {
            this.updateSummary(t('goodreadsImportNotFound'));
            if (this.importBtn) this.importBtn.disabled = true;
            return;
        }
        if (error === 'empty' || !books.length) {
            this.updateSummary(t('goodreadsImportEmpty'));
            if (this.importBtn) this.importBtn.disabled = true;
            return;
        }
        this.preview = books;
        const completed = books.filter((b) => b.frontmatter.status === 'completed').length;
        const watching = books.filter((b) => b.frontmatter.status === 'watching').length;
        const planned = books.filter((b) => b.frontmatter.status === 'planned').length;
        this.updateSummary(
            t('goodreadsImportPreviewSummary')
                .replace('{count}', String(books.length))
                .replace('{completed}', String(completed))
                .replace('{watching}', String(watching))
                .replace('{planned}', String(planned))
        );
        if (this.importBtn) this.importBtn.disabled = false;
    }

    private async runImport(): Promise<void> {
        if (!this.preview) return;
        if (this.importBtn) this.importBtn.disabled = true;
        const result = await this.service.import(this.path, this.settings);
        new Notice(
            t('goodreadsImportDone')
                .replace('{created}', String(result.created))
                .replace('{updated}', String(result.updated))
                .replace('{failed}', String(result.failed)),
            6000
        );
        this.onDone();
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
