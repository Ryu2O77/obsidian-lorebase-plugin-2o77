import { Platform, setIcon } from 'obsidian';

/**
 * Rearranges the editor panels into the final layout (identity under the poster,
 * rating first in the centre, source panels on top of the right column, collapsible tags,
 * heart favorite button). Works on any editor; panels that are missing are skipped.
 */
export function arrangeEditorLayout(root: HTMLElement): void {
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
        if (notes) titleMeta.after(notes);
    }

    // Rating first in the centre; progress / seasons / chapters follow.
    const status = center.querySelector<HTMLElement>('.lorebase-editmode-status-rating');
    if (status) center.prepend(status);

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
    button.removeClass('lorebase-editmode-switch');
    button.removeClass('lorebase-editmode-switch-favorite');
    button.addClass('lorebase-editmode-heart-btn');
    button.empty();
    setIcon(button, 'heart');
}
