import { AnimeDetails, IntegrationAnimePart, SearchResult, VideoDetails, IntegrationVideoPart } from '../types';
import type { JsonFetcher } from './common';

interface TmdbOptions {
    kind: 'movies' | 'series';
    page?: number;
    pageSize?: number;
    /** BCP-47 like "es-ES". Defaults to English. */
    language?: string;
}

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

function clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toYear(value: unknown): string {
    return clean(value).slice(0, 4);
}

function imageUrl(path: unknown, size = 'w500'): string {
    const text = clean(path);
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    return `${TMDB_IMAGE_BASE}/${size}${text.startsWith('/') ? text : `/${text}`}`;
}

function getArray(source: Record<string, unknown>, key: string): Record<string, unknown>[] {
    const value = source[key];
    return Array.isArray(value)
        ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
        : [];
}

function getGenres(item: Record<string, unknown>): string[] {
    return getArray(item, 'genres')
        .map((genre) => clean(genre.name))
        .filter(Boolean);
}

function getCastNames(item: Record<string, unknown>): string {
    const credits = item.credits && typeof item.credits === 'object'
        ? item.credits as Record<string, unknown>
        : {};
    return getArray(credits, 'cast')
        .map((entry) => clean(entry.name))
        .filter(Boolean)
        .slice(0, 8)
        .join(', ');
}

function buildUrl(
    path: string,
    apiKey: string,
    params: Record<string, string | number | boolean> = {},
    language = 'en-US'
): string {
    const search = new URLSearchParams({
        api_key: apiKey,
        language: language || 'en-US',
    });
    for (const [key, value] of Object.entries(params)) {
        search.set(key, String(value));
    }
    return `${TMDB_API_BASE}${path}?${search.toString()}`;
}

export async function searchTmdb(
    fetchJson: JsonFetcher,
    query: string,
    apiKey: string,
    options: TmdbOptions
): Promise<SearchResult[]> {
    if (!query.trim() || !apiKey.trim()) return [];
    const page = Math.max(1, options.page ?? 1);
    const endpoint = options.kind === 'series' ? '/search/tv' : '/search/movie';
    const payload = await fetchJson(buildUrl(endpoint, apiKey, {
        query,
        page,
        include_adult: false,
    }, options.language));
    if (!payload || typeof payload !== 'object') return [];
    const results = (payload as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    return results
        .slice(0, options.pageSize ?? 20)
        .map((entry) => {
            const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
            const isSeries = options.kind === 'series';
            return {
                id: String(item.id ?? ''),
                title: clean(isSeries ? item.name : item.title) || clean(isSeries ? item.original_name : item.original_title),
                provider: 'tmdb' as const,
                image: imageUrl(item.poster_path),
                year: toYear(isSeries ? item.first_air_date : item.release_date),
                format: isSeries ? 'TV / TMDB' : 'Movie / TMDB',
            };
        })
        .filter((item) => item.id && item.title);
}

/**
 * When the query matches a person (director, mainly) more than a title, this returns
 * their filmography so you can browse it instead of needing the exact title.
 * Looked up in parallel with the normal title search; safe to ignore if it returns [].
 */
export async function searchTmdbByDirector(
    fetchJson: JsonFetcher,
    query: string,
    apiKey: string,
    options: TmdbOptions
): Promise<SearchResult[]> {
    const name = query.trim();
    if (!name || !apiKey.trim()) return [];
    const peoplePayload = await fetchJson(buildUrl('/search/person', apiKey, { query: name, include_adult: false }, options.language));
    const people = peoplePayload && typeof peoplePayload === 'object' ? (peoplePayload as Record<string, unknown>).results : null;
    if (!Array.isArray(people) || !people.length) return [];
    // Prefer an exact (case-insensitive) name match; otherwise the most "known" person TMDB returned first.
    const person = (people.find((entry) => clean((entry as Record<string, unknown>)?.name).toLocaleLowerCase() === name.toLocaleLowerCase())
        ?? people[0]) as Record<string, unknown>;
    const personId = person?.id;
    if (!personId) return [];
    const isSeries = options.kind === 'series';
    const creditsPayload = await fetchJson(buildUrl(`/person/${encodeURIComponent(String(personId))}/${isSeries ? 'tv' : 'movie'}_credits`, apiKey, {}, options.language));
    if (!creditsPayload || typeof creditsPayload !== 'object') return [];
    const crew = getArray(creditsPayload as Record<string, unknown>, 'crew')
        .filter((entry) => clean(entry.job) === 'Director' || clean(entry.department) === 'Directing');
    const seen = new Set<string>();
    const directorName = clean(person.name);
    return crew
        .map((item): SearchResult | null => {
            const id = String(item.id ?? '');
            if (!id || seen.has(id)) return null;
            seen.add(id);
            const title = clean(isSeries ? item.name : item.title) || clean(isSeries ? item.original_name : item.original_title);
            if (!title) return null;
            return {
                id,
                title,
                provider: 'tmdb',
                image: imageUrl(item.poster_path),
                year: toYear(isSeries ? item.first_air_date : item.release_date),
                format: `${isSeries ? 'TV' : 'Movie'} \u00B7 ${directorName}`,
            };
        })
        .filter((entry): entry is SearchResult => entry !== null)
        .sort((a, b) => (b.year || '0').localeCompare(a.year || '0'))
        .slice(0, options.pageSize ?? 20);
}

export async function getTmdbDetails(
    fetchJson: JsonFetcher,
    id: string,
    apiKey: string,
    kind: 'movies' | 'series',
    language?: string
): Promise<VideoDetails | null> {
    if (!id || !apiKey.trim()) return null;
    const endpoint = kind === 'series' ? `/tv/${encodeURIComponent(id)}` : `/movie/${encodeURIComponent(id)}`;
    const item = await fetchJson(buildUrl(endpoint, apiKey, { append_to_response: 'credits' }, language));
    if (!item || typeof item !== 'object') return null;
    const show = item as Record<string, unknown>;
    const isSeries = kind === 'series';
    const runtime = isSeries
        ? Array.isArray(show.episode_run_time) ? Number(show.episode_run_time[0]) : NaN
        : Number(show.runtime);
    const seasons = isSeries ? getArray(show, 'seasons').filter((season) => Number(season.season_number) > 0) : [];
    const parts: IntegrationVideoPart[] = isSeries
        ? seasons.map((season) => ({
            id: `season-${season.id ?? season.season_number}`,
            kind: 'season',
            title: clean(season.name) || `Season ${season.season_number}`,
            seasonNumber: Number(season.season_number),
            episodeCurrent: 0,
            episodeTotal: Number.isFinite(Number(season.episode_count)) ? Number(season.episode_count) : null,
            status: 'planned',
        }))
        : [];
    const networks = isSeries ? getArray(show, 'networks').map((network) => clean(network.name)).filter(Boolean) : [];
    const studios = getArray(show, 'production_companies').map((company) => clean(company.name)).filter(Boolean);

    return {
        kind: 'video',
        name: clean(isSeries ? show.name : show.title) || clean(isSeries ? show.original_name : show.original_title) || 'Untitled',
        originalTitle: clean(isSeries ? show.original_name : show.original_title),
        description: clean(show.overview),
        poster: imageUrl(show.poster_path),
        posterHorizontal: imageUrl(show.backdrop_path, 'w780') || imageUrl(show.poster_path),
        genres: getGenres(show),
        year: toYear(isSeries ? show.first_air_date : show.release_date),
        released: clean(isSeries ? show.first_air_date : show.release_date),
        runtime: Number.isFinite(runtime) && runtime > 0 ? `${runtime} min` : '',
        director: '',
        actors: getCastNames(show),
        rating: Number.isFinite(Number(show.vote_average)) ? Number(show.vote_average).toFixed(1) : '',
        communityRating: Number.isFinite(Number(show.vote_average)) ? Number(show.vote_average).toFixed(1) : '',
        communityVotes: Number.isFinite(Number(show.vote_count)) ? String(Math.trunc(Number(show.vote_count))) : '',
        seasons: isSeries ? String(seasons.length || '') : '',
        episodeCurrent: '0',
        episodeTotal: parts.reduce((sum, part) => sum + (part.episodeTotal ?? 0), 0).toString(),
        networks,
        studios,
        url: `https://www.themoviedb.org/${isSeries ? 'tv' : 'movie'}/${id}`,
        parts,
    };
}

// ---------------------------------------------------------------------------
// Anime (TMDB lists anime as TV series and movies; ids are "tv-123" / "movie-123")
// ---------------------------------------------------------------------------

const ANIMATION_GENRE_ID = 16;

function isAnimation(item: Record<string, unknown>): boolean {
    return Array.isArray(item.genre_ids) && item.genre_ids.includes(ANIMATION_GENRE_ID);
}

/** Searches TV and movies together and lists animation first. */
export async function searchTmdbAnime(
    fetchJson: JsonFetcher,
    query: string,
    apiKey: string,
    options: { page?: number; pageSize?: number; language?: string }
): Promise<SearchResult[]> {
    if (!query.trim() || !apiKey.trim()) return [];
    const page = Math.max(1, options.page ?? 1);
    const load = async (endpoint: string): Promise<Record<string, unknown>[]> => {
        const payload = await fetchJson(buildUrl(endpoint, apiKey, { query, page, include_adult: false }, options.language));
        const results = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).results : null;
        return Array.isArray(results)
            ? results.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
            : [];
    };
    const [tv, movies] = await Promise.all([load('/search/tv'), load('/search/movie')]);
    const mapped = [
        ...tv.map((item) => ({ item, isTv: true })),
        ...movies.map((item) => ({ item, isTv: false })),
    ]
        .sort((left, right) => Number(isAnimation(right.item)) - Number(isAnimation(left.item)))
        .map(({ item, isTv }) => ({
            id: `${isTv ? 'tv' : 'movie'}-${String(item.id ?? '')}`,
            title: clean(isTv ? item.name : item.title) || clean(isTv ? item.original_name : item.original_title),
            provider: 'tmdb' as const,
            image: imageUrl(item.poster_path),
            year: toYear(isTv ? item.first_air_date : item.release_date),
            format: isTv ? 'TV / TMDB' : 'Movie / TMDB',
        }))
        .filter((item) => item.id.length > 3 && item.title);
    return mapped.slice(0, options.pageSize ?? 20);
}

export async function getTmdbAnimeDetails(
    fetchJson: JsonFetcher,
    rawId: string,
    apiKey: string,
    language?: string
): Promise<AnimeDetails | null> {
    if (!rawId || !apiKey.trim()) return null;
    const match = /^(tv|movie)-(.+)$/.exec(rawId);
    const isTv = match ? match[1] === 'tv' : true;
    const id = match ? match[2] : rawId;
    const item = await fetchJson(buildUrl(`/${isTv ? 'tv' : 'movie'}/${encodeURIComponent(id)}`, apiKey, {}, language));
    if (!item || typeof item !== 'object') return null;
    const show = item as Record<string, unknown>;
    const vote = Number(show.vote_average);
    const seasons = isTv ? getArray(show, 'seasons').filter((season) => Number(season.season_number) > 0) : [];
    const parts: IntegrationAnimePart[] = isTv
        ? seasons.map((season) => ({
            id: `season-${season.id ?? season.season_number}`,
            kind: 'tv',
            title: clean(season.name) || `Season ${season.season_number}`,
            seasonNumber: Number(season.season_number),
            episodeCurrent: 0,
            episodeTotal: Number.isFinite(Number(season.episode_count)) ? Number(season.episode_count) : null,
            status: 'planned',
        }))
        : [{
            id: `movie-${id}`,
            kind: 'movie',
            title: clean(show.title) || 'Movie',
            seasonNumber: null,
            episodeCurrent: 0,
            episodeTotal: 1,
            status: 'planned',
        }];
    const studios = [
        ...getArray(show, 'production_companies').map((company) => clean(company.name)),
        ...(isTv ? getArray(show, 'networks').map((network) => clean(network.name)) : []),
    ].filter(Boolean);
    return {
        kind: 'anime',
        name: clean(isTv ? show.name : show.title) || clean(isTv ? show.original_name : show.original_title) || 'Untitled',
        originalTitle: clean(isTv ? show.original_name : show.original_title),
        description: clean(show.overview),
        image: imageUrl(show.poster_path),
        imageHorizontal: imageUrl(show.backdrop_path, 'w780') || imageUrl(show.poster_path),
        tags: getGenres(show),
        studios: Array.from(new Set(studios)),
        year: toYear(isTv ? show.first_air_date : show.release_date),
        imdbRating: Number.isFinite(vote) && vote > 0 ? vote.toFixed(1) : '',
        url: `https://www.themoviedb.org/${isTv ? 'tv' : 'movie'}/${id}`,
        format: isTv ? 'tv' : 'movie',
        parts,
        communityRating: Number.isFinite(vote) && vote > 0 ? vote.toFixed(1) : '',
        communityVotes: Number.isFinite(Number(show.vote_count)) ? String(Math.trunc(Number(show.vote_count))) : '',
    };
}
