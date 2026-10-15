import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { ReadingService } from '../src/services/ReadingService';
import { VideoService } from '../src/services/VideoService';
import {
    addNames, areCompanionsEqual, companionFrontmatter, parseCompanionStatus, parseHalfRating,
    parseNameList, personSlug, readCompanions, removeNames,
} from '../src/services/media/people';
import { groupMediaItems, matchesFilterRule } from '../src/services/media/libraryViewState';
import { buildMassUpdates, hasMassChanges } from '../src/views/library/massEdit';
import type { BookItem, MovieItem } from '../src/types';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';

function writableApp(file: TFile, frontmatter: Record<string, unknown>): App {
    return {
        metadataCache: { getFileCache: (target: TFile) => (target.path === file.path ? { frontmatter } : null) },
        vault: {
            getAbstractFileByPath: (path: string) => (path === file.path ? file : null),
            getFiles: () => [],
            getResourcePath: () => '',
        },
        fileManager: {
            async processFrontMatter(_file: TFile, handler: (value: Record<string, unknown>) => void): Promise<void> {
                handler(frontmatter);
            },
        },
    } as unknown as App;
}

describe('people helpers', () => {
    it('parses and de-duplicates names case-insensitively, keeping casing', () => {
        expect(parseNameList('Isita, isita ; Ale\nAle')).toEqual(['Isita', 'Ale']);
        expect(addNames(['Isita'], ['ale', 'ISITA'])).toEqual(['Isita', 'ale']);
        expect(removeNames(['Isita', 'Ale'], ['isita'])).toEqual(['Ale']);
    });

    it('builds frontmatter keys from names', () => {
        expect(personSlug('Isita')).toBe('isita');
        expect(personSlug('Ana María')).toBe('ana_maria');
    });

    it('snaps ratings to 0.5 steps and understands Notion-style statuses', () => {
        expect(parseHalfRating('4.5')).toBe(4.5);
        expect(parseHalfRating(4.4)).toBe(4.5);
        expect(parseHalfRating(9)).toBe(5);
        expect(parseHalfRating(0)).toBeNull();
        expect(parseCompanionStatus('Done')).toBe('completed');
        expect(parseCompanionStatus('No Plan')).toBeNull();
    });

    it('reads, writes and compares companions', () => {
        const fm = { isita_status: 'done', isita_rating: 3.5 };
        expect(readCompanions(fm, ['Isita', 'Ale'])).toEqual([
            { name: 'Isita', status: 'completed', rating: 3.5 },
            { name: 'Ale', status: null, rating: null },
        ]);
        expect(companionFrontmatter([{ name: 'Isita', status: null, rating: 2 }])).toEqual({ isita_status: null, isita_rating: 2 });
        expect(areCompanionsEqual([{ name: 'A', status: null, rating: 1 }], [{ name: 'A', status: null, rating: 1 }])).toBe(true);
        expect(areCompanionsEqual([{ name: 'A', status: null, rating: 1 }], [{ name: 'A', status: 'planned', rating: 1 }])).toBe(false);
    });
});

describe('watched with / franchise parsing and writing', () => {
    it('only exposes a companion when they are listed in watched_with', () => {
        const withHer = createMockFile('Movies/Dune 2.md', 'Dune 2');
        const alone = createMockFile('Movies/Solo.md', 'Solo');
        const app = createMockApp({
            [withHer.path]: { frontmatter: { type: 'movie', title: 'Dune 2', watched_with: ['Isita'], isita_status: 'completed', isita_rating: 4.5, franchise: ['Dune'] } },
            // her data exists but she is not in "watched with": it must stay hidden
            [alone.path]: { frontmatter: { type: 'movie', title: 'Solo', isita_status: 'completed', isita_rating: 5 } },
        });
        const service = new VideoService(app, 'movie', 'Movies', createMetadataService(app));
        const a = service.parseFromCache(withHer) as MovieItem;
        const b = service.parseFromCache(alone) as MovieItem;
        expect(a.companions).toEqual([{ name: 'Isita', status: 'completed', rating: 4.5 }]);
        expect(a.franchise).toEqual(['Dune']);
        expect(b.watchedWith).toEqual([]);
        expect(b.companions).toEqual([]);
    });

    it('writes and clears the new fields for movies', async () => {
        const file = createMockFile('Movies/X.md', 'X');
        const frontmatter: Record<string, unknown> = { type: 'movie', title: 'X' };
        const service = new VideoService(writableApp(file, frontmatter), 'movie', 'Movies', createMetadataService(writableApp(file, frontmatter)));
        const item = service.parseFromCache(file) as MovieItem;
        await service.updateItem(item, {
            watchedWith: ['Isita', 'Ale'],
            franchise: ['Dune'],
            companions: [{ name: 'Isita', status: 'completed', rating: 4.5 }, { name: 'Ale', status: null, rating: null }],
        });
        expect(frontmatter).toMatchObject({ watched_with: ['Isita', 'Ale'], franchise: ['Dune'], isita_status: 'completed', isita_rating: 4.5 });
        expect(frontmatter).not.toHaveProperty('ale_status');
        await service.updateItem(item, { watchedWith: [], franchise: [] });
        expect(frontmatter).not.toHaveProperty('watched_with');
        expect(frontmatter).not.toHaveProperty('franchise');
    });

    it('supports franchise and watched_with for books', async () => {
        const file = createMockFile('Books/Dune.md', 'Dune');
        const frontmatter: Record<string, unknown> = { type: 'book', title: 'Dune' };
        const app = writableApp(file, frontmatter);
        const service = new ReadingService(app, 'book', 'Books', createMetadataService(app));
        const item = service.parseFromCache(file) as BookItem;
        await service.updateItem(item, { franchise: ['Cosmere'], watchedWith: ['Isita'], companions: [{ name: 'Isita', status: 'planned', rating: null }] });
        expect(frontmatter).toMatchObject({ franchise: ['Cosmere'], watched_with: ['Isita'], isita_status: 'planned' });
    });
});

const movie = (over: Record<string, unknown> = {}): MovieItem => ({
    type: 'movie', filePath: 'Movies/x.md', displayName: 'X', tags: [], genres: [], status: 'planned',
    watchedWith: [], companions: [], franchise: [], ...over,
}) as unknown as MovieItem;

describe('mass edit', () => {
    it('detects whether anything would change', () => {
        expect(hasMassChanges({})).toBe(false);
        expect(hasMassChanges({ favorite: false })).toBe(true);
    });

    it('builds per-item updates', () => {
        const done = buildMassUpdates(movie(), { status: 'completed', finishToday: true });
        expect(done.status).toBe('completed');
        expect(String(done.finished)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(buildMassUpdates(movie({ finished: '2026-01-02' }), { status: 'completed', finishToday: true })).not.toHaveProperty('finished');
        expect(buildMassUpdates(movie({ tags: ['a', 'b'] }), { tagsAdd: ['#C', 'a'], tagsRemove: ['b'] }).tags).toEqual(['a', 'c']);
        expect(buildMassUpdates(movie(), { rating: null }).userRating).toBeNull();
        const person = buildMassUpdates(
            movie({ watchedWith: ['Ale'], companions: [{ name: 'Ale', status: 'completed', rating: 3 }] }),
            { person: { name: 'Isita', status: 'completed', rating: 4.5 } },
        );
        expect(person.watchedWith).toEqual(['Ale', 'Isita']);
        expect(person.companions).toEqual([
            { name: 'Ale', status: 'completed', rating: 3 },
            { name: 'Isita', status: 'completed', rating: 4.5 },
        ]);
    });

    it('ignores franchise for games but still allows "status for" (available on every type)', () => {
        const game = buildMassUpdates({ type: 'game', tags: [] } as never, { watchedWithAdd: ['X'], franchiseAdd: ['Y'], favorite: true });
        expect(game.favorite).toBe(true);
        expect(game.franchise).toBeUndefined();
        expect(game.watchedWith).toEqual(['X']);
    });

    it('can add/remove platforms for any media type', () => {
        const updated = buildMassUpdates({ type: 'movie', tags: [], platforms: ['Stremio'] } as never, { platformsAdd: ['Nuvio'], platformsRemove: ['stremio'] });
        expect(updated.platforms).toEqual(['Nuvio']);
    });
});

describe('franchise filtering and grouping', () => {
    const rule = (field: string, value: string[]) => ({ id: 'r', field, fieldType: 'list', operator: 'containsAny', value }) as never;

    it('filters by franchise and watched with', () => {
        const dune = movie({ franchise: ['Dune'], watchedWith: ['Isita'] });
        const panda = movie({ franchise: ['Dreamworks', 'Kung Fu Panda'] });
        expect(matchesFilterRule(panda, rule('franchise', ['kung fu panda']))).toBe(true);
        expect(matchesFilterRule(dune, rule('franchise', ['Kung Fu Panda']))).toBe(false);
        expect(matchesFilterRule(dune, rule('watchedWith', ['Isita']))).toBe(true);
        expect(matchesFilterRule(panda, rule('watchedWith', ['Isita']))).toBe(false);
    });

    it('groups by first franchise and puts items without one last', () => {
        const items = [
            movie({ displayName: 'Dune', filePath: 'a', franchise: ['Dune'] }),
            movie({ displayName: 'KFP', filePath: 'b', franchise: ['Dreamworks', 'Kung Fu Panda'] }),
            movie({ displayName: 'Solo', filePath: 'c' }),
        ];
        const groups = groupMediaItems(items, 'franchise', 'asc', 'en');
        expect(groups.map((group) => group.label)).toEqual(['Dreamworks', 'Dune', 'No franchise']);
        expect(groups[2].missing).toBe(true);
    });
});
