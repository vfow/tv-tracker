import type { SearchEyeState, SearchMediaType } from './contracts';

export type SearchPosterItem = Readonly<{
  kind: 'media';
  id: number;
  media: 'tv' | 'movie';
  name: string;
  route: string;
  posterUrl: string;
  placeholderLabel: string;
  year: string;
  ratingLabel: string;
  adult: boolean;
  eyeFaded: boolean;
  posterPath: string;
  overview: string;
  firstAirDate: string;
  releaseDate: string;
}>;

export type SearchPersonItem = Readonly<{
  kind: 'person';
  id: number;
  name: string;
  route: string;
  photoUrl: string;
}>;

export type SearchCollectionPosterSlot = Readonly<{
  imageUrl: string;
  label: string;
}>;

export type SearchCollectionItem = Readonly<{
  kind: 'collection';
  id: number;
  name: string;
  route: string;
  countLabel: string;
  posterSlots: readonly SearchCollectionPosterSlot[];
}>;

export type SearchResultItem = SearchPosterItem | SearchPersonItem | SearchCollectionItem;
export type SearchBodyState = 'prompt' | 'loading' | 'results' | 'empty';

export type SearchViewModel = Readonly<{
  query: string;
  media: SearchMediaType;
  loading: boolean;
  page: number;
  totalPages: number;
  visibleLimit: number;
  eyeState: SearchEyeState;
  eyeMenuOpen: boolean;
  liveDiscover: boolean;
  bodyState: SearchBodyState;
  emptyHeading: string;
  canLoadMore: boolean;
  items: readonly SearchResultItem[];
}>;

export type SearchRendererActions = Readonly<{
  setMedia: (media: SearchMediaType) => void;
  loadMore: () => void;
  openMedia: (item: SearchPosterItem) => void | Promise<void>;
  openPerson: (item: SearchPersonItem) => void | Promise<void>;
  openCollection: (item: SearchCollectionItem) => void | Promise<void>;
}>;
