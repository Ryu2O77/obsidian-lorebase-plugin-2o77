import { getCompanionStatusLabels } from '../views/library/companionLabels';
import { App, Modal, Notice } from 'obsidian';
import { t } from '../localization';
import { bindDateTextInput } from './HierarchicalDatePicker';
import type { CompanionStatus, MediaType } from '../types';
import { COMPANION_STATUSES, collectVaultNames, FRANCHISE_KEYS, parseHalfRating, parseNameList, PLATFORM_KEYS, WATCHED_WITH_KEYS } from '../services/media/people';
import { hasMassChanges, MassEditChanges, supportsCompanions, supportsPeopleFields } from '../views/library/massEdit';

/** Dialog to change several fields on all selected items at once. */
export class MassEditModal extends Modal {
    private resolve?: (value: MassEditChanges | null) => void;
    private hasResolved = false;

    constructor(app: App, private readonly mediaType: MediaType, private readonly count: number) {
        super(app);
    }

    openAndGetValue(): Promise<MassEditChanges | null> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    private statusOptions(): Array<[string, string]> {
        if (this.mediaType === 'game') {
            return [
                ['not_started', t('statusNotStarted')], ['playing', t('statusPlaying')], ['played', t('statusPartlyPlayed')], ['completed', t('statusPlayed')],
                ['dropped', t('statusDropped')], ['wishlist', t('statusWishlist')], ['sandbox', t('statusSandbox')],
            ];
        }
        const reading = this.mediaType === 'book' || this.mediaType === 'manga';
        return [
            ['planned', reading ? t('statusPlanToRead') : t('statusPlanned')],
            ['watching', reading ? t('statusReading') : t('statusWatching')],
            ['completed', reading ? t('statusReadCompleted') : t('statusCompleted')],
            ['dropped', t('statusDropped')],
            ['paused', t('statusPaused')],
        ];
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-mass-edit');
        contentEl.createEl('h2', { text: `${t('massEditTitle')} (${this.count})` });

        const field = (label: string): HTMLElement => {
            const row = contentEl.createDiv({ cls: 'lorebase-mass-row' });
            row.createDiv({ cls: 'lorebase-editmode-field-label', text: label });
            return row.createDiv({ cls: 'lorebase-mass-control' });
        };
        const select = (host: HTMLElement, options: Array<[string, string]>): HTMLSelectElement => {
            const el = host.createEl('select', { cls: 'lorebase-editmode-input' });
            el.createEl('option', { text: t('massKeep'), attr: { value: '' } });
            for (const [value, label] of options) el.createEl('option', { text: label, attr: { value } });
            return el;
        };
        const text = (host: HTMLElement, placeholder: string, suggestions: string[] = []): HTMLInputElement => {
            const listId = `lorebase-mass-list-${Math.random().toString(36).slice(2, 8)}`;
            const input = host.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'text', placeholder, list: listId } });
            const list = host.createEl('datalist', { attr: { id: listId } });
            for (const suggestion of suggestions) list.createEl('option', { attr: { value: suggestion } });
            return input;
        };

        const statusSel = select(field(t('editStatus')), this.statusOptions());
        const ratingSel = select(field(t('editRating')), [
            ...Array.from({ length: 10 }, (_, i): [string, string] => [String((10 - i) / 2), `${(10 - i) / 2} \u2605`]),
            ['clear', t('massClearRating')],
        ]);
        const favoriteSel = select(field(t('editFavorite')), [['on', t('massFavoriteOn')], ['off', t('massFavoriteOff')]]);

        const finishHost = field(t('editFinished'));
        const finishToday = finishHost.createEl('label', { cls: 'lorebase-add-option-row' });
        const finishTodayBox = finishToday.createEl('input', { attr: { type: 'checkbox' } });
        finishToday.createSpan({ text: t('massFinishToday') });
        const dateRow = finishHost.createDiv({ cls: 'lorebase-add-option-row' });
        dateRow.createSpan({ text: t('massSetDate') });
        const dateInput = dateRow.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'text' } });
        let finishedIso = '';
        bindDateTextInput(dateInput, '', (iso) => { finishedIso = iso; });
        const clearDate = finishHost.createEl('label', { cls: 'lorebase-add-option-row' });
        const clearDateBox = clearDate.createEl('input', { attr: { type: 'checkbox' } });
        clearDate.createSpan({ text: t('massClearDate') });

        const tagsHost = field(t('tags'));
        const tagsAdd = text(tagsHost, `${t('massAdd')}: ${t('massValuesPlaceholder')}`);
        const tagsRemove = text(tagsHost, `${t('massRemove')}: ${t('massValuesPlaceholder')}`);

        const platformsHost = field(t('tableColPlatforms'));
        const platformsAdd = text(platformsHost, `${t('massAdd')}: ${t('massValuesPlaceholder')}`, collectVaultNames(this.app, PLATFORM_KEYS));
        const platformsRemove = text(platformsHost, `${t('massRemove')}: ${t('massValuesPlaceholder')}`, collectVaultNames(this.app, PLATFORM_KEYS));

        let watchedAdd: HTMLInputElement | null = null;
        let watchedRemove: HTMLInputElement | null = null;
        let franchiseAdd: HTMLInputElement | null = null;
        let franchiseRemove: HTMLInputElement | null = null;
        let personName: HTMLInputElement | null = null;
        let personStatus: HTMLSelectElement | null = null;
        let personRating: HTMLSelectElement | null = null;
        if (supportsCompanions(this.mediaType)) {
            const people = collectVaultNames(this.app, WATCHED_WITH_KEYS);
            const wHost = field(t('editWatchedWith'));
            watchedAdd = text(wHost, `${t('massAdd')}: ${t('massValuesPlaceholder')}`, people);
            watchedRemove = text(wHost, `${t('massRemove')}: ${t('massValuesPlaceholder')}`, people);
            const pHost = field(`${t('editWatchedWith')} \u2192 ${t('editStatus')} / ${t('editRating')}`);
            personName = text(pHost, t('editWatchedWithPlaceholder'), people);
            personStatus = select(pHost, COMPANION_STATUSES.map((s): [string, string] => [s, this.statusLabel(s)]));
            personRating = select(pHost, [
                ...Array.from({ length: 10 }, (_, i): [string, string] => [String((i + 1) / 2), `${(i + 1) / 2} \u2605`]),
                ['clear', t('massClearRating')],
            ]);
        }
        if (supportsPeopleFields(this.mediaType)) {
            const franchises = collectVaultNames(this.app, FRANCHISE_KEYS);
            const fHost = field(t('editFranchise'));
            franchiseAdd = text(fHost, `${t('massAdd')}: ${t('massValuesPlaceholder')}`, franchises);
            franchiseRemove = text(fHost, `${t('massRemove')}: ${t('massValuesPlaceholder')}`, franchises);
        }

        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        const cancel = actions.createEl('button', { text: t('commonCancel'), cls: 'lorebase-btn' });
        const apply = actions.createEl('button', { text: t('massApply'), cls: 'lorebase-btn lorebase-btn-primary' });
        cancel.addEventListener('click', () => this.finish(null));
        apply.addEventListener('click', () => {
            const changes: MassEditChanges = {};
            if (statusSel.value) changes.status = statusSel.value;
            if (ratingSel.value) changes.rating = ratingSel.value === 'clear' ? null : Number(ratingSel.value);
            if (favoriteSel.value) changes.favorite = favoriteSel.value === 'on';
            if (finishTodayBox.checked) changes.finishToday = true;
            if (clearDateBox.checked) changes.finished = null;
            else if (finishedIso) changes.finished = finishedIso;
            const addTags = parseNameList(tagsAdd.value);
            const removeTags = parseNameList(tagsRemove.value);
            if (addTags.length) changes.tagsAdd = addTags;
            if (removeTags.length) changes.tagsRemove = removeTags;
            const addPlatforms = parseNameList(platformsAdd.value);
            const removePlatforms = parseNameList(platformsRemove.value);
            if (addPlatforms.length) changes.platformsAdd = addPlatforms;
            if (removePlatforms.length) changes.platformsRemove = removePlatforms;
            if (franchiseAdd && franchiseRemove) {
                const fAdd = parseNameList(franchiseAdd.value);
                const fRemove = parseNameList(franchiseRemove.value);
                if (fAdd.length) changes.franchiseAdd = fAdd;
                if (fRemove.length) changes.franchiseRemove = fRemove;
            }
            if (watchedAdd && watchedRemove && personName && personStatus && personRating) {
                const wAdd = parseNameList(watchedAdd.value);
                const wRemove = parseNameList(watchedRemove.value);
                if (wAdd.length) changes.watchedWithAdd = wAdd;
                if (wRemove.length) changes.watchedWithRemove = wRemove;
                const name = personName.value.trim();
                if (name && (personStatus.value || personRating.value)) {
                    changes.person = { name };
                    if (personStatus.value) changes.person.status = personStatus.value as CompanionStatus;
                    if (personRating.value) changes.person.rating = personRating.value === 'clear' ? null : parseHalfRating(personRating.value);
                }
            }
            if (!hasMassChanges(changes)) {
                new Notice(t('massNothingToChange'));
                return;
            }
            this.finish(changes);
        });
    }

    private statusLabel(status: CompanionStatus): string {
        return getCompanionStatusLabels(this.mediaType)[status];
    }

    private finish(value: MassEditChanges | null): void {
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
