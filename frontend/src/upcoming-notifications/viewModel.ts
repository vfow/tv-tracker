export type UpcomingNotificationsSurface = 'upcoming' | 'notifications';

export interface UpcomingNotificationsViewModel {
  readonly surface: UpcomingNotificationsSurface;
  readonly html: string;
}

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
