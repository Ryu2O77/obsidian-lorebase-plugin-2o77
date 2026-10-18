import { AbstractInputSuggest, App, TFile } from 'obsidian';

/** Vault file path suggester, filtered to files whose extension matches `extensions`. */
export class FileSuggest extends AbstractInputSuggest<TFile> {
    private appRef: App;
    private inputEl: HTMLInputElement;
    private extensions: string[];
    private onSelectPath: (path: string) => void;

    constructor(app: App, inputEl: HTMLInputElement, extensions: string[], onSelectPath: (path: string) => void) {
        super(app, inputEl);
        this.appRef = app;
        this.inputEl = inputEl;
        this.extensions = extensions.map((ext) => ext.toLowerCase());
        this.onSelectPath = onSelectPath;
    }

    getSuggestions(query: string): TFile[] {
        const lowerQuery = query.trim().toLowerCase();
        const files = this.appRef.vault.getFiles()
            .filter((file) => this.extensions.includes(file.extension.toLowerCase()));
        if (!lowerQuery) return files.slice(0, 50);
        return files
            .filter((file) => file.path.toLowerCase().includes(lowerQuery))
            .slice(0, 50);
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.setText(file.path);
    }

    selectSuggestion(file: TFile): void {
        this.inputEl.value = file.path;
        this.onSelectPath(file.path);
        this.close();
    }
}
