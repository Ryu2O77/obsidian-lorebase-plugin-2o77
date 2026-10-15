import { App, Modal } from 'obsidian';
import { t } from '../localization';
import { collectVaultNames, FRANCHISE_KEYS, parseNameList, todayDateInput, WATCHED_WITH_KEYS } from '../services/media/people';
import type { MediaKind } from '../services/integrations/types';

export interface AddExtras {
    completed: boolean;
    finishedDate: string;
    watchedWith: string[];
    franchise: string[];
}

export const EMPTY_ADD_EXTRAS: AddExtras = { completed: false, finishedDate: '', watchedWith: [], franchise: [] };

/** True when the extras change anything, so callers can skip the extra write. */
export function hasAddExtras(extras: AddExtras): boolean {
    return extras.completed || extras.watchedWith.length > 0 || extras.franchise.length > 0;
}

/**
 * Small options dialog shown when adding items: mark them as completed right away
 * and (for movies, series and books) record who they were watched with and the franchise.
 * The values apply to every item added in this batch.
 */
export class AddOptionsModal extends Modal {
    private resolve?: (value: AddExtras | null) => void;
    private hasResolved = false;
    private completed = false;
    private finishedDate = todayDateInput();

    constructor(app: App, private readonly kind: MediaKind) {
        super(app);
    }

    openAndGetValue(): Promise<AddExtras | null> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('addOptionsTitle') });

        const completedRow = contentEl.createEl('label', { cls: 'lorebase-add-option-row' });
        const completedBox = completedRow.createEl('input', { attr: { type: 'checkbox' } });
        completedRow.createSpan({ text: t('addAsCompleted') });

        const dateRow = contentEl.createDiv({ cls: 'lorebase-add-option-row lorebase-add-option-date' });
        dateRow.createSpan({ text: t('addFinishedOn') });
        const dateInput = dateRow.createEl('input', {
            cls: 'lorebase-editmode-input',
            attr: { type: 'date', value: this.finishedDate },
        });
        dateRow.hide();
        completedBox.addEventListener('change', () => {
            this.completed = completedBox.checked;
            if (this.completed) dateRow.show(); else dateRow.hide();
        });
        dateInput.addEventListener('change', () => { this.finishedDate = dateInput.value; });

        let watchedInput: HTMLInputElement | null = null;
        let franchiseInput: HTMLInputElement | null = null;
        const supportsPeople = this.kind === 'movies' || this.kind === 'series' || this.kind === 'books';
        if (supportsPeople) {
            watchedInput = this.createListField(contentEl, t('addWatchedWith'), collectVaultNames(this.app, WATCHED_WITH_KEYS));
            franchiseInput = this.createListField(contentEl, t('addFranchise'), collectVaultNames(this.app, FRANCHISE_KEYS));
        }

        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        const cancel = actions.createEl('button', { text: t('commonCancel'), cls: 'lorebase-btn' });
        const confirm = actions.createEl('button', { text: t('addOptionsConfirm'), cls: 'lorebase-btn lorebase-btn-primary' });
        cancel.addEventListener('click', () => this.finish(null));
        const submit = (): void => this.finish({
            completed: this.completed,
            finishedDate: this.finishedDate || todayDateInput(),
            watchedWith: parseNameList(watchedInput?.value ?? ''),
            franchise: parseNameList(franchiseInput?.value ?? ''),
        });
        confirm.addEventListener('click', submit);
        contentEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'BUTTON') {
                event.preventDefault();
                submit();
            }
        });
        window.setTimeout(() => confirm.focus(), 0);
    }

    private createListField(parent: HTMLElement, label: string, suggestions: string[]): HTMLInputElement {
        const row = parent.createDiv({ cls: 'lorebase-add-option-field' });
        row.createDiv({ cls: 'lorebase-editmode-field-label', text: label });
        const listId = `lorebase-add-list-${Math.random().toString(36).slice(2, 8)}`;
        const input = row.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'text', list: listId } });
        const list = row.createEl('datalist', { attr: { id: listId } });
        for (const suggestion of suggestions) list.createEl('option', { attr: { value: suggestion } });
        return input;
    }

    private finish(value: AddExtras | null): void {
        if (this.hasResolved) return;
        this.hasResolved = true;
        this.resolve?.(value);
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.hasResolved) {
            this.hasResolved = true;
            this.resolve?.(null);
        }
    }
}
