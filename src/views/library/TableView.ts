import { Menu, setIcon } from 'obsidian';
import { t } from '../../localization';
import type { CompanionStatus, MediaItem, TableViewConfig } from '../../types';
import { COMPANION_STATUSES } from '../../services/media/people';
import { OptionPicker } from './OptionPicker';
import type { OptionColor } from './tagColors';
import {
    CellValue, MIN_COLUMN_WIDTH, TableColumnDef, TableLabels, columnWidth, findCompanion, getCellValue,
} from './tableColumns';

export interface TableGroup {
    label: string;
    items: MediaItem[];
    progress?: { text: string; title: string } | null;
}

export interface TableViewOptions {
    container: HTMLElement;
    items: MediaItem[];
    groups: TableGroup[] | null;
    columns: TableColumnDef[];
    config: TableViewConfig | undefined;
    statusOptions: Array<{ status: string; label: string }>;
    companionLabels: Record<CompanionStatus, string>;
    halfRatings: boolean;
    isSelected: (item: MediaItem) => boolean;
    onOpen: (item: MediaItem) => void;
    onContextMenu: (item: MediaItem, x: number, y: number) => void;
    onUpdate: (item: MediaItem, updates: Record<string, unknown>) => void;
    onPerson: (item: MediaItem, name: string, change: { status?: CompanionStatus | null; rating?: number | null }) => void;
    onConfigChange: (config: TableViewConfig) => void;
    onOpenColumns: () => void;
    /** Whether chips of this column can be edited in place for this item */
    isListEditable: (item: MediaItem, column: TableColumnDef) => boolean;
    /** Every value already used in this column (for the picker) */
    getListOptions: (column: TableColumnDef) => string[];
    getOptionColor: (column: TableColumnDef, value: string) => OptionColor;
    onOptionColor: (column: TableColumnDef, value: string, color: OptionColor) => void;
    onListChange: (item: MediaItem, column: TableColumnDef, values: string[]) => void;
    /** Whether a date/number/text column can be edited in place for this item */
    isTextEditable: (item: MediaItem, column: TableColumnDef) => boolean;
    onTextChange: (item: MediaItem, column: TableColumnDef, value: string | number | null) => void;
}

export function buildTableLabels(): TableLabels {
    return {
        name: t('tableColName'), status: t('tableColStatus'), rating: t('tableColRating'), year: t('tableColYear'),
        started: t('tableColStarted'), finished: t('tableColFinished'), tags: t('tableColTags'), genres: t('tableColGenres'),
        favorite: t('tableColFavorite'), community: t('tableColCommunity'), progress: t('tableColProgress'),
        franchise: t('tableColFranchise'), people: t('tableColPeople'), platforms: t('tableColPlatforms'),
        creators: t('tableColCreators'), artists: t('tableColArtists'), personStatus: t('tableColStatus'), personRating: t('tableColScore'),
    };
}

export function formatStars(value: number | null | undefined): string {
    if (!value || value <= 0) return '';
    const whole = Math.floor(value);
    return '\u2605'.repeat(whole) + (value - whole >= 0.5 ? '\u00BD' : '');
}

/** Table layout of a media library: sticky header, resizable columns, in-cell editing of status and scores. */
export class TableView {
    private readonly config: TableViewConfig;
    private tableEl!: HTMLTableElement;
    private readonly colEls = new Map<string, HTMLTableColElement>();

    constructor(private readonly options: TableViewOptions) {
        const saved = options.config;
        this.config = {
            columns: options.columns.map((column) => column.key),
            widths: { ...(saved?.widths ?? {}) },
            wrap: Boolean(saved?.wrap),
        };
        this.render();
    }

    private render(): void {
        const { container, columns } = this.options;
        const wrap = container.createDiv({ cls: 'lorebase-table-wrap' });
        const bar = wrap.createDiv({ cls: 'lorebase-table-bar' });
        const columnsButton = bar.createEl('button', { cls: 'lorebase-btn lorebase-table-bar-btn', attr: { type: 'button' } });
        setIcon(columnsButton.createSpan({ cls: 'lorebase-table-bar-icon' }), 'columns-3');
        columnsButton.createSpan({ text: t('tableColumns') });
        columnsButton.addEventListener('click', () => this.options.onOpenColumns());

        const wrapLabel = bar.createEl('label', { cls: 'lorebase-table-bar-toggle' });
        const wrapBox = wrapLabel.createEl('input', { attr: { type: 'checkbox' } });
        wrapBox.checked = this.config.wrap;
        wrapLabel.createSpan({ text: t('tableWrap') });
        wrapBox.addEventListener('change', () => {
            this.config.wrap = wrapBox.checked;
            scroller.toggleClass('is-wrap', this.config.wrap);
            this.options.onConfigChange(this.snapshot());
        });
        bar.createSpan({ cls: 'lorebase-table-bar-count', text: String(this.options.items.length) });

        const scroller = wrap.createDiv({ cls: 'lorebase-table-scroll' });
        scroller.toggleClass('is-wrap', this.config.wrap);
        this.tableEl = scroller.createEl('table', { cls: 'lorebase-table' });

        const colgroup = this.tableEl.createEl('colgroup');
        for (const column of columns) {
            const col = colgroup.createEl('col');
            col.style.width = `${columnWidth(this.config, column)}px`;
            this.colEls.set(column.key, col);
        }
        this.updateTableWidth();

        const headRow = this.tableEl.createEl('thead').createEl('tr');
        for (const column of columns) {
            const th = headRow.createEl('th', { cls: 'lorebase-table-th' });
            th.createSpan({ cls: 'lorebase-table-th-label', text: column.label, attr: { title: column.label } });
            const handle = th.createDiv({ cls: 'lorebase-table-resize', attr: { 'aria-hidden': 'true' } });
            this.bindResize(handle, column);
        }

        const body = this.tableEl.createEl('tbody');
        if (this.options.groups) {
            for (const group of this.options.groups) {
                const row = body.createEl('tr', { cls: 'lorebase-table-group' });
                const cell = row.createEl('td', { attr: { colspan: String(columns.length) } });
                cell.createSpan({ cls: 'lorebase-table-group-label', text: group.label });
                if (group.progress) cell.createSpan({ cls: 'lorebase-table-group-meta', text: group.progress.text, attr: { title: group.progress.title } });
                cell.createSpan({ cls: 'lorebase-table-group-meta', text: String(group.items.length) });
                for (const item of group.items) this.renderRow(body, item);
            }
        } else {
            for (const item of this.options.items) this.renderRow(body, item);
        }
    }

    private snapshot(): TableViewConfig {
        return { columns: [...this.config.columns], widths: { ...this.config.widths }, wrap: this.config.wrap };
    }

    private updateTableWidth(): void {
        const total = this.options.columns.reduce((sum, column) => sum + columnWidth(this.config, column), 0);
        this.tableEl.style.width = `${total}px`;
    }

    private bindResize(handle: HTMLElement, column: TableColumnDef): void {
        handle.addEventListener('click', (event) => event.stopPropagation());
        handle.addEventListener('pointerdown', (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const startX = event.clientX;
            const startWidth = columnWidth(this.config, column);
            handle.addClass('is-active');
            const move = (moveEvent: PointerEvent): void => {
                const next = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX));
                this.config.widths[column.key] = next;
                const col = this.colEls.get(column.key);
                if (col) col.style.width = `${next}px`;
                this.updateTableWidth();
            };
            const stop = (): void => {
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', stop);
                document.removeEventListener('pointercancel', stop);
                handle.removeClass('is-active');
                this.options.onConfigChange(this.snapshot());
            };
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', stop);
            document.addEventListener('pointercancel', stop);
        });
    }

    private renderRow(body: HTMLElement, item: MediaItem): void {
        const row = body.createEl('tr', { cls: 'lorebase-table-row', attr: { 'data-lorebase-file-path': item.filePath } });
        if (this.options.isSelected(item)) row.addClass('is-selected');
        row.addEventListener('click', () => this.options.onOpen(item));
        row.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            this.options.onContextMenu(item, event.clientX, event.clientY);
        });
        for (const column of this.options.columns) {
            const cell = row.createEl('td', { cls: `lorebase-table-cell is-${column.kind}` });
            this.renderCell(cell, item, column);
        }
    }

    private renderCell(cell: HTMLElement, item: MediaItem, column: TableColumnDef): void {
        const value = getCellValue(item, column);
        switch (column.kind) {
            case 'name': {
                const wrap = cell.createDiv({ cls: 'lorebase-table-name' });
                if (item.imageUrl) {
                    const img = wrap.createEl('img', { cls: 'lorebase-table-thumb', attr: { src: item.imageUrl, alt: '', loading: 'lazy' } });
                    img.addEventListener('error', () => img.remove());
                }
                wrap.createSpan({ cls: 'lorebase-table-name-text', text: item.displayName });
                return;
            }
            case 'status': {
                const status = String(value ?? '');
                const label = this.options.statusOptions.find((option) => option.status === status)?.label ?? status;
                this.renderStatusPill(cell, status, label, (event) => this.pickStatus(event, item));
                return;
            }
            case 'personStatus': {
                const status = typeof value === 'string' ? value : '';
                this.renderStatusPill(cell, status, status ? this.options.companionLabels[status as CompanionStatus] ?? status : '', (event) => this.pickPersonStatus(event, item, column.person ?? ''));
                return;
            }
            case 'rating':
                this.renderScore(cell, typeof value === 'number' ? value : null, (event) => this.pickRating(event, item));
                return;
            case 'personRating':
                this.renderScore(cell, typeof value === 'number' ? value : null, (event) => this.pickPersonRating(event, item, column.person ?? ''), true);
                return;
            case 'boolean': {
                const checked = value === true;
                const box = cell.createSpan({ cls: `lorebase-table-check${checked ? ' is-checked' : ''}`, text: checked ? '\u2713' : '' });
                if (column.key === 'b:favorite') {
                    box.addClass('is-clickable');
                    box.addEventListener('click', (event) => {
                        event.stopPropagation();
                        this.options.onUpdate(item, { favorite: !item.favorite });
                    });
                }
                return;
            }
            case 'list':
                this.renderChips(cell, value, column, item);
                return;
            default:
                this.renderText(cell, value, column, item);
        }
    }

    private renderText(cell: HTMLElement, value: CellValue, column: TableColumnDef, item: MediaItem): void {
        if (Array.isArray(value)) { this.renderChips(cell, value, column, item); return; }
        if (typeof value === 'boolean') { cell.setText(value ? '\u2713' : ''); return; }
        const editable = (column.kind === 'date' || column.kind === 'number' || column.kind === 'text')
            && this.options.isTextEditable(item, column);
        if (value !== null && value !== undefined && value !== '') {
            cell.createSpan({ cls: 'lorebase-table-text', text: String(value) });
        }
        if (!editable) return;
        cell.addClass('is-editable');
        cell.addEventListener('click', (event) => {
            event.stopPropagation();
            this.editTextCell(cell, item, column, value);
        });
    }

    /** Swaps a text/number/date cell for an input, committing on Enter/blur and cancelling on Escape. */
    private editTextCell(cell: HTMLElement, item: MediaItem, column: TableColumnDef, value: CellValue): void {
        if (cell.querySelector('input')) return;
        cell.empty();
        const inputType = column.kind === 'date' ? 'date' : column.kind === 'number' ? 'number' : 'text';
        const input = cell.createEl('input', {
            cls: 'lorebase-table-edit-input',
            attr: { type: inputType, value: value === null || value === undefined ? '' : String(value) },
        });
        let settled = false;
        const commit = (): void => {
            if (settled) return;
            settled = true;
            const raw = input.value.trim();
            const next: string | number | null = raw === '' ? null : (column.kind === 'number' ? Number(raw) : raw);
            this.options.onTextChange(item, column, next);
        };
        const cancel = (): void => {
            if (settled) return;
            settled = true;
            this.renderCell(cell, item, column);
        };
        input.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
            else if (event.key === 'Escape') { event.preventDefault(); cancel(); }
        });
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('blur', commit);
        window.setTimeout(() => input.focus(), 0);
    }

    private renderChips(cell: HTMLElement, value: CellValue, column: TableColumnDef, item: MediaItem): void {
        const values = Array.isArray(value) ? value.map(String) : (value === null || value === '' ? [] : [String(value)]);
        const wrap = cell.createDiv({ cls: 'lorebase-table-chips' });
        for (const entry of values) {
            wrap.createSpan({ cls: `lorebase-table-chip is-c-${this.options.getOptionColor(column, entry)}`, text: entry });
        }
        if (!this.options.isListEditable(item, column)) return;
        cell.addClass('is-editable');
        cell.addEventListener('click', (event) => {
            event.stopPropagation();
            new OptionPicker({
                anchor: cell,
                selected: values,
                options: this.options.getListOptions(column),
                getColor: (entry) => this.options.getOptionColor(column, entry),
                onColor: (entry, color) => this.options.onOptionColor(column, entry, color),
                onChange: (next) => this.options.onListChange(item, column, next),
                placeholder: t('tableOptionHint'),
                createLabel: t('tableCreateOption'),
                creatable: true,
            }).open();
        });
    }

    private renderStatusPill(cell: HTMLElement, status: string, label: string, onClick: (event: MouseEvent) => void): void {
        const pill = cell.createSpan({
            cls: `lorebase-table-pill lorebase-table-clickable${status ? ` is-status-${status}` : ' is-empty'}`,
            text: label || '\u2014',
        });
        pill.addEventListener('click', (event) => { event.stopPropagation(); onClick(event); });
    }

    private renderScore(cell: HTMLElement, value: number | null, onClick: (event: MouseEvent) => void, person = false): void {
        const span = cell.createSpan({ cls: `lorebase-table-score lorebase-table-clickable${person ? ' is-person' : ''}`, text: formatStars(value) || '\u2014' });
        if (value === null) span.addClass('is-empty');
        span.addEventListener('click', (event) => { event.stopPropagation(); onClick(event); });
    }

    private pickStatus(event: MouseEvent, item: MediaItem): void {
        const menu = new Menu();
        for (const option of this.options.statusOptions) {
            menu.addItem((menuItem) => menuItem.setTitle(option.label).setChecked(item.status === option.status)
                .onClick(() => this.options.onUpdate(item, { status: option.status })));
        }
        menu.showAtMouseEvent(event);
    }

    private ratingSteps(): number[] {
        const steps: number[] = [];
        if (this.options.halfRatings) for (let step = 10; step >= 1; step--) steps.push(step / 2);
        else for (let value = 5; value >= 1; value--) steps.push(value);
        return steps;
    }

    private pickRating(event: MouseEvent, item: MediaItem): void {
        const menu = new Menu();
        for (const value of this.ratingSteps()) {
            menu.addItem((menuItem) => menuItem.setTitle(`${value} \u2605`).setChecked(item.userRating === value)
                .onClick(() => this.options.onUpdate(item, { userRating: value })));
        }
        menu.addItem((menuItem) => menuItem.setTitle(t('contextClear')).onClick(() => this.options.onUpdate(item, { userRating: null })));
        menu.showAtMouseEvent(event);
    }

    private pickPersonStatus(event: MouseEvent, item: MediaItem, name: string): void {
        if (!name) return;
        const current = findCompanion(item, name)?.status ?? null;
        const menu = new Menu();
        for (const status of COMPANION_STATUSES) {
            menu.addItem((menuItem) => menuItem.setTitle(this.options.companionLabels[status]).setChecked(current === status)
                .onClick(() => this.options.onPerson(item, name, { status })));
        }
        menu.addItem((menuItem) => menuItem.setTitle(t('contextClear')).onClick(() => this.options.onPerson(item, name, { status: null })));
        menu.showAtMouseEvent(event);
    }

    private pickPersonRating(event: MouseEvent, item: MediaItem, name: string): void {
        if (!name) return;
        const current = findCompanion(item, name)?.rating ?? null;
        const menu = new Menu();
        for (let step = 10; step >= 1; step--) {
            const value = step / 2;
            menu.addItem((menuItem) => menuItem.setTitle(`${value} \u2605`).setChecked(current === value)
                .onClick(() => this.options.onPerson(item, name, { rating: value })));
        }
        menu.addItem((menuItem) => menuItem.setTitle(t('contextClear')).onClick(() => this.options.onPerson(item, name, { rating: null })));
        menu.showAtMouseEvent(event);
    }
}
