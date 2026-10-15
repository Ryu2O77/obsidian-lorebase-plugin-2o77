import { describe, expect, it } from 'vitest';
import { isResourceUrl, toStoredImagePath } from '../src/services/media/imagePaths';

const appFor = (base: string, existing: string[] = []) => ({
    vault: {
        adapter: { getBasePath: () => base },
        getAbstractFileByPath: (path: string) => (existing.includes(path) ? {} : null),
    },
}) as never;

describe('toStoredImagePath', () => {
    it('turns a session app:// URL back into the vault path', () => {
        const url = 'app://98a3dd5bab2bd247af4edaecf6cba0da6f2e/E:/ObsidianVaults/MediaTracker/files/lorebase/images/movies/The%20Hobbit%20-%20Poster.webp?1790801023070';
        expect(toStoredImagePath(appFor('E:\\ObsidianVaults\\MediaTracker'), url))
            .toBe('files/lorebase/images/movies/The Hobbit - Poster.webp');
    });

    it('finds the vault path when the base folder differs (another machine)', () => {
        const app = appFor('C:/Other', ['files/x/a b.webp']);
        expect(toStoredImagePath(app, 'app://h/D:/Some/Where/files/x/a%20b.webp?1')).toBe('files/x/a b.webp');
    });

    it('leaves paths, remote URLs and empty values alone', () => {
        const app = appFor('E:/V');
        expect(toStoredImagePath(app, 'https://image.tmdb.org/t/p/w500/a.jpg?x=1')).toBe('https://image.tmdb.org/t/p/w500/a.jpg?x=1');
        expect(toStoredImagePath(app, 'files/a.jpg')).toBe('files/a.jpg');
        expect(toStoredImagePath(null, '')).toBe('');
        expect(isResourceUrl('data:image/png;base64,AA')).toBe(false);
    });
});
