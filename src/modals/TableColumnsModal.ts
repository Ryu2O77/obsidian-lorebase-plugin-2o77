import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';
import type { TableViewConfig } from '../types';
import { DEFAULT_TABLE_COLUMNS, TableColumnDef } from '../views/library/tableColumns';

/** Picks which columns the table shows and in which order. Every property of the notes can be added. */
export class TableColumnsModal extends Modal {
    private keys: string[];

    constructor(
        app: App,
        private readonly available: TableColumnDef[],
        private readonly config: TableViewConfig | undefined,
        shown: string[],
        private readonly onApply: (columns: string[]) => void
    ) {
        super(app);
        this.keys = [...shown];
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-table-columns-modal');
        this.render();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private commit(): void {
        this.onApply([...this.keys]);
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('tableColumns') });

        const byKey = new Map(this.available.map((column) => [column.key, column]));
        const shownList = contentEl.createDiv({ cls: 'lorebase-table-columns-shown' });
        contentEl.querySelector('h2')?.after(shownList);
        shownList.createDiv({ cls: 'lorebase-table-columns-title', text: t('tableShown') });
        this.keys.forEach((key, index) => {
            const column = byKey.get(key);
            const row = shownList.createDiv({ cls: 'lorebase-table-columns-row' });
            row.createSpan({ cls: 'lorebase-table-columns-name', text: column?.label ?? key });
            const actions = row.createDiv({ cls: 'lorebase-table-columns-actions' });
            const button = (icon: string, label: string, disabled: boolean, onClick: () => void): void => {
                const el = actions.createEl('button', { cls: 'lorebase-editmode-icon-btn', attr: { type: 'button', title: label, 'aria-label': label } });
                setIcon(el, icon);
                if (disabled) el.setAttr('disabled', 'true');
                el.addEventListener('click', onClick);
            };
            button('arrow-up', t('tableMoveUp'), index === 0, () => this.move(index, -1));
            button('arrow-down', t('tableMoveDown'), index === this.keys.length - 1, () => this.move(index, 1));
            button('x', t('posterRemove'), this.keys.length <= 1, () => {
                this.keys.splice(index, 1);
                this.commit();
                this.render();
            });
        });

        contentEl.createDiv({ cls: 'lorebase-table-columns-title', text: t('tableAdd') });
        const search = contentEl.createEl('input', {
            cls: 'lorebase-editmode-input',
            attr: { type: 'text', placeholder: t('tableSearchFields') },
        });
        const list = contentEl.createDiv({ cls: 'lorebase-table-columns-available' });
        const draw = (): void => {
            list.empty();
            const term = search.value.trim().toLocaleLowerCase();
            const pool = this.available.filter((column) => !this.keys.includes(column.key)
                && (!term || column.label.toLocaleLowerCase().includes(term) || column.key.toLocaleLowerCase().includes(term)));
            for (const [group, title] of [['builtin', t('tableGroupBuiltin')], ['people', t('tableGroupPeople')], ['properties', t('tableGroupProperties')]] as const) {
                const entries = pool.filter((column) => column.group === group);
                if (!entries.length) continue;
                list.createDiv({ cls: 'lorebase-table-columns-group', text: title });
                for (const column of entries) {
                    const row = list.createDiv({ cls: 'lorebase-table-columns-row is-addable' });
                    row.createSpan({ cls: 'lorebase-table-columns-name', text: column.label });
                    setIcon(row.createSpan({ cls: 'lorebase-table-columns-plus' }), 'plus');
                    row.addEventListener('click', () => {
                        this.keys.push(column.key);
                        this.commit();
                        this.render();
                    });
                }
            }
        };
        search.addEventListener('input', draw);
        draw();

        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        actions.createEl('button', { text: t('tableReset'), cls: 'lorebase-btn' }).addEventListener('click', () => {
            this.keys = DEFAULT_TABLE_COLUMNS.filter((key) => byKey.has(key));
            this.commit();
            this.render();
        });
        actions.createEl('button', { text: t('commonOk'), cls: 'lorebase-btn lorebase-btn-primary' }).addEventListener('click', () => this.close());
    }

    private move(index: number, delta: number): void {
        const target = index + delta;
        if (target < 0 || target >= this.keys.length) return;
        [this.keys[index], this.keys[target]] = [this.keys[target], this.keys[index]];
        this.commit();
        this.render();
    }
}
