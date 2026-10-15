import { GameCard } from '../../components/GameCard';

type VirtualGridOrientation = 'vertical' | 'horizontal';

type CreateCardFn<T> = (parent: HTMLElement, item: T) => GameCard;

export interface VirtualGridOptions<T> {
    gridEl: HTMLElement;
    scrollContainer: HTMLElement;
    items: T[];
    columns: number;
    orientation: VirtualGridOrientation;
    cardHeight: number;
    buffer: number;
    createCard: CreateCardFn<T>;
}

export interface VirtualGroup<T> {
    key: string;
    label: string;
    items: T[];
    progress?: { text: string; title: string };
}

export interface VirtualGroupedGridOptions<T> extends Omit<VirtualGridOptions<T>, 'items'> {
    groups: VirtualGroup<T>[];
    colors: string[];
}

export interface VirtualGridController {
    destroy(): void;
    updateLayout(options: { columns: number; orientation: VirtualGridOrientation; cardHeight: number }): void;
    setLayoutResizing(resizing: boolean): void;
}

export class VirtualGrid<T> {
    private options: VirtualGridOptions<T>;
    private virtualScrollHandler: (() => void) | null = null;
    private rafId: number | null = null;
    private visibleCards: Map<number, GameCard> = new Map();
    private cardsPerRow: number;
    private spacer: HTMLElement | null = null;
    private cachedCardWidthCalc: string = '';

    constructor(options: VirtualGridOptions<T>) {
        this.options = options;
        this.cardsPerRow = Math.max(1, options.columns);
        this.setup();
    }

    destroy(): void {
        if (this.virtualScrollHandler) {
            this.options.scrollContainer.removeEventListener('scroll', this.virtualScrollHandler);
            this.virtualScrollHandler = null;
        }

        if (this.rafId !== null) {
            window.cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        for (const card of this.visibleCards.values()) {
            card.destroy();
        }
        this.visibleCards.clear();
        this.spacer = null;
    }

    updateLayout(options: Pick<VirtualGridOptions<T>, 'columns' | 'orientation' | 'cardHeight'>): void {
        this.options = {
            ...this.options,
            ...options,
        };
        this.cardsPerRow = Math.max(1, options.columns);
        this.rebuildCardWidthCalc();
        this.updateSpacerHeight();
        this.scheduleUpdate();
    }

    setLayoutResizing(resizing: boolean): void {
        this.options.gridEl.toggleClass('is-virtual-layout-resizing', resizing);
        if (resizing) {
            let firstVisibleCard: GameCard | undefined;
            for (const card of this.visibleCards.values()) {
                firstVisibleCard = card;
                break;
            }
            const visibleHeight = firstVisibleCard?.getElement().getBoundingClientRect().height;
            const lockedHeight = visibleHeight && visibleHeight > 0 ? visibleHeight : this.options.cardHeight;
            this.options.gridEl.style.setProperty('--lorebase-virtual-card-height', `${lockedHeight}px`);
        } else {
            this.options.gridEl.style.removeProperty('--lorebase-virtual-card-height');
        }
    }

    private setup(): void {
        this.spacer = this.options.gridEl.createDiv({ cls: 'lorebase-spacer' });
        this.spacer.setCssStyles({ gridColumn: '1 / -1' });
        this.rebuildCardWidthCalc();
        this.updateSpacerHeight();
        this.updateVisibleCards();

        this.virtualScrollHandler = () => {
            this.scheduleUpdate();
        };

        this.options.scrollContainer.addEventListener('scroll', this.virtualScrollHandler);
    }

    private updateSpacerHeight(): void {
        if (!this.spacer) return;

        const gap = this.getGap();
        const padding = this.getPadding();
        const totalRows = Math.ceil(this.options.items.length / this.cardsPerRow);
        const totalHeight = (totalRows * this.options.cardHeight) +
            (totalRows > 0 ? (totalRows - 1) * gap : 0) +
            (padding * 2);

        this.spacer.setCssStyles({ height: `${totalHeight}px` });
    }

    private scheduleUpdate(): void {
        if (this.rafId !== null) return;

        this.rafId = window.requestAnimationFrame(() => {
            this.rafId = null;
            this.updateVisibleCards();
        });
    }

    private updateVisibleCards(): void {
        const gap = this.getGap();
        const padding = this.getPadding();
        const scrollTop = this.options.scrollContainer.scrollTop;
        const containerHeight = this.options.scrollContainer.clientHeight;

        const startRow = Math.max(
            0,
            Math.floor((scrollTop - padding) / (this.options.cardHeight + gap)) - this.options.buffer
        );
        const endRow = Math.ceil(
            (scrollTop + containerHeight - padding) / (this.options.cardHeight + gap)
        ) + this.options.buffer;

        const startIndex = startRow * this.cardsPerRow;
        const endIndex = Math.min(endRow * this.cardsPerRow, this.options.items.length);

        for (const [index, card] of this.visibleCards) {
            if (index < startIndex || index >= endIndex) {
                card.destroy();
                this.visibleCards.delete(index);
            }
        }

        for (const [index, card] of this.visibleCards) {
            if (index >= startIndex && index < endIndex) {
                this.positionCard(index, card, this.cachedCardWidthCalc, gap, padding);
            }
        }

        for (let i = startIndex; i < endIndex; i++) {
            const item = this.options.items[i];
            if (!item || this.visibleCards.has(i)) continue;

            const card = this.options.createCard(this.options.gridEl, item);
            this.positionCard(i, card, this.cachedCardWidthCalc, gap, padding);
            this.visibleCards.set(i, card);
        }
    }

    private positionCard(
        index: number,
        card: GameCard,
        cardWidthCalc: string,
        gap: number,
        padding: number
    ): void {
        const row = Math.floor(index / this.cardsPerRow);
        const col = index % this.cardsPerRow;
        const cardEl = card.getElement();

        cardEl.setCssStyles({
            position: 'absolute',
            width: cardWidthCalc,
            top: `${padding + (row * (this.options.cardHeight + gap))}px`,
            left: `calc(${padding}px + ${col} * (${cardWidthCalc} + ${gap}px))`,
        });
    }

    private getGap(): number {
        return 16;
    }

    private getPadding(): number {
        return 16;
    }

    private rebuildCardWidthCalc(): void {
        const gap = this.getGap();
        const padding = this.getPadding();
        const totalGapWidth = gap * (this.cardsPerRow - 1);
        const totalPaddingWidth = padding * 2;
        this.cachedCardWidthCalc = `calc((100% - ${totalGapWidth}px - ${totalPaddingWidth}px) / ${this.cardsPerRow})`;
    }
}

/**
 * Virtualized grouped grid. Section headers stay lightweight while card DOM is
 * created only around the viewport.
 */
export class VirtualGroupedGrid<T> implements VirtualGridController {
    private options: VirtualGroupedGridOptions<T>;
    private positions: Array<{ item: T; top: number; leftColumn: number }> = [];
    private visibleCards = new Map<number, GameCard>();
    private headers: HTMLElement[] = [];
    private spacer: HTMLElement | null = null;
    private scrollHandler: (() => void) | null = null;
    private rafId: number | null = null;
    private cardWidthCalc = '';

    constructor(options: VirtualGroupedGridOptions<T>) {
        this.options = options;
        this.rebuild();
        this.updateVisibleCards();
        this.scrollHandler = () => this.scheduleUpdate();
        options.scrollContainer.addEventListener('scroll', this.scrollHandler);
    }

    destroy(): void {
        if (this.scrollHandler) {
            this.options.scrollContainer.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler = null;
        }
        if (this.rafId !== null) window.cancelAnimationFrame(this.rafId);
        for (const card of this.visibleCards.values()) card.destroy();
        this.visibleCards.clear();
        this.headers = [];
        this.spacer = null;
    }

    updateLayout(options: { columns: number; orientation: VirtualGridOrientation; cardHeight: number }): void {
        this.options = { ...this.options, ...options };
        for (const card of this.visibleCards.values()) card.destroy();
        this.visibleCards.clear();
        this.rebuild();
        this.scheduleUpdate();
    }

    setLayoutResizing(resizing: boolean): void {
        this.options.gridEl.toggleClass('is-virtual-layout-resizing', resizing);
        if (resizing) {
            let firstVisibleCard: GameCard | undefined;
            for (const card of this.visibleCards.values()) {
                firstVisibleCard = card;
                break;
            }
            const visibleHeight = firstVisibleCard?.getElement().getBoundingClientRect().height;
            const lockedHeight = visibleHeight && visibleHeight > 0 ? visibleHeight : this.options.cardHeight;
            this.options.gridEl.style.setProperty('--lorebase-virtual-card-height', `${lockedHeight}px`);
        } else {
            this.options.gridEl.style.removeProperty('--lorebase-virtual-card-height');
        }
    }

    private rebuild(): void {
        const columns = Math.max(1, this.options.columns);
        const gap = 16;
        const padding = 16;
        const headerHeight = 38;
        this.cardWidthCalc = `calc((100% - ${(columns - 1) * gap}px - ${padding * 2}px) / ${columns})`;
        this.positions = [];
        for (const header of this.headers) header.remove();
        this.headers = [];
        this.spacer?.remove();

        let top = padding;
        this.options.groups.forEach((group, groupIndex) => {
            const header = this.options.gridEl.createDiv({
                cls: 'lorebase-series-title lorebase-view-group-title lorebase-virtual-group-title',
            });
            header.createSpan({ text: group.label });
            if (group.progress) header.createSpan({ cls: 'lorebase-view-group-progress', text: group.progress.text, attr: { title: group.progress.title } });
            header.createSpan({ cls: 'lorebase-view-group-count', text: String(group.items.length) });
            header.style.borderLeftColor = this.options.colors[
                groupIndex % Math.max(1, this.options.colors.length)
            ] ?? 'var(--lorebase-accent)';
            header.setCssStyles({
                position: 'absolute',
                top: `${top}px`,
                left: `${padding}px`,
                right: `${padding}px`,
                height: `${headerHeight - 8}px`,
            });
            this.headers.push(header);
            top += headerHeight;

            group.items.forEach((item, index) => {
                const row = Math.floor(index / columns);
                this.positions.push({
                    item,
                    top: top + row * (this.options.cardHeight + gap),
                    leftColumn: index % columns,
                });
            });
            const rows = Math.ceil(group.items.length / columns);
            top += rows * this.options.cardHeight + Math.max(0, rows - 1) * gap + gap;
        });

        this.spacer = this.options.gridEl.createDiv({ cls: 'lorebase-spacer' });
        this.spacer.setCssStyles({ height: `${Math.max(0, top + padding)}px`, gridColumn: '1 / -1' });
    }

    private scheduleUpdate(): void {
        if (this.rafId !== null) return;
        this.rafId = window.requestAnimationFrame(() => {
            this.rafId = null;
            this.updateVisibleCards();
        });
    }

    private updateVisibleCards(): void {
        const scrollTop = this.options.scrollContainer.scrollTop;
        const minTop = Math.max(0, scrollTop - this.options.buffer * this.options.cardHeight);
        const maxTop = scrollTop + this.options.scrollContainer.clientHeight
            + this.options.buffer * this.options.cardHeight;
        const visible = new Set<number>();
        for (let index = 0; index < this.positions.length; index++) {
            const position = this.positions[index];
            if (position.top + this.options.cardHeight < minTop || position.top > maxTop) continue;
            visible.add(index);
            let card = this.visibleCards.get(index);
            if (!card) {
                card = this.options.createCard(this.options.gridEl, position.item);
                this.visibleCards.set(index, card);
            }
            card.getElement().setCssStyles({
                position: 'absolute',
                width: this.cardWidthCalc,
                top: `${position.top}px`,
                left: `calc(16px + ${position.leftColumn} * (${this.cardWidthCalc} + 16px))`,
            });
        }
        for (const [index, card] of this.visibleCards) {
            if (visible.has(index)) continue;
            card.destroy();
            this.visibleCards.delete(index);
        }
    }
}
