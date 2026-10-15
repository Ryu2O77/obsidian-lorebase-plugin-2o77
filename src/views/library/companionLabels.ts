import { t } from '../../localization';
import type { CompanionStatus, MediaItem } from '../../types';

/** Label of each "Status for" status, worded for the media type (playing, reading, watching...). */
export function getCompanionStatusLabels(type: MediaItem['type']): Record<CompanionStatus, string> {
    if (type === 'game') {
        return {
            planned: t('statusWishlist'), watching: t('statusPlaying'), completed: t('statusCompleted'),
            dropped: t('statusDropped'), paused: t('statusPaused'),
        };
    }
    if (type === 'book' || type === 'manga') {
        return {
            planned: t('statusPlanToRead'), watching: t('statusReading'), completed: t('statusReadCompleted'),
            dropped: t('statusDropped'), paused: t('statusPaused'),
        };
    }
    return {
        planned: t('statusPlanned'), watching: t('statusWatching'), completed: t('statusCompleted'),
        dropped: t('statusDropped'), paused: t('statusPaused'),
    };
}
