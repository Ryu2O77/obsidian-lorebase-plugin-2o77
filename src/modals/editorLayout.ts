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
    // Always visible next to the title, so the quick-settings row is no longer needed.
    const titleRow = root.querySelector<HTMLElement>('.lorebase-editmode-title-meta .lorebase-editmode-title-row');
    const host = titleRow ?? root.querySelector<HTMLElement>('.lorebase-editmode-poster-frame');
    if (!host) return;
    button.addClass(titleRow ? 'is-inline' : 'is-overlay');
    host.appendChild(button);
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
    const related = center.querySelector('.lorebase-editmode-related');
    if (related) related.before(panel);
    else center.appendChild(panel);
}
