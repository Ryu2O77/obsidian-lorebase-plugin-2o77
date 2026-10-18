/**
 * LOREBASE - Statistics Modal
 * Displays collection statistics in a beautiful dashboard
 */

import { Modal, App, setIcon } from 'obsidian';
import { GameStats, AnimeStats, MediaItem, MediaType } from '../types';
import { completedPerMonth, computeCompanionStats } from '../services/media/insights';
import { t } from '../localization';
import { RATING_CONFIG } from '../constants';

// =============================================================================
// STATS MODAL
// =============================================================================

/**
 * Modal for displaying collection statistics
 */
export class StatsModal extends Modal {
    private stats: GameStats | AnimeStats;
    private mediaType: MediaType;
    private items: MediaItem[];

    constructor(app: App, stats: GameStats | AnimeStats, mediaType: MediaType, items: MediaItem[] = []) {
        super(app);
        this.stats = stats;
        this.mediaType = mediaType;
        this.items = items;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass('lorebase-sd-container');
        contentEl.addClass('lorebase-sd', 'lorebase-modal-root');

        const header = contentEl.createDiv({ cls: 'lorebase-sd-header' });
        setIcon(header.createSpan({ cls: 'lorebase-sd-header-icon' }), this.getMediaIcon());
        const heading = header.createDiv({ cls: 'lorebase-sd-heading' });
        heading.createEl('h2', { text: t('statsTitle'), cls: 'lorebase-sd-title' });
        heading.createDiv({ cls: 'lorebase-sd-subtitle', text: `${this.stats.total} ${t('statsTotal').toLowerCase()}` });
        const closeBtn = header.createEl('button', { cls: 'lorebase-sd-close', attr: { type: 'button', 'aria-label': 'Close' } });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.close());

        this.renderKpis(contentEl);

        const columns = contentEl.createDiv({ cls: 'lorebase-sd-columns' });
        this.renderStatusDistribution(columns);
        this.renderRatingDistribution(columns);

        this.renderMonthly(contentEl);
        this.renderTogether(contentEl);
        if (this.mediaType === 'game') this.renderAdditionalInfo(contentEl);
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private section(parent: HTMLElement, title: string): HTMLElement {
        const section = parent.createDiv({ cls: 'lorebase-sd-section' });
        section.createDiv({ cls: 'lorebase-sd-section-title', text: title });
        return section;
    }

    /** Four headline numbers. */
    private renderKpis(container: HTMLElement): void {
        const grid = container.createDiv({ cls: 'lorebase-sd-kpis' });
        const isWatchMedia = this.mediaType !== 'game';
        const isReadingMedia = this.mediaType === 'book' || this.mediaType === 'manga';
        const stats = this.stats as (GameStats & AnimeStats);
        const favPercent = stats.total > 0 ? Math.round((stats.favorite / stats.total) * 1000) / 10 : 0;
        const completedLabel = isWatchMedia
            ? isReadingMedia ? t('statusReadCompleted') : t('statusCompleted')
            : t('statsCompleted');

        const kpi = (label: string, value: string | number, sub: string, accent = false): void => {
            const card = grid.createDiv({ cls: `lorebase-sd-kpi${accent ? ' is-accent' : ''}` });
            card.createDiv({ cls: 'lorebase-sd-kpi-label', text: label });
            card.createDiv({ cls: 'lorebase-sd-kpi-value', text: String(value) });
            card.createDiv({ cls: 'lorebase-sd-kpi-sub', text: sub });
        };
        kpi(t('statsTotal'), stats.total, ' ');
        kpi(completedLabel, stats.completed, `${stats.statusPercentages.completed || 0}%`);
        kpi(t('statsAvgRating'), stats.avgRating, `${t('statsOf')} 5.0`, true);
        kpi(t('statusFavorite'), stats.favorite, `${favPercent}%`);
    }

    /** One stacked bar for the whole collection plus a legend row per status. */
    private renderStatusDistribution(container: HTMLElement): void {
        const section = this.section(container, t('statsDistribution'));
        const isWatchMedia = this.mediaType !== 'game';
        const isReadingMedia = this.mediaType === 'book' || this.mediaType === 'manga';

        const statusData = isWatchMedia
            ? [
                { key: 'planned', label: isReadingMedia ? t('statusPlanToRead') : t('statusPlanned'), value: (this.stats as AnimeStats).planned, color: '#9e9e9e' },
                { key: 'watching', label: isReadingMedia ? t('statusReading') : t('statusWatching'), value: (this.stats as AnimeStats).watching, color: '#2196f3' },
                { key: 'completed', label: isReadingMedia ? t('statusReadCompleted') : t('statusCompleted'), value: (this.stats as AnimeStats).completed, color: '#4caf50' },
                { key: 'dropped', label: t('statusDropped'), value: (this.stats as AnimeStats).dropped, color: '#ff9800' },
                { key: 'paused', label: t('statusPaused'), value: (this.stats as AnimeStats).paused, color: '#ffeb3b' },
            ]
            : [
                { key: 'completed', label: t('statusPlayed'), value: (this.stats as GameStats).completed, color: '#4caf50' },
                { key: 'playing', label: t('statusPlaying'), value: (this.stats as GameStats).playing, color: '#2196f3' },
                { key: 'played', label: t('statusPartlyPlayed'), value: (this.stats as GameStats).played, color: '#b388ff' },
                { key: 'dropped', label: t('statusDropped'), value: (this.stats as GameStats).dropped, color: '#ff9800' },
                { key: 'wishlist', label: t('statusWishlist'), value: (this.stats as GameStats).wishlist, color: 'var(--lorebase-wishlist-color)' },
                { key: 'sandbox', label: t('statusSandbox'), value: (this.stats as GameStats).sandbox, color: '#ffeb3b' },
                { key: 'notStarted', label: t('statusNotStarted'), value: (this.stats as GameStats).notStarted, color: '#9e9e9e' },
            ];

        const total = statusData.reduce((sum, entry) => sum + entry.value, 0);
        const stack = section.createDiv({ cls: 'lorebase-sd-stack' });
        for (const entry of statusData) {
            if (entry.value <= 0 || total <= 0) continue;
            const segment = stack.createDiv({ cls: 'lorebase-sd-stack-seg', attr: { title: `${entry.label}: ${entry.value}` } });
            segment.style.width = `${(entry.value / total) * 100}%`;
            segment.style.background = entry.color;
        }

        const legend = section.createDiv({ cls: 'lorebase-sd-legend' });
        for (const entry of statusData) {
            const row = legend.createDiv({ cls: `lorebase-sd-legend-row${entry.value ? '' : ' is-empty'}` });
            const dot = row.createSpan({ cls: 'lorebase-sd-dot' });
            dot.style.background = entry.color;
            row.createSpan({ cls: 'lorebase-sd-legend-label', text: entry.label });
            row.createSpan({ cls: 'lorebase-sd-legend-value', text: String(entry.value) });
            row.createSpan({ cls: 'lorebase-sd-legend-percent', text: `${this.stats.statusPercentages[entry.key] || 0}%` });
        }
    }

    private renderRatingDistribution(container: HTMLElement): void {
        const section = this.section(container, t('statsRatingDistribution'));
        const rows = section.createDiv({ cls: 'lorebase-sd-bars' });
        for (const config of RATING_CONFIG) {
            const count = this.stats.ratingDistribution[config.value] || 0;
            const percent = this.stats.withRating > 0
                ? Math.round((count / this.stats.withRating) * 1000) / 10
                : 0;
            const row = rows.createDiv({ cls: 'lorebase-sd-bar-row' });
            const label = row.createDiv({ cls: 'lorebase-sd-bar-label' });
            label.createSpan({ cls: 'lorebase-sd-bar-star', text: `${config.value}★` }).style.color = config.color;
            label.createSpan({ text: t(config.labelKey) });
            const track = row.createDiv({ cls: 'lorebase-sd-track' });
            const fill = track.createDiv({ cls: 'lorebase-sd-track-fill' });
            fill.style.width = `${percent}%`;
            fill.style.background = config.color;
            row.createSpan({ cls: 'lorebase-sd-bar-count', text: String(count) });
            row.createSpan({ cls: 'lorebase-sd-bar-percent', text: `${percent}%` });
        }
    }

    /** Bar chart of items completed in each of the last 12 months. */
    private renderMonthly(container: HTMLElement): void {
        const buckets = completedPerMonth(this.items, 12);
        const max = Math.max(...buckets.map((bucket) => bucket.count));
        if (max <= 0) return;
        const section = this.section(container, t('statsMonthlyTitle'));
        const chart = section.createDiv({ cls: 'lorebase-sd-months' });
        for (const bucket of buckets) {
            const col = chart.createDiv({ cls: 'lorebase-sd-month', attr: { title: `${bucket.key}: ${bucket.count}` } });
            col.createDiv({ cls: 'lorebase-sd-month-count', text: bucket.count ? String(bucket.count) : '' });
            const bar = col.createDiv({ cls: 'lorebase-sd-month-bar' });
            bar.style.height = `${Math.max(bucket.count ? 6 : 2, Math.round((bucket.count / max) * 96))}px`;
            col.createDiv({ cls: 'lorebase-sd-month-label', text: String(bucket.month).padStart(2, '0') });
        }
    }

    /** Comparison with each person the collection is shared with. */
    private renderTogether(container: HTMLElement): void {
        if (this.mediaType !== 'movie' && this.mediaType !== 'series' && this.mediaType !== 'book') return;
        for (const person of computeCompanionStats(this.items)) {
            const section = this.section(container, `${t('statsTogetherTitle')} ${person.name}`);
            const grid = section.createDiv({ cls: 'lorebase-sd-kpis is-compact' });
            const cell = (label: string, value: string): void => {
                const card = grid.createDiv({ cls: 'lorebase-sd-kpi' });
                card.createDiv({ cls: 'lorebase-sd-kpi-label', text: label });
                card.createDiv({ cls: 'lorebase-sd-kpi-value', text: value });
            };
            cell(t('statsShared'), String(person.shared));
            cell(t('statsBothCompleted'), String(person.bothCompleted));
            cell(t('statsAvgMine'), person.avgMine === null ? '-' : `${person.avgMine} ★`);
            cell(t('statsAvgTheirs'), person.avgTheirs === null ? '-' : `${person.avgTheirs} ★`);
            if (person.disagreements.length) {
                section.createDiv({ cls: 'lorebase-sd-subtitle-row', text: t('statsDisagreeTitle') });
                const list = section.createDiv({ cls: 'lorebase-sd-list' });
                for (const entry of person.disagreements) {
                    const row = list.createDiv({ cls: 'lorebase-sd-list-row' });
                    row.createSpan({ cls: 'lorebase-sd-list-name', text: entry.name });
                    row.createSpan({ cls: 'lorebase-sd-list-values', text: `${t('statsYou')} ${entry.mine} · ${person.name} ${entry.theirs}` });
                }
            }
        }
    }

    /** Smaller secondary facts about the game collection. */
    private renderAdditionalInfo(container: HTMLElement): void {
        const stats = this.stats as GameStats;
        const section = this.section(container, t('statsAdditionalInfo'));
        const list = section.createDiv({ cls: 'lorebase-sd-facts' });
        const facts: Array<[string, string | number]> = [
            [t('statsSeries'), stats.seriesCount],
            [t('statsCustomPosters'), stats.customPosters],
            [t('statsAdultContent'), stats.adult],
            [t('statsRated'), stats.withRating],
            [t('statsCompletionPercent'), stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}%` : '0%'],
        ];
        for (const [label, value] of facts) {
            const fact = list.createDiv({ cls: 'lorebase-sd-fact' });
            fact.createSpan({ cls: 'lorebase-sd-fact-label', text: label });
            fact.createSpan({ cls: 'lorebase-sd-fact-value', text: String(value) });
        }
    }

    private getMediaIcon(): string {
        if (this.mediaType === 'game') return 'gamepad-2';
        if (this.mediaType === 'movie') return 'film';
        if (this.mediaType === 'book') return 'book-open';
        if (this.mediaType === 'manga') return 'library';
        return 'tv';
    }
}
