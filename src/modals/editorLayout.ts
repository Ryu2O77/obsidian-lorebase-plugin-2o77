import { Notice, Platform, setIcon } from 'obsidian';
import { t } from '../localization';
import { bindStarHover, paintStars } from './halfStars';
import { mountEpisodeNotes, type NoteKind } from './episodeNotes';

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
                titleMeta.appendChild(shell);
                // Original title goes right below the description.
                clampDescription(shell, area);
            }
            notes.removeClass('is-always-open');
            notes.setCssStyles({ display: 'none' });
        }
        let genresBlock: HTMLElement | null = null;
        // One card of "label + value" rows: year, format, director/author, studio, genres.
        const facts = createDiv({ cls: 'lorebase-editmode-panel lorebase-editmode-facts' });
        const metaRow = titleMeta.querySelector<HTMLElement>('.lorebase-editmode-meta-row');
        if (metaRow) facts.appendChild(metaRow);
        // Original title sits right above the description.
        const original = titleMeta.querySelector<HTMLElement>('.lorebase-editmode-original-title');
        if (original) titleMeta.prepend(original);
        const creator = root.querySelector<HTMLInputElement>('[data-field="director"], [data-field="authors"]')?.closest<HTMLElement>('.lorebase-editmode-field');
        if (creator) facts.appendChild(creator);
        const studio = root.querySelector<HTMLInputElement>('[data-field="studios"]')?.closest<HTMLElement>('.lorebase-editmode-field');
        if (studio) facts.appendChild(studio);
        const genres = titleMeta.querySelector<HTMLElement>('.lorebase-editmode-genres-field');
        if (genres) {
            genres.querySelector('.lorebase-editmode-title-meta-actions')?.remove();
            // Genres live in the right column list (grouped there later).
            const wrap = createDiv({ cls: 'lorebase-genres-block' });
            wrap.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: t('genres') });
            wrap.appendChild(genres);
            genresBlock = wrap;
        }
        if (facts.childElementCount > 0) poster.after(facts);
        if (facts.isConnected) facts.after(titleMeta);
        if (genresBlock) right.appendChild(genresBlock);
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
        compactPartsHeader(progress);
    }

    // Community rating and metadata source on top of the right column.
    const source = right.querySelector<HTMLElement>('.lorebase-source-panel');
    const community = right.querySelector<HTMLElement>('.lorebase-editmode-community-rating');
    if (source) right.prepend(source);
    if (community) right.prepend(community);

    collapseTags(right);
    groupRightColumn(right);
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
    // Back on the poster itself, in the top-right corner.
    heart.removeClass('is-under-poster');
    heart.addClass('is-overlay');
    (posterCard.querySelector<HTMLElement>('.lorebase-editmode-poster-frame') ?? posterCard).appendChild(heart);

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
    const panel = createDiv({ cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-my-notes is-collapsed' });
    const root = center.closest<HTMLElement>('.lorebase-editmode-view') ?? center;
    const kind: NoteKind = root.querySelector('.lorebase-editmode-reading-progress')
        ? 'chapters'
        : root.querySelector('.lorebase-editmode-anime-parts') ? 'episodes' : 'none';
    let current = options.getMyNotes?.() ?? '';
    const handle = mountEpisodeNotes(panel, {
        kind,
        getValue: () => current,
        setValue: (value) => { current = value; options.setMyNotes?.(value); },
    });
    // The modals fill this hidden field once the section has been read from the file; it forwards the text to the list.
    const bridge = panel.createEl('textarea', { cls: 'lorebase-hidden-bridge', attr: { 'data-field': 'my-notes', 'aria-hidden': 'true', tabindex: '-1' } });
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (descriptor?.get && descriptor.set) {
        const { get, set } = descriptor;
        Object.defineProperty(bridge, 'value', {
            configurable: true,
            get() { return get.call(bridge) as string; },
            set(next: string) { set.call(bridge, next); current = next; handle.load(next); },
        });
    }
    // Notes go right above Related media.
    const related = center.querySelector('.lorebase-editmode-related');
    if (related) related.before(panel);
    else center.appendChild(panel);
    collapseRelated(center);
}

/** Related media becomes a collapsible panel, closed whenever the editor opens. */
function collapseRelated(center: HTMLElement): void {
    const related = center.querySelector<HTMLElement>('.lorebase-editmode-related');
    const titleRow = related?.querySelector<HTMLElement>('.lorebase-editmode-panel-title-row');
    if (!related || !titleRow || related.hasClass('is-collapsible')) return;
    related.addClass('is-collapsible', 'is-collapsed');
    const heading = titleRow.querySelector<HTMLElement>('.lorebase-editmode-panel-title');
    const caret = createSpan({ cls: 'lorebase-editmode-collapsible-caret lorebase-related-caret', attr: { 'aria-hidden': 'true' } });
    setIcon(caret, 'chevron-down');
    heading?.after(caret);
    titleRow.addClass('lorebase-related-head');
    titleRow.setAttribute('role', 'button');
    titleRow.setAttribute('tabindex', '0');
    titleRow.setAttribute('aria-expanded', 'false');
    const toggle = (): void => {
        const collapsed = related.hasClass('is-collapsed');
        related.toggleClass('is-collapsed', !collapsed);
        titleRow.setAttribute('aria-expanded', String(collapsed));
    };
    titleRow.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        toggle();
    });
    titleRow.addEventListener('keydown', (event) => {
        if (event.target !== titleRow || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        toggle();
    });
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
    const facts = root.querySelector<HTMLElement>('.lorebase-editmode-facts');
    const card = root.querySelector<HTMLElement>('.lorebase-editmode-poster-card');
    const dates = root.querySelector<HTMLElement>('.lorebase-editmode-status-rating .lorebase-editmode-play-dates');
    if (!dates) return;
    // Start / finish dates are rows of the facts card (year, director, ...).
    (facts ?? card)?.appendChild(dates);
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

/** Total + actions live in the parts header; the "Total / Active part" strip is hidden. */
function compactPartsHeader(progress: HTMLElement): void {
    const titleRow = progress.querySelector<HTMLElement>('.lorebase-editmode-panel-title-row');
    if (!titleRow) return;
    const heading = titleRow.querySelector<HTMLElement>('.lorebase-editmode-panel-title');
    const total = progress.querySelector<HTMLElement>('[data-role="progress-total"]');
    if (heading && total) {
        total.addClass('lorebase-parts-total');
        heading.after(total);
    }
    const tools = titleRow.createDiv({ cls: 'lorebase-parts-title-actions' });
    const refresh = titleRow.querySelector<HTMLElement>('[data-action="refresh-parts"]');
    if (refresh) tools.appendChild(refresh);
    for (const action of ['complete-all-parts', 'add-part', 'remove-part']) {
        const button = progress.querySelector<HTMLElement>(`[data-action="${action}"]`);
        if (button) tools.appendChild(button);
    }
    progress.querySelector('.lorebase-editmode-anime-part-inline-actions')?.addClass('is-empty');
    confirmPartRemoval(progress);
    addPartChip(progress);
    totalInLabel(progress);
}

/** Removing a season needs a second press (the first one arms the button). */
function confirmPartRemoval(progress: HTMLElement): void {
    const remove = progress.querySelector<HTMLButtonElement>('[data-action="remove-part"]');
    if (!remove) return;
    let armed = false;
    remove.addEventListener('click', (event) => {
        if (armed) {
            armed = false;
            remove.removeClass('is-armed');
            return;
        }
        event.stopImmediatePropagation();
        armed = true;
        remove.addClass('is-armed');
        new Notice(t('epNoteDeleteConfirm'), 1800);
        window.setTimeout(() => { armed = false; remove.removeClass('is-armed'); }, 2500);
    }, true);
}

/** The "+" that adds a season sits right after the last season chip. */
function addPartChip(progress: HTMLElement): void {
    const strip = progress.querySelector<HTMLElement>('[data-role="part-strip"]');
    const add = progress.querySelector<HTMLButtonElement>('[data-action="add-part"]');
    if (!strip || !add) return;
    add.addClass('lorebase-part-add-chip');
    const place = (): void => {
        if (strip.lastElementChild !== add) strip.appendChild(add);
    };
    new MutationObserver(place).observe(strip, { childList: true });
    place();
}

/** "Episodes (8)": the total is the grey, editable number next to the label instead of a second field. */
function totalInLabel(progress: HTMLElement): void {
    const field = progress.querySelector<HTMLElement>('.lorebase-editmode-anime-episodes-field');
    const label = field?.querySelector<HTMLElement>('.lorebase-editmode-field-label');
    const total = field?.querySelector<HTMLInputElement>('[data-field="part-episode-total"]');
    if (!field || !label || !total) return;
    label.createSpan({ cls: 'lorebase-ep-total-paren', text: ' (' });
    total.addClass('lorebase-ep-total-input');
    label.appendChild(total);
    label.createSpan({ cls: 'lorebase-ep-total-paren', text: ')' });
    field.querySelector('.lorebase-editmode-anime-slash')?.addClass('is-hidden');
}

/** Right column: one card for community + source, one flat list for the collapsible / secondary blocks. */
function groupRightColumn(right: HTMLElement): void {
    if (right.querySelector('.lorebase-right-card')) return;
    const make = (selectors: string[], cls: string): HTMLElement | null => {
        const items = selectors.flatMap((selector) => {
            const el = right.querySelector<HTMLElement>(selector);
            return el ? [el] : [];
        });
        if (items.length === 0) return null;
        const card = createDiv({ cls: `lorebase-editmode-panel lorebase-right-card ${cls}` });
        for (const item of items) {
            item.addClass('is-flat');
            card.appendChild(item);
        }
        return card;
    };
    const top = make(['.lorebase-editmode-community-rating', '.lorebase-source-panel'], 'is-source');
    const list = make([
        '.lorebase-genres-block',
        '.lorebase-editmode-advanced:not(.lorebase-editmode-tags)',
        '.lorebase-editmode-tags',
        '.lorebase-editmode-companions',
        '.lorebase-editmode-timestamps',
    ], 'is-list');
    if (list) right.prepend(list);
    if (top) right.prepend(top);
}

const DESCRIPTION_CLAMP_PX = 96;

/** Description: grows with its text but is clamped to a few lines, with a show more / less toggle. */
function clampDescription(shell: HTMLElement, area: HTMLTextAreaElement): void {
    growWithContent(area);
    const toggle = shell.createEl('button', { cls: 'lorebase-desc-toggle', attr: { type: 'button' } });
    let expanded = false;
    const apply = (): void => {
        const overflowing = area.scrollHeight > DESCRIPTION_CLAMP_PX + 6;
        const focused = activeDocument.activeElement === area;
        shell.toggleClass('is-clamped', overflowing && !expanded && !focused);
        toggle.toggleClass('is-hidden', !overflowing);
        toggle.empty();
        setIcon(toggle, expanded ? 'chevron-up' : 'chevron-down');
        toggle.setAttribute('aria-label', expanded ? t('editShowLess') : t('editShowMore'));
        toggle.setAttribute('title', expanded ? t('editShowLess') : t('editShowMore'));
    };
    toggle.addEventListener('click', () => { expanded = !expanded; apply(); });
    area.addEventListener('focus', () => shell.removeClass('is-clamped'));
    area.addEventListener('blur', apply);
    area.addEventListener('input', apply);
    window.requestAnimationFrame(apply);
    window.setTimeout(apply, 300);
}
