import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';

/** Confirmation dialog before deleting every selected item. Resolves true only on explicit confirm. */
export class MassDeleteModal extends Modal {
    private resolve?: (value: boolean) => void;
    private done = false;

    constructor(app: App, private readonly titles: string[]) {
        super(app);
    }

    openAndGetValue(): Promise<boolean> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-delete-modal');
        const header = contentEl.createDiv({ cls: 'lorebase-delete-header' });
        setIcon(header.createDiv({ cls: 'lorebase-delete-icon' }), 'trash-2');
        const text = header.createDiv({ cls: 'lorebase-delete-header-text' });
        text.createEl('h2', { text: `${t('massDeleteTitle')} (${this.titles.length})` });
        text.createEl('p', { cls: 'lorebase-delete-subtitle', text: t('massDeleteBody') });

        const list = contentEl.createEl('ul', { cls: 'lorebase-mass-delete-list' });
        for (const title of this.titles.slice(0, 8)) list.createEl('li', { text: title });
        if (this.titles.length > 8) list.createEl('li', { text: `+${this.titles.length - 8}` });

        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        const cancel = actions.createEl('button', { text: t('commonCancel'), cls: 'lorebase-btn' });
        const confirm = actions.createEl('button', {
            text: `${t('massDeleteConfirm')} (${this.titles.length})`,
            cls: 'lorebase-btn mod-warning lorebase-btn-danger',
        });
        cancel.addEventListener('click', () => this.finish(false));
        confirm.addEventListener('click', () => this.finish(true));
        window.setTimeout(() => cancel.focus(), 0);
    }

    private finish(value: boolean): void {
        if (this.done) return;
        this.done = true;
        this.resolve?.(value);
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.done) {
            this.done = true;
            this.resolve?.(false);
        }
    }
}
