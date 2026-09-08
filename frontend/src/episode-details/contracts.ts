export interface EpisodePerson {
  readonly id: number;
  readonly name: string;
  readonly role: string;
  readonly routeRole: string;
  readonly route: string;
  readonly photo: string;
}
export interface EpisodePersonGroup {
  readonly label: string;
  readonly people: readonly EpisodePerson[];
}
export interface EpisodeTarget {
  readonly season: number;
  readonly episode: number;
  readonly route: string;
}
export interface EpisodeDetailsModel {
  readonly key: string;
  readonly state: 'loading' | 'ready' | 'error';
  readonly showId: string;
  readonly season: number;
  readonly number: number;
  readonly code: string;
  readonly title: string;
  readonly showTitle: string;
  readonly showRoute: string;
  readonly backdrop: string;
  readonly airDate: string;
  readonly runtime: string;
  readonly rating: string;
  readonly overview: string;
  readonly status: string;
  readonly watchedText: string;
  readonly watched: boolean;
  readonly canToggle: boolean;
  readonly preview: boolean;
  readonly previous: EpisodeTarget | null;
  readonly next: EpisodeTarget | null;
  readonly links: readonly Readonly<{label: string; url: string}>[];
  readonly guests: readonly EpisodePerson[];
  readonly cast: readonly EpisodePerson[];
  readonly crew: readonly EpisodePersonGroup[];
}
export interface EpisodeDetailsActions {
  back(): void;
  navigate(model: EpisodeDetailsModel, target: EpisodeTarget): void;
}
export interface EpisodeDetailsOwner {
  render(model: EpisodeDetailsModel): void;
  unmount(): void;
}
export interface EpisodeDetailsBridge {
  readonly actions: EpisodeDetailsActions;
  attachVueOwner(owner: EpisodeDetailsOwner): void;
}
