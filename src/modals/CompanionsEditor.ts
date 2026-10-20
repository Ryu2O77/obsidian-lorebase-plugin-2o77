import { Companion, CompanionStatus } from '../types';
import { t } from '../localization';
import { COMPANION_STATUSES, addNames, parseHalfRating, parseNameList } from '../services/media/people';

export interface CompanionsEditorOptions {
    /** Show the "Watched with" block (people + their status/rating) */
    showWatchedWith: boolean;
    /** Show the franchise block */
    showFranchise: boolean;
    watchedWith: string[];
    companions: Companion[];
    franchise: string[];
    nameSuggestions: string[];
    franchiseSuggestions: string[];
    /** Optional "Platforms" chip block (streaming service, store, device) */
    showPlatforms?: boolean;
    platforms?: string[];
    platformSuggestions?: string[];
    statusLabels: Record<CompanionStatus, string>;
}

export interface CompanionsEditorValue {
    watchedWith: string[];
    companions: Companion[];
    franchise: string[];
    platforms: string[];
}

let datalistCounter = 0;

/**
 * Editor block for "Watched with" (each person carries their own status and
 * rating in 0.5 steps) and "Franchise". Builds DOM directly, no HTML strings.
 */
export class CompanionsEditor {
    private watchedWith: string[];
    private franchise: string[];
    private platforms: string[];
    private readonly data = new Map<string, Companion>();
    private peopleEl?: HTMLElement;
    private rowsEl?: HTMLElement;
    private franchiseEl?: HTMLElement;
    private platformsEl?: HTMLElement;

    constructor(private readonly host: HTMLElement, private readonly options: CompanionsEditorOptions) {
        this.watchedWith = parseNameList(options.watchedWith);
        this.franchise = parseNameList(options.franchise);
        this.platforms = parseNameList(options.platforms ?? []);
        for (const companion of options.companions) {
            this.data.set(companion.name.toLocaleLowerCase(), { ...companion });
        }
        this.render();
    }

    getValue(): CompanionsEditorValue {
        const companions = this.watchedWith.map((name) => this.ensure(name));
        // Keep data of people removed from the list so nothing is lost, but only report active ones.
        return {
            watchedWith: [...this.watchedWith],
            companions: companions.map((entry) => ({ ...entry })),
            franchise: [...this.franchise],
            platforms: [...this.platforms],
        };
    }

    private ensure(name: string): Companion {
        const key = name.toLocaleLowerCase();
        let entry = this.data.get(key);
        if (!entry) {
            entry = { name, status: null, rating: null };
            this.data.set(key, entry);
        }
        return entry;
    }

    private render(): void {
        this.host.empty();
        if (this.options.showWatchedWith) {
            // When the editor has a status & rating panel, the per-person block lives there so it reads as part of the rating.
            const ratingPanel = this.host.closest('.lorebase-editmode-view')?.querySelector<HTMLElement>('.lorebase-editmode-status-rating') ?? null;
            let peopleHost = this.host;
            if (ratingPanel) {
                ratingPanel.querySelector('.lorebase-companion-people-block')?.remove();
                peopleHost = createDiv({ cls: 'lorebase-companion-people-block' });
                const dates = ratingPanel.querySelector('.lorebase-editmode-play-dates');
                if (dates) dates.before(peopleHost);
                else ratingPanel.appendChild(peopleHost);
                this.host.addClass('is-people-moved');
            }
            peopleHost.createDiv({ cls: 'lorebase-editmode-panel-title-row' })
                .createEl('h3', { cls: 'lorebase-editmode-panel-title', text: t('editWatchedWith') });
            this.peopleEl = peopleHost.createDiv({ cls: 'lorebase-editmode-chip-row' });
            this.buildInput(peopleHost, t('editWatchedWithPlaceholder'), this.options.nameSuggestions, (value) => {
                this.watchedWith = addNames(this.watchedWith, [value]);
                this.renderPeople();
            });
            this.rowsEl = peopleHost.createDiv({ cls: 'lorebase-companion-rows' });
            this.renderPeople();
        }
        if (this.options.showFranchise) {
            const titleRow = this.host.createDiv({ cls: 'lorebase-editmode-panel-title-row lorebase-companion-franchise-title' });
            titleRow.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: t('editFranchise') });
            this.franchiseEl = this.host.createDiv({ cls: 'lorebase-editmode-chip-row' });
            this.buildInput(this.host, t('editFranchisePlaceholder'), this.options.franchiseSuggestions, (value) => {
                this.franchise = addNames(this.franchise, [value]);
                this.renderFranchise();
            });
            this.renderFranchise();
        }
        if (this.options.showPlatforms) {
            const titleRow = this.host.createDiv({ cls: 'lorebase-editmode-panel-title-row lorebase-companion-franchise-title' });
            titleRow.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: t('editPlatforms') });
            this.platformsEl = this.host.createDiv({ cls: 'lorebase-editmode-chip-row' });
            this.buildInput(this.host, t('editPlatformPlaceholder'), this.options.platformSuggestions ?? [], (value) => {
                this.platforms = addNames(this.platforms, [value]);
                this.renderPlatforms();
            });
            this.renderPlatforms();
        }
    }

    private buildInput(parent: HTMLElement, placeholder: string, suggestions: string[], onAdd: (value: string) => void): void {
        const listId = `lorebase-companion-list-${++datalistCounter}`;
        const input = parent.createEl('input', {
            cls: 'lorebase-editmode-input lorebase-editmode-tag-input',
            attr: { type: 'text', placeholder, list: listId },
        });
        const datalist = parent.createEl('datalist', { attr: { id: listId } });
        for (const suggestion of suggestions) datalist.createEl('option', { attr: { value: suggestion } });
        const commit = (): void => {
            for (const piece of parseNameList(input.value)) onAdd(piece);
            input.value = '';
        };
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ',') return;
            event.preventDefault();
            event.stopPropagation();
            commit();
        });
        input.addEventListener('change', commit);
    }

    private renderPeople(): void {
        if (!this.peopleEl || !this.rowsEl) return;
        this.peopleEl.empty();
        this.rowsEl.empty();
        for (const name of this.watchedWith) {
            const chip = this.peopleEl.createEl('button', {
                cls: 'lorebase-editmode-chip',
                text: name,
                attr: { type: 'button', title: t('editRemoveHint') },
            });
            chip.addEventListener('click', () => {
                this.watchedWith = this.watchedWith.filter((entry) => entry.toLocaleLowerCase() !== name.toLocaleLowerCase());
                this.renderPeople();
            });
            this.renderRow(this.ensure(name));
        }
    }

    private renderRow(entry: Companion): void {
        if (!this.rowsEl) return;
        const row = this.rowsEl.createDiv({ cls: 'lorebase-companion-row' });
        row.createSpan({ cls: 'lorebase-companion-row-name', text: entry.name });

        const status = row.createEl('select', { cls: 'lorebase-editmode-input lorebase-companion-select' });
        status.createEl('option', { text: '—', attr: { value: '' } });
        for (const value of COMPANION_STATUSES) {
            status.createEl('option', { text: this.options.statusLabels[value], attr: { value } });
        }
        status.value = entry.status ?? '';
        status.addEventListener('change', () => {
            entry.status = (status.value || null) as CompanionStatus | null;
        });

        const rating = row.createEl('select', { cls: 'lorebase-editmode-input lorebase-companion-select' });
        rating.createEl('option', { text: '—', attr: { value: '' } });
        for (let step = 1; step <= 10; step++) {
            const value = step / 2;
            rating.createEl('option', { text: `${value} \u2605`, attr: { value: String(value) } });
        }
        rating.value = entry.rating === null ? '' : String(entry.rating);
        rating.addEventListener('change', () => {
            entry.rating = parseHalfRating(rating.value);
        });
    }

    private renderFranchise(): void {
        if (!this.franchiseEl) return;
        this.franchiseEl.empty();
        for (const value of this.franchise) {
            const chip = this.franchiseEl.createEl('button', {
                cls: 'lorebase-editmode-chip',
                text: value,
                attr: { type: 'button', title: t('editRemoveHint') },
            });
            chip.addEventListener('click', () => {
                this.franchise = this.franchise.filter((entry) => entry.toLocaleLowerCase() !== value.toLocaleLowerCase());
                this.renderFranchise();
            });
        }
    }

    private renderPlatforms(): void {
        if (!this.platformsEl) return;
        this.platformsEl.empty();
        for (const value of this.platforms) {
            const chip = this.platformsEl.createEl('button', {
                cls: 'lorebase-editmode-chip',
                text: value,
                attr: { type: 'button', title: t('editRemoveHint') },
            });
            chip.addEventListener('click', () => {
                this.platforms = this.platforms.filter((entry) => entry.toLocaleLowerCase() !== value.toLocaleLowerCase());
                this.renderPlatforms();
            });
        }
    }
}
