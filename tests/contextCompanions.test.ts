import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu } from 'obsidian';
import { showMediaContextMenu, type MediaContextMenuDeps } from '../src/views/library/contextMenu';
import type { MovieItem } from '../src/types';

type Shown = { items: Array<{ title: unknown; checked: boolean; clickHandler: (() => void) | null; submenu: Shown | null }> };
const shown = (): Shown => (Menu as unknown as { shown: Shown[] }).shown.at(-1) as Shown;
const titleOf = (value: unknown): string => String(value);

function setup(item: Partial<MovieItem>) {
    (Menu as unknown as { shown: Shown[] }).shown.length = 0;
    const calls = { video: [] as Array<Record<string, unknown>>, mutated: [] as string[][] };
    const deps = {
        isDestroyed: () => false,
        getStatusOptions: () => [
            { status: 'planned', label: 'Planned' }, { status: 'watching', label: 'Watching' },
            { status: 'completed', label: 'Completed' }, { status: 'dropped', label: 'Dropped' }, { status: 'paused', label: 'Paused' },
        ],
        onApplyFiltersAndSort: () => {}, onEdit: () => {}, onOpen: () => {}, onDelete: () => {},
        onItemMutated: (_i: unknown, fields: string[]) => { calls.mutated.push(fields); },
        cardClickAction: 'open', ratingMode: 'emoji',
        updateAnime: () => {}, updateGame: () => {},
        updateVideo: (_i: unknown, updates: Record<string, unknown>) => { calls.video.push(updates); },
        getKnownPeople: () => ['Ale', 'Isita'],
        promptPerson: async () => 'Carlos',
    } as unknown as MediaContextMenuDeps;
    const movie = {
        type: 'movie', filePath: 'Movies/x.md', displayName: 'X', status: 'planned', tags: [], genres: [],
        watchedWith: [], companions: [], franchise: [], userRating: null, favorite: false, ...item,
    } as unknown as MovieItem;
    showMediaContextMenu(movie, 0, 0, deps);
    return { movie, calls, menu: shown() };
}
const find = (menu: Shown, text: string) => menu.items.find((entry) => titleOf(entry.title) === text || titleOf(entry.title).startsWith(`${text} (`));

describe('context menu: watched with', () => {
    beforeEach(() => { (Menu as unknown as { shown: Shown[] }).shown.length = 0; });

    it('lists known people as toggles and adds one with a single click', () => {
        const { menu, calls, movie } = setup({});
        const watched = find(menu, 'Status for');
        expect(watched).toBeTruthy();
        const names = watched!.submenu!.items.map((entry) => titleOf(entry.title));
        expect(names).toEqual(['Ale', 'Isita', 'New person...']);
        watched!.submenu!.items[1].clickHandler!();
        expect(calls.video[0]).toMatchObject({ watchedWith: ['Isita'], companions: [{ name: 'Isita', status: null, rating: null }] });
        expect(movie.watchedWith).toEqual(['Isita']);
        expect(calls.mutated[0]).toContain('watchedWith');
        // no status/rating entries until somebody is listed
        expect(find(menu, 'Isita \u00B7 status')).toBeUndefined();
    });

    it('unchecks a listed person and removes them', () => {
        const { menu, calls } = setup({ watchedWith: ['Isita'], companions: [{ name: 'Isita', status: null, rating: null }] });
        const isita = find(menu, 'Status for')!.submenu!.items.find((entry) => titleOf(entry.title) === 'Isita')!;
        expect(isita.checked).toBe(true);
        isita.clickHandler!();
        expect(calls.video[0].watchedWith).toEqual([]);
    });

    it('sets their status and half-star rating without opening the editor', () => {
        const base = { watchedWith: ['Isita'], companions: [{ name: 'Isita', status: 'planned', rating: null }] } as Partial<MovieItem>;
        const a = setup(base);
        const status = find(a.menu, 'Isita \u00B7 status')!;
        expect(status.submenu!.items.find((entry) => titleOf(entry.title) === 'Planned')!.checked).toBe(true);
        status.submenu!.items.find((entry) => titleOf(entry.title) === 'Completed')!.clickHandler!();
        expect(a.calls.video[0].companions).toEqual([{ name: 'Isita', status: 'completed', rating: null }]);

        const b = setup(base);
        const rating = find(b.menu, 'Isita \u00B7 rating')!;
        expect(rating.submenu!.items.map((entry) => titleOf(entry.title)).slice(0, 3)).toEqual(['5 \u2605', '4.5 \u2605', '4 \u2605']);
        rating.submenu!.items.find((entry) => titleOf(entry.title) === '4.5 \u2605')!.clickHandler!();
        expect(b.calls.video[0].companions).toEqual([{ name: 'Isita', status: 'planned', rating: 4.5 }]);
    });

    it('offers "new person" through the prompt', async () => {
        const { menu, calls } = setup({});
        find(menu, 'Status for')!.submenu!.items.at(-1)!.clickHandler!();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(calls.video[0].watchedWith).toEqual(['Carlos']);
    });

    it('is offered for games and anime too', () => {
        for (const type of ['game', 'anime', 'manga'] as const) {
            const shown = setup({ type } as never);
            expect(find(shown.menu, 'Status for')).toBeDefined();
        }
    });
});
