import type { HiddenCardParts } from '../../types';
import { FilterState, LibraryViewState, MediaType, SortField, SortOrder, ViewMode } from '../../types';

export interface CardStyleFlags {
    hoverPreview: boolean;
    progressFooter: boolean;
    titleBelow: boolean;
}

export interface ToolbarCallbacks {
    onSortChange: (field: SortField, order: SortOrder) => void;
    onFilterChange: (filter: Partial<FilterState>) => void;
    onSearch: (term: string) => void;
    onAdd: () => void;
    onRandom: () => void;
    onToggleSelection?: () => void;
    onTogether?: () => void;
    onStats: () => void;
    onSettings: () => void;
    onViewModeChange: (mode: ViewMode) => void;
    onViewStateChange: (state: LibraryViewState) => void;
    onApplySavedView: (id: string | null) => void;
    onSaveView: (name: string, state: LibraryViewState) => void;
    onUpdateSavedView: (id: string, state: LibraryViewState) => void;
    onRenameSavedView: (id: string, name: string) => void;
    onDeleteSavedView: (id: string) => void;
    onResetView: () => void;
    onMediaTypeChange: (mediaType: MediaType) => void;
    /** Poster size slider in the view-mode dropdown (grid/horizontal only; scale is 0.6\u20131.6) */
    onCardScaleChange?: (scale: number) => void;
    onHiddenCardPartsChange?: (parts: HiddenCardParts) => void;
    /** Quick shortcuts for Hover preview / Progress footer / Title below in the view-mode dropdown */
    onCardStyleFlagsChange?: (flags: CardStyleFlags) => void;
}

export type TagSummary = {
    id: string;
    label: string;
    count: number;
};

export type TagGroups = {
    planTags?: TagSummary[];
    tags: TagSummary[];
    genres: TagSummary[];
};
