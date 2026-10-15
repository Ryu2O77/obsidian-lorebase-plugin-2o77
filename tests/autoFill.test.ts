import { describe, expect, it } from 'vitest';
import { IntegrationService } from '../src/services/IntegrationService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockApp } from './helpers/testHelpers';

type Result = { id: string; title: string; year?: string };
function makeService(resultsByProvider: Record<string, Result[]>, enabled = true) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.integrations.enabled = enabled;
    for (const id of ['tmdb', 'tvmaze', 'omdb']) {
        const provider = settings.integrations.providers[id as 'tmdb'];
        provider.enabled = true;
        provider.apiKey = 'test-key';
    }
    settings.integrations.media.movies.provider = 'tmdb';
    const service = new IntegrationService(createMockApp({}), () => settings);
    const searched: string[] = [];
    (service as unknown as { search: unknown }).search = async (provider: string) => {
        searched.push(provider);
        return (resultsByProvider[provider] ?? []).map((entry) => ({ ...entry, provider }));
    };
    return { service, searched };
}

describe('autoSelectMediaSource', () => {
    it('links a confident match and skips the other providers', async () => {
        const { service, searched } = makeService({ tmdb: [{ id: '1', title: 'Shrek 2', year: '2004' }, { id: '2', title: 'Shrek', year: '2001' }] });
        const pick = await service.autoSelectMediaSource('movies', 'Shrek', 2001, false);
        expect(pick.reason).toBe('matched');
        expect(pick.source).toMatchObject({ id: '2', provider: 'tmdb' });
        expect(searched).toEqual(['tmdb']);
    });

    it('falls through to another provider when the first finds nothing', async () => {
        const { service, searched } = makeService({ tmdb: [], omdb: [{ id: '9', title: 'Totoro' }] });
        const pick = await service.autoSelectMediaSource('movies', 'Totoro', null, false);
        expect(pick.source?.id).toBe('9');
        expect(searched[0]).toBe('tmdb');
        expect(searched.length).toBeGreaterThan(1);
    });

    it('does not link an unsure match unless the first result is allowed', async () => {
        const results = { tmdb: [{ id: '5', title: "Howl's Moving Castle", year: '2004' }] };
        const careful = await makeService(results).service.autoSelectMediaSource('movies', 'El Castillo Ambulante', null, false);
        expect(careful.source).toBeNull();
        expect(careful.reason).toBe('review');
        expect(careful.candidate).toBe("Howl's Moving Castle");
        const eager = await makeService(results).service.autoSelectMediaSource('movies', 'El Castillo Ambulante', null, true);
        expect(eager.reason).toBe('first');
        expect(eager.source?.id).toBe('5');
    });

    it('reports nothing found, and does nothing when integrations are off', async () => {
        expect((await makeService({}).service.autoSelectMediaSource('movies', 'Zzzz', null, true)).reason).toBe('none');
        const off = await makeService({ tmdb: [{ id: '1', title: 'A' }] }, false).service.autoSelectMediaSource('movies', 'A', null, true);
        expect(off.reason).toBe('none');
    });
});
