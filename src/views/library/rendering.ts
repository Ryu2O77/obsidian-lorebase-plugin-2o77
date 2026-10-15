import { MediaItem, ViewMode } from '../../types';

interface LibraryLayout {
    columns: number;
    orientation: 'vertical' | 'horizontal';
    minCardWidth: number;
}

interface BaseRenderParams {
    container: HTMLElement;
    layout: LibraryLayout;
}

export interface RenderFlatGridParams extends BaseRenderParams {
    className?: string;
}

export interface RenderRandomCardParams {
    container: HTMLElement;
    item: MediaItem;
    titleText: string;
    backText: string;
    createCard: (parent: HTMLElement, item: MediaItem) => void;
    onBack: () => void;
}

export function createGrid(params: RenderFlatGridParams): HTMLElement {
    const { container, layout, className = 'lorebase-grid' } = params;
    const gridEl = container.createDiv({ cls: className });
    const ownerWindow = container.ownerDocument.defaultView;
    const isPhoneLayout = ownerWindow?.matchMedia('(max-width: 520px)').matches ?? false;
    gridEl.setCssStyles({
        position: 'relative',
        gridTemplateColumns: `repeat(${isPhoneLayout ? 2 : Math.max(1, layout.columns)}, minmax(0, 1fr))`,
        gap: isPhoneLayout ? '10px' : '16px',
        padding: isPhoneLayout ? '10px' : '16px',
    });

    return gridEl;
}

export function renderRandomCard(params: RenderRandomCardParams): void {
    const { container, item, titleText, backText, createCard, onBack } = params;
    container.empty();

    container.createDiv({
        cls: 'lorebase-random-title',
        text: `${titleText}: ${item.displayName}`
    });

    const grid = container.createDiv({ cls: 'lorebase-grid lorebase-random-grid' });
    createCard(grid, item);

    const backBtn = container.createEl('button', {
        cls: 'lorebase-btn lorebase-back-btn',
        text: backText
    });
    backBtn.addEventListener('click', onBack);
}

export function applyViewModeClass(container: HTMLElement, viewMode: ViewMode): void {
    container.removeClass(
        'lorebase-view-mode-grid',
        'lorebase-view-mode-horizontal',
        'lorebase-view-mode-table'
    );
    container.addClass(`lorebase-view-mode-${viewMode}`);
}
