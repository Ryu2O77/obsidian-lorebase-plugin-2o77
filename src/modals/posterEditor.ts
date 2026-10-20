import { App, FuzzySuggestModal, Menu, Modal, Notice, setIcon, TFile } from 'obsidian';
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

    // Controls live on top of the poster and only show on hover/focus; the menu keeps the rarely used actions tidy.
    const frame = card.querySelector<HTMLElement>('.lorebase-editmode-poster-frame') ?? card;
    const controls = frame.createDiv({ cls: 'lorebase-poster-overlay' });
    const bar = controls.createDiv({ cls: 'lorebase-poster-overlay-bar' });

    if (options.supportsHorizontal) {
        const tabs = bar.createDiv({ cls: 'lorebase-poster-overlay-tabs' });
        const buttons = new Map<PosterTarget, HTMLButtonElement>();
        const select = (next: PosterTarget): void => {
            target = next;
            for (const [key, button] of buttons) button.toggleClass('is-active', key === next);
            show();
        };
        for (const [key, label, icon] of [
            ['vertical', t('posterVertical'), 'rectangle-vertical'],
            ['horizontal', t('posterHorizontal'), 'rectangle-horizontal'],
        ] as const) {
            const button = tabs.createEl('button', { cls: 'lorebase-poster-overlay-btn', attr: { type: 'button', 'aria-label': label, title: label } });
            setIcon(button, icon);
            button.addEventListener('click', (event) => { event.stopPropagation(); select(key); });
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

    const fileInput = bar.createEl('input', { attr: { type: 'file', accept: 'image/*' } });
    fileInput.addClass('lorebase-hidden-file-input');
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        void saveEditorImageFile(options.app, file, saveParams())
            .then((path) => apply(path, options.app.vault.adapter.getResourcePath(path)))
            .catch(fail);
    });

    const openUrlPrompt = (): void => {
        new ImageUrlPrompt(options.app, (url) => {
            void saveEditorImageUrl(options.app, url, saveParams())
                .then((path) => apply(path, options.app.vault.adapter.getResourcePath(path)))
                .catch(fail);
        }).open();
    };
    const menuButton = bar.createEl('button', {
        cls: 'lorebase-poster-overlay-btn lorebase-poster-overlay-menu',
        attr: { type: 'button', 'aria-label': t('editPoster'), title: t('editPoster') },
    });
    setIcon(menuButton, 'image-plus');
    menuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const menu = new Menu();
        menu.addItem((item) => item.setTitle(t('posterUpload')).setIcon('upload').onClick(() => fileInput.click()));
        menu.addItem((item) => item.setTitle(t('posterFromVault')).setIcon('folder-open').onClick(() => {
            new VaultImageSuggest(options.app, (file) => apply(file.path, options.app.vault.getResourcePath(file))).open();
        }));
        menu.addItem((item) => item.setTitle(t('posterFromUrl')).setIcon('link').onClick(openUrlPrompt));
        menu.addSeparator();
        menu.addItem((item) => item.setTitle(t('posterRemove')).setIcon('x').onClick(() => apply('', '')));
        const rect = menuButton.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right, y: rect.top });
    });

    show();
}

/** Folder where downloaded or uploaded images are kept (the plugin's image storage setting). */
export function getPosterFolder(app: App): string {
    const plugins = (app as unknown as {
        plugins?: { getPlugin?: (id: string) => { settings?: LorebaseSettings } | null };
    }).plugins;
    return plugins?.getPlugin?.('lorebase')?.settings?.integrations?.imageStorage?.folderPath || 'files/lorebase/images';
}
