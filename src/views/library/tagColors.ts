/** Notion-like option colors for the table view. */
export const OPTION_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const;
export type OptionColor = typeof OPTION_COLORS[number];

/** Colors given by default (gray is left for the user to pick on purpose). */
const DEFAULT_COLORS: OptionColor[] = ['brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

export function isOptionColor(value: unknown): value is OptionColor {
    return typeof value === 'string' && (OPTION_COLORS as readonly string[]).includes(value);
}

/** Same value always gets the same color until the user chooses another one. */
export function defaultOptionColor(value: string): OptionColor {
    let hash = 5381;
    const text = value.trim().toLocaleLowerCase();
    for (let index = 0; index < text.length; index++) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
    return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
}

export function resolveOptionColor(saved: Record<string, string> | undefined, value: string): OptionColor {
    const chosen = saved?.[value.trim().toLocaleLowerCase()];
    return isOptionColor(chosen) ? chosen : defaultOptionColor(value);
}
