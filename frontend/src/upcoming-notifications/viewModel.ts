export type UpcomingNotificationsSurface = 'upcoming' | 'notifications';

export type UpcomingSurfaceState = 'loading' | 'ready' | 'empty';
export type NotificationsSurfaceState = 'loading' | 'ready' | 'empty' | 'error';

export interface UpcomingBatchEpisodeViewModel {
  readonly key: string;
  readonly showId: string;
  readonly season: number;
  readonly episode: number;
  readonly label: string;
  readonly timeLabel: string;
  readonly route: string;
  readonly imageUrl: string;
  readonly canLog: boolean;
}

export interface UpcomingEpisodeViewModel {
  readonly key: string;
  readonly showId: string;
  readonly season: number;
  readonly episode: number;
  readonly showTitle: string;
  readonly episodeLabel: string;
  readonly timeLabel: string;
  readonly route: string;
  readonly imageUrl: string;
  readonly canLog: boolean;
  readonly isNew: boolean;
  readonly behindText: string;
  readonly batchKey: string;
  readonly batchOpen: boolean;
  readonly extraEpisodes: readonly UpcomingBatchEpisodeViewModel[];
}

export interface UpcomingGroupViewModel {
  readonly name: string;
  readonly showNotificationBell: boolean;
  readonly items: readonly UpcomingEpisodeViewModel[];
}

export interface UpcomingViewModel {
  readonly surface: 'upcoming';
  readonly state: UpcomingSurfaceState;
  readonly groups: readonly UpcomingGroupViewModel[];
  readonly unread: boolean;
  readonly bellIcon: string;
}

export interface NotificationItemViewModel {
  readonly id: string;
  readonly message: string;
  readonly timeLabel: string;
  readonly route: string;
  readonly imageUrl: string;
}

export interface NotificationsViewModel {
  readonly surface: 'notifications';
  readonly state: NotificationsSurfaceState;
  readonly items: readonly NotificationItemViewModel[];
  readonly bellIcon: string;
  readonly settingsIcon: string;
}

export type UpcomingNotificationsViewModel = UpcomingViewModel | NotificationsViewModel;

export type UpcomingNotificationsVueOwner = Readonly<{
  render: (model: UpcomingNotificationsViewModel) => void;
  unmount: (surface?: UpcomingNotificationsSurface) => void;
}>;

export type UpcomingNotificationsVueBridge = Readonly<{
  attachVueOwner: (owner: UpcomingNotificationsVueOwner) => void;
  renderUpcoming: (startBackgroundRefresh?: boolean) => Promise<void>;
  renderNotificationsPage: () => Promise<void>;
  ownership: 'vue-dom';
}>;
