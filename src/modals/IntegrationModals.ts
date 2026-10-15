/**
 * LOREBASE - Integration Modals
 * Simple input, choice, and search modals for integrations
 */

import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';
import { getSteamAppIdFromImageUrl, getSteamVerticalImageCandidates } from '../services/integrations/steamImages';
import { fetchBinary } from '../services/integrations/shared';

export class ChoiceModal extends Modal {
    private titleText: string;
    private bodyText: string;
    private confirmText: string;
    private cancelText: string;
    private resolve?: (value: boolean) => void;
    private hasResolved = false;

    constructor(
        app: App,
        titleText: string,
        bodyText: string,
        confirmText: string,
        cancelText: string
    ) {
        super(app);
        this.titleText = titleText;
        this.bodyText = bodyText;
        this.confirmText = confirmText;
        this.cancelText = cancelText;
    }

    openAndGetValue(): Promise<boolean> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: this.titleText });
        contentEl.createDiv({ text: this.bodyText, cls: 'lorebase-modal-body' });

        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        const cancelBtn = actions.createEl('button', { text: this.cancelText, cls: 'lorebase-btn' });
        const confirmBtn = actions.createEl('button', { text: this.confirmText, cls: 'lorebase-btn lorebase-btn-primary' });

        cancelBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(false);
            this.close();
        });

        confirmBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(true);
            this.close();
        });
    }

    onClose(): void {
        if (!this.hasResolved) {
            this.resolve?.(false);
        }
        const { contentEl } = this;
        contentEl.empty();
    }
}

export type ExistingFileChoice = 'update' | 'separate' | 'skip';

export interface ExistingFilePreview {
    title?: string;
    subtitle?: string;
    meta?: string[];
    image?: string;
}

export class ExistingFileChoiceModal extends Modal {
    private titleText: string;
    private bodyText: string;
    private filePath: string;
    private preview: ExistingFilePreview;
    private resolve?: (value: ExistingFileChoice) => void;
    private hasResolved = false;

    constructor(app: App, titleText: string, bodyText: string, filePath: string, preview: ExistingFilePreview = {}) {
        super(app);
        this.titleText = titleText;
        this.bodyText = bodyText;
        this.filePath = filePath;
        this.preview = preview;
    }

    openAndGetValue(): Promise<ExistingFileChoice> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        this.modalEl.addClass('lorebase-existing-file-modal');
        contentEl.createEl('h2', { text: this.titleText, cls: 'lorebase-existing-file-heading' });
        contentEl.createDiv({ text: this.bodyText, cls: 'lorebase-modal-body lorebase-existing-file-body' });

        const card = contentEl.createDiv({ cls: 'lorebase-existing-file-preview' });
        const poster = card.createDiv({ cls: 'lorebase-existing-file-poster' });
        const image = this.preview.image?.trim();
        if (image) {
            poster.setCssStyles({ backgroundImage: `url("${image.replace(/"/g, '\\"')}")` });
        } else {
            poster.addClass('is-empty');
            setIcon(poster, 'image');
        }

        const info = card.createDiv({ cls: 'lorebase-existing-file-info' });
        info.createDiv({ cls: 'lorebase-existing-file-title', text: this.preview.title?.trim() || this.titleText });
        const metaValues = this.preview.meta?.map(value => value.trim()).filter(Boolean) ?? [];
        const subtitle = this.preview.subtitle?.trim();
        if (metaValues.length) {
            const meta = info.createDiv({ cls: 'lorebase-existing-file-meta' });
            for (const value of metaValues) {
                meta.createSpan({ cls: 'lorebase-existing-file-meta-pill', text: value });
            }
        } else if (subtitle) {
            const meta = info.createDiv({ cls: 'lorebase-existing-file-meta' });
            meta.createSpan({ cls: 'lorebase-existing-file-meta-pill', text: subtitle });
        }
        info.createDiv({ cls: 'lorebase-existing-file-path-label', text: this.filePath });

        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-existing-file-actions' });
        const skipBtn = this.createExistingFileAction(actions, t('promptFileExistsSkip'), 'x', 'lorebase-existing-file-secondary lorebase-existing-file-skip');
        const separateBtn = this.createExistingFileAction(actions, t('promptFileExistsSeparate'), 'copy-plus', 'lorebase-existing-file-secondary lorebase-existing-file-separate');
        const updateBtn = this.createExistingFileAction(actions, t('promptFileExistsUpdate'), 'refresh-cw', 'lorebase-btn-primary lorebase-existing-file-primary');

        skipBtn.addEventListener('click', () => this.finish('skip'));
        separateBtn.addEventListener('click', () => this.finish('separate'));
        updateBtn.addEventListener('click', () => this.finish('update'));
    }

    onClose(): void {
        this.modalEl.removeClass('lorebase-existing-file-modal');
        if (!this.hasResolved) {
            this.resolve?.('skip');
        }
        this.contentEl.empty();
    }

    private finish(value: ExistingFileChoice): void {
        this.hasResolved = true;
        this.resolve?.(value);
        this.close();
    }

    private createExistingFileAction(container: HTMLElement, label: string, icon: string, extraClass: string): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: `lorebase-btn lorebase-existing-file-action ${extraClass}`,
            attr: { type: 'button' },
        });
        const iconEl = button.createSpan({ cls: 'lorebase-existing-file-action-icon' });
        setIcon(iconEl, icon);
        button.createSpan({ cls: 'lorebase-existing-file-action-label', text: label });
        return button;
    }
}

export interface SearchItem {
    id?: string;
    title: string;
    subtitle?: string;
    image?: string;
    year?: string;
    format?: string;
    status?: string;
    provider?: string;
}

export interface SearchProviderOption {
    id: string;
    label: string;
    disabled?: boolean;
    disabledReason?: string;
}

type SearchOptions = {
    includeDlc?: boolean;
    page?: number;
    pageSize?: number;
    language?: string;
};

/** Remembered for the rest of the session so repeated searches keep the chosen language. */
let lastMetadataLanguage = '';
type SearchHandler<T extends SearchItem> = (query: string, providerId?: string, options?: SearchOptions) => Promise<T[]>;
type ImageFallbackResolver<T extends SearchItem> = (item: T) => Promise<string>;

const SEARCH_PAGE_SIZE = 10;

export class MultiSelectSearchModal<T extends SearchItem> extends Modal {
    private searchHandler: SearchHandler<T>;
    private items: T[] = [];
    private selected = new Map<string, T>();
    private placeholder: string;
    private titleText: string;
    private emptyText: string;
    private doneText: string;
    private cancelText: string;
    private titleIcon: string;
    private syncActionText?: string;
    private onSyncAction?: () => void;
    private manualActionText?: string;
    private onManualAction?: () => void;
    private includeDlcToggleText?: string;
    private keepPosterToggleText?: string;
    private keepPoster = false;
    private providerOptions: SearchProviderOption[];
    private activeProviderId?: string;
    private resolve?: (value: T[] | null) => void;
    private hasResolved = false;
    private focusedIndex = 0;
    private searchSeq = 0;
    private currentQuery = '';
    private currentPage = 1;
    private isReviewing = false;
    private includeDlc = false;
    private language = lastMetadataLanguage;
    private languageOptions: Array<{ value: string; label: string }> = [];
    private languageLabel = '';
    private maxSelection?: number;
    private imageFallbackResolver?: ImageFallbackResolver<T>;

    private inputEl?: HTMLInputElement;
    private searchBtn?: HTMLButtonElement;
    private searchBtnIcon?: HTMLElement;
    private providerListEl?: HTMLElement;
    private searchOptionsEl?: HTMLElement;
    private gridEl?: HTMLElement;
    private paginationEl?: HTMLElement;
    private doneBtn?: HTMLButtonElement;
    private lastErrorText = '';
    private isLoading = false;
    private activeSearchKey: string | null = null;
    private hasNextPage = false;
    private objectUrls: string[] = [];
    private previewObjectUrlCache = new Map<string, string>();
    private previewFallbackRequests = new Map<string, Promise<string>>();

    constructor(
        app: App,
        searchHandler: SearchHandler<T>,
        options: {
            titleText: string;
            placeholder: string;
            emptyText: string;
            doneText: string;
            cancelText: string;
            providerOptions?: SearchProviderOption[];
            initialProviderId?: string;
            titleIcon?: string;
            syncActionText?: string;
            onSyncAction?: () => void;
            manualActionText?: string;
            onManualAction?: () => void;
            includeDlcToggleText?: string;
            languageOptions?: Array<{ value: string; label: string }>;
            languageLabel?: string;
            keepPosterToggleText?: string;
            initialQuery?: string;
            maxSelection?: number;
            imageFallbackResolver?: ImageFallbackResolver<T>;
        }
    ) {
        super(app);
        this.searchHandler = searchHandler;
        this.titleText = options.titleText;
        this.placeholder = options.placeholder;
        this.emptyText = options.emptyText;
        this.doneText = options.doneText;
        this.cancelText = options.cancelText;
        this.titleIcon = options.titleIcon ?? 'search';
        this.syncActionText = options.syncActionText;
        this.onSyncAction = options.onSyncAction;
        this.manualActionText = options.manualActionText;
        this.onManualAction = options.onManualAction;
        this.includeDlcToggleText = options.includeDlcToggleText;
        this.languageOptions = options.languageOptions ?? [];
        this.languageLabel = options.languageLabel ?? '';
        this.keepPosterToggleText = options.keepPosterToggleText;
        this.providerOptions = options.providerOptions ?? [];
        this.activeProviderId = this.resolveInitialProvider(options.initialProviderId);
        this.currentQuery = options.initialQuery?.trim() ?? '';
        this.maxSelection = options.maxSelection;
        this.imageFallbackResolver = options.imageFallbackResolver;
    }

    /** Read after openAndGetValues() resolves, when a keep-poster toggle was offered. */
    getKeepPoster(): boolean {
        return this.keepPoster;
    }

    openAndGetValues(): Promise<T[] | null> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-select-modal-container');
        this.renderSearchView();
        this.modalEl.addEventListener('keydown', this.onKeydown);
    }

    onClose(): void {
        this.modalEl.removeClass('lorebase-select-modal-container');
        this.modalEl.removeEventListener('keydown', this.onKeydown);
        this.revokeObjectUrls();
        if (!this.hasResolved) {
            this.resolve?.(null);
        }
        this.contentEl.empty();
    }

    private renderSearchView(): void {
        this.isReviewing = false;
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-select-modal');
        contentEl.addClass('lorebase-select-multi');

        const header = contentEl.createDiv({ cls: 'lorebase-select-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-select-title-row' });
        const titleIcon = titleRow.createSpan({ cls: 'lorebase-select-title-icon' });
        setIcon(titleIcon, this.titleIcon);
        titleRow.createEl('h2', { cls: 'lorebase-select-title', text: this.titleText });
        const syncBtn = this.onSyncAction && this.syncActionText
            ? this.createHeaderActionButton(titleRow, 'refresh-cw', this.syncActionText)
            : null;
        const manualBtn = this.onManualAction && this.manualActionText
            ? this.createHeaderActionButton(titleRow, 'file-plus-2', this.manualActionText)
            : null;

        const searchShell = contentEl.createDiv({ cls: 'lorebase-select-search-shell' });
        const searchWrap = searchShell.createDiv({ cls: 'lorebase-select-search-wrap' });
        const searchIcon = searchWrap.createSpan({ cls: 'lorebase-select-search-icon' });
        setIcon(searchIcon, 'search');
        this.inputEl = searchWrap.createEl('input', {
            cls: 'lorebase-select-search',
            attr: { type: 'text', placeholder: this.placeholder }
        });
        this.inputEl.value = this.currentQuery;
        this.searchBtn = searchWrap.createEl('button', {
            cls: 'lorebase-select-search-submit',
            attr: {
                type: 'button',
                'aria-label': t('promptSearchAction'),
                title: t('promptSearchAction'),
            },
        });
        this.searchBtnIcon = this.searchBtn.createSpan({ cls: 'lorebase-select-search-submit-icon' });
        setIcon(this.searchBtnIcon, 'search');
        this.searchBtn.createSpan({ cls: 'lorebase-select-search-submit-label', text: t('promptSearchAction') });
        const searchControls = searchShell.createDiv({ cls: 'lorebase-select-search-controls' });
        this.providerListEl = searchControls.createDiv({ cls: 'lorebase-select-providers' });
        this.searchOptionsEl = searchControls.createDiv({ cls: 'lorebase-select-search-options' });
        this.renderProviders();
        this.renderSearchOptions();

        this.inputEl.addEventListener('input', () => this.updateSearchDraft());
        this.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void this.runSearch();
            }
        });
        this.searchBtn.addEventListener('click', () => void this.runSearch());
        this.updateSearchButtonState();

        this.gridEl = contentEl.createDiv({ cls: 'lorebase-select-grid lorebase-select-search-grid' });
        this.renderGrid();
        this.paginationEl = contentEl.createDiv({ cls: 'lorebase-select-pagination' });
        this.renderPagination();

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        const cancelBtn = this.createFooterButton(footer, 'x', this.cancelText, 'secondary');
        this.doneBtn = this.createFooterButton(footer, 'check-check', this.doneText, 'primary');
        this.renderSelected();

        cancelBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
        });

        syncBtn?.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
            this.onSyncAction?.();
        });
        manualBtn?.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
            this.onManualAction?.();
        });

        this.doneBtn.addEventListener('click', () => this.renderReviewView());
        this.inputEl.focus();
    }

    private renderReviewView(): void {
        this.isReviewing = true;
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-select-modal');
        contentEl.addClass('lorebase-select-multi');

        const header = contentEl.createDiv({ cls: 'lorebase-select-review-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-select-review-title-row' });
        const titleIcon = titleRow.createSpan({ cls: 'lorebase-select-title-icon' });
        setIcon(titleIcon, 'check-check');
        titleRow.createEl('h2', {
            cls: 'lorebase-select-title lorebase-select-review-heading',
            text: `${t('promptReviewSelected')}: ${this.selected.size}`,
        });
        header.createDiv({ cls: 'lorebase-select-review-subtitle', text: t('promptReviewSelectedSubtitle') });

        const list = contentEl.createDiv({ cls: 'lorebase-select-review-gallery' });
        for (const item of this.selected.values()) {
            const card = list.createDiv({ cls: 'lorebase-select-review-card' });
            const image = card.createDiv({ cls: 'lorebase-select-review-poster' });
            if (item.image) {
                this.setPreviewBackground(image, item.image, item);
            } else {
                image.addClass('is-empty');
                const emptyIcon = image.createSpan({ cls: 'lorebase-select-review-empty-icon' });
                setIcon(emptyIcon, 'image-off');
                if (item.provider) {
                    image.createSpan({
                        cls: 'lorebase-select-review-empty-provider',
                        text: this.formatProvider(item.provider),
                    });
                }
            }

            if (item.provider && item.image) {
                image.createSpan({
                    cls: 'lorebase-select-review-provider',
                    text: this.formatProvider(item.provider),
                });
            }

            const remove = card.createEl('button', {
                cls: 'lorebase-select-review-remove',
                attr: {
                    type: 'button',
                    'aria-label': t('promptRemoveSelected'),
                    title: t('promptRemoveSelected'),
                },
            });
            setIcon(remove, 'trash-2');
            remove.addEventListener('click', () => {
                this.selected.delete(this.getItemKey(item));
                this.renderReviewView();
            });

            const body = card.createDiv({ cls: 'lorebase-select-review-body' });
            body.createDiv({ cls: 'lorebase-select-review-title', text: item.title });
            const metaParts = [item.year, item.format, item.status].filter(Boolean);
            if (metaParts.length) {
                body.createDiv({ cls: 'lorebase-select-review-meta', text: metaParts.join(' / ') });
            }
            if (item.subtitle) {
                body.createDiv({ cls: 'lorebase-select-review-subtitle-text', text: item.subtitle });
            }
        }

        if (!this.selected.size) {
            list.createDiv({ cls: 'lorebase-select-empty', text: this.emptyText });
        }

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        const backBtn = this.createFooterButton(footer, 'arrow-left', t('commonBack'), 'secondary');
        const confirmBtn = this.createFooterButton(footer, 'check', `${t('promptConfirmSelected')} (${this.selected.size})`, 'primary');
        confirmBtn.disabled = this.selected.size === 0;

        backBtn.addEventListener('click', () => this.renderSearchView());
        confirmBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(Array.from(this.selected.values()));
            this.close();
        });
    }

    private formatProvider(provider?: string): string {
        if (!provider) return '';
        return provider.toUpperCase();
    }

    private createFooterButton(
        container: HTMLElement,
        iconName: string,
        text: string,
        variant: 'primary' | 'secondary'
    ): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: variant === 'primary' ? 'lorebase-flow-btn lorebase-flow-btn-primary' : 'lorebase-flow-btn lorebase-flow-btn-secondary',
            attr: { type: 'button' },
        });
        const icon = button.createSpan({ cls: 'lorebase-flow-btn-icon' });
        setIcon(icon, iconName);
        button.createSpan({ cls: 'lorebase-flow-btn-label', text });
        return button;
    }

    private createHeaderActionButton(container: HTMLElement, iconName: string, text: string): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: 'lorebase-select-header-action',
            attr: { type: 'button' },
        });
        const icon = button.createSpan({ cls: 'lorebase-select-header-action-icon' });
        setIcon(icon, iconName);
        button.createSpan({ text });
        return button;
    }

    private getItemKey(item: T): string {
        if (item.provider && item.id) return `${item.provider}:${item.id}`;
        if (item.id) return item.id;
        return `${item.title}:${item.subtitle ?? ''}`;
    }

    private resolveInitialProvider(initialProviderId?: string): string | undefined {
        if (!this.providerOptions.length) return undefined;
        const enabledProviders = this.providerOptions.filter((provider) => !provider.disabled);
        if (!enabledProviders.length) return undefined;
        if (initialProviderId && enabledProviders.some((provider) => provider.id === initialProviderId)) {
            return initialProviderId;
        }
        return enabledProviders[0].id;
    }

    private updateSearchDraft(): void {
        if (!this.inputEl) return;
        const query = this.inputEl.value.trim();
        if (query !== this.currentQuery) {
            this.searchSeq++;
            this.activeSearchKey = null;
            this.isLoading = false;
            this.currentPage = 1;
            this.items = [];
            this.focusedIndex = 0;
            this.lastErrorText = '';
            this.hasNextPage = false;
        }
        this.currentQuery = query;
        this.updateSearchButtonState();
        this.renderGrid();
        this.renderPagination();
    }

    private async runSearch(): Promise<void> {
        if (!this.inputEl) return;
        const query = this.inputEl.value.trim();
        this.currentQuery = query;
        if (!query) return;
        if (this.providerOptions.length && !this.activeProviderId) {
            this.items = [];
            this.focusedIndex = 0;
            this.hasNextPage = false;
            this.renderGrid();
            this.renderPagination();
            this.updateSearchButtonState();
            return;
        }
        const searchKey = [
            this.activeProviderId ?? '',
            query.toLowerCase(),
            this.currentPage,
            this.includeDlc ? 'dlc' : 'base',
            this.language,
        ].join('|');
        if (this.isLoading && this.activeSearchKey === searchKey) return;

        const seq = ++this.searchSeq;
        this.activeSearchKey = searchKey;
        this.items = [];
        this.focusedIndex = 0;
        this.lastErrorText = '';
        this.hasNextPage = false;
        this.isLoading = true;
        this.updateSearchButtonState();
        this.renderGrid(true);
        this.renderPagination();

        let results: T[] = [];
        try {
            results = await this.searchHandler(query, this.activeProviderId, {
                includeDlc: this.includeDlc,
                page: this.currentPage,
                pageSize: SEARCH_PAGE_SIZE,
                language: this.language || undefined,
            });
        } catch (error) {
            const message = error instanceof Error && error.message ? `: ${error.message}` : '';
            this.lastErrorText = `${t('noticeIntegrationsError')}${message}`;
        }
        if (seq !== this.searchSeq) return;
        this.activeSearchKey = null;
        this.items = Array.isArray(results) ? results : [];
        this.hasNextPage = this.readHasNextPage(results);
        this.isLoading = false;
        this.updateSearchButtonState();
        this.focusedIndex = 0;
        this.renderGrid();
        this.renderPagination();
    }

    private renderProviders(): void {
        if (!this.providerListEl) return;
        this.providerListEl.empty();

        if (!this.providerOptions.length) {
            this.providerListEl.addClass('is-hidden');
            return;
        }

        this.providerListEl.removeClass('is-hidden');
        for (const provider of this.providerOptions) {
            const chip = this.providerListEl.createEl('button', {
                cls: 'lorebase-select-provider-chip',
                text: provider.label,
                attr: {
                    type: 'button',
                    'aria-pressed': String(provider.id === this.activeProviderId),
                },
            });
            chip.toggleClass('is-active', provider.id === this.activeProviderId);
            chip.toggleClass('is-disabled', Boolean(provider.disabled));
            chip.disabled = Boolean(provider.disabled);
            if (provider.disabledReason) {
                chip.setAttr('title', provider.disabledReason);
            }

            chip.addEventListener('click', () => {
                if (provider.disabled || provider.id === this.activeProviderId) return;
                this.activeProviderId = provider.id;
                this.searchSeq++;
                this.activeSearchKey = null;
                this.isLoading = false;
                this.currentPage = 1;
                this.items = [];
                this.focusedIndex = 0;
                this.lastErrorText = '';
                this.hasNextPage = false;
                this.renderProviders();
                this.renderSearchOptions();
                this.updateSearchButtonState();
                this.renderGrid();
                this.renderPagination();
            });
        }
    }

    private renderSearchOptions(): void {
        if (!this.searchOptionsEl) return;
        this.searchOptionsEl.empty();
        const showDlc = Boolean(this.includeDlcToggleText) && this.activeProviderId === 'steam';
        // TMDB translates titles and plots; Google Books only lists books published in the chosen language.
        const showLanguage = this.languageOptions.length > 0
            && (this.activeProviderId === 'tmdb' || this.activeProviderId === 'googlebooks');
        const showKeepPoster = Boolean(this.keepPosterToggleText);
        this.searchOptionsEl.toggleClass('is-hidden', !showDlc && !showLanguage && !showKeepPoster);

        if (showLanguage) {
            const row = this.searchOptionsEl.createDiv({ cls: 'lorebase-select-language' });
            row.createSpan({ text: this.languageLabel });
            const select = row.createEl('select', { cls: 'dropdown lorebase-select-language-input' });
            for (const option of this.languageOptions) {
                select.createEl('option', { text: option.label, attr: { value: option.value } });
            }
            select.value = this.language;
            select.addEventListener('change', () => {
                this.language = select.value;
                lastMetadataLanguage = this.language;
                this.searchSeq++;
                this.activeSearchKey = null;
                this.isLoading = false;
                this.currentPage = 1;
                this.items = [];
                this.focusedIndex = 0;
                this.lastErrorText = '';
                this.hasNextPage = false;
                this.updateSearchButtonState();
                if (this.inputEl?.value.trim()) {
                    void this.runSearch();
                } else {
                    this.renderGrid();
                    this.renderPagination();
                }
            });
        }
        if (showKeepPoster) {
            const keepLabel = this.searchOptionsEl.createEl('label', { cls: 'lorebase-select-dlc-toggle' });
            const keepInput = keepLabel.createEl('input', { attr: { type: 'checkbox' } });
            keepInput.checked = this.keepPoster;
            keepLabel.createSpan({ text: this.keepPosterToggleText ?? '' });
            keepInput.addEventListener('change', () => { this.keepPoster = keepInput.checked; });
        }

        if (!showDlc) return;

        const label = this.searchOptionsEl.createEl('label', { cls: 'lorebase-select-dlc-toggle' });
        const input = label.createEl('input', {
            attr: {
                type: 'checkbox',
            },
        });
        input.checked = this.includeDlc;
        label.createSpan({ text: this.includeDlcToggleText });

        input.addEventListener('change', () => {
            this.includeDlc = input.checked;
            this.searchSeq++;
            this.activeSearchKey = null;
            this.isLoading = false;
            this.currentPage = 1;
            this.items = [];
            this.focusedIndex = 0;
            this.lastErrorText = '';
            this.hasNextPage = false;
            this.updateSearchButtonState();
            this.renderGrid();
            this.renderPagination();
        });
    }

    private updateSearchButtonState(): void {
        if (!this.searchBtn) return;
        const hasQuery = Boolean(this.inputEl?.value.trim());
        this.searchBtn.disabled = !hasQuery || this.isLoading;
        this.searchBtn.toggleClass('is-loading', this.isLoading);
        if (this.searchBtnIcon) {
            setIcon(this.searchBtnIcon, this.isLoading ? 'loader-circle' : 'search');
        }
    }

    private readHasNextPage(results: T[]): boolean {
        const metadata = results as T[] & { hasNext?: boolean };
        return typeof metadata.hasNext === 'boolean'
            ? metadata.hasNext
            : results.length >= SEARCH_PAGE_SIZE;
    }

    private renderPagination(): void {
        if (!this.paginationEl) return;
        this.paginationEl.empty();

        const hasQuery = Boolean(this.currentQuery.trim());
        if (!hasQuery && !this.items.length) {
            this.paginationEl.addClass('is-hidden');
            return;
        }

        this.paginationEl.removeClass('is-hidden');
        const previousBtn = this.paginationEl.createEl('button', {
            cls: 'lorebase-select-page-btn',
            attr: {
                type: 'button',
                'aria-label': t('promptPreviousPage'),
            },
        });
        setIcon(previousBtn.createSpan({ cls: 'lorebase-select-page-icon' }), 'arrow-left');
        previousBtn.createSpan({ text: t('promptPreviousPage') });

        const pageLabel = this.paginationEl.createDiv({
            cls: 'lorebase-select-page-label',
            text: `${t('promptPage')} ${this.currentPage}`,
        });
        pageLabel.setAttr('aria-live', 'polite');

        const nextBtn = this.paginationEl.createEl('button', {
            cls: 'lorebase-select-page-btn',
            attr: {
                type: 'button',
                'aria-label': t('promptNextPage'),
            },
        });
        nextBtn.createSpan({ text: t('promptNextPage') });
        setIcon(nextBtn.createSpan({ cls: 'lorebase-select-page-icon' }), 'arrow-right');

        previousBtn.disabled = this.isLoading || this.currentPage <= 1;
        nextBtn.disabled = this.isLoading || !this.hasNextPage;

        previousBtn.addEventListener('click', () => {
            if (previousBtn.disabled) return;
            this.currentPage = Math.max(1, this.currentPage - 1);
            void this.runSearch();
        });

        nextBtn.addEventListener('click', () => {
            if (nextBtn.disabled) return;
            this.currentPage += 1;
            void this.runSearch();
        });
    }

    private renderSelected(): void {
        if (this.doneBtn) {
            const count = this.selected.size;
            this.doneBtn.disabled = count === 0;
            const label = this.doneBtn.querySelector<HTMLElement>('.lorebase-flow-btn-label');
            if (label) {
                label.setText(count > 0 ? `${this.doneText} (${count})` : this.doneText);
            }
        }
    }

    private renderGrid(loading: boolean = false): void {
        if (!this.gridEl) return;
        this.gridEl.empty();

        if (loading) {
            const loadingEl = this.gridEl.createDiv({ cls: 'lorebase-select-empty lorebase-select-loading' });
            const loadingIcon = loadingEl.createSpan({ cls: 'lorebase-select-loading-icon' });
            setIcon(loadingIcon, 'loader-circle');
            loadingEl.createSpan({ text: t('notifyLoading') });
            return;
        }

        if (this.lastErrorText) {
            this.gridEl.createDiv({ cls: 'lorebase-select-empty is-error', text: this.lastErrorText });
            return;
        }

        if (!this.items.length) {
            this.gridEl.createDiv({ cls: 'lorebase-select-empty', text: this.emptyText });
            return;
        }

        this.items.forEach((item, index) => {
            const card = this.gridEl!.createDiv({ cls: 'lorebase-select-card' });
            card.setAttr('data-index', String(index));
            const key = this.getItemKey(item);
            if (this.selected.has(key)) {
                card.addClass('is-picked');
            }
            if (index === this.focusedIndex) {
                card.addClass('is-focused');
            }

            const image = card.createDiv({ cls: 'lorebase-select-card-image' });
            if (item.image) {
                this.setPreviewBackground(image, item.image, item);
            } else {
                image.addClass('is-empty');
            }

            card.createDiv({ cls: 'lorebase-select-card-check' });

            const body = card.createDiv({ cls: 'lorebase-select-card-body' });
            body.createDiv({ cls: 'lorebase-select-card-title', text: item.title });

            const metaParts = [item.year, item.format, item.status].filter(Boolean);
            if (metaParts.length) {
                body.createDiv({ cls: 'lorebase-select-card-meta', text: metaParts.join(' / ') });
            }

            if (item.subtitle) {
                body.createDiv({ cls: 'lorebase-select-card-subtitle', text: item.subtitle });
            }

            card.addEventListener('click', () => this.toggleSelection(item));
            card.addEventListener('mouseenter', () => this.updateFocus(index));
        });
    }

    private updateFocus(nextIndex: number): void {
        const max = this.items.length - 1;
        this.focusedIndex = Math.max(0, Math.min(max, nextIndex));
        this.gridEl?.querySelectorAll<HTMLElement>('.lorebase-select-card').forEach(card => {
            const index = Number(card.dataset.index);
            if (index === this.focusedIndex) card.addClass('is-focused');
            else card.removeClass('is-focused');
        });
    }

    private toggleSelection(item: T): void {
        const key = this.getItemKey(item);
        let isSelected: boolean;
        if (this.selected.has(key)) {
            this.selected.delete(key);
            isSelected = false;
        } else {
            if (this.maxSelection === 1) this.selected.clear();
            this.selected.set(key, item);
            isSelected = true;
        }
        this.renderSelected();
        if (this.maxSelection === 1) {
            this.renderGrid();
            return;
        }
        const index = this.items.findIndex((candidate) => this.getItemKey(candidate) === key);
        const card = index >= 0
            ? this.gridEl?.querySelector<HTMLElement>(`.lorebase-select-card[data-index="${index}"]`)
            : null;
        card?.toggleClass('is-picked', isSelected);
    }

    private setPreviewBackground(target: HTMLElement, imageUrl: string, item?: T, allowFallback = true): void {
        const candidates = this.getImageCandidates(imageUrl);
        let index = 0;

        const apply = (): void => {
            const next = candidates[index];
            if (!next) {
                target.setCssStyles({ backgroundImage: '' });
                target.addClass('is-empty');
                if (allowFallback && item && this.imageFallbackResolver) {
                    void this.applyPreviewFallback(target, item);
                }
                return;
            }

            if (this.isMangaDexImage(next)) {
                void this.setMangaDexPreviewBackground(target, next, () => {
                    index++;
                    apply();
                });
                return;
            }

            const probe = new Image();
            probe.onload = () => {
                target.removeClass('is-empty');
                target.setCssStyles({ backgroundImage: `url("${next}")` });
            };
            probe.onerror = () => {
                index++;
                apply();
            };
            probe.src = next;
        };

        apply();
    }

    private async applyPreviewFallback(target: HTMLElement, item: T): Promise<void> {
        if (!this.imageFallbackResolver) return;
        const key = this.getItemKey(item);
        let request = this.previewFallbackRequests.get(key);
        if (!request) {
            request = this.imageFallbackResolver(item).catch(() => '');
            this.previewFallbackRequests.set(key, request);
        }
        const fallback = (await request).trim();
        if (!fallback) return;
        item.image = fallback;
        if (target.isConnected) {
            this.setPreviewBackground(target, fallback, item, false);
        }
    }

    private async setMangaDexPreviewBackground(target: HTMLElement, url: string, onError: () => void): Promise<void> {
        const cached = this.previewObjectUrlCache.get(url);
        if (cached) {
            target.removeClass('is-empty');
            target.setCssStyles({ backgroundImage: `url("${cached}")` });
            return;
        }
        try {
            const response = await fetchBinary(url);
            const type = response.headers?.['content-type'] || 'image/jpeg';
            const objectUrl = URL.createObjectURL(new Blob([response.arrayBuffer], { type }));
            this.objectUrls.push(objectUrl);
            this.previewObjectUrlCache.set(url, objectUrl);
            target.removeClass('is-empty');
            target.setCssStyles({ backgroundImage: `url("${objectUrl}")` });
        } catch {
            onError();
        }
    }

    private getImageCandidates(imageUrl: string): string[] {
        const appId = getSteamAppIdFromImageUrl(imageUrl);
        const mangaDexCandidates = this.getMangaDexImageCandidates(imageUrl);
        if (mangaDexCandidates.length) return mangaDexCandidates;
        return appId
            ? getSteamVerticalImageCandidates(appId, imageUrl)
            : [imageUrl].filter(Boolean);
    }

    private getMangaDexImageCandidates(imageUrl: string): string[] {
        if (!this.isMangaDexImage(imageUrl)) return [];
        const base = imageUrl
            .replace(/\.512\.jpg$/i, '')
            .replace(/\.256\.jpg$/i, '');
        return Array.from(new Set([
            imageUrl,
            `${base}.512.jpg`,
            `${base}.256.jpg`,
            base,
        ].filter(Boolean)));
    }

    private isMangaDexImage(imageUrl: string): boolean {
        return imageUrl.includes('uploads.mangadex.org/covers/');
    }

    private revokeObjectUrls(): void {
        for (const url of this.objectUrls) URL.revokeObjectURL(url);
        this.objectUrls = [];
        this.previewObjectUrlCache.clear();
    }

    private onKeydown = (event: KeyboardEvent): void => {
        if (this.isReviewing) {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.renderSearchView();
            }
            return;
        }
        if (!this.items.length) return;
        if (event.target === this.inputEl) return;

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.updateFocus(this.focusedIndex + 1);
            return;
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            this.updateFocus(this.focusedIndex - 1);
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.updateFocus(this.focusedIndex + 1);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.updateFocus(this.focusedIndex - 1);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const item = this.items[this.focusedIndex];
            if (item) this.toggleSelection(item);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
        }
    };
}
