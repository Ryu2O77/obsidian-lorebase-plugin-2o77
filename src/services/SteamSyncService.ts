import { App, TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../constants';
import type { GameStatus, LorebaseSettings, SteamSyncSettings } from '../types';
import { ChoiceModal } from '../modals/IntegrationModals';
import type { GameDetails } from './integrations/types';
import { getSteamDetails } from './integrations/providers/steam';
import { buildSimpleTemplate, getDefaultTemplateFields, getEffectiveSimpleTemplateFields, renderTemplate, sanitizeFileName } from './integrations/templateUtils';
import { extractYear } from './integrations/providers/common';
import type { JsonFetcher } from './integrations/providers/common';
import { localizeTemplateImages } from './integrations/imageStorage';
import { MetadataService } from './MetadataService';
import {
    ensureFolder,
    fetchHowLongToBeatValues,
    fetchJson,
    fetchText as fetchIntegrationText,
    getJsonFetcher,
    imageUrlExists,
    isProviderBlockedError,
    shouldLoadHowLongToBeat,
} from './integrations/shared';
import { recordIntegrationDiagnostic } from './integrations/diagnostics';

export interface SteamOwnedGame {
    appId: number;
    name: string;
    playtimeForever: number;
    iconUrl: string;
}

function isControlCharacter(character: string): boolean {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
}

export interface SteamWishlistGame {
    appId: number;
    name: string;
}

export interface SteamSyncGame {
    appId: number;
    name: string;
    playtimeForever: number;
    source: 'owned' | 'wishlist' | 'owned_wishlist';
    status: GameStatus;
    details: GameDetails;
}

export interface SteamSyncResult {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
}

export type SteamSyncItemOutcome = 'created' | 'updated' | 'skipped' | 'failed';

export interface SteamSyncItemResult {
    appId: number;
    name: string;
    outcome: SteamSyncItemOutcome;
    durationMs: number;
    detail?: string;
}

export class SteamSyncController {
    private paused = false;
    private cancelled = false;
    private waiters = new Set<() => void>();
    private listeners = new Set<() => void>();

    pause(): void {
        if (this.cancelled || this.paused) return;
        this.paused = true;
        this.notify();
    }

    resume(): void {
        if (!this.paused) return;
        this.paused = false;
        this.releaseWaiters();
        this.notify();
    }

    cancel(): void {
        if (this.cancelled) return;
        this.cancelled = true;
        this.paused = false;
        this.releaseWaiters();
        this.notify();
    }

    isPaused(): boolean {
        return this.paused;
    }

    isCancelled(): boolean {
        return this.cancelled;
    }

    async waitIfPaused(): Promise<void> {
        while (this.paused && !this.cancelled) {
            await new Promise<void>((resolve) => this.waiters.add(resolve));
        }
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private releaseWaiters(): void {
        const waiters = [...this.waiters];
        this.waiters.clear();
        waiters.forEach((resolve) => resolve());
    }

    private notify(): void {
        this.listeners.forEach((listener) => listener());
    }
}

export interface SteamSyncOptions {
    onProgress?: (message: string) => void;
    onItemStart?: (candidate: SteamImportCandidate, index: number, total: number) => void;
    onItemResult?: (item: SteamSyncItemResult) => void;
    onHalt?: (reason: 'cancelled' | 'blocked') => void;
    confirmDuplicateUpdate?: (count: number) => Promise<boolean>;
    selectedAppIds?: Set<number>;
    candidates?: SteamImportCandidate[];
    control?: SteamSyncController;
}

type JsonMap = Record<string, unknown>;

export interface SteamImportCandidate {
    appId: number;
    name: string;
    playtimeForever: number;
    source: 'owned' | 'wishlist' | 'owned_wishlist';
    poster?: string;
    posterHorizontal?: string;
}

export class SteamSyncService {
    private app: App;
    private metadataService: MetadataService;
    private jsonFetcher: JsonFetcher;
    private detailsCache = new Map<number, GameDetails | null>();
    private warnings: string[] = [];

    constructor(app: App, metadataService: MetadataService) {
        this.app = app;
        this.metadataService = metadataService;
        this.jsonFetcher = getJsonFetcher((url, headers, method, body) => fetchJson(url, headers, method, body, {
            rateLimitMessage: 'Steam request was rate limited.',
            htmlJsonMessage: 'Steam returned HTML instead of JSON.',
        }));
    }

    async getOwnedGames(steamId: string, apiKey?: string): Promise<SteamOwnedGame[]> {
        const resolvedSteamId = await this.resolveSteamId(steamId);
        const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
        url.searchParams.set('steamid', resolvedSteamId);
        url.searchParams.set('include_appinfo', 'true');
        url.searchParams.set('include_played_free_games', 'true');
        url.searchParams.set('format', 'json');
        if (apiKey?.trim()) {
            url.searchParams.set('key', apiKey.trim());
        }

        let json: unknown;
        try {
            json = await this.jsonFetcher(url.toString());
        } catch (error) {
            if (!apiKey?.trim() && this.isStatusError(error, 401)) {
                this.addWarning('Steam library requires an API Key for this profile. Wishlist can still be imported.');
                console.warn('[Steam Sync] Owned games require a Steam API key for this profile. Continuing without library games.', error);
                return [];
            }
            throw error;
        }
        const response = this.asObject(this.asObject(json)?.response);
        const games = this.asArray(response?.games);

        return games
            .map((entry) => {
                const record = this.asObject(entry);
                const appId = this.toNumber(record?.appid);
                if (!appId) return null;
                return {
                    appId,
                    name: this.toString(record?.name) || `Steam App ${appId}`,
                    playtimeForever: this.toNumber(record?.playtime_forever),
                    iconUrl: this.toString(record?.img_icon_url),
                };
            })
            .filter((entry): entry is SteamOwnedGame => entry !== null);
    }

    async getWishlist(steamId: string): Promise<SteamWishlistGame[]> {
        const resolvedSteamId = await this.resolveSteamId(steamId);
        const officialWishlist = await this.getWishlistFromWebApi(resolvedSteamId);
        if (officialWishlist.length > 0) {
            return officialWishlist;
        }

        const byAppId = new Map<number, SteamWishlistGame>();
        let shouldTryHtmlFallback = false;

        for (let page = 0; page < 50; page++) {
            try {
                const pageGames = await this.getWishlistPage(resolvedSteamId, page);
                if (!pageGames.length) {
                    if (page === 0) shouldTryHtmlFallback = true;
                    break;
                }
                for (const game of pageGames) {
                    byAppId.set(game.appId, game);
                }
            } catch (error) {
                if (this.isRecoverableWishlistError(error)) {
                    console.warn('[Steam Sync] Wishlist is unavailable. Continuing without wishlist.', error);
                    shouldTryHtmlFallback = true;
                    break;
                }
                throw error;
            }
        }

        if (byAppId.size === 0 && shouldTryHtmlFallback) {
            let fallbackGames: SteamWishlistGame[] = [];
            try {
                fallbackGames = await this.getWishlistFromHtml(resolvedSteamId);
            } catch (error) {
                if (!this.isRecoverableWishlistError(error)) {
                    throw error;
                }
                console.warn('[Steam Sync] Wishlist fallback is unavailable. Continuing without wishlist.', error);
            }
            for (const game of fallbackGames) {
                byAppId.set(game.appId, game);
            }
        }

        return Array.from(byAppId.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    async enrichGame(appId: number, settings?: LorebaseSettings): Promise<GameDetails | null> {
        const shouldUseSteamGridDb = Boolean(settings?.integrations?.providers.steamgriddb?.enabled && settings.integrations.providers.steamgriddb.apiKey?.trim());
        if (this.detailsCache.has(appId)) {
            const cached = this.detailsCache.get(appId) ?? null;
            if (!shouldUseSteamGridDb || cached?.poster) {
                return cached;
            }
        }
        const details = await getSteamDetails(this.jsonFetcher, String(appId), {
            imageExists: imageUrlExists,
            steamGridDb: settings?.integrations?.providers.steamgriddb,
        });
        this.detailsCache.set(appId, details);
        return details;
    }

    async testConnection(settings: SteamSyncSettings): Promise<number> {
        this.clearWarnings();
        return (await this.loadCandidates(settings)).length;
    }

    async previewImport(settings: LorebaseSettings | SteamSyncSettings): Promise<SteamImportCandidate[]> {
        this.clearWarnings();
        const steamSettings = this.getSteamSettings(settings);
        const candidates = await this.loadCandidates(steamSettings);
        return this.preparePreviewCandidates(candidates);
    }

    async sync(settings: LorebaseSettings, options: SteamSyncOptions = {}): Promise<SteamSyncResult> {
        const steamSettings = settings.steamSync;
        this.clearWarnings();

        const result: SteamSyncResult = { created: 0, updated: 0, skipped: 0, failed: 0 };
        options.onProgress?.('Loading Steam data...');

        const allCandidates = options.candidates
            ? options.candidates.map((candidate) => ({ ...candidate }))
            : await this.loadCandidates(steamSettings);
        const candidates = options.selectedAppIds
            ? allCandidates.filter((candidate) => options.selectedAppIds?.has(candidate.appId))
            : allCandidates;
        const existingIndex = this.indexExistingGames(settings.games.folderPath);
        const duplicateCount = candidates.filter((candidate) => this.findDuplicate(candidate, existingIndex) !== null).length;
        let updateDuplicates = steamSettings.duplicateMode === 'update';

        if (steamSettings.duplicateMode === 'ask' && duplicateCount > 0) {
            updateDuplicates = options.confirmDuplicateUpdate
                ? await options.confirmDuplicateUpdate(duplicateCount)
                : await this.confirmDuplicateUpdate(duplicateCount);
        }

        const template = this.getGameTemplate(settings);
        await ensureFolder(this.app, settings.games.folderPath);

        let halted = false;
        for (let index = 0; index < candidates.length; index++) {
            const candidate = candidates[index];
            if (options.control?.isCancelled()) {
                options.onHalt?.('cancelled');
                halted = true;
                break;
            }
            await options.control?.waitIfPaused();
            if (options.control?.isCancelled()) {
                options.onHalt?.('cancelled');
                halted = true;
                break;
            }

            const itemStartedAt = Date.now();
            options.onItemStart?.(candidate, index, candidates.length);
            try {
                options.onProgress?.(`Importing ${candidate.name}...`);
                const duplicate = this.findDuplicate(candidate, existingIndex);
                if (duplicate && !updateDuplicates) {
                    result.skipped++;
                    this.emitItemResult(
                        candidate,
                        'skipped',
                        itemStartedAt,
                        options,
                        this.getDuplicateSkippedReason(settings.language)
                    );
                    continue;
                }

                const details = await this.enrichGame(candidate.appId, settings) ?? this.buildFallbackDetails(candidate);
                if (/^Steam App \d+$/.test(candidate.name) && details.name && details.name !== 'Unknown') {
                    candidate.name = details.name;
                }
                const game = this.toSyncGame(candidate, details, steamSettings);

                if (duplicate) {
                    await this.updateExistingGame(duplicate, game, steamSettings);
                    result.updated++;
                    this.emitItemResult(candidate, 'updated', itemStartedAt, options);
                    continue;
                }

                const fullPath = this.getUniquePath(settings.games.folderPath, game.details.name || game.name);
                const content = await this.buildNewGameContent(template, game, steamSettings, settings);
                await this.app.vault.create(fullPath, content);
                const createdFile = this.app.vault.getAbstractFileByPath(fullPath);
                if (createdFile instanceof TFile) {
                    if (candidate.source !== 'wishlist') {
                        const stats = await this.buildStatUpdates(steamSettings, game.appId, game.playtimeForever, steamSettings.fields.playtime);
                        if (Object.keys(stats).length) await this.metadataService.updateMetadata(createdFile, stats);
                    }
                    existingIndex.files.push(createdFile);
                    this.addFileToIndex(createdFile, existingIndex);
                }
                result.created++;
                this.emitItemResult(candidate, 'created', itemStartedAt, options);
            } catch (error) {
                console.error('[Steam Sync] Failed to import game', candidate, error);
                result.failed++;
                this.emitItemResult(candidate, 'failed', itemStartedAt, options, undefined, error);
                if (isProviderBlockedError(error)) {
                    this.addWarning(error instanceof Error
                        ? error.message
                        : 'Steam temporarily blocked requests. The remaining imports were paused.');
                    options.onHalt?.('blocked');
                    halted = true;
                    break;
                }
            }
        }

        if (!halted && options.control?.isCancelled()) {
            options.onHalt?.('cancelled');
        }
        return result;
    }

    private emitItemResult(
        candidate: SteamImportCandidate,
        outcome: SteamSyncItemOutcome,
        startedAt: number,
        options: SteamSyncOptions,
        detail?: string,
        error?: unknown
    ): void {
        const errorMessage = this.describeSyncError(error);
        const safeDetail = errorMessage ?? detail;
        const item: SteamSyncItemResult = {
            appId: candidate.appId,
            name: candidate.name,
            outcome,
            durationMs: Math.max(0, Date.now() - startedAt),
            detail: safeDetail,
        };
        options.onItemResult?.(item);
        recordIntegrationDiagnostic({
            url: `https://store.steampowered.com/app/${candidate.appId}/`,
            origin: 'https://store.steampowered.com',
            method: 'GET',
            status: outcome === 'failed' ? 0 : 200,
            outcome: outcome === 'failed' ? 'error' : outcome,
            durationMs: item.durationMs,
            attempt: 1,
            kind: 'process',
            operation: 'Steam Sync',
            itemLabel: candidate.name,
            itemId: String(candidate.appId),
            detail: safeDetail,
        });
    }

    private getDuplicateSkippedReason(language: LorebaseSettings['language']): string {
        if (language === 'ru') {
            return 'Игра уже есть в LOREBASE; в настройках дубликатов выбран режим «Пропускать».';
        }
        if (language === 'uk') {
            return 'Гра вже є в LOREBASE; у налаштуваннях дублікатів вибрано режим «Пропускати».';
        }
        return 'The game already exists in LOREBASE; duplicate mode is set to Skip.';
    }

    private describeSyncError(error: unknown): string | undefined {
        const raw = error instanceof Error
            ? error.message
            : typeof error === 'string'
                ? error
                : '';
        if (!raw) return undefined;
        return raw
            .replace(/https?:\/\/[^\s)]+/gi, '[request URL omitted]')
            .replace(
                /\b(api[_ -]?key|token|authorization|client[_ -]?secret|password)\b\s*[:=]\s*[^\s,;]+/gi,
                '$1=[hidden]'
            )
            .split('')
            .map((character) => isControlCharacter(character) ? ' ' : character)
            .join('')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 240);
    }

    consumeWarnings(): string[] {
        const warnings = [...this.warnings];
        this.clearWarnings();
        return warnings;
    }

    /** Steam reports minutes; notes also get a friendlier hours value (one decimal). */
    private minutesToHours(minutes: number): number {
        return Math.round((minutes / 60) * 10) / 10;
    }

    private achievementsWarned = false;

    /**
     * Achievement counts for one game. Needs a Steam API key and a public "Game details" profile.
     * Returns null for games without achievements or when Steam refuses the request.
     */
    async getAchievementProgress(
        steamId: string,
        apiKey: string,
        appId: number
    ): Promise<{ current: number; total: number } | null> {
        if (!apiKey.trim()) return null;
        try {
            const resolvedSteamId = await this.resolveSteamId(steamId);
            const url = new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/');
            url.searchParams.set('appid', String(appId));
            url.searchParams.set('steamid', resolvedSteamId);
            url.searchParams.set('key', apiKey.trim());
            url.searchParams.set('format', 'json');
            const json = await this.jsonFetcher(url.toString());
            const stats = this.asObject(this.asObject(json)?.playerstats);
            if (!stats || stats.success === false) return null;
            const list = this.asArray(stats.achievements);
            if (!list.length) return null;
            const current = list.filter((entry) => this.toNumber(this.asObject(entry)?.achieved) === 1).length;
            return { current, total: list.length };
        } catch (error) {
            if ((this.isStatusError(error, 403) || this.isStatusError(error, 401)) && !this.achievementsWarned) {
                this.achievementsWarned = true;
                this.addWarning('Steam achievements need a valid API key and a public "Game details" privacy setting on your Steam profile.');
            }
            // 400 = the game has no achievements/stats; skip it quietly.
            return null;
        }
    }

    /** Frontmatter values derived from Steam library data for one game. */
    private async buildStatUpdates(
        settings: SteamSyncSettings,
        appId: number,
        minutes: number,
        includePlaytime: boolean
    ): Promise<Record<string, unknown>> {
        const updates: Record<string, unknown> = {};
        if (includePlaytime) {
            updates.playtime = minutes;
            updates.hours_played = this.minutesToHours(minutes);
        }
        if (settings.fields.achievements) {
            const progress = await this.getAchievementProgress(settings.steamId, settings.apiKey, appId);
            if (progress) {
                updates.trophies_current = progress.current;
                updates.trophies_total = progress.total;
            }
        }
        return updates;
    }

    /**
     * Fresh hours + achievement counts for a single game (nothing is written; the editor applies them).
     * Returns null when Steam isn't configured or the request fails.
     */
    async fetchGameStats(
        settings: SteamSyncSettings,
        appId: number
    ): Promise<{ hoursPlayed: number | null; trophiesCurrent: number | null; trophiesTotal: number | null } | null> {
        if (!settings.steamId.trim() || !Number.isFinite(appId) || appId <= 0) return null;
        this.achievementsWarned = false;
        try {
            const owned = await this.getOwnedGames(settings.steamId, settings.apiKey);
            const game = owned.find((entry) => entry.appId === appId);
            const progress = await this.getAchievementProgress(settings.steamId, settings.apiKey, appId);
            if (!game && !progress) return null;
            return {
                hoursPlayed: game ? this.minutesToHours(game.playtimeForever) : null,
                trophiesCurrent: progress?.current ?? null,
                trophiesTotal: progress?.total ?? null,
            };
        } catch (error) {
            console.warn('[Steam Sync] Failed to fetch stats for a single game', error);
            return null;
        }
    }

    async syncPlaytimeForExisting(settings: LorebaseSettings): Promise<SteamSyncResult> {
        const steamSettings = settings.steamSync;
        this.achievementsWarned = false;

        const result: SteamSyncResult = { created: 0, updated: 0, skipped: 0, failed: 0 };
        const owned = await this.getOwnedGames(steamSettings.steamId, steamSettings.apiKey);
        const existingIndex = this.indexExistingGames(settings.games.folderPath);

        const jobs: Array<{ file: TFile; game: SteamOwnedGame }> = [];
        for (const game of owned) {
            const candidate: SteamImportCandidate = {
                appId: game.appId,
                name: game.name,
                playtimeForever: game.playtimeForever,
                source: 'owned',
            };
            const duplicate = this.findDuplicate(candidate, existingIndex);
            if (!duplicate) {
                result.skipped++;
                continue;
            }
            jobs.push({ file: duplicate, game });
        }

        // Achievements need one request per game, so run a few at a time.
        let cursor = 0;
        const worker = async (): Promise<void> => {
            while (cursor < jobs.length) {
                const { file, game } = jobs[cursor++];
                try {
                    const stats = await this.buildStatUpdates(steamSettings, game.appId, game.playtimeForever, true);
                    await this.metadataService.updateMetadata(file, { steamAppId: game.appId, ...stats });
                    result.updated++;
                } catch (error) {
                    console.error('[Steam Sync] Failed to update playtime', game, error);
                    result.failed++;
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(steamSettings.fields.achievements ? 5 : 1, jobs.length) }, worker));

        return result;
    }

    mapOwnedStatus(playtimeForever: number, settings: SteamSyncSettings): GameStatus {
        return playtimeForever > 0 ? settings.statusWithPlaytime : settings.statusWithoutPlaytime;
    }

    mapWishlistStatus(settings: SteamSyncSettings): GameStatus {
        return settings.statusWishlist;
    }

    private async loadCandidates(settings: SteamSyncSettings): Promise<SteamImportCandidate[]> {
        const byAppId = new Map<number, SteamImportCandidate>();

        if (settings.importOwnedGames) {
            const owned = await this.getOwnedGames(settings.steamId, settings.apiKey);
            for (const game of owned) {
                byAppId.set(game.appId, {
                    appId: game.appId,
                    name: game.name,
                    playtimeForever: game.playtimeForever,
                    source: 'owned',
                });
            }
        }

        if (settings.importWishlist) {
            const wishlist = await this.getWishlist(settings.steamId);
            for (const game of wishlist) {
                const existing = byAppId.get(game.appId);
                if (existing) {
                    existing.source = 'owned_wishlist';
                    if (!existing.name) existing.name = game.name;
                    continue;
                }
                byAppId.set(game.appId, {
                    appId: game.appId,
                    name: game.name,
                    playtimeForever: 0,
                    source: 'wishlist',
                });
            }
        }

        return Array.from(byAppId.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    private addWarning(message: string): void {
        if (!this.warnings.includes(message)) {
            this.warnings.push(message);
        }
    }

    private clearWarnings(): void {
        this.warnings = [];
    }

    private getSteamSettings(settings: LorebaseSettings | SteamSyncSettings): SteamSyncSettings {
        return this.isLorebaseSettings(settings) ? settings.steamSync : settings;
    }

    private isLorebaseSettings(settings: LorebaseSettings | SteamSyncSettings): settings is LorebaseSettings {
        return 'steamSync' in settings;
    }

    private preparePreviewCandidates(candidates: SteamImportCandidate[]): SteamImportCandidate[] {
        for (const candidate of candidates) {
            candidate.posterHorizontal = this.getSteamHeaderImage(candidate.appId);
        }
        return candidates.sort((a, b) => a.name.localeCompare(b.name));
    }

    private async getWishlistFromWebApi(steamId: string): Promise<SteamWishlistGame[]> {
        const url = new URL('https://api.steampowered.com/IWishlistService/GetWishlist/v1/');
        url.searchParams.set('steamid', steamId);

        try {
            const json = await this.jsonFetcher(url.toString());
            const response = this.asObject(this.asObject(json)?.response);
            const items = this.asArray(response?.items);

            return items
                .map((entry) => {
                    const record = this.asObject(entry);
                    const appId = this.toNumber(record?.appid);
                    if (!appId) return null;
                    return {
                        appId,
                        name: `Steam App ${appId}`,
                    };
                })
                .filter((entry): entry is SteamWishlistGame => entry !== null);
        } catch (error) {
            console.warn('[Steam Sync] IWishlistService/GetWishlist failed. Falling back to Store wishlistdata.', error);
            return [];
        }
    }

    private async getWishlistPage(steamId: string, page: number): Promise<SteamWishlistGame[]> {
        const url = `https://store.steampowered.com/wishlist/profiles/${encodeURIComponent(steamId)}/wishlistdata/?p=${page}`;
        const json = await this.jsonFetcher(url);
        const root = this.asObject(json);
        if (!root) return [];

        const games: SteamWishlistGame[] = [];
        for (const [appIdRaw, value] of Object.entries(root)) {
            if (appIdRaw === 'success') continue;
            const appId = Number(appIdRaw);
            if (!Number.isFinite(appId) || appId <= 0) continue;
            const record = this.asObject(value);
            games.push({
                appId,
                name: this.toString(record?.name) || `Steam App ${appId}`,
            });
        }

        return games;
    }

    private async getWishlistFromHtml(steamId: string): Promise<SteamWishlistGame[]> {
        const url = `https://store.steampowered.com/wishlist/profiles/${encodeURIComponent(steamId)}/`;
        const html = await this.fetchText(url);
        const fromScript = this.parseWishlistScript(html);
        if (fromScript.length) return fromScript;

        const byAppId = new Map<number, SteamWishlistGame>();
        const appIdRegex = /"appid"\s*:\s*(\d+)/g;
        let match: RegExpExecArray | null;
        while ((match = appIdRegex.exec(html)) !== null) {
            const appId = Number(match[1]);
            if (Number.isFinite(appId) && appId > 0) {
                byAppId.set(appId, { appId, name: `Steam App ${appId}` });
            }
        }

        return Array.from(byAppId.values());
    }

    private parseWishlistScript(html: string): SteamWishlistGame[] {
        const match = html.match(/g_rgWishlistData\s*=\s*(\[[\s\S]*?\]);/);
        if (!match) return [];

        try {
            const parsed = JSON.parse(match[1]) as unknown;
            const entries = this.asArray(parsed);
            return entries
                .map((entry) => {
                    const record = this.asObject(entry);
                    const appId = this.toNumber(record?.appid);
                    if (!appId) return null;
                    return {
                        appId,
                        name: this.toString(record?.name) || `Steam App ${appId}`,
                    };
                })
                .filter((entry): entry is SteamWishlistGame => entry !== null);
        } catch (error) {
            console.warn('[Steam Sync] Failed to parse wishlist HTML data.', error);
            return [];
        }
    }

    private toSyncGame(candidate: SteamImportCandidate, details: GameDetails, settings: SteamSyncSettings): SteamSyncGame {
        const status = candidate.source === 'wishlist'
            ? this.mapWishlistStatus(settings)
            : this.mapOwnedStatus(candidate.playtimeForever, settings);

        return {
            appId: candidate.appId,
            name: details.name || candidate.name,
            playtimeForever: candidate.playtimeForever,
            source: candidate.source,
            status,
            details,
        };
    }

    private buildFallbackDetails(candidate: SteamImportCandidate): GameDetails {
        return {
            kind: 'game',
            name: candidate.name || `Steam App ${candidate.appId}`,
            description: '',
            poster: '',
            posterHorizontal: this.getSteamHeaderImage(candidate.appId),
            genres: [],
            platforms: [],
            developers: [],
            publishers: [],
            rating: '',
            metacritic: '',
            released: '',
            year: '',
            url: `https://store.steampowered.com/app/${candidate.appId}/`,
        };
    }

    private async buildNewGameContent(
        template: string,
        game: SteamSyncGame,
        settings: SteamSyncSettings,
        allSettings: LorebaseSettings
    ): Promise<string> {
        const rawValues = await this.buildTemplateValues(game, settings, allSettings);
        const title = this.toString(rawValues.name) || game.details.name || game.name || 'Untitled';
        const values = await localizeTemplateImages(this.app, 'games', title, rawValues, allSettings.integrations?.imageStorage, template);
        return renderTemplate(template, values);
    }

    private async buildTemplateValues(
        game: SteamSyncGame,
        settings: SteamSyncSettings,
        allSettings: LorebaseSettings
    ): Promise<Record<string, unknown>> {
        const details = game.details;
        const hltb = shouldLoadHowLongToBeat(
            allSettings.integrations?.media.games ?? DEFAULT_SETTINGS.integrations!.media.games,
            this.getGameTemplate(allSettings)
        )
            ? await fetchHowLongToBeatValues(this.jsonFetcher, details.name || game.name, details.year, '[Steam Sync]')
            : null;
        return {
            name: details.name || game.name,
            Poster: details.poster,
            PosterHorizontal: details.posterHorizontal ?? details.poster,
            Plot: details.description,
            genres: settings.fields.genres ? details.genres : [],
            platforms: details.platforms,
            developers: details.developers,
            publishers: details.publishers,
            rating: this.toNumber(details.rating),
            userRating: 0,
            metacritic: details.metacritic,
            released: settings.fields.releaseDate ? details.released : '',
            Year: this.toNumber(settings.fields.releaseDate ? details.year : extractYear(details.released)),
            url: details.url || `https://store.steampowered.com/app/${game.appId}/`,
            status: game.status,
            playtime: settings.fields.playtime ? game.playtimeForever : '',
            steamAppId: game.appId,
            main: hltb?.main ?? '',
            main_plus_sides: hltb?.main_plus_sides ?? '',
            perfectionist: hltb?.perfectionist ?? '',
            completionist: hltb?.perfectionist ?? '',
            integrationProvider: 'steam',
            integrationId: game.appId,
        };
    }

    private async updateExistingGame(file: TFile, game: SteamSyncGame, settings: SteamSyncSettings): Promise<void> {
        const updates: Record<string, unknown> = {
            steamAppId: game.appId,
            url: game.details.url || `https://store.steampowered.com/app/${game.appId}/`,
        };

        Object.assign(updates, await this.buildStatUpdates(settings, game.appId, game.playtimeForever, settings.fields.playtime));
        if (settings.fields.genres) {
            updates.genres = game.details.genres;
        }
        if (settings.fields.releaseDate) {
            updates.released = game.details.released || null;
            updates.year = game.details.year || null;
        }

        await this.metadataService.updateMetadata(file, updates);
    }

    private indexExistingGames(folderPath: string): {
        files: TFile[];
        byAppId: Map<number, TFile>;
        byUrl: Map<string, TFile>;
        byPath: Map<string, TFile>;
    } {
        const files = this.app.vault.getFiles()
            .filter((file) => file.extension === 'md')
            .filter((file) => !folderPath || file.path.startsWith(`${folderPath}/`));
        const index = {
            files,
            byAppId: new Map<number, TFile>(),
            byUrl: new Map<string, TFile>(),
            byPath: new Map<string, TFile>(),
        };

        for (const file of files) {
            this.addFileToIndex(file, index);
        }

        return index;
    }

    private addFileToIndex(
        file: TFile,
        index: { byAppId: Map<number, TFile>; byUrl: Map<string, TFile>; byPath: Map<string, TFile> }
    ): void {
        const frontmatter = this.asObject(this.app.metadataCache.getFileCache(file)?.frontmatter);
        const appId = this.toNumber(frontmatter?.steamAppId) || this.toNumber(frontmatter?.appid);
        if (appId) {
            index.byAppId.set(appId, file);
        }

        const url = this.normalizeSteamUrl(this.toString(frontmatter?.url));
        if (url) {
            index.byUrl.set(url, file);
        }

        index.byPath.set(file.path, file);
    }

    private findDuplicate(
        candidate: SteamImportCandidate,
        index: { byAppId: Map<number, TFile>; byUrl: Map<string, TFile>; byPath: Map<string, TFile> }
    ): TFile | null {
        const byAppId = index.byAppId.get(candidate.appId);
        if (byAppId) return byAppId;

        const byUrl = index.byUrl.get(this.normalizeSteamUrl(`https://store.steampowered.com/app/${candidate.appId}/`));
        if (byUrl) return byUrl;

        const fileName = sanitizeFileName(candidate.name) || `Steam App ${candidate.appId}`;
        for (const file of index.byPath.values()) {
            if (file.basename.toLowerCase() === fileName.toLowerCase()) {
                return file;
            }
        }

        return null;
    }

    private getGameTemplate(settings: LorebaseSettings): string {
        const media = settings.integrations?.media.games ?? DEFAULT_SETTINGS.integrations!.media.games;
        if (!media.templateEnabled) {
            return `---\nstatus: "{{VALUE:status}}"\nfavorite: false\nurl: "{{VALUE:url}}"\n---`;
        }

        const mode = media.templateMode ?? 'advanced';
        if (mode === 'advanced') return media.template;

        const selected = Array.isArray(media.templateFields) ? media.templateFields : getDefaultTemplateFields('games');
        return buildSimpleTemplate('games', getEffectiveSimpleTemplateFields('games', selected, {
            howLongToBeatEnabled: Boolean(media.howLongToBeatEnabled)
        }));
    }

    private getUniquePath(folderPath: string, title: string): string {
        const fileName = sanitizeFileName(title) || 'Untitled';
        const basePath = folderPath ? `${folderPath}/${fileName}` : fileName;
        let candidate = `${basePath}.md`;
        let suffix = 2;
        while (this.app.vault.getAbstractFileByPath(candidate)) {
            candidate = `${basePath} ${suffix}.md`;
            suffix++;
        }
        return candidate;
    }

    private async confirmDuplicateUpdate(count: number): Promise<boolean> {
        const modal = new ChoiceModal(
            this.app,
            'Steam duplicates found',
            `${count} Steam games already exist in your LOREBASE library. Update Steam fields for all duplicates?`,
            'Update all',
            'Skip all'
        );
        return modal.openAndGetValue();
    }

    private async resolveSteamId(input: string): Promise<string> {
        const value = input.trim();
        const profileMatch = value.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
        if (profileMatch) return profileMatch[1];

        const vanity = this.extractVanityName(value);
        if (vanity) {
            const steamId = await this.resolveVanitySteamId(vanity);
            if (steamId) return steamId;
        }

        throw new Error('Steam profile must be a steamcommunity.com/profiles URL or steamcommunity.com/id URL.');
    }

    private extractVanityName(value: string): string {
        const urlMatch = value.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
        if (urlMatch) return decodeURIComponent(urlMatch[1]).trim();
        return '';
    }

    private async resolveVanitySteamId(vanity: string): Promise<string | null> {
        const url = `https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`;
        const xml = await this.fetchText(url);
        const match = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
        return match ? match[1] : null;
    }

    private normalizeSteamUrl(url: string): string {
        const match = url.match(/store\.steampowered\.com\/app\/(\d+)/);
        return match ? `steam-app:${match[1]}` : '';
    }

    private getSteamHeaderImage(appId: number): string {
        return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
    }

    private async fetchText(url: string): Promise<string> {
        return fetchIntegrationText(url);
    }

    private isRecoverableWishlistError(error: unknown): boolean {
        if (isProviderBlockedError(error)) return true;
        if (this.isHtmlJsonError(error)) return true;
        return error instanceof Error && error.message.toLowerCase().includes('rate limited');
    }

    private isHtmlJsonError(error: unknown): boolean {
        return error instanceof Error && error.message.includes('Steam returned HTML');
    }

    private isStatusError(error: unknown, status: number): boolean {
        if (error && typeof error === 'object') {
            const value = error as { status?: unknown; statusCode?: unknown };
            if (value.status === status || value.statusCode === status) return true;
        }
        if (!(error instanceof Error)) return false;
        const message = error.message.toLowerCase();
        return message.includes(`status ${status}`)
            || message.includes(`status: ${status}`)
            || message.includes(`http ${status}`);
    }

    private asObject(value: unknown): JsonMap | null {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
        return value as JsonMap;
    }

    private asArray(value: unknown): unknown[] {
        return Array.isArray(value) ? value : [];
    }

    private toString(value: unknown): string {
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        return '';
    }

    private toNumber(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const parsed = Number.parseFloat(value.trim());
            return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
    }

}
