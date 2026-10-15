import { Menu, MenuItem } from 'obsidian';
import { AnimeItem, BookItem, GameItem, MediaItem, MediaStatus, MovieItem, RatingBadgeMode, ReadingItem, SeriesItem } from '../../types';
import { FILTER_ICON_MAP, RATING_CONFIG, RATING_EMOJI, STATUS_ICON_MAP } from '../../constants';
import { t } from '../../localization';
import { completeAllAnime, completeAllBook, completeAllManga, incrementAnimeEpisode, incrementMangaChapter } from './progressActions';
import { getCompanionStatusLabels } from './companionLabels';
import { buildMassUpdates, MassEditChanges } from './massEdit';
import { COMPANION_STATUSES, parseNameList } from '../../services/media/people';

type MenuItemWithSubmenu = MenuItem & { setSubmenu: () => Menu };

export interface MediaContextMenuDeps {
    isDestroyed: () => boolean;
    getStatusOptions: () => Array<{ status: MediaStatus; label: string }>;
    onApplyFiltersAndSort: () => void;
    onEdit: (item: MediaItem) => void;
    onOpen: (item: MediaItem) => void;
    onDelete: (item: MediaItem) => void;
    onSourceAction?: (item: MediaItem, relink: boolean) => void;
    onItemMutated: (item: MediaItem, changedFields: string[]) => void;
    cardClickAction: 'open' | 'edit';
    ratingMode: RatingBadgeMode;
    updateAnime: (anime: AnimeItem, updates: Partial<AnimeItem>) => void;
    updateGame: (game: GameItem, updates: Partial<GameItem>) => void;
    updateVideo?: (item: MovieItem | SeriesItem, updates: Partial<MovieItem | SeriesItem>) => void;
    updateReading?: (item: ReadingItem, updates: Partial<ReadingItem>) => void;
    onHide?: (item: MediaItem, hidden: boolean) => void;
    getKnownPeople?: () => string[];
    promptPerson?: () => Promise<string | null>;
}

export function showMediaContextMenu(item: MediaItem, x: number, y: number, deps: MediaContextMenuDeps): void {
    if (deps.isDestroyed()) return;

    const menu = new Menu();

    menu.addItem((menuItem) => {
        const submenuHost = menuItem as MenuItemWithSubmenu;
        submenuHost.setTitle(t('contextChangeRating')).setIcon('star');
        const sub = submenuHost.setSubmenu();

        const ratings: Array<{ value: 1 | 2 | 3 | 4 | 5; label: string }> = [
            { value: 5, label: t('ratingAwesome') },
            { value: 4, label: t('ratingGood') },
            { value: 3, label: t('ratingOkay') },
            { value: 2, label: t('ratingWeak') },
            { value: 1, label: t('ratingBad') },
        ];

        for (const rating of ratings) {
            sub.addItem((subItem: MenuItem) => {
                let title: string | DocumentFragment;
                if (deps.ratingMode === 'star') {
                    title = createFragment();
                    const star = title.createSpan({ cls: 'lorebase-context-rating-star', text: '\u2605' });
                    star.style.color = RATING_CONFIG.find((entry) => entry.value === rating.value)?.color
                        ?? 'var(--interactive-accent)';
                    title.createSpan({ text: `${rating.value} \u00b7 ${rating.label}` });
                } else {
                    title = `${RATING_EMOJI[rating.value]} ${rating.label}`;
                }
                subItem.setTitle(title)
                    .onClick(() => {
                        if (deps.isDestroyed()) return;
                        if (item.type === 'anime') {
                            item.userRating = rating.value;
                            deps.onItemMutated(item, ['userRating']);
                            deps.updateAnime(item, { userRating: rating.value });
                        } else if (item.type === 'movie' || item.type === 'series') {
                            item.userRating = rating.value;
                            deps.onItemMutated(item, ['userRating']);
                            deps.updateVideo?.(item, { userRating: rating.value });
                        } else if (item.type === 'book' || item.type === 'manga') {
                            item.userRating = rating.value;
                            deps.onItemMutated(item, ['userRating']);
                            deps.updateReading?.(item, { userRating: rating.value });
                        } else {
                            item.userRating = rating.value;
                            deps.onItemMutated(item, ['userRating']);
                            deps.updateGame(item, { userRating: rating.value });
                        }
                    });
            });
        }

        // Half stars are available for every category.
        sub.addSeparator();
        for (const half of [4.5, 3.5, 2.5, 1.5, 0.5]) {
            sub.addItem((subItem: MenuItem) => {
                subItem.setTitle(`\u2605 ${half}`).onClick(() => {
                    if (deps.isDestroyed()) return;
                    item.userRating = half;
                    deps.onItemMutated(item, ['userRating']);
                    if (item.type === 'anime') deps.updateAnime(item, { userRating: half });
                    else if (item.type === 'movie' || item.type === 'series') deps.updateVideo?.(item, { userRating: half });
                    else if (item.type === 'book' || item.type === 'manga') deps.updateReading?.(item, { userRating: half });
                    else deps.updateGame(item, { userRating: half });
                });
            });
        }

        sub.addItem((subItem: MenuItem) => {
            subItem.setTitle(`${String.fromCodePoint(0x1f9f9)} ${t('contextClear')}`)
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    item.userRating = null;
                    deps.onItemMutated(item, ['userRating']);
                    if (item.type === 'anime') {
                        deps.updateAnime(item, { userRating: null });
                    } else if (item.type === 'movie' || item.type === 'series') {
                        deps.updateVideo?.(item, { userRating: null });
                    } else if (item.type === 'book' || item.type === 'manga') {
                        deps.updateReading?.(item, { userRating: null });
                    } else {
                        deps.updateGame(item, { userRating: null });
                    }
                });
        });
    });

    menu.addItem((menuItem) => {
        const submenuHost = menuItem as MenuItemWithSubmenu;
        submenuHost.setTitle(t('contextChangeStatus')).setIcon('circle');
        const sub = submenuHost.setSubmenu();

        for (const { status, label } of deps.getStatusOptions()) {
            sub.addItem((subItem: MenuItem) => {
                subItem.setTitle(label)
                    .setIcon(STATUS_ICON_MAP[status])
                    .onClick(() => {
                        if (deps.isDestroyed()) return;
                        if (item.type === 'anime') {
                            const nextStatus = status as AnimeItem['status'];
                            const updates: Partial<AnimeItem> = { status: nextStatus };
                            const changedFields = ['status'];
                            item.status = nextStatus;
                            if (nextStatus === 'completed' && !item.finished) {
                                item.finished = getTodayDateInput();
                                updates.finished = item.finished;
                                changedFields.push('finished');
                            }
                            deps.onItemMutated(item, changedFields);
                            deps.updateAnime(item, updates);
                        } else if (item.type === 'movie' || item.type === 'series') {
                            const nextStatus = status as MovieItem['status'];
                            const updates: Partial<MovieItem> = { status: nextStatus };
                            const changedFields = ['status'];
                            item.status = nextStatus;
                            if (nextStatus === 'completed' && !item.finished) {
                                item.finished = getTodayDateInput();
                                updates.finished = item.finished;
                                changedFields.push('finished');
                            }
                            deps.onItemMutated(item, changedFields);
                            deps.updateVideo?.(item, updates);
                        } else if (item.type === 'book' || item.type === 'manga') {
                            const nextStatus = status as ReadingItem['status'];
                            const updates: Partial<ReadingItem> = { status: nextStatus };
                            const changedFields = ['status'];
                            item.status = nextStatus;
                            if (nextStatus === 'completed' && !item.finished) {
                                item.finished = getTodayDateInput();
                                updates.finished = item.finished;
                                changedFields.push('finished');
                            }
                            deps.onItemMutated(item, changedFields);
                            deps.updateReading?.(item, updates);
                        } else {
                            const nextStatus = status as GameItem['status'];
                            const updates: Partial<GameItem> = { status: nextStatus };
                            item.status = nextStatus;
                            const changedFields = ['status'];
                            if (nextStatus === 'completed' && !item.finished) {
                                item.finished = getTodayDateInput();
                                item.dateCompleted = Date.parse(item.finished);
                                updates.finished = item.finished;
                                changedFields.push('finished', 'dateCompleted');
                            }
                            deps.onItemMutated(item, changedFields);
                            deps.updateGame(item, updates);
                        }
                    });
            });
        }
    });

    if (item.type === 'anime') {
        menu.addItem((menuItem) => {
            menuItem.setTitle(t('contextEpisodePlusOne'))
                .setIcon('plus')
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    const mutation = incrementAnimeEpisode(item);
                    deps.onItemMutated(item, mutation.changedFields);
                    deps.updateAnime(item, mutation.updates);
                });
        });
    }

    if (item.type === 'book') {
        menu.addItem((menuItem) => {
            menuItem.setTitle(t('contextPagePlusOne'))
                .setIcon('plus')
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    const current = Number.isFinite(item.pageCurrent) ? Math.max(0, Math.trunc(item.pageCurrent as number)) : 0;
                    const total = Number.isFinite(item.pageTotal) ? Math.max(0, Math.trunc(item.pageTotal as number)) : null;
                    const next = total ? Math.min(current + 1, total) : current + 1;
                    const updates: Partial<BookItem> = { pageCurrent: next };
                    item.pageCurrent = next;
                    if (item.status === 'planned') {
                        item.status = 'watching';
                        updates.status = 'watching';
                    }
                    if (total && next >= total) {
                        item.status = 'completed';
                        updates.status = 'completed';
                    }
                    deps.onItemMutated(item, ['pageCurrent', 'status']);
                    deps.updateReading?.(item, updates);
                });
        });
    }

    if (item.type === 'manga') {
        menu.addItem((menuItem) => {
            menuItem.setTitle(t('contextChapterPlusOne'))
                .setIcon('plus')
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    const mutation = incrementMangaChapter(item);
                    deps.onItemMutated(item, mutation.changedFields);
                    deps.updateReading?.(item, mutation.updates);
                });
        });
    }

    addCompanionMenus(menu, item, deps);

    menu.addSeparator();

    if (deps.onSourceAction) {
        const connected = Boolean(item.integrationProvider && item.integrationId);
        menu.addItem((menuItem) => {
            menuItem
                .setTitle(connected ? t('contextSourceRefresh') : t('contextSourceLink'))
                .setIcon(connected ? 'refresh-cw' : 'link-2')
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    deps.onSourceAction?.(item, false);
                });
        });
        if (connected) {
            menu.addItem((menuItem) => {
                menuItem
                    .setTitle(t('contextSourceChange'))
                    .setIcon('repeat-2')
                    .onClick(() => {
                        if (deps.isDestroyed()) return;
                        deps.onSourceAction?.(item, true);
                    });
            });
        }
        menu.addSeparator();
    }

    if (item.type === 'anime') {
        menu.addItem((menuItem) => {
            menuItem.setTitle(t('seriesCompleteAll')).setIcon('check-check').onClick(() => {
                if (deps.isDestroyed()) return;
                const mutation = completeAllAnime(item);
                deps.onItemMutated(item, mutation.changedFields);
                deps.updateAnime(item, mutation.updates);
            });
        });
    }

    if (item.type === 'manga') {
        menu.addItem((menuItem) => {
            menuItem.setTitle(t('mangaCompleteAll')).setIcon('check-check').onClick(() => {
                if (deps.isDestroyed()) return;
                const mutation = completeAllManga(item);
                deps.onItemMutated(item, mutation.changedFields);
                deps.updateReading?.(item, mutation.updates);
            });
        });
    }

    if (item.type === 'book') {
        menu.addItem((menuItem) => {
            menuItem.setTitle(t('bookCompleteAll')).setIcon('check-check').onClick(() => {
                if (deps.isDestroyed()) return;
                const mutation = completeAllBook(item);
                deps.onItemMutated(item, mutation.changedFields);
                deps.updateReading?.(item, mutation.updates);
            });
        });
    }

    if (item.type === 'series') {
        menu.addItem((menuItem) => {
            menuItem.setTitle(t('seriesCompleteAll')).setIcon('check-check').onClick(() => {
                if (deps.isDestroyed()) return;
                item.status = 'completed';
                if (!item.finished) item.finished = getTodayDateInput();
                deps.onItemMutated(item, ['status', 'finished']);
                deps.updateVideo?.(item, { status: 'completed', finished: item.finished });
            });
        });
    }

    menu.addItem((menuItem) => {
        menuItem.setTitle(item.favorite ? t('contextRemoveFavorite') : t('contextAddFavorite'))
            .setIcon(FILTER_ICON_MAP.favorite)
            .onClick(() => {
                if (deps.isDestroyed()) return;
                item.favorite = !item.favorite;
                deps.onItemMutated(item, ['favorite']);
                if (item.type === 'anime') {
                    deps.updateAnime(item, { favorite: item.favorite });
                } else if (item.type === 'movie' || item.type === 'series') {
                    deps.updateVideo?.(item, { favorite: item.favorite });
                } else if (item.type === 'book' || item.type === 'manga') {
                    deps.updateReading?.(item, { favorite: item.favorite });
                } else {
                    deps.updateGame(item, { favorite: item.favorite });
                }
            });
    });

    menu.addSeparator();

    menu.addItem((menuItem) => {
        const opensEditorOnClick = deps.cardClickAction === 'edit';
        menuItem.setTitle(opensEditorOnClick ? t('editOpen') : t('contextEdit'))
            .setIcon(opensEditorOnClick ? 'file-text' : 'pencil')
            .onClick(() => {
                if (deps.isDestroyed()) return;
                if (opensEditorOnClick) deps.onOpen(item);
                else deps.onEdit(item);
            });
    });

    if (deps.onHide) {
        const hidden = item.rawFields?.lorebase_hidden === true;
        menu.addItem((menuItem) => {
            menuItem.setTitle(hidden ? t('contextUnhide') : t('contextHide'))
                .setIcon(hidden ? 'eye' : 'eye-off')
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    deps.onHide?.(item, !hidden);
                });
        });
    }

    menu.addItem((menuItem) => {
        menuItem.setTitle(t('contextDelete'))
            .setIcon('trash-2')
            .onClick(() => {
                if (deps.isDestroyed()) return;
                deps.onDelete(item);
            });
    });

    menu.showAtPosition({ x, y });
}

function applyCompanionChange(
    item: MediaItem,
    change: MassEditChanges,
    deps: MediaContextMenuDeps
): void {
    if (deps.isDestroyed()) return;
    const updates = buildMassUpdates(item, change);
    const fields = Object.keys(updates);
    if (!fields.length) return;
    Object.assign(item, updates);
    deps.onItemMutated(item, fields);
    if (item.type === 'game') deps.updateGame(item, updates as Partial<GameItem>);
    else if (item.type === 'anime') deps.updateAnime(item, updates as Partial<AnimeItem>);
    else if (item.type === 'book' || item.type === 'manga') deps.updateReading?.(item, updates as Partial<ReadingItem>);
    else deps.updateVideo?.(item, updates as Partial<MovieItem | SeriesItem>);
}

/** "Status for" people toggles, plus status and rating pickers for each person listed. */
function addCompanionMenus(menu: Menu, item: MediaItem, deps: MediaContextMenuDeps): void {
    const statusLabels = getCompanionStatusLabels(item.type);
    const same = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase();
    const listed = item.watchedWith ?? [];

    menu.addItem((menuItem) => {
        const host = menuItem as MenuItemWithSubmenu;
        host.setTitle(t('contextWatchedWith')).setIcon('users');
        const sub = host.setSubmenu();
        for (const name of parseNameList([...(deps.getKnownPeople?.() ?? []), ...listed])) {
            const active = listed.some((entry) => same(entry, name));
            sub.addItem((subItem: MenuItem) => {
                subItem.setTitle(name).setChecked(active).onClick(() => {
                    applyCompanionChange(item, active ? { watchedWithRemove: [name] } : { watchedWithAdd: [name] }, deps);
                });
            });
        }
        const prompt = deps.promptPerson;
        if (prompt) {
            sub.addItem((subItem: MenuItem) => {
                subItem.setTitle(t('contextNewPerson')).setIcon('plus').onClick(() => {
                    void prompt().then((name) => {
                        if (name) applyCompanionChange(item, { watchedWithAdd: [name] }, deps);
                    });
                });
            });
        }
    });

    for (const name of listed) {
        const current = (item.companions ?? []).find((entry) => same(entry.name, name));
        const currentStatusLabel = current?.status ? statusLabels[current.status] : undefined;
        menu.addItem((menuItem) => {
            const host = menuItem as MenuItemWithSubmenu;
            const statusTitle = `${name} \u00B7 ${t('contextPersonStatus')}`;
            host.setTitle(currentStatusLabel ? `${statusTitle} (${currentStatusLabel})` : statusTitle).setIcon('user-check');
            const sub = host.setSubmenu();
            for (const status of COMPANION_STATUSES) {
                sub.addItem((subItem: MenuItem) => {
                    subItem.setTitle(statusLabels[status]).setChecked(current?.status === status)
                        .onClick(() => applyCompanionChange(item, { person: { name, status } }, deps));
                });
            }
            sub.addItem((subItem: MenuItem) => {
                subItem.setTitle(`${String.fromCodePoint(0x1f9f9)} ${t('contextClear')}`)
                    .onClick(() => applyCompanionChange(item, { person: { name, status: null } }, deps));
            });
        });
        menu.addItem((menuItem) => {
            const host = menuItem as MenuItemWithSubmenu;
            const ratingTitle = `${name} \u00B7 ${t('contextPersonRating')}`;
            host.setTitle(current?.rating ? `${ratingTitle} (${current.rating} \u2605)` : ratingTitle).setIcon('star-half');
            const sub = host.setSubmenu();
            for (let step = 10; step >= 1; step--) {
                const rating = step / 2;
                sub.addItem((subItem: MenuItem) => {
                    subItem.setTitle(`${rating} \u2605`).setChecked(current?.rating === rating)
                        .onClick(() => applyCompanionChange(item, { person: { name, rating } }, deps));
                });
            }
            sub.addItem((subItem: MenuItem) => {
                subItem.setTitle(`${String.fromCodePoint(0x1f9f9)} ${t('contextClear')}`)
                    .onClick(() => applyCompanionChange(item, { person: { name, rating: null } }, deps));
            });
        });
    }
}

function getTodayDateInput(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
