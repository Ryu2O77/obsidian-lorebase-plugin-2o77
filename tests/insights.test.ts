import { describe, expect, it } from 'vitest';
import {
    completedPerMonth, computeCompanionStats, franchiseProgress, isPendingTogether,
    normalizeTitle, pickBestMatch, pickRandom, titleSimilarity,
} from '../src/services/media/insights';

const item = (over: Record<string, unknown> = {}) => ({
    filePath: 'x', displayName: 'X', status: 'planned', companions: [], ...over,
}) as never;

describe('title matching', () => {
    it('ignores case, accents, punctuation and articles', () => {
        expect(normalizeTitle('El Castillo Ambulante')).toBe('castillo ambulante');
        expect(titleSimilarity('Kiki: entregas a domicilio', 'kiki entregas a domicilio')).toBe(1);
        expect(titleSimilarity('Amélie', 'Amelie')).toBe(1);
    });

    it('prefers the candidate whose year matches', () => {
        const result = pickBestMatch('Dune', 2021, [{ title: 'Dune', year: '1984' }, { title: 'Dune', year: '2021' }]);
        expect(result.candidate?.year).toBe('2021');
        expect(result.confident).toBe(true);
    });

    it('does not claim confidence for loosely related or unrelated results', () => {
        expect(pickBestMatch('Dune 2', null, [{ title: 'Dune: Part Two' }]).confident).toBe(false);
        expect(pickBestMatch('Totoro', null, [{ title: 'Shrek' }]).confident).toBe(false);
        expect(pickBestMatch('Totoro', null, []).candidate).toBeNull();
    });
});

describe('what do we watch today', () => {
    it('needs me and everyone listed to still be pending', () => {
        const her = (status: string | null) => [{ name: 'Isita', status, rating: null }];
        expect(isPendingTogether(item({ status: 'planned', companions: her('planned') }))).toBe(true);
        expect(isPendingTogether(item({ status: 'watching', companions: her(null) }))).toBe(true);
        expect(isPendingTogether(item({ status: 'completed', companions: her('planned') }))).toBe(false);
        expect(isPendingTogether(item({ status: 'planned', companions: her('completed') }))).toBe(false);
        expect(isPendingTogether(item({ status: 'planned', companions: her('dropped') }))).toBe(false);
        expect(isPendingTogether(item({ status: 'planned', companions: [] }))).toBe(false);
    });

    it('picks deterministically with an injected random', () => {
        expect(pickRandom(['a', 'b', 'c'], () => 0.5)).toBe('b');
        expect(pickRandom(['a', 'b', 'c'], () => 0.999)).toBe('c');
        expect(pickRandom([])).toBeNull();
    });
});

describe('franchise progress', () => {
    it('counts completed items and suggests the oldest pending one', () => {
        const result = franchiseProgress([
            item({ displayName: 'Part 3', year: 2024, status: 'planned' }),
            item({ displayName: 'Part 1', year: 2019, status: 'completed' }),
            item({ displayName: 'Part 2', year: 2021, status: 'planned' }),
            item({ displayName: 'Spin-off', year: 2020, status: 'dropped' }),
        ] as never[]);
        expect(result.done).toBe(1);
        expect(result.total).toBe(4);
        expect((result.next as { displayName: string }).displayName).toBe('Part 2');
        expect(franchiseProgress([item({ status: 'completed' })] as never[]).next).toBeNull();
    });
});

describe('completed per month', () => {
    it('fills empty months and only counts completed items with a date', () => {
        const buckets = completedPerMonth([
            item({ status: 'completed', finished: '2026-09-23' }),
            item({ status: 'completed', finished: '2026-09-01' }),
            item({ status: 'completed', finished: '2026-07-10' }),
            item({ status: 'planned', finished: '2026-08-10' }),
            item({ status: 'completed' }),
        ] as never[], 3, new Date(2026, 8, 30));
        expect(buckets.map((bucket) => `${bucket.key}:${bucket.count}`)).toEqual(['2026-07:1', '2026-08:0', '2026-09:2']);
    });

    it('rolls over the year boundary', () => {
        const buckets = completedPerMonth([], 3, new Date(2026, 0, 15));
        expect(buckets.map((bucket) => bucket.key)).toEqual(['2025-11', '2025-12', '2026-01']);
    });
});

describe('stats for the two of you', () => {
    it('compares ratings using the exact half-star value and ranks disagreements', () => {
        const her = (status: string, rating: number | null) => [{ name: 'Isita', status, rating }];
        const stats = computeCompanionStats([
            item({ displayName: 'A', status: 'completed', userRating: 4, rawFields: { rating_exact: 4.5 }, companions: her('completed', 4.5) }),
            item({ displayName: 'B', status: 'completed', userRating: 2, companions: her('completed', 5) }),
            item({ displayName: 'C', status: 'planned', companions: her('planned', null) }),
            item({ displayName: 'D', status: 'completed', userRating: 3, companions: [] }),
        ] as never[]);
        expect(stats).toHaveLength(1);
        expect(stats[0].name).toBe('Isita');
        expect(stats[0].shared).toBe(3);
        expect(stats[0].bothCompleted).toBe(2);
        expect(stats[0].bothRated).toBe(2);
        expect(stats[0].avgMine).toBe(3.3);
        expect(stats[0].avgTheirs).toBe(4.8);
        expect(stats[0].disagreements).toEqual([{ name: 'B', mine: 2, theirs: 5 }]);
    });
});
