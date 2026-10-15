import { App, Modal } from 'obsidian';
import { t } from '../localization';

/** Asks for one person's name (with suggestions from names already used). */
export class PersonPromptModal extends Modal {
    private resolve?: (value: string | null) => void;
    private done = false;

    constructor(app: App, private readonly suggestions: string[]) {
        super(app);
    }

    openAndGetValue(): Promise<string | null> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('personPrompt') });
        const listId = `lorebase-person-${Math.random().toString(36).slice(2, 8)}`;
        const input = contentEl.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'text', list: listId } });
        const list = contentEl.createEl('datalist', { attr: { id: listId } });
        for (const name of this.suggestions) list.createEl('option', { attr: { value: name } });
        const submit = (): void => this.finish(input.value.trim() || null);
        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        actions.createEl('button', { text: t('commonCancel'), cls: 'lorebase-btn' }).addEventListener('click', () => this.finish(null));
        actions.createEl('button', { text: t('addOptionsConfirm'), cls: 'lorebase-btn lorebase-btn-primary' }).addEventListener('click', submit);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); submit(); }
        });
        window.setTimeout(() => input.focus(), 0);
    }

    private finish(value: string | null): void {
        if (this.done) return;
        this.done = true;
        this.resolve?.(value);
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.done) {
            this.done = true;
            this.resolve?.(null);
        }
    }
}
