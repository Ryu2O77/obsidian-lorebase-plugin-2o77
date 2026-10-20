import { setIcon } from 'obsidian';
import { Companion, CompanionStatus } from '../types';
import { bindStarHover, paintStars, starValueFromClick } from './halfStars';
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
                // Inside the personal-rating box so both read as one section.
                const wrap = ratingPanel.querySelector('.lorebase-editmode-rating-wrap');
                const dates = ratingPanel.querySelector('.lorebase-editmode-play-dates');
                if (wrap) wrap.appendChild(peopleHost);
                else if (dates) dates.after(peopleHost);
                else ratingPanel.appendChild(peopleHost);
                this.host.addClass('is-people-moved');
            }
            peopleHost.createDiv({ cls: 'lorebase-editmode-panel-title-row' })
                .createEl('h3', { cls: 'lorebase-editmode-panel-title', text: t('editWatchedWith') });
            this.peopleEl = peopleHost.createDiv({ cls: 'lorebase-editmode-chip-row' });
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
        this.renderAddPerson(this.peopleEl);
    }

    /** A "+" chip that turns into a small inline input to add one more person. */
    private renderAddPerson(parent: HTMLElement): void {
        const add = parent.createEl('button', {
            cls: 'lorebase-editmode-chip lorebase-companion-add',
            text: '+',
            attr: { type: 'button', 'aria-label': t('editWatchedWithPlaceholder'), title: t('editWatchedWithPlaceholder') },
        });
        add.addEventListener('click', () => {
            const listId = `lorebase-companion-list-${++datalistCounter}`;
            const input = createEl('input', {
                cls: 'lorebase-editmode-input lorebase-companion-add-input',
                attr: { type: 'text', placeholder: t('editWatchedWithPlaceholder'), list: listId },
            });
            const datalist = createEl('datalist', { attr: { id: listId } });
            for (const suggestion of this.options.nameSuggestions) datalist.createEl('option', { attr: { value: suggestion } });
            add.replaceWith(input, datalist);
            input.focus();
            let done = false;
            const finish = (commit: boolean): void => {
                if (done) return;
                done = true;
                if (commit) this.watchedWith = addNames(this.watchedWith, parseNameList(input.value));
                this.renderPeople();
            };
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
                else if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); event.stopPropagation(); finish(true); }
            });
            input.addEventListener('blur', () => finish(true));
        });
    }

    private renderRow(entry: Companion): void {
        if (!this.rowsEl) return;
        const card = this.rowsEl.createDiv({ cls: 'lorebase-companion-card' });

        const head = card.createDiv({ cls: 'lorebase-companion-card-head' });
        head.createSpan({ cls: 'lorebase-companion-card-name', text: entry.name });
        const clear = head.createEl('button', {
            cls: 'lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tight',
            text: t('editClear'),
            attr: { type: 'button' },
        });

        const segments = card.createDiv({ cls: 'lorebase-editmode-segmented lorebase-companion-segments', attr: { role: 'tablist' } });
        const icons: Record<CompanionStatus, string> = { planned: 'circle', watching: 'play', completed: 'check', dropped: 'x', paused: 'pause' };
        const segmentButtons = new Map<CompanionStatus, HTMLButtonElement>();
        for (const value of COMPANION_STATUSES) {
            const button = segments.createEl('button', {
                cls: 'lorebase-editmode-segment',
                attr: { type: 'button', 'aria-pressed': 'false' },
            });
            setIcon(button.createSpan({ cls: 'lorebase-editmode-segment-icon', attr: { 'aria-hidden': 'true' } }), icons[value]);
            button.createSpan({ cls: 'lorebase-editmode-segment-label', text: this.options.statusLabels[value] });
            button.addEventListener('click', () => {
                entry.status = entry.status === value ? null : value;
                paintStatus();
            });
            segmentButtons.set(value, button);
        }

        const ratingBody = card.createDiv({ cls: 'lorebase-editmode-rating-body lorebase-companion-rating-body' });
        const stars = ratingBody.createDiv({ cls: 'lorebase-editmode-stars' });
        const valueEl = ratingBody.createSpan({ cls: 'lorebase-editmode-rating-value lorebase-companion-rating-value' });
        for (let value = 1; value <= 5; value++) {
            const star = stars.createEl('button', {
                cls: 'lorebase-editmode-star',
                text: String.fromCharCode(9733),
                attr: { type: 'button', 'data-rating': String(value), 'aria-label': `${t('editRating')} ${value}` },
            });
            star.addEventListener('click', (event) => {
                const picked = starValueFromClick(star, value, event);
                entry.rating = entry.rating === picked ? null : picked;
                paintRating();
            });
        }

        const paintStatus = (): void => {
            for (const [value, button] of segmentButtons) {
                button.toggleClass('is-active', entry.status === value);
                button.setAttr('aria-pressed', String(entry.status === value));
            }
        };
        const paintRating = (): void => {
            paintStars(stars, entry.rating);
            valueEl.setText(`${(entry.rating ?? 0).toFixed(1)} / 5.0`);
        };
        bindStarHover(stars, (value) => {
            paintStars(stars, value);
            valueEl.setText(`${value.toFixed(1)} / 5.0`);
        }, paintRating);
        clear.addEventListener('click', () => {
            entry.status = null;
            entry.rating = null;
            paintStatus();
            paintRating();
        });
        paintStatus();
        paintRating();
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
