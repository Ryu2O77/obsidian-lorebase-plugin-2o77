/**
 * Lets some notes live inside a library folder without showing up as cards
 * (for example a database/index note created by another plugin).
 *
 * A note is hidden when:
 *  - its frontmatter has `lorebase_hidden: true`, or
 *  - its path matches a pattern from the settings (one per line; `*` is a wildcard;
 *    a pattern without "/" also matches the file name; a trailing "/" matches a folder).
 *
 * "Show hidden items" turns the filter off so hidden notes can be found and un-hidden.
 */
export const HIDDEN_KEY = 'lorebase_hidden';

export interface HiddenFilesConfig {
    patterns: string;
    showHidden: boolean;
}

let compiled: RegExp[] = [];
let showHidden = false;

function globToRegExp(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
}

export function parseHiddenPatterns(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
}

export function configureHiddenFiles(config: Partial<HiddenFilesConfig> | undefined): void {
    showHidden = Boolean(config?.showHidden);
    compiled = [];
    for (const pattern of parseHiddenPatterns(config?.patterns ?? '')) {
        const normalized = pattern.replace(/\\/g, '/').replace(/^\/+/, '');
        if (normalized.endsWith('/')) {
            compiled.push(globToRegExp(`${normalized}*`));
        } else if (normalized.includes('/')) {
            compiled.push(globToRegExp(normalized));
            compiled.push(globToRegExp(`${normalized}.md`));
        } else {
            // bare name: match the file name anywhere, with or without the .md extension
            compiled.push(globToRegExp(`*/${normalized}`));
            compiled.push(globToRegExp(`*/${normalized}.md`));
            compiled.push(globToRegExp(normalized));
            compiled.push(globToRegExp(`${normalized}.md`));
        }
    }
}

export function isHiddenByFrontmatter(frontmatter: Record<string, unknown> | null | undefined): boolean {
    const value = frontmatter?.[HIDDEN_KEY];
    return value === true || (typeof value === 'string' && ['true', 'yes', '1'].includes(value.trim().toLowerCase()));
}

export function matchesHiddenPattern(path: string): boolean {
    const normalized = path.replace(/\\/g, '/');
    return compiled.some((regex) => regex.test(normalized));
}

/** True when the note must be left out of the library right now. */
export function isFileHidden(path: string, frontmatter?: Record<string, unknown> | null): boolean {
    if (showHidden) return false;
    return isHiddenByFrontmatter(frontmatter) || matchesHiddenPattern(path);
}
