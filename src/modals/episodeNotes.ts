import { Notice, setIcon } from 'obsidian';
import { t } from '../localization';

/** What a note's code means: season/episode, volume/chapter, or none (movies, games). */
export type NoteKind = 'episodes' | 'chapters' | 'none';

export interface EpisodeNote {
    /** Season (or volume) number, empty when unset */
    major: string;
    /** Episode (or chapter) number, empty when unset */
    minor: string;
    /** Free title shown after the code */
    label: string;
    body: string;
    /** ISO date (yyyy-mm-dd) the note was written */
    date: string;
    spoiler: boolean;
}

const LETTERS: Record<NoteKind, [string, string]> = {
    episodes: ['S', 'E'],
    chapters: ['V', 'C'],
    none: ['', ''],
};
const META_PATTERN = /^%%\s*lb:\s*(\d{4}-\d{2}-\d{2})?\s*(spoiler)?\s*%%$/;

function todayIso(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseHeading(heading: string, kind: NoteKind): Pick<EpisodeNote, 'major' | 'minor' | 'label'> {
    const [a, b] = LETTERS[kind];
    const [first, ...rest] = heading.split(' · ');
    if (kind !== 'none') {
        const match = new RegExp(`^(?:${a}(\\d+))?(?:${b}(\\d+))?$`).exec(first.trim());
        if (match && (match[1] || match[2])) {
            return { major: match[1] ?? '', minor: match[2] ?? '', label: rest.join(' · ').trim() };
        }
    }
    return { major: '', minor: '', label: heading.trim() };
}

/** Splits the "My notes" section text into notes: `### heading` starts a note, text before the first heading is kept as an untitled note. */
export function parseEpisodeNotes(text: string, kind: NoteKind): EpisodeNote[] {
    const notes: EpisodeNote[] = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let current: { heading: string | null; lines: string[] } | null = null;
    const flush = (): void => {
        if (!current) return;
        const body = [...current.lines];
        let date = '';
        let spoiler = false;
        const firstIndex = body.findIndex((line) => line.trim() !== '');
        if (firstIndex >= 0) {
            const meta = META_PATTERN.exec(body[firstIndex].trim());
            if (meta) {
                date = meta[1] ?? '';
                spoiler = Boolean(meta[2]);
                body.splice(firstIndex, 1);
            }
        }
        const content = body.join('\n').trim();
        if (current.heading === null && !content) { current = null; return; }
        notes.push({
            ...(current.heading === null ? { major: '', minor: '', label: '' } : parseHeading(current.heading, kind)),
            body: content,
            date,
            spoiler,
        });
        current = null;
    };
    for (const line of lines) {
        const heading = /^###\s+(.*)$/.exec(line);
        if (heading) {
            flush();
            current = { heading: heading[1].trim(), lines: [] };
        } else {
            current ??= { heading: null, lines: [] };
            current.lines.push(line);
        }
    }
    flush();
    return notes;
}

export function formatNoteCode(note: Pick<EpisodeNote, 'major' | 'minor'>, kind: NoteKind): string {
    const [a, b] = LETTERS[kind];
    return `${note.major ? `${a}${note.major}` : ''}${note.minor ? `${b}${note.minor}` : ''}`;
}

export function serializeEpisodeNotes(notes: EpisodeNote[], kind: NoteKind): string {
    const blocks = notes.map((note, index) => {
        const code = kind === 'none' ? '' : formatNoteCode(note, kind);
        const heading = [code, note.label.trim()].filter(Boolean).join(' · ');
        const hasMeta = Boolean(note.date) || note.spoiler;
        if (!heading && !hasMeta && index === 0) return note.body.trim();
        const meta = hasMeta ? `%% lb: ${note.date}${note.spoiler ? ' spoiler' : ''} %%\n` : '';
        return `### ${heading || 'Note'}\n${meta}${note.body.trim()}`.trimEnd();
    });
    return blocks.filter((block) => block.length > 0).join('\n\n');
}

export interface EpisodeNotesOptions {
    kind: NoteKind;
    getValue: () => string;
    setValue: (value: string) => void;
}

export interface EpisodeNotesHandle {
    /** Receives the raw section text (used when it finishes loading from the file) */
    load: (value: string) => void;
}

function autosize(area: HTMLTextAreaElement): void {
    area.setCssStyles({ height: 'auto' });
    area.setCssStyles({ height: `${Math.max(area.scrollHeight, 44)}px` });
}

/** Builds the notes list inside `panel`; every change is serialized back through `setValue`. */
export function mountEpisodeNotes(panel: HTMLElement, options: EpisodeNotesOptions): EpisodeNotesHandle {
    const { kind } = options;
    let notes = parseEpisodeNotes(options.getValue(), kind);
    let userToggled = false;
    let lastSerialized = serializeEpisodeNotes(notes, kind);

    const head = panel.createEl('button', { cls: 'lorebase-my-notes-head', attr: { type: 'button', 'aria-expanded': 'false' } });
    head.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: t('editMyNotes') });
    const count = head.createSpan({ cls: 'lorebase-ep-count' });
    const spacer = head.createSpan({ cls: 'lorebase-my-notes-preview' });
    const caret = head.createSpan({ cls: 'lorebase-editmode-collapsible-caret', attr: { 'aria-hidden': 'true' } });
    setIcon(caret, 'chevron-down');
    void spacer;

    const body = panel.createDiv({ cls: 'lorebase-ep-body' });
    const toolbar = body.createDiv({ cls: 'lorebase-ep-toolbar' });
    const addButton = toolbar.createEl('button', { cls: 'lorebase-ep-add', attr: { type: 'button' } });
    setIcon(addButton.createSpan({ cls: 'lorebase-ep-add-icon' }), 'plus');
    addButton.createSpan({ text: t('epNoteAdd') });
    const sortButton = toolbar.createEl('button', {
        cls: 'lorebase-ep-icon-btn',
        attr: { type: 'button', 'aria-label': t('epNoteSort'), title: t('epNoteSort') },
    });
    setIcon(sortButton, 'arrow-up-narrow-wide');
    if (kind === 'none') sortButton.addClass('is-hidden');
    const list = body.createDiv({ cls: 'lorebase-ep-list' });

    const setCollapsed = (collapsed: boolean): void => {
        panel.toggleClass('is-collapsed', collapsed);
        head.setAttribute('aria-expanded', String(!collapsed));
    };
    head.addEventListener('click', () => {
        userToggled = true;
        setCollapsed(!panel.hasClass('is-collapsed'));
    });

    const save = (): void => {
        lastSerialized = serializeEpisodeNotes(notes, kind);
        options.setValue(lastSerialized);
        count.setText(notes.length > 0 ? String(notes.length) : '');
    };

    const sortNotes = (): void => {
        const key = (note: EpisodeNote): number => (Number(note.major) || 0) * 10000 + (Number(note.minor) || 0);
        notes = notes
            .map((note, index) => ({ note, index }))
            .sort((x, y) => key(x.note) - key(y.note) || x.index - y.index)
            .map((entry) => entry.note);
        save();
        render();
    };
    sortButton.addEventListener('click', sortNotes);

    const render = (): void => {
        list.empty();
        count.setText(notes.length > 0 ? String(notes.length) : '');
        if (notes.length === 0) {
            list.createDiv({ cls: 'lorebase-ep-empty', text: t('epNoteEmpty') });
            return;
        }
        notes.forEach((note, index) => list.appendChild(renderCard(note, index)));
    };

    const renderCard = (note: EpisodeNote, index: number): HTMLElement => {
        const card = createDiv({ cls: 'lorebase-ep-note' });
        card.toggleClass('is-spoiler', note.spoiler);
        const header = card.createDiv({ cls: 'lorebase-ep-note-head' });

        if (kind !== 'none') {
            const [a, b] = LETTERS[kind];
            const codes = header.createDiv({ cls: 'lorebase-ep-codes' });
            const makeCode = (letter: string, value: string, tip: string, apply: (next: string) => void): void => {
                const wrap = codes.createDiv({ cls: 'lorebase-ep-code', attr: { title: tip } });
                wrap.createSpan({ cls: 'lorebase-ep-code-letter', text: letter });
                const input = wrap.createEl('input', { cls: 'lorebase-ep-code-input', attr: { type: 'text', inputmode: 'numeric', maxlength: '4', 'aria-label': tip } });
                input.value = value;
                input.addEventListener('input', () => {
                    input.value = input.value.replace(/\D/g, '');
                    apply(input.value);
                    save();
                });
            };
            makeCode(a, note.major, kind === 'episodes' ? t('epNoteSeason') : t('epNoteVolume'), (next) => { note.major = next; });
            makeCode(b, note.minor, kind === 'episodes' ? t('epNoteEpisode') : t('epNoteChapter'), (next) => { note.minor = next; });
        }

        const title = header.createEl('input', {
            cls: 'lorebase-ep-title',
            attr: { type: 'text', placeholder: t('epNoteTitle') },
        });
        title.value = note.label;
        title.addEventListener('input', () => { note.label = title.value; save(); });

        const tools = header.createDiv({ cls: 'lorebase-ep-tools' });
        if (note.date) tools.createSpan({ cls: 'lorebase-ep-date', text: note.date });
        const spoiler = tools.createEl('button', {
            cls: 'lorebase-ep-icon-btn',
            attr: { type: 'button', 'aria-label': t('epNoteSpoiler'), title: t('epNoteSpoiler') },
        });
        const paintSpoiler = (): void => {
            spoiler.empty();
            setIcon(spoiler, note.spoiler ? 'eye-off' : 'eye');
            spoiler.toggleClass('is-active', note.spoiler);
            card.toggleClass('is-spoiler', note.spoiler);
        };
        paintSpoiler();
        spoiler.addEventListener('click', () => { note.spoiler = !note.spoiler; paintSpoiler(); save(); });

        const remove = tools.createEl('button', {
            cls: 'lorebase-ep-icon-btn is-danger',
            attr: { type: 'button', 'aria-label': t('epNoteDelete'), title: t('epNoteDelete') },
        });
        setIcon(remove, 'trash-2');
        let armed = false;
        remove.addEventListener('click', () => {
            if (!armed) {
                armed = true;
                remove.addClass('is-armed');
                new Notice(t('epNoteDeleteConfirm'), 1800);
                window.setTimeout(() => { armed = false; remove.removeClass('is-armed'); }, 2500);
                return;
            }
            notes.splice(index, 1);
            save();
            render();
        });

        const area = card.createEl('textarea', {
            cls: 'lorebase-ep-note-body',
            attr: { rows: '2', placeholder: t('epNoteBody') },
        });
        area.value = note.body;
        area.addEventListener('input', () => { note.body = area.value; autosize(area); save(); });
        window.requestAnimationFrame(() => autosize(area));
        return card;
    };

    addButton.addEventListener('click', () => {
        notes.push({ major: '', minor: '', label: '', body: '', date: todayIso(), spoiler: false });
        save();
        setCollapsed(false);
        userToggled = true;
        render();
        const cards = list.querySelectorAll<HTMLElement>('.lorebase-ep-note');
        const last = cards[cards.length - 1];
        (last?.querySelector<HTMLElement>('.lorebase-ep-code-input, .lorebase-ep-title'))?.focus();
    });

    render();
    setCollapsed(notes.length === 0);

    return {
        load: (value: string) => {
            if (value === lastSerialized) return;
            notes = parseEpisodeNotes(value, kind);
            lastSerialized = serializeEpisodeNotes(notes, kind);
            render();
            if (!userToggled && notes.length > 0) setCollapsed(false);
        },
    };
}
