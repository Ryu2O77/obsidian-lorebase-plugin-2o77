import { App, Modal } from 'obsidian';
import { t } from '../localization';
import type { AutoFillOutcome, MediaItem } from '../types';

type Runner = (item: MediaItem, acceptFirst: boolean) => Promise<AutoFillOutcome>;
interface Entry { title: string; outcome: AutoFillOutcome }

/**
 * Looks up every selected item by title and links it to the best provider match.
 * Confirm screen -> live progress with a Stop button -> summary of what needs review.
 */
export class AutoFillModal extends Modal {
    private acceptFirst = false;
    private stopped = false;
    private running = false;

    constructor(
        app: App,
        private readonly items: MediaItem[],
        private readonly run: Runner,
        private readonly onFinished: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        this.contentEl.addClass('lorebase-autofill');
        this.renderConfirm();
    }

    private renderConfirm(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('autoFillTitle') });
        contentEl.createEl('p', { text: `${this.items.length} ${t('autoFillIntro')}` });
        const row = contentEl.createEl('label', { cls: 'lorebase-add-option-row' });
        const box = row.createEl('input', { attr: { type: 'checkbox' } });
        row.createSpan({ text: t('autoFillAcceptFirst') });
        box.addEventListener('change', () => { this.acceptFirst = box.checked; });
        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        actions.createEl('button', { text: t('commonCancel'), cls: 'lorebase-btn' }).addEventListener('click', () => this.close());
        actions.createEl('button', { text: t('autoFillStart'), cls: 'lorebase-btn lorebase-btn-primary' })
            .addEventListener('click', () => { void this.start(); });
    }

    private async start(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('autoFillRunning') });
        const status = contentEl.createDiv({ cls: 'lorebase-autofill-status' });
        const track = contentEl.createDiv({ cls: 'lorebase-stats-bar' });
        const fill = track.createDiv({ cls: 'lorebase-stats-bar-fill' });
        const stop = contentEl.createDiv({ cls: 'lorebase-modal-actions' })
            .createEl('button', { text: t('autoFillStop'), cls: 'lorebase-btn' });
        stop.addEventListener('click', () => { this.stopped = true; stop.disabled = true; });

        const results: Entry[] = [];
        this.running = true;
        for (let index = 0; index < this.items.length; index++) {
            if (this.stopped) break;
            const item = this.items[index];
            status.setText(`${index + 1}/${this.items.length} \u00B7 ${item.displayName}`);
            fill.style.width = `${Math.round((index / this.items.length) * 100)}%`;
            let outcome: AutoFillOutcome;
            try {
                outcome = await this.run(item, this.acceptFirst);
            } catch {
                outcome = { status: 'failed' };
            }
            results.push({ title: item.displayName, outcome });
        }
        this.running = false;
        this.onFinished();
        this.renderSummary(results);
    }

    private renderSummary(results: Entry[]): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('autoFillTitle') });
        const count = (status: AutoFillOutcome['status']): Entry[] => results.filter((entry) => entry.outcome.status === status);
        const sections: Array<[AutoFillOutcome['status'], string]> = [
            ['linked', t('autoFillLinked')], ['review', t('autoFillReview')],
            ['notfound', t('autoFillNotFound')], ['failed', t('autoFillFailed')],
        ];
        for (const [status, label] of sections) {
            const entries = count(status);
            const line = contentEl.createDiv({ cls: `lorebase-autofill-line is-${status}` });
            line.createSpan({ cls: 'lorebase-autofill-count', text: String(entries.length) });
            line.createSpan({ text: label });
            if (status !== 'linked' && entries.length) {
                const list = contentEl.createEl('ul', { cls: 'lorebase-autofill-list' });
                for (const entry of entries) {
                    const extra = entry.outcome.candidate ? ` \u2192 ${entry.outcome.candidate}` : '';
                    list.createEl('li', { text: `${entry.title}${extra}` });
                }
            }
        }
        contentEl.createDiv({ cls: 'lorebase-modal-actions' })
            .createEl('button', { text: t('autoFillClose'), cls: 'lorebase-btn lorebase-btn-primary' })
            .addEventListener('click', () => this.close());
    }

    onClose(): void {
        if (this.running) this.stopped = true;
        this.contentEl.empty();
    }
}
