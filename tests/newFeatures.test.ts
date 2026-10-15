import { afterEach, describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { VideoService } from '../src/services/VideoService';
import { ReadingService } from '../src/services/ReadingService';
import { AnimeService } from '../src/services/AnimeService';
import { parseUserRating, ratingBucket, resolveExactRating } from '../src/services/media/parsers';
import { completePartsProgress, completeSeriesFrontmatter, sumEpisodes } from '../src/services/media/seriesProgress';
import { configureHiddenFiles, isFileHidden, parseHiddenPatterns } from '../src/services/media/hiddenFiles';
import { getTmdbAnimeDetails, getTmdbDetails, searchTmdb, searchTmdbAnime } from '../src/services/integrations/providers/tmdb';
import type { MovieItem, SeriesItem, BookItem } from '../src/types';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';

function writableApp(file: TFile, frontmatter: Record<string, unknown>): App {
    return {
        metadataCache: { getFileCache: (target: TFile) => (target.path === file.path ? { frontmatter } : null) },
        vault: { getAbstractFileByPath: (path: string) => (path === file.path ? file : null), getFiles: () => [], getResourcePath: () => '' },
        fileManager: { async processFrontMatter(_f: TFile, handler: (value: Record<string, unknown>) => void): Promise<void> { handler(frontmatter); } },
    } as unknown as App;
}

describe('half-star ratings', () => {
    it('parses halves, snaps to 0.5 and rejects out-of-range values', () => {
        expect(parseUserRating(4.5)).toBe(4.5);
        expect(parseUserRating('3.5')).toBe(3.5);
        expect(parseUserRating(4.4)).toBe(4.5);
        expect(parseUserRating(4)).toBe(4);
        expect(parseUserRating(0.2)).toBeNull();
        expect(parseUserRating(6)).toBeNull();
        expect(ratingBucket(4.5)).toBe(5);
        expect(ratingBucket(0.5)).toBe(1);
    });

    it('reads the exact value written by the Notion converter when it agrees with the stored star', () => {
        expect(resolveExactRating(4, 4.5)).toBe(4.5);
        expect(resolveExactRating(1, 0.5)).toBe(0.5);
        expect(resolveExactRating(4, 2)).toBe(4);
        expect(resolveExactRating(null, 4.5)).toBeNull();
    });

    it('movies keep half stars and clear the stale exact value when the rating changes', async () => {
        const file = createMockFile('Movies/Dune.md', 'Dune');
        const frontmatter: Record<string, unknown> = { type: 'movie', title: 'Dune', userRating: 4, rating_exact: 4.5 };
        const app = writableApp(file, frontmatter);
        const service = new VideoService(app, 'movie', 'Movies', createMetadataService(app));
        const item = service.parseFromCache(file) as MovieItem;
        expect(item.userRating).toBe(4.5);
        await service.updateItem(item, { userRating: 3.5 });
        expect(frontmatter.userRating).toBe(3.5);
        expect(frontmatter).not.toHaveProperty('rating_exact');
    });

    it('books store half stars in the rating field', async () => {
        const file = createMockFile('Books/B.md', 'B');
        const frontmatter: Record<string, unknown> = { type: 'book', title: 'B', rating: 5 };
        const app = writableApp(file, frontmatter);
        const service = new ReadingService(app, 'book', 'Books', createMetadataService(app));
        const item = service.parseFromCache(file) as BookItem;
        await service.updateItem(item, { userRating: 4.5 });
        expect(frontmatter.rating).toBe(4.5);
    });
});

describe('series progress', () => {
    const part = (id: string, current: number, total: number | null, status = 'planned') =>
        ({ id, episodeCurrent: current, episodeTotal: total, status });

    it('fills each season with its own total, never one combined number', () => {
        const done = completePartsProgress([part('s1', 0, 50), part('s2', 3, 50), part('s3', 0, 8)]);
        expect(done.map((p) => p.episodeCurrent)).toEqual([50, 50, 8]);
        expect(done.every((p) => p.status === 'completed')).toBe(true);
        expect(sumEpisodes(done)).toEqual({ current: 108, total: 108 });
    });

    it('leaves seasons of unknown length untouched and does not invent a total', () => {
        const done = completePartsProgress([part('s1', 2, null), part('s2', 0, 10)]);
        expect(done[0].episodeCurrent).toBe(2);
        expect(done[1].episodeCurrent).toBe(10);
        expect(sumEpisodes(done).total).toBeNull();
    });

    it('completes raw note frontmatter (used right after adding a series as completed)', () => {
        const fm: Record<string, unknown> = {
            type: 'series',
            series_parts: [
                { id: 'a', season: 1, episode_current: 0, episode_total: 50, status: 'planned' },
                { id: 'b', season: 2, episode_current: '0', episode_total: '50', status: 'planned' },
            ],
        };
        expect(completeSeriesFrontmatter(fm)).toBe(true);
        const parts = fm.series_parts as Array<Record<string, unknown>>;
        expect(parts.map((p) => p.episode_current)).toEqual([50, 50]);
        expect(parts.every((p) => p.status === 'completed')).toBe(true);
        expect(fm.episode_current).toBe(100);
        expect(fm.episode_total).toBe(100);
        expect(completeSeriesFrontmatter(fm)).toBe(false);
    });

    it('marking a series completed through the service fills every season', async () => {
        const file = createMockFile('Series/Show.md', 'Show');
        const frontmatter: Record<string, unknown> = {
            type: 'series', title: 'Show', status: 'planned', active_part_id: 's1',
            series_parts: [
                { id: 's1', kind: 'season', title: 'S1', season: 1, episode_current: 0, episode_total: 50, status: 'planned' },
                { id: 's2', kind: 'season', title: 'S2', season: 2, episode_current: 0, episode_total: 50, status: 'planned' },
            ],
        };
        const app = writableApp(file, frontmatter);
        const service = new VideoService(app, 'series', 'Series', createMetadataService(app));
        const item = service.parseFromCache(file) as SeriesItem;
        await service.updateItem(item, { status: 'completed' });
        const parts = frontmatter.series_parts as Array<Record<string, unknown>>;
        expect(parts.map((p) => p.episode_current)).toEqual([50, 50]);
        expect(parts.map((p) => p.status)).toEqual(['completed', 'completed']);
        expect(frontmatter.episode_total).toBe(100);
        expect(item.episodeCurrent).toBe(50);
        // movies are not affected
        const movieFile = createMockFile('Movies/M.md', 'M');
        const movieFm: Record<string, unknown> = { type: 'movie', title: 'M' };
        const movieApp = writableApp(movieFile, movieFm);
        const movieService = new VideoService(movieApp, 'movie', 'Movies', createMetadataService(movieApp));
        await movieService.updateItem(movieService.parseFromCache(movieFile) as MovieItem, { status: 'completed' });
        expect(movieFm).not.toHaveProperty('series_parts');
    });
});

describe('hidden notes', () => {
    afterEach(() => configureHiddenFiles({ patterns: '', showHidden: false }));

    it('hides by name, path pattern, folder and frontmatter flag', () => {
        configureHiddenFiles({ patterns: '# comment\nDatabase.md\nNotion Bases/*\nIndex\ntemplates/', showHidden: false });
        expect(parseHiddenPatterns('# c\n\n A \nB')).toEqual(['A', 'B']);
        expect(isFileHidden('Movies/Database.md')).toBe(true);
        expect(isFileHidden('Movies/database.md')).toBe(true);
        expect(isFileHidden('Notion Bases/Films.md')).toBe(true);
        expect(isFileHidden('Movies/Index.md')).toBe(true);
        expect(isFileHidden('templates/x.md')).toBe(true);
        expect(isFileHidden('Movies/Dune.md')).toBe(false);
        expect(isFileHidden('Movies/My Database Notes.md')).toBe(false);
        expect(isFileHidden('Movies/Dune.md', { lorebase_hidden: true })).toBe(true);
        expect(isFileHidden('Movies/Dune.md', { lorebase_hidden: false })).toBe(false);
    });

    it('can be shown again and is skipped by the parsers', () => {
        configureHiddenFiles({ patterns: 'Database.md', showHidden: false });
        const file = createMockFile('Movies/Database.md', 'Database');
        const app = createMockApp({ [file.path]: { frontmatter: { type: 'movie', title: 'Database' } } });
        const service = new VideoService(app, 'movie', 'Movies', createMetadataService(app));
        expect(service.parseFromCache(file)).toBeNull();
        configureHiddenFiles({ patterns: 'Database.md', showHidden: true });
        expect(service.parseFromCache(file)).not.toBeNull();
    });
});

describe('TMDB language, original title and anime', () => {
    const urls: string[] = [];
    const fetcher = (payloads: Record<string, unknown>) => async (url: string): Promise<unknown> => {
        urls.push(url);
        const hit = Object.keys(payloads).find((key) => url.includes(key));
        return hit ? payloads[hit] : {};
    };

    it('sends the chosen language and keeps English by default', async () => {
        urls.length = 0;
        await searchTmdb(fetcher({}), 'Totoro', 'k', { kind: 'movies', language: 'es-ES' });
        await searchTmdb(fetcher({}), 'Totoro', 'k', { kind: 'movies' });
        expect(urls[0]).toContain('language=es-ES');
        expect(urls[1]).toContain('language=en-US');
    });

    it('returns the original title next to the localized one', async () => {
        const details = await getTmdbDetails(fetcher({ '/movie/1': { title: 'Mi vecino Totoro', original_title: 'となりのトトロ', release_date: '1988-04-16' } }), '1', 'k', 'movies', 'es-ES');
        expect(details?.name).toBe('Mi vecino Totoro');
        expect(details?.originalTitle).toBe('となりのトトロ');
        expect(urls.at(-1)).toContain('language=es-ES');
    });

    it('searches TV and movies for anime and lists animation first', async () => {
        const results = await searchTmdbAnime(fetcher({
            '/search/tv': { results: [{ id: 7, name: 'Live Show', genre_ids: [18], first_air_date: '2010-01-01' }, { id: 8, name: 'Cartoon', genre_ids: [16], first_air_date: '2011-01-01' }] },
            '/search/movie': { results: [{ id: 9, title: 'Anime Film', genre_ids: [16], release_date: '2012-01-01' }] },
        }), 'x', 'k', { language: 'ja-JP' });
        expect(results.map((r) => r.id)).toEqual(['tv-8', 'movie-9', 'tv-7']);
        expect(results[0].format).toBe('TV / TMDB');
        expect(results[1].format).toBe('Movie / TMDB');
    });

    it('builds anime details with one part per season, or a single movie part', async () => {
        const tv = await getTmdbAnimeDetails(fetcher({
            '/tv/8': { name: 'Cartoon', original_name: 'カートゥーン', overview: 'x', first_air_date: '2011-01-01', genres: [{ name: 'Animation' }],
                seasons: [{ id: 1, season_number: 0, name: 'Specials', episode_count: 2 }, { id: 2, season_number: 1, name: 'Season 1', episode_count: 12 }, { id: 3, season_number: 2, name: 'Season 2', episode_count: 13 }] },
        }), 'tv-8', 'k');
        expect(tv?.kind).toBe('anime');
        expect(tv?.format).toBe('tv');
        expect(tv?.originalTitle).toBe('カートゥーン');
        expect(tv?.parts?.map((p) => p.episodeTotal)).toEqual([12, 13]);
        const film = await getTmdbAnimeDetails(fetcher({ '/movie/9': { title: 'Anime Film', release_date: '2012-01-01' } }), 'movie-9', 'k');
        expect(film?.format).toBe('movie');
        expect(film?.parts).toHaveLength(1);
        expect(urls.some((url) => url.includes('/movie/9'))).toBe(true);
    });
});

describe('anime linked to TMDB', () => {
    it('keeps tmdb as the saved provider, so refresh and relink recognise it', () => {
        const file = createMockFile('Anime/Totoro.md', 'Totoro');
        const app = createMockApp({
            [file.path]: { frontmatter: { type: 'anime', title: 'Totoro', integration_provider: 'tmdb', integration_id: 'movie-8392', original_title: 'となりのトトロ' } },
        });
        const service = new AnimeService(app, createMetadataService(app));
        const item = service.parseAnimeFromCache(file);
        expect(item?.integrationProvider).toBe('tmdb');
        expect(item?.integrationId).toBe('movie-8392');
        expect(item?.originalTitle).toBe('となりのトトロ');
    });
});
