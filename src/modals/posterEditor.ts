import { App, FuzzySuggestModal, Modal, Notice, setIcon, TFile } from 'obsidian';
import { t } from '../localization';
import { DEFAULT_COVER } from '../constants';
import type { MediaKind } from '../services/integrations/types';
import { saveEditorImageFile, saveEditorImageUrl } from '../services/integrations/imageStorage';
import type { LorebaseSettings } from '../types';

export type PosterTarget = 'vertical' | 'horizontal';

export interface PosterEditorOptions {
    app: App;
    kind: MediaKind;
    getTitle: () => string;
    getFolder: () => string;
    /** Whether the image can also be edited as a horizontal (banner) image */
    supportsHorizontal: boolean;
    /** Image to display for a target (an already resolved URL, or empty) */
    getDisplay: (target: PosterTarget) => string;
    /** Called with the vault path (or remote URL) to store; an empty `stored` clears the image */
    onChange: (target: PosterTarget, change: { stored: string; display: string }) => void;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']);

class VaultImageSuggest extends FuzzySuggestModal<TFile> {
    constructor(app: App, private readonly onPick: (file: TFile) => void) {
        super(app);
        this.setPlaceholder(t('posterFromVault'));
    }

    getItems(): TFile[] {
        return this.app.vault.getFiles().filter((file) => IMAGE_EXTENSIONS.has(file.extension.toLowerCase()));
    }

    getItemText(file: TFile): string {
        return file.path;
    }

    onChooseItem(file: TFile): void {
        this.onPick(file);
    }
}

class ImageUrlPrompt extends Modal {
    private done = false;

    constructor(app: App, private readonly onSubmit: (url: string) => void) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('posterUrlPrompt') });
        const input = contentEl.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'url', placeholder: 'https://' } });
        const submit = (): void => {
            const value = input.value.trim();
            if (!value || this.done) return;
            this.done = true;
            this.onSubmit(value);
            this.close();
        };
        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        actions.createEl('button', { text: t('commonCancel'), cls: 'lorebase-btn' }).addEventListener('click', () => this.close());
        actions.createEl('button', { text: t('addOptionsConfirm'), cls: 'lorebase-btn lorebase-btn-primary' }).addEventListener('click', submit);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { event.preventDefault(); submit(); }
        });
        window.setTimeout(() => input.focus(), 0);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

/**
 * Adds image controls to the poster card of an editor: upload a file, pick one already in the
 * vault, download from a URL, or remove it. `frame` is the element holding the <img>.
 */
export function mountPosterEditor(card: HTMLElement, options: PosterEditorOptions): void {
    const image = card.querySelector<HTMLImageElement>('[data-role="poster"]');
    if (!image) return;
    let target: PosterTarget = 'vertical';

    const show = (): void => {
        image.src = options.getDisplay(target) || DEFAULT_COVER;
    };

    const controls = card.createDiv({ cls: 'lorebase-poster-editor' });

    if (options.supportsHorizontal) {
        const tabs = controls.createDiv({ cls: 'lorebase-poster-editor-tabs' });
        const buttons = new Map<PosterTarget, HTMLButtonElement>();
        const select = (next: PosterTarget): void => {
            target = next;
            for (const [key, button] of buttons) button.toggleClass('is-active', key === next);
            show();
        };
        for (const [key, label] of [['vertical', t('posterVertical')], ['horizontal', t('posterHorizontal')]] as const) {
            const button = tabs.createEl('button', { cls: 'lorebase-poster-editor-tab', text: label, attr: { type: 'button' } });
            button.addEventListener('click', () => select(key));
            buttons.set(key, button);
        }
        buttons.get('vertical')?.addClass('is-active');
    }

    const apply = (stored: string, display: string): void => {
        options.onChange(target, { stored, display });
        show();
    };

    const saveParams = (): { baseFolder: string; kind: MediaKind; title: string; label: string } => ({
        baseFolder: options.getFolder(),
        kind: options.kind,
        title: options.getTitle() || 'Untitled',
        label: target === 'horizontal' ? 'Horizontal' : 'Poster',
    });

    const fail = (error: unknown): void => {
        console.warn('[Lorebase] Poster change failed', error);
        new Notice(t('posterSaveFailed'));
    };

    const row = controls.createDiv({ cls: 'lorebase-poster-editor-actions' });
    const addButton = (icon: string, label: string, onClick: () => void): void => {
        const button = row.createEl('button', {
            cls: 'lorebase-flow-btn lorebase-flow-btn-secondary lorebase-poster-editor-btn',
            attr: { type: 'button', 'aria-label': label, title: label },
        });
        setIcon(button.createSpan({ cls: 'lorebase-flow-btn-icon' }), icon);
        button.addEventListener('click', onClick);
    };

    const fileInput = controls.createEl('input', { attr: { type: 'file', accept: 'image/*' } });
    fileInput.addClass('lorebase-hidden-file-input');
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        void saveEditorImageFile(options.app, file, saveParams())
            .then((path) => apply(path, options.app.vault.adapter.getResourcePath(path)))
            .catch(fail);
    });

    addButton('upload', t('posterUpload'), () => fileInput.click());
    addButton('folder-open', t('posterFromVault'), () => {
        new VaultImageSuggest(options.app, (file) => apply(file.path, options.app.vault.getResourcePath(file))).open();
    });
    addButton('link', t('posterFromUrl'), () => {
        new ImageUrlPrompt(options.app, (url) => {
            void saveEditorImageUrl(options.app, url, saveParams())
                .then((path) => apply(path, options.app.vault.adapter.getResourcePath(path)))
                .catch(fail);
        }).open();
    });
    addButton('x', t('posterRemove'), () => apply('', ''));

    show();
}

/** Folder where downloaded or uploaded images are kept (the plugin's image storage setting). */
export function getPosterFolder(app: App): string {
    const plugins = (app as unknown as {
        plugins?: { getPlugin?: (id: string) => { settings?: LorebaseSettings } | null };
    }).plugins;
    return plugins?.getPlugin?.('lorebase')?.settings?.integrations?.imageStorage?.folderPath || 'files/lorebase/images';
}
