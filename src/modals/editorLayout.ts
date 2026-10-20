import { Platform, setIcon } from 'obsidian';
import { t } from '../localization';
import { bindStarHover, paintStars } from './halfStars';

export interface EditorLayoutOptions {
    /** Use the beta layout (poster rail + header + tabs) */
    beta?: boolean;
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
    const status = center.querySelector<HTMLElement>('.lorebase-editmode-status-rating');

    // Rating on top, chapters / seasons / episodes right after.
    if (status) center.prepend(status);
    const progress = center.querySelector<HTMLElement>('.lorebase-editmode-anime-parts, .lorebase-editmode-reading-progress');
    if (progress) {
        if (status) status.after(progress);
        else center.prepend(progress);
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
    moveTitleUnderPoster(root);
    moveDatesUnderPoster(root);
    bindRatingPreview(root);
    if (options.beta) {
        applyBetaLayout(root, left, center, right);
    }
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
    const original = root.querySelector<HTMLButtonElement>('[data-toggle="favorite"]');
    if (!original) return;
    const row = original.closest<HTMLElement>('.lorebase-editmode-switch-row');
    const panel = original.closest<HTMLElement>('.lorebase-editmode-quick-settings');
    const posterCard = root.querySelector<HTMLElement>('.lorebase-editmode-poster-card');
    if (!posterCard) return;

    // The original switch stays in the DOM (hidden) as the source of truth; the heart mirrors and forwards clicks.
    const heart = createEl('button', {
        cls: 'lorebase-editmode-heart-btn is-under-poster',
        attr: { type: 'button', 'aria-label': original.getAttribute('aria-label') ?? '', title: original.getAttribute('aria-label') ?? '' },
    });
    setIcon(heart, 'heart');
    const sync = (): void => {
        const active = original.classList.contains('is-active') || original.getAttribute('aria-pressed') === 'true';
        heart.toggleClass('is-active', active);
        heart.setAttribute('aria-pressed', String(active));
    };
    heart.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        original.click();
        sync();
    });
    new MutationObserver(sync).observe(original, { attributes: true, attributeFilter: ['class', 'aria-pressed'] });
    sync();
    posterCard.createDiv({ cls: 'lorebase-poster-favorite-row' }).appendChild(heart);

    row?.addClass('is-hidden');
    if (panel && !panel.querySelector('.lorebase-editmode-switch-row:not(.is-hidden)')) panel.addClass('is-hidden');
}

/**
 * Beta layout: poster rail on the left; on the right the identity header followed by tabs
 * (Tracking / Advanced / Related) holding the same panels, so nothing is lost or re-bound.
 */
function applyBetaLayout(root: HTMLElement, left: HTMLElement, center: HTMLElement, right: HTMLElement): void {
    const grid = root.querySelector<HTMLElement>('.lorebase-editmode-grid');
    if (!grid) return;
    grid.addClass('is-beta');
    root.querySelector('.lorebase-editmode-breadcrumb')?.appendText(' · beta');

    const titleMeta = left.querySelector<HTMLElement>('.lorebase-editmode-title-meta');
    if (titleMeta) {
        titleMeta.removeClass('is-in-sidebar');
        center.prepend(titleMeta);
    }

    const pick = (container: HTMLElement, selectors: string[]): HTMLElement[] =>
        selectors.map((selector) => container.querySelector<HTMLElement>(selector)).filter((el): el is HTMLElement => !!el);
    const find = (selectors: string[]): HTMLElement[] =>
        selectors.flatMap((selector) => {
            const el = root.querySelector<HTMLElement>(selector);
            return el ? [el] : [];
        });

    const panes: Array<{ label: string; panels: HTMLElement[] }> = [
        {
            label: t('editTracking'),
            panels: find(['.lorebase-editmode-anime-parts', '.lorebase-editmode-reading-progress', '.lorebase-editmode-progress', '.lorebase-editmode-status-rating']),
        },
        {
            label: t('editAdvanced'),
            panels: find(['.lorebase-editmode-advanced:not(.lorebase-editmode-tags)', '.lorebase-editmode-tags', '.lorebase-editmode-companions', '.lorebase-editmode-my-notes']),
        },
        {
            label: t('editRelatedMedia'),
            panels: find(['.lorebase-editmode-related', '.lorebase-editmode-community-rating', '.lorebase-source-panel', '.lorebase-editmode-timestamps']),
        },
    ];
    void pick;

    const tabBar = createDiv({ cls: 'lorebase-beta-tabs', attr: { role: 'tablist' } });
    const stack = createDiv({ cls: 'lorebase-beta-panes' });
    const buttons: HTMLButtonElement[] = [];
    const paneEls: HTMLElement[] = [];
    panes.forEach((pane, index) => {
        const button = tabBar.createEl('button', { cls: 'lorebase-beta-tab', text: pane.label, attr: { type: 'button', role: 'tab' } });
        const el = stack.createDiv({ cls: 'lorebase-beta-pane' });
        for (const panel of pane.panels) el.appendChild(panel);
        buttons.push(button);
        paneEls.push(el);
        button.addEventListener('click', () => select(index));
    });
    const select = (active: number): void => {
        buttons.forEach((button, i) => {
            button.toggleClass('is-active', i === active);
            button.setAttribute('aria-selected', String(i === active));
        });
        paneEls.forEach((el, i) => el.toggleClass('is-active', i === active));
    };
    select(0);
    center.appendChild(tabBar);
    center.appendChild(stack);
    right.addClass('is-empty-rail');
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

/** Start / finish dates live under the poster, where there is room, instead of a mostly empty column. */
function moveDatesUnderPoster(root: HTMLElement): void {
    const row = root.querySelector<HTMLElement>('.lorebase-poster-favorite-row');
    const card = root.querySelector<HTMLElement>('.lorebase-editmode-poster-card');
    const dates = root.querySelector<HTMLElement>('.lorebase-editmode-status-rating .lorebase-editmode-play-dates');
    if (!dates) return;
    // Same line as the favorite heart; the picker covers "today", so the extra buttons are dropped.
    if (row) { row.addClass('has-dates'); row.appendChild(dates); }
    else card?.appendChild(dates);
}

/** Hovering the personal rating stars previews the value (and half stars) before clicking. */
function bindRatingPreview(root: HTMLElement): void {
    const stars = root.querySelector<HTMLElement>('.lorebase-editmode-status-rating [data-role="stars"]');
    const valueEl = root.querySelector<HTMLElement>('.lorebase-editmode-status-rating [data-role="rating-value"]');
    if (!stars || !valueEl) return;
    let snapshot: { classes: string[]; text: string } | null = null;
    const take = (): void => {
        snapshot = {
            classes: Array.from(stars.querySelectorAll<HTMLElement>('.lorebase-editmode-star')).map((star) => star.className),
            text: valueEl.textContent ?? '',
        };
    };
    const restore = (): void => {
        if (!snapshot) return;
        stars.querySelectorAll<HTMLElement>('.lorebase-editmode-star').forEach((star, index) => {
            star.className = snapshot?.classes[index] ?? star.className;
        });
        valueEl.setText(snapshot.text);
        snapshot = null;
    };
    bindStarHover(stars, (value) => {
        if (!snapshot) take();
        paintStars(stars, value);
        valueEl.setText(`${value.toFixed(1)} / 5.0`);
    }, restore);
    // A click changes the real value: forget the old snapshot so leaving the row does not undo it.
    stars.addEventListener('click', () => { snapshot = null; });
}

/** The title sits centred right below the poster, in the poster's own card. */
function moveTitleUnderPoster(root: HTMLElement): void {
    const frame = root.querySelector<HTMLElement>('.lorebase-editmode-poster-card .lorebase-editmode-poster-frame');
    const titleRow = root.querySelector<HTMLElement>('.lorebase-editmode-title-meta .lorebase-editmode-title-row');
    if (frame && titleRow) {
        titleRow.addClass('is-under-poster');
        frame.after(titleRow);
    }
}
