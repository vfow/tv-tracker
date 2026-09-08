export interface FavoriteSlot {
  readonly kind: 'show' | 'movie';
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly poster: string;
}
export interface ProfileRank {
  readonly name: string;
  readonly count: string;
  readonly percentage: string;
  readonly logo: string;
}
export interface ProfileModel {
  readonly view: 'home' | 'stats';
  readonly identity: Readonly<{username: string; avatar_type: string; avatar_preset: string; avatar_data: string}>;
  readonly headerClass: string;
  readonly headerImage: string;
  readonly watchTime: string;
  readonly episodes: string;
  readonly favorites: readonly Readonly<{kind: 'show' | 'movie'; label: string; slots: readonly FavoriteSlot[]}>[];
  readonly cards: readonly Readonly<{label: string; value: string}>[];
  readonly genres: readonly ProfileRank[];
  readonly networks: readonly ProfileRank[];
  readonly syncText: string;
  readonly syncWarning: boolean;
}
export interface ProfileActions {
  setView(view: 'home' | 'stats'): void;
  editFavorites(kind: 'show' | 'movie'): void;
  openFavorite(item: FavoriteSlot): void;
}
export interface ProfileOwner {
  render(model: ProfileModel): void;
  unmount(): void;
}
export interface ProfileBridge {
  readonly actions: ProfileActions;
  attachVueOwner(owner: ProfileOwner): void;
}
