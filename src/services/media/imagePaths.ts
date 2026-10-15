import type { App } from 'obsidian';

/**
 * Obsidian turns a vault file into a session-specific resource URL such as
 * `app://<hash>/E:/Vaults/MyVault/files/poster.webp?1790704235998`. The hash changes between
 * sessions, so such a value must never be stored in a note: it stops working the next time
 * Obsidian starts. These helpers turn it back into the vault-relative path.
 */

const RESOURCE_URL = /^(app|capacitor|file):\/\//i;
const LOCALHOST_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i;

export function isResourceUrl(value: string): boolean {
    const text = value.trim();
    return RESOURCE_URL.test(text) || LOCALHOST_URL.test(text);
}

function readBasePath(app: App | null): string {
    const adapter = app?.vault?.adapter as { getBasePath?: () => string } | undefined;
    try {
        return (adapter?.getBasePath?.() ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
    } catch {
        return '';
    }
}

/**
 * Returns a vault-relative path for a resource URL, or the value unchanged when it is already a
 * path, a remote https URL, a data/blob URL or empty.
 */
export function toStoredImagePath(app: App | null, value: string): string {
    const text = (value ?? '').trim();
    if (!text || !isResourceUrl(text)) return text;

    let rest = text.split('#')[0].split('?')[0];
    rest = rest.replace(/^[a-z]+:\/\/[^/]*\/?/i, '');
    try {
        rest = decodeURIComponent(rest);
    } catch {
        // keep the raw text when it is not valid URI data
    }
    rest = rest.replace(/\\/g, '/').replace(/^\/+/, '');

    const base = readBasePath(app).replace(/^\/+/, '');
    if (base && rest.toLowerCase().startsWith(`${base.toLowerCase()}/`)) {
        return rest.slice(base.length + 1);
    }

    // Different machine or unknown base path: find the longest tail that exists in this vault.
    const segments = rest.split('/').filter(Boolean);
    if (app?.vault?.getAbstractFileByPath) {
        for (let index = 0; index < segments.length; index++) {
            const candidate = segments.slice(index).join('/');
            if (app.vault.getAbstractFileByPath(candidate)) return candidate;
        }
    }
    return rest;
}
