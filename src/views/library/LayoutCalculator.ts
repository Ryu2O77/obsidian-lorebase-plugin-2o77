import { CardDimensionOverrides } from '../../components/GameCard';
import { CARD_SIZES, HORIZONTAL_CARD_SIZES } from '../../constants';
import { CardSize, LorebaseSettings, ViewMode } from '../../types';

export type EffectiveLayout = {
    cardSize: CardSize;
    progressFooter: boolean;
    titleBelow: boolean;
    columns: number;
    orientation: LorebaseSettings['games']['orientation'];
    dimensions: CardDimensionOverrides | null;
    minCardWidth: number;
    /** Quick size multiplier already baked into minCardWidth; getCardHeight needs it too for horizontal cards */
    cardScale: number;
};

const MAX_COLUMNS = 12;
const MIN_CARD_WIDTH_PX = 72;
const GRID_GAP_PX = 16;
const GRID_PADDING_PX = 16;
const PROGRESS_FOOTER_HEIGHT_PX = 48;
const TITLE_FOOTER_HEIGHT_PX = 44;
const PROGRESS_ONLY_FOOTER_HEIGHT_PX = 34;
const PRESET_HORIZONTAL_MIN_WIDTH = 340;
const MOBILE_BREAKPOINT_PX = 520;
const MOBILE_VERTICAL_MIN_WIDTH_PX = 136;
const PRESET_VERTICAL_MIN_WIDTH: Record<CardSize, number> = {
    small: 180,
    medium: 220,
    large: 260,
};

export class LayoutCalculator {
    constructor(private readonly getAvailableWidth: () => number) {}

    getEffectiveLayout(settings: LorebaseSettings['games'], viewMode: ViewMode): EffectiveLayout {
        const orientation = viewMode === 'horizontal' ? 'horizontal' : 'vertical';
        const cardScale = this.clampCardScale(settings.cardScale);
        const baseColumns = orientation === 'horizontal' ? 4 : settings.columns;
        // Smaller cards need room for more columns; without this the column cap (5 by default)
        // would keep the cards at their default width and the slider could only enlarge them.
        const maxColumns = cardScale < 1
            ? Math.min(MAX_COLUMNS, Math.max(baseColumns, Math.ceil(baseColumns / cardScale)))
            : baseColumns;
        const cardSize = settings.cardSize;
        const dimensions = settings.customCardSize
            ? this.resolveCustomCardDimensions(settings, cardSize)
            : null;
        let minCardWidth = orientation === 'vertical'
            ? (dimensions?.verticalMinWidth ?? PRESET_VERTICAL_MIN_WIDTH[cardSize])
            : (dimensions?.horizontalMinWidth ?? PRESET_HORIZONTAL_MIN_WIDTH);
        const availableWidth = this.getAvailableWidth();
        if (orientation === 'vertical' && availableWidth > 0 && availableWidth <= MOBILE_BREAKPOINT_PX) {
            minCardWidth = Math.min(minCardWidth, MOBILE_VERTICAL_MIN_WIDTH_PX);
        }
        minCardWidth = Math.round(minCardWidth * cardScale);

        return {
            cardSize,
            progressFooter: settings.progressFooter === true,
            titleBelow: settings.titleBelow === true,
            columns: maxColumns,
            orientation,
            dimensions,
            minCardWidth,
            cardScale,
        };
    }

    /** 0.6–1.6x; keeps the slider from producing unusably tiny or huge cards. */
    private clampCardScale(value: number | undefined): number {
        if (!Number.isFinite(value)) return 1;
        return Math.min(1.6, Math.max(0.6, Math.round((value as number) * 20) / 20));
    }

    getRenderedColumns(layout: EffectiveLayout): number {
        return this.resolveAdaptiveColumns(layout.columns, layout.minCardWidth);
    }

    getCardHeight(layout: EffectiveLayout): number {
        if (layout.orientation === 'horizontal') {
            const base = layout.dimensions ? layout.dimensions.horizontalHeight : (parseInt(HORIZONTAL_CARD_SIZES[layout.cardSize].height) || 220);
            // Horizontal height isn't derived from width like vertical cards are, so the
            // slider has to scale it explicitly to avoid stretching/squashing the poster.
            return Math.round(base * layout.cardScale);
        }
        // The static height is a minimum for vertical cards; it has to shrink with the slider
        // or smaller cards would turn tall and narrow instead of keeping the poster ratio.
        const shrink = Math.min(1, layout.cardScale);
        const base = layout.dimensions
            ? layout.dimensions.verticalMinHeight
            : (parseInt(CARD_SIZES[layout.cardSize].minHeight) || 400);
        return Math.round(base * shrink);
    }

    calculateActualCardHeight(
        layout: EffectiveLayout,
        renderedColumns: number,
        gridEl: HTMLElement | null
    ): number {
        const staticHeight = this.getCardHeight(layout);
        if (layout.orientation === 'horizontal' || !gridEl) return staticHeight;

        const gridWidth = gridEl.clientWidth;
        if (gridWidth <= 0) return staticHeight;

        const cols = Math.max(1, renderedColumns);
        const totalGap = GRID_GAP_PX * (cols - 1);
        const totalPadding = GRID_PADDING_PX * 2;
        const cardWidth = (gridWidth - totalGap - totalPadding) / cols;
        const imageRatio = layout.dimensions?.verticalImageRatio;
        const ratio = (imageRatio && Number.isFinite(imageRatio) && imageRatio > 0)
            ? imageRatio
            : 2 / 3;

        // Phone grids use the poster ratio as the source of truth. Keeping the
        // desktop preset as a minimum here made every phone card ~400px tall
        // and forced the library into a single oversized column.
        const imageHeight = gridWidth <= MOBILE_BREAKPOINT_PX || layout.cardScale < 1
            ? Math.ceil(cardWidth / ratio)
            : Math.max(staticHeight, Math.ceil(cardWidth / ratio));
        const progress = layout.progressFooter;
        // Title + progress share one footer (the old progress height); each alone is a bit shorter.
        if (progress && layout.titleBelow) return imageHeight + PROGRESS_FOOTER_HEIGHT_PX;
        if (progress) return imageHeight + PROGRESS_ONLY_FOOTER_HEIGHT_PX;
        if (layout.titleBelow) return imageHeight + TITLE_FOOTER_HEIGHT_PX;
        return imageHeight;
    }

    private resolveCustomCardDimensions(
        settings: LorebaseSettings['games'],
        cardSize: CardSize
    ): CardDimensionOverrides {
        const verticalPreset = CARD_SIZES[cardSize];
        const horizontalPreset = HORIZONTAL_CARD_SIZES[cardSize];
        const presetVerticalMinWidth = this.parseCssPixels(verticalPreset.maxWidth, 280);
        const presetVerticalMinHeight = this.parseCssPixels(verticalPreset.minHeight, 380);
        const presetImageHeight = this.parseCssPixels(verticalPreset.imageHeight, 320);
        const presetImageRatio = this.clampImageRatio(
            presetVerticalMinWidth / Math.max(1, presetImageHeight),
            0.72
        );

        return {
            verticalMinWidth: this.clampDimension(settings.customCardMinWidth, 140, 480, presetVerticalMinWidth),
            verticalMinHeight: this.clampDimension(settings.customCardMinHeight, 180, 900, presetVerticalMinHeight),
            verticalImageRatio: this.clampImageRatio(settings.customCardImageRatio, presetImageRatio),
            horizontalMinWidth: this.clampDimension(settings.customHorizontalCardMinWidth, 240, 700, 340),
            horizontalHeight: this.clampDimension(
                settings.customHorizontalCardHeight,
                120,
                520,
                this.parseCssPixels(horizontalPreset.height, 220)
            ),
        };
    }

    private resolveAdaptiveColumns(maxColumns: number, minCardWidth: number): number {
        const safeMaxColumns = this.clampDimension(maxColumns, 1, MAX_COLUMNS, 5);
        const safeMinWidth = this.clampDimension(minCardWidth, MIN_CARD_WIDTH_PX, 700, 220);
        const widthSource = this.getAvailableWidth();
        if (!Number.isFinite(widthSource) || widthSource <= 0) return safeMaxColumns;

        const innerWidth = Math.max(0, widthSource - (GRID_PADDING_PX * 2));
        const byWidth = Math.max(1, Math.floor((innerWidth + GRID_GAP_PX) / (safeMinWidth + GRID_GAP_PX)));
        return Math.max(1, Math.min(safeMaxColumns, byWidth));
    }

    private parseCssPixels(value: string, fallback: number): number {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
        return parsed;
    }

    private clampDimension(value: number, min: number, max: number, fallback: number): number {
        if (!Number.isFinite(value)) return fallback;
        const rounded = Math.round(value);
        if (rounded < min) return min;
        if (rounded > max) return max;
        return rounded;
    }

    private clampImageRatio(value: number, fallback: number): number {
        if (!Number.isFinite(value)) return fallback;
        if (value < 0.4) return 0.4;
        if (value > 2.2) return 2.2;
        return Math.round(value * 100) / 100;
    }
}
