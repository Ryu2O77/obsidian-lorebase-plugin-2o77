import { setIcon } from 'obsidian';
import { OPTION_COLORS, OptionColor } from './tagColors';

export interface OptionPickerOptions {
    anchor: HTMLElement;
    selected: string[];
    /** Every value already used in this field */
    options: string[];
    getColor: (value: string) => OptionColor;
    onColor: (value: string, color: OptionColor) => void;
    onChange: (values: string[]) => void;
    placeholder: string;
    createLabel: string;
    creatable: boolean;
}

const sameValue = (a: string, b: string): boolean => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** Notion-style multi-select popover: pick existing options, create new ones, recolor them. */
export class OptionPicker {
    private panel!: HTMLElement;
    private chipsEl!: HTMLElement;
    private listEl!: HTMLElement;
    private input!: HTMLInputElement;
    private selected: string[];
    private known: string[];
    private colorRowFor: string | null = null;
    private readonly onOutside: (event: MouseEvent) => void;
    private readonly onKey: (event: KeyboardEvent) => void;

    constructor(private readonly options: OptionPickerOptions) {
        this.selected = [...options.selected];
        this.known = Array.from(new Set([...options.options, ...options.selected]));
        this.onOutside = (event) => {
            if (!this.panel.contains(event.target as Node)) this.close();
        };
        this.onKey = (event) => {
            if (event.key === 'Escape') { event.stopPropagation(); this.close(); }
        };
    }

    open(): void {
        this.panel = document.body.createDiv({ cls: 'lorebase-opt-picker' });
        const header = this.panel.createDiv({ cls: 'lorebase-opt-header' });
        this.chipsEl = header.createDiv({ cls: 'lorebase-opt-selected' });
        this.input = header.createEl('input', {
            cls: 'lorebase-opt-input',
            attr: { type: 'text', placeholder: this.options.placeholder },
        });
        this.panel.createDiv({ cls: 'lorebase-opt-hint', text: this.options.placeholder });
        this.listEl = this.panel.createDiv({ cls: 'lorebase-opt-list' });

        this.input.addEventListener('input', () => this.renderList());
        this.input.addEventListener('keydown', (event) => this.handleKey(event));
        this.panel.addEventListener('click', (event) => event.stopPropagation());
        this.renderChips();
        this.renderList();
        this.position();
        window.setTimeout(() => {
            document.addEventListener('mousedown', this.onOutside, true);
            document.addEventListener('keydown', this.onKey, true);
            this.input.focus();
        }, 0);
    }

    close(): void {
        document.removeEventListener('mousedown', this.onOutside, true);
        document.removeEventListener('keydown', this.onKey, true);
        this.panel?.remove();
    }

    private position(): void {
        const rect = this.options.anchor.getBoundingClientRect();
        const width = Math.max(260, Math.min(340, rect.width));
        this.panel.style.width = `${width}px`;
        const height = this.panel.offsetHeight;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        let top = rect.bottom + 4;
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
        this.panel.style.left = `${left}px`;
        this.panel.style.top = `${top}px`;
    }

    private commit(): void {
        this.options.onChange([...this.selected]);
    }

    private toggle(value: string): void {
        const index = this.selected.findIndex((entry) => sameValue(entry, value));
        if (index >= 0) this.selected.splice(index, 1);
        else this.selected.push(value);
        this.commit();
        this.renderChips();
        this.renderList();
    }

    private create(raw: string): void {
        const value = raw.trim();
        if (!value) return;
        const existing = this.known.find((entry) => sameValue(entry, value));
        if (existing) {
            if (!this.selected.some((entry) => sameValue(entry, existing))) this.toggle(existing);
        } else {
            this.known.push(value);
            this.selected.push(value);
            this.commit();
        }
        this.input.value = '';
        this.renderChips();
        this.renderList();
    }

    private handleKey(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            const term = this.input.value.trim();
            if (!term) { this.close(); return; }
            const exact = this.known.find((entry) => sameValue(entry, term));
            if (exact) {
                if (!this.selected.some((entry) => sameValue(entry, exact))) this.toggle(exact);
                this.input.value = '';
                this.renderList();
            } else if (this.options.creatable) {
                this.create(term);
            }
        } else if (event.key === 'Backspace' && !this.input.value && this.selected.length) {
            this.selected.pop();
            this.commit();
            this.renderChips();
            this.renderList();
        }
    }

    private chip(parent: HTMLElement, value: string): HTMLElement {
        return parent.createSpan({ cls: `lorebase-table-chip is-c-${this.options.getColor(value)}`, text: value });
    }

    private renderChips(): void {
        this.chipsEl.empty();
        for (const value of this.selected) {
            const chip = this.chip(this.chipsEl, value);
            chip.addClass('is-removable');
            const remove = chip.createSpan({ cls: 'lorebase-opt-chip-x', text: '\u00D7' });
            remove.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggle(value);
            });
        }
    }

    private renderList(): void {
        this.listEl.empty();
        const term = this.input.value.trim().toLocaleLowerCase();
        const matches = this.known
            .filter((value) => !term || value.toLocaleLowerCase().includes(term))
            .sort((a, b) => a.localeCompare(b));
        for (const value of matches) {
            const row = this.listEl.createDiv({ cls: 'lorebase-opt-row' });
            const main = row.createDiv({ cls: 'lorebase-opt-row-main' });
            this.chip(main, value);
            if (this.selected.some((entry) => sameValue(entry, value))) {
                setIcon(main.createSpan({ cls: 'lorebase-opt-check' }), 'check');
            }
            main.addEventListener('click', () => this.toggle(value));
            const more = row.createEl('button', { cls: 'lorebase-opt-more', attr: { type: 'button', 'aria-label': 'Color' } });
            setIcon(more, 'more-horizontal');
            more.addEventListener('click', (event) => {
                event.stopPropagation();
                this.colorRowFor = this.colorRowFor === value ? null : value;
                this.renderList();
            });
            if (this.colorRowFor === value) {
                const swatches = this.listEl.createDiv({ cls: 'lorebase-opt-swatches' });
                for (const color of OPTION_COLORS) {
                    const dot = swatches.createEl('button', {
                        cls: `lorebase-opt-swatch is-c-${color}${this.options.getColor(value) === color ? ' is-current' : ''}`,
                        attr: { type: 'button', title: color, 'aria-label': color },
                    });
                    dot.addEventListener('click', (event) => {
                        event.stopPropagation();
                        this.options.onColor(value, color);
                        this.renderChips();
                        this.renderList();
                    });
                }
            }
        }
        if (this.options.creatable && term && !this.known.some((entry) => sameValue(entry, term))) {
            const row = this.listEl.createDiv({ cls: 'lorebase-opt-row lorebase-opt-create' });
            const main = row.createDiv({ cls: 'lorebase-opt-row-main' });
            main.createSpan({ cls: 'lorebase-opt-create-label', text: this.options.createLabel });
            this.chip(main, this.input.value.trim());
            main.addEventListener('click', () => this.create(this.input.value));
        }
    }
}
