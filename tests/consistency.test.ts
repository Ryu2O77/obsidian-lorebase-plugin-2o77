import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../src/constants';
import { GameService } from '../src/services/GameService';
import { ReadingService } from '../src/services/ReadingService';
import { searchGoogleBooks } from '../src/services/integrations/providers/googlebooks';
import { matchesLocalSearch } from '../src/services/media/libraryViewState';
import { LayoutCalculator } from '../src/views/library/LayoutCalculator';
import { getAvailableColumns, getCellValue } from '../src/views/library/tableColumns';
import { buildTableLabels } from '../src/views/library/TableView';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';

describe('half-star ratings in every category', () => {
    it('reads a half-star rating on a game note', () => {
        const file = createMockFile('Games/Hades.md', 'Hades');
        const app = createMockApp({ [file.path]: { frontmatter: { type: 'game', userRating: 4.5, status: 'played' } } });
        const parsed = new GameService(app, createMetadataService(app)).parseGameFromCache(file);
        expect(parsed?.userRating).toBe(4.5);
    });

    it('still reads whole-star ratings stored as text', () => {
        const file = createMockFile('Games/Doom.md', 'Doom');
        const app = createMockApp({ [file.path]: { frontmatter: { type: 'game', userRating: '3' } } });
        const parsed = new GameService(app, createMetadataService(app)).parseGameFromCache(file);
        expect(parsed?.userRating).toBe(3);
    });
});

describe('original title', () => {
    it('is found by the local search', () => {
        const item = { nameLower: 'spirited away', originalTitle: '千と千尋の神隠し' } as never;
        expect(matchesLocalSearch(item, '千と千尋')).toBe(true);
        expect(matchesLocalSearch(item, 'totoro')).toBe(false);
    });

    it('is read from book and manga notes', () => {
        const file = createMockFile('Manga/Berserk.md', 'Berserk');
        const app = createMockApp({ [file.path]: { frontmatter: { type: 'manga', original_title: 'ベルセルク' } } });
        const parsed = new ReadingService(app, 'manga', 'Manga', createMetadataService(app)).parseFromCache(file);
        expect(parsed?.originalTitle).toBe('ベルセルク');
    });
});

describe('Google Books language', () => {
    const run = async (language?: string): Promise<URL> => {
        let seen = '';
        await searchGoogleBooks(async (url: string) => { seen = url; return { items: [] }; }, 'dune', 'key', { language });
        return new URL(seen);
    };

    it('restricts the search to the chosen language (two-letter code)', async () => {
        expect((await run('es-ES')).searchParams.get('langRestrict')).toBe('es');
    });

    it('searches every language when none is chosen', async () => {
        expect((await run('')).searchParams.get('langRestrict')).toBeNull();
    });
});

describe('table columns', () => {
    it('offers the Artists column only when there is manga', () => {
        const labels = buildTableLabels();
        const hasArtists = (items: unknown[]): boolean => getAvailableColumns(items as never[], labels).some((column) => column.key === 'b:artists');
        expect(hasArtists([{ type: 'book', rawFields: {} }])).toBe(false);
        expect(hasArtists([{ type: 'manga', rawFields: {} }])).toBe(true);
    });

    it('shows manga artists in their own column', () => {
        const labels = buildTableLabels();
        const column = getAvailableColumns([{ type: 'manga', rawFields: {} }] as never[], labels).find((entry) => entry.key === 'b:artists');
        expect(getCellValue({ type: 'manga', authors: ['A'], artists: ['B'] } as never, column as never)).toEqual(['B']);
    });
});

describe('Title below is independent from the progress footer', () => {
    const grid = { clientWidth: 1000 } as HTMLElement;
    const height = (patch: Record<string, unknown>): number => {
        const calculator = new LayoutCalculator(() => 1000);
        const layout = calculator.getEffectiveLayout({ ...DEFAULT_SETTINGS.anime, ...patch } as never, 'grid');
        return calculator.calculateActualCardHeight(layout, 5, grid);
    };

    it('adds footer height for each option', () => {
        const plain = height({ cardStyle: 'hover', titleBelow: false });
        expect(height({ cardStyle: 'hover', titleBelow: true })).toBeGreaterThan(plain);
        expect(height({ cardStyle: 'progress', titleBelow: false })).toBeGreaterThan(plain);
    });

    it('title + progress is at least as tall as either alone', () => {
        const both = height({ cardStyle: 'progress', titleBelow: true });
        expect(both).toBeGreaterThanOrEqual(height({ cardStyle: 'progress', titleBelow: false }));
        expect(both).toBeGreaterThanOrEqual(height({ cardStyle: 'hover', titleBelow: true }));
    });
});
