import { Notice, setIcon } from 'obsidian';
import { i18n } from '../localization';
import type { CommunityRating, MediaItem } from '../types';

export type CommunityRatingRefresh = () => Promise<CommunityRating | null>;

function label(en: string, ru: string, uk: string): string {
    const language = i18n.getLanguage();
    if (language === 'ru') return ru;
    if (language === 'uk') return uk;
    return en;
}

function formatRating(value: number | null | undefined): string {
    if (!Number.isFinite(value)) return '-';
    const rating = Number(value);
    const text = Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
    return `${text}%`;
}

function formatVotes(value: number | null | undefined): string {
    if (!Number.isFinite(value)) return '-';
    return new Intl.NumberFormat().format(Math.max(0, Math.trunc(Number(value))));
}

function formatVotesLine(value: number | null | undefined): string {
    const votes = formatVotes(value);
    if (votes === '-') return label('No votes', '\u041d\u0435\u0442 \u0433\u043e\u043b\u043e\u0441\u043e\u0432', '\u041d\u0435\u043c\u0430\u0454 \u0433\u043e\u043b\u043e\u0441\u0456\u0432');
    return `${votes} ${label('votes', '\u0433\u043e\u043b\u043e\u0441\u043e\u0432', '\u0433\u043e\u043b\u043e\u0441\u0456\u0432')}`;
}

export function renderCommunityRatingPanel(
    root: HTMLElement,
    item: MediaItem,
    refresh: CommunityRatingRefresh
): void {
    const column = root.querySelector<HTMLElement>('.lorebase-editmode-column-right');
    if (!column || column.querySelector('.lorebase-editmode-community-rating')) return;

    const panel = createDiv({ cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-community-rating' });
    panel.dataset.mobilePane = 'more';
    const titleRow = panel.createDiv({ cls: 'lorebase-editmode-panel-title-row' });
    titleRow.createEl('h3', {
        cls: 'lorebase-editmode-panel-title',
        text: label('Community rating', '\u041e\u0446\u0435\u043d\u043a\u0430 \u0441\u043e\u043e\u0431\u0449\u0435\u0441\u0442\u0432\u0430', '\u041e\u0446\u0456\u043d\u043a\u0430 \u0441\u043f\u0456\u043b\u044c\u043d\u043e\u0442\u0438'),
    });
    const refreshButton = titleRow.createEl('button', {
        cls: 'lorebase-editmode-icon-btn lorebase-editmode-community-refresh',
        attr: {
            type: 'button',
            title: label('Refresh rating', '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043e\u0446\u0435\u043d\u043a\u0443', '\u041e\u043d\u043e\u0432\u0438\u0442\u0438 \u043e\u0446\u0456\u043d\u043a\u0443'),
            'aria-label': label('Refresh rating', '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043e\u0446\u0435\u043d\u043a\u0443', '\u041e\u043d\u043e\u0432\u0438\u0442\u0438 \u043e\u0446\u0456\u043d\u043a\u0443'),
        },
    });
    setIcon(refreshButton, 'refresh-cw');

    const body = panel.createDiv({ cls: 'lorebase-community-rating-card' });
    const score = body.createDiv({ cls: 'lorebase-community-rating-score' });
    const ratingValue = score.createSpan({ cls: 'lorebase-community-rating-number', attr: { 'data-role': 'community-rating' } });
    score.createSpan({ cls: 'lorebase-community-rating-caption', text: label('score', '\u043e\u0446\u0435\u043d\u043a\u0430', '\u043e\u0446\u0456\u043d\u043a\u0430') });

    const meta = body.createDiv({ cls: 'lorebase-community-rating-meta' });
    const providerValue = meta.createSpan({ cls: 'lorebase-community-rating-provider', attr: { 'data-role': 'community-provider' } });
    const votesValue = meta.createSpan({ cls: 'lorebase-community-rating-votes', attr: { 'data-role': 'community-votes' } });

    const sync = (): void => {
        providerValue.textContent = item.communityRatingProvider || label('No source', '\u041d\u0435\u0442 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0430', '\u041d\u0435\u043c\u0430\u0454 \u0434\u0436\u0435\u0440\u0435\u043b\u0430');
        ratingValue.textContent = formatRating(item.communityRating);
        votesValue.textContent = formatVotesLine(item.communityVotes);
        body.toggleClass('is-empty', !Number.isFinite(item.communityRating));
    };

    refreshButton.addEventListener('click', () => {
        void (async (): Promise<void> => {
            refreshButton.disabled = true;
            refreshButton.addClass('is-loading');
            try {
                const next = await refresh();
                if (!next || !Number.isFinite(next.rating)) {
                    new Notice(label('Community rating not found.', '\u041e\u0446\u0435\u043d\u043a\u0430 \u0441\u043e\u043e\u0431\u0449\u0435\u0441\u0442\u0432\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430.', '\u041e\u0446\u0456\u043d\u043a\u0443 \u0441\u043f\u0456\u043b\u044c\u043d\u043e\u0442\u0438 \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e.'));
                    return;
                }
                item.communityRatingProvider = next.provider;
                item.communityRating = next.rating;
                item.communityVotes = next.votes;
                sync();
                new Notice(label('Community rating updated.', '\u041e\u0446\u0435\u043d\u043a\u0430 \u0441\u043e\u043e\u0431\u0449\u0435\u0441\u0442\u0432\u0430 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0430.', '\u041e\u0446\u0456\u043d\u043a\u0443 \u0441\u043f\u0456\u043b\u044c\u043d\u043e\u0442\u0438 \u043e\u043d\u043e\u0432\u043b\u0435\u043d\u043e.'));
            } catch (error) {
                console.error('Community rating refresh failed:', error);
                new Notice(label('Community rating refresh failed.', '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043e\u0446\u0435\u043d\u043a\u0443 \u0441\u043e\u043e\u0431\u0449\u0435\u0441\u0442\u0432\u0430.', '\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u043e\u043d\u043e\u0432\u0438\u0442\u0438 \u043e\u0446\u0456\u043d\u043a\u0443 \u0441\u043f\u0456\u043b\u044c\u043d\u043e\u0442\u0438.'));
            } finally {
                refreshButton.disabled = false;
                refreshButton.removeClass('is-loading');
            }
        })();
    });

    sync();

    const tags = column.querySelector<HTMLElement>('.lorebase-editmode-tags');
    if (tags) {
        tags.after(panel);
        return;
    }

    const companions = column.querySelector<HTMLElement>('.lorebase-editmode-companions');
    if (companions) {
        companions.before(panel);
        return;
    }
    const dates = column.querySelector<HTMLElement>('.lorebase-editmode-timestamps');
    if (dates) dates.before(panel);
    else column.appendChild(panel);
}
