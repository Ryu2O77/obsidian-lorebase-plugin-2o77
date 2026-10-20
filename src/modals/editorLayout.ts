import { Platform, setIcon } from 'obsidian';
import { t } from '../localization';

export interface EditorLayoutOptions {
    /** Current "my notes" text and a setter, so the notes get their own box instead of a tab */
    getMyNotes?: () => string;
    setMyNotes?: (value: string) => void;
}

/**
 * Rearranges the editor panels into the final layout (identity under the poster,
 * rating first in the centre, source panels on top of the right column, collapsible tags,
 * heart favorite button). Works on any editor; panels that are missing are skipped.
 */
export function arrangeEditorLayout(root: HTMLElement, options: EditorLayoutOptions = {}): void {
    if (Platform.isMobile) return;
    const left = root.querySelector<HTMLElement>('.lorebase-editmode-column-left');
    const center = root.querySelector<HTMLElement>('.lorebase-editmode-column-center');
    const right = root.querySelector<HTMLElement>('.lorebase-editmode-column-right');
    if (!left || !center || !right) return;

    // Title, year, genres and description go under the poster.
    const poster = left.querySelector<HTMLElement>('.lorebase-editmode-poster-card');
    const titleMeta = center.querySelector<HTMLElement>('.lorebase-editmode-title-meta');
    const notes = center.querySelector<HTMLElement>('.lorebase-editmode-notes');
    if (poster && titleMeta) {
        poster.after(titleMeta);
        titleMeta.addClass('is-in-sidebar');
        if (notes) {
            // Description lives inside the identity panel as a plain text area (no title row, counter or "saved" label).
            const shell = notes.querySelector<HTMLElement>('.lorebase-editmode-notes-shell');
            const area = notes.querySelector<HTMLTextAreaElement>('textarea');
            titleMeta.querySelector('.lorebase-editmode-title-meta-actions')?.remove();
            if (shell && area) {
                area.setAttribute('rows', '6');
                area.placeholder = t('editDescription');
                shell.addClass('lorebase-editmode-description-shell');
                titleMeta.insertBefore(shell, titleMeta.querySelector('.lorebase-editmode-genres-field'));
                // Original title goes right below the description.
                const original = titleMeta.querySelector<HTMLElement>('.lorebase-editmode-original-title');
                if (original) shell.after(original);
                growWithContent(area);
            }
            notes.removeClass('is-always-open');
            notes.setCssStyles({ display: 'none' });
        }
        // Genres and studio sit below the description.
        const extra = createDiv({ cls: 'lorebase-editmode-panel lorebase-editmode-identity-extra' });
        const creator = root.querySelector<HTMLInputElement>('[data-field="director"], [data-field="authors"]')?.closest<HTMLElement>('.lorebase-editmode-field');
        if (creator) extra.appendChild(creator);
        const studio = root.querySelector<HTMLInputElement>('[data-field="studios"]')?.closest<HTMLElement>('.lorebase-editmode-field');
        if (studio) extra.appendChild(studio);
        const genres = titleMeta.querySelector<HTMLElement>('.lorebase-editmode-genres-field');
        if (genres) {
            genres.querySelector('.lorebase-editmode-title-meta-actions')?.remove();
            const wrap = extra.createDiv({ cls: 'lorebase-editmode-field' });
            wrap.createSpan({ cls: 'lorebase-editmode-field-label', text: t('genres') });
            wrap.appendChild(genres);
        }
        if (extra.childElementCount > 0) titleMeta.after(extra);
    }
    mountMyNotes(center, options);
    if (titleMeta) wrapTitle(titleMeta);
    // Start/finish dates sit beside the personal rating.
    const ratingWrap = status?.querySelector<HTMLElement>('.lorebase-editmode-rating-wrap');
    const playDates = status?.querySelector<HTMLElement>('.lorebase-editmode-play-dates');
    if (status && ratingWrap && playDates) {
        ratingWrap.after(playDates);
        status.addClass('has-side-dates');
    }

    // Chapters / seasons / episodes on top, rating right after.
    const status = center.querySelector<HTMLElement>('.lorebase-editmode-status-rating');
    if (status) center.prepend(status);
    const progress = center.querySelector<HTMLElement>('.lorebase-editmode-anime-parts, .lorebase-editmode-reading-progress');
    if (progress) {
        center.prepend(progress);
        // Season status goes above the seasons strip.
        const seasonStatus = progress.querySelector<HTMLElement>('.lorebase-editmode-anime-part-status-field');
        const navigation = progress.querySelector<HTMLElement>('.lorebase-editmode-anime-parts-navigation');
        if (seasonStatus && navigation) navigation.before(seasonStatus);
        // "Mark all watched" joins the add / remove icons.
        const completeAll = progress.querySelector<HTMLButtonElement>('[data-action="complete-all-parts"]');
        const actions = progress.querySelector<HTMLElement>('.lorebase-editmode-anime-part-inline-actions');
        if (completeAll && actions) {
            const label = completeAll.textContent?.replace('\u2713', '').trim() ?? '';
            completeAll.className = 'lorebase-editmode-anime-parts-icon-action';
            completeAll.empty();
            completeAll.setAttribute('aria-label', label);
            completeAll.setAttribute('title', label);
            setIcon(completeAll, 'check-check');
            actions.prepend(completeAll);
        }
    }

    // Community rating and metadata source on top of the right column.
    const source = right.querySelector<HTMLElement>('.lorebase-source-panel');
    const community = right.querySelector<HTMLElement>('.lorebase-editmode-community-rating');
    if (source) right.prepend(source);
    if (community) right.prepend(community);

    collapseTags(right);
    heartifyFavorite(root);
}

function collapseTags(right: HTMLElement): void {
    const tags = right.querySelector<HTMLElement>('.lorebase-editmode-tags');
    if (!tags || tags.tagName === 'DETAILS') return;
    const title = tags.querySelector('.lorebase-editmode-panel-title')?.textContent ?? '';
    const details = document.createElement('details');
    details.className = `${tags.className} lorebase-editmode-panel-glass lorebase-editmode-advanced`;
    for (const attr of Array.from(tags.attributes)) {
        if (attr.name.startsWith('data-')) details.setAttribute(attr.name, attr.value);
    }
    const summary = details.createEl('summary', { cls: 'lorebase-editmode-panel-title-row lorebase-editmode-collapsible-summary' });
    summary.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: title });
    summary.createSpan({ cls: 'lorebase-editmode-collapsible-caret', text: 'v', attr: { 'aria-hidden': 'true' } });
    for (const child of Array.from(tags.children)) {
        if (child.classList.contains('lorebase-editmode-panel-title-row')) continue;
        details.appendChild(child);
    }
    tags.replaceWith(details);
}

function heartifyFavorite(root: HTMLElement): void {
    const button = root.querySelector<HTMLButtonElement>('[data-toggle="favorite"]');
    if (!button) return;
    const row = button.closest<HTMLElement>('.lorebase-editmode-switch-row');
    const panel = button.closest<HTMLElement>('.lorebase-editmode-quick-settings');
    button.removeClass('lorebase-editmode-switch');
    button.removeClass('lorebase-editmode-switch-favorite');
    button.addClass('lorebase-editmode-heart-btn');
    button.empty();
    setIcon(button, 'heart');
    // Always visible, under the poster, so the quick-settings row is no longer needed.
    const posterCard = root.querySelector<HTMLElement>('.lorebase-editmode-poster-card');
    if (!posterCard) return;
    const favoriteRow = posterCard.createDiv({ cls: 'lorebase-poster-favorite-row' });
    button.addClass('is-under-poster');
    favoriteRow.appendChild(button);
    row?.remove();
    if (panel && !panel.querySelector('.lorebase-editmode-switch-row')) panel.addClass('is-hidden');
}

/** "My notes" as its own panel in the centre column, instead of a tab on the description. */
function mountMyNotes(center: HTMLElement, options: EditorLayoutOptions): void {
    if (!options.setMyNotes || center.querySelector('.lorebase-editmode-my-notes')) return;
    const panel = createDiv({ cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-my-notes' });
    panel.createDiv({ cls: 'lorebase-editmode-panel-title-row' })
        .createEl('h3', { cls: 'lorebase-editmode-panel-title', text: t('editMyNotes') });
    const area = panel.createEl('textarea', { cls: 'lorebase-editmode-notes-input', attr: { 'data-field': 'my-notes', rows: '5' } });
    area.value = options.getMyNotes?.() ?? '';
    area.addEventListener('input', () => options.setMyNotes?.(area.value));
    center.appendChild(panel);
}

/**
 * Swaps the single-line title box for an auto-growing one so long titles wrap instead of being cut.
 * The original input stays in the DOM (hidden) as the source of truth: its value setter mirrors to
 * the visible area, and typing in the area is forwarded as a normal `input` event.
 */
function wrapTitle(titleMeta: HTMLElement): void {
    const input = titleMeta.querySelector<HTMLInputElement>('.lorebase-editmode-title-input');
    if (!input || input.dataset.wrapped === 'true') return;
    input.dataset.wrapped = 'true';
    const area = createEl('textarea', { cls: 'lorebase-editmode-title-input lorebase-editmode-title-area', attr: { rows: '1', 'aria-label': input.getAttribute('aria-label') ?? '' } });
    const resize = (): void => {
        area.setCssStyles({ height: 'auto' });
        area.setCssStyles({ height: `${area.scrollHeight}px` });
    };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor?.get && descriptor.set) {
        const { get, set } = descriptor;
        Object.defineProperty(input, 'value', {
            configurable: true,
            get() { return get.call(input) as string; },
            set(next: string) { set.call(input, next); area.value = next; window.requestAnimationFrame(resize); },
        });
    }
    area.value = input.value;
    area.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); });
    area.addEventListener('input', () => {
        const flat = area.value.replace(/\n/g, ' ');
        if (flat !== area.value) area.value = flat;
        input.value = flat;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        resize();
    });
    input.after(area);
    input.addClass('is-hidden');
    window.requestAnimationFrame(resize);
    window.setTimeout(resize, 150);
}

/** Makes a text area as tall as its text, so it reads like plain text instead of a scrolling box. */
function growWithContent(area: HTMLTextAreaElement): void {
    const resize = (): void => {
        area.setCssStyles({ height: 'auto' });
        area.setCssStyles({ height: `${area.scrollHeight}px` });
    };
    area.addEventListener('input', resize);
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (descriptor?.get && descriptor.set) {
        const { get, set } = descriptor;
        Object.defineProperty(area, 'value', {
            configurable: true,
            get() { return get.call(area) as string; },
            set(next: string) { set.call(area, next); window.requestAnimationFrame(resize); },
        });
    }
    window.requestAnimationFrame(resize);
    window.setTimeout(resize, 200);
}
