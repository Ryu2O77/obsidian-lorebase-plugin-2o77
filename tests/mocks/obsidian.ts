export class App {}

export class TFile {
    path: string;
    basename: string;
    name: string;
    extension: string;
    stat: { ctime: number; mtime: number };

    constructor(path: string = '', basename: string = '') {
        this.path = path;
        this.basename = basename;
        this.name = basename ? `${basename}.md` : '';
        this.extension = 'md';
        this.stat = { ctime: Date.now(), mtime: Date.now() };
    }
}

export class TFolder {
    path: string;
    name: string;

    constructor(path: string = '') {
        this.path = path;
        this.name = path.split('/').pop() ?? path;
    }
}

export class Modal {
    app: App;
    contentEl: HTMLElement;
    modalEl: HTMLElement;

    constructor(app: App) {
        this.app = app;
        this.contentEl = {} as HTMLElement;
        this.modalEl = {} as HTMLElement;
    }

    open(): void {
        return;
    }

    close(): void {
        return;
    }
}

export class Notice {
    constructor(_message: string, _timeout?: number) {
        return;
    }
}

if (typeof window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
        value: {
            setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
        },
        configurable: true,
    });
}

type RequestUrlOptions = string | { url: string; method?: string; headers?: Record<string, string>; body?: string | ArrayBuffer };
type RequestUrlResponse = { json: unknown; text?: string; arrayBuffer: ArrayBuffer; headers: Record<string, string>; status: number };
type RequestUrlMock = (options: RequestUrlOptions) => Promise<Partial<RequestUrlResponse>> | Partial<RequestUrlResponse>;

let requestUrlMock: RequestUrlMock | null = null;

export function __setRequestUrlMock(mock: RequestUrlMock | null): void {
    requestUrlMock = mock;
}

export async function requestUrl(options: RequestUrlOptions): Promise<RequestUrlResponse> {
    if (!requestUrlMock) {
        throw new Error('requestUrl mock is not configured');
    }
    const response = await requestUrlMock(options);
    const result = {
        arrayBuffer: response.arrayBuffer ?? new ArrayBuffer(0),
        headers: response.headers ?? {},
        status: response.status ?? 200,
    } as RequestUrlResponse;
    for (const key of ['json', 'text'] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(response, key);
        if (descriptor) {
            Object.defineProperty(result, key, descriptor);
        } else {
            result[key] = response[key] as never;
        }
    }
    return result;
}

export function setIcon(): void {
    return;
}

/** Records menu structure so context-menu logic can be tested without Obsidian. */
export class MenuItem {
    title: unknown = '';
    checked = false;
    clickHandler: (() => void) | null = null;
    submenu: Menu | null = null;
    setTitle(title: unknown): this { this.title = title; return this; }
    setIcon(_icon: string): this { return this; }
    setChecked(checked: boolean | null): this { this.checked = Boolean(checked); return this; }
    onClick(handler: () => void): this { this.clickHandler = handler; return this; }
    setSubmenu(): Menu { this.submenu = new Menu(); return this.submenu; }
}

export class Menu {
    static shown: Menu[] = [];
    items: MenuItem[] = [];
    addItem(build: (item: MenuItem) => void): this {
        const item = new MenuItem();
        build(item);
        this.items.push(item);
        return this;
    }
    addSeparator(): this { return this; }
    showAtPosition(_position: { x: number; y: number }): void { Menu.shown.push(this); }
}
