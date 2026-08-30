import type { DiscoverMediaType } from './contracts';

export type DiscoverBodyState = 'loading' | 'error' | 'ready';

export type DiscoverPosterItem = Readonly<{
  id: number;
  media: DiscoverMediaType;
  name: string;
  route: string;
  posterUrl: string;
  placeholderLabel: string;
  year: string;
  adult: boolean;
  posterPath: string;
  overview: string;
  firstAirDate: string;
  releaseDate: string;
}>;

export type DiscoverRow = Readonly<{
  key: string;
  title: string;
  route: string;
  items: readonly DiscoverPosterItem[];
}>;

export type DiscoverCollectionPosterSlot = Readonly<{
  imageUrl: string;
  label: string;
}>;

export type DiscoverCollectionItem = Readonly<{
  id: number;
  name: string;
  route: string;
  countLabel: string;
  posterSlots: readonly DiscoverCollectionPosterSlot[];
}>;

export type DiscoverGenreItem = Readonly<{
  id: number;
  name: string;
  route: string;
  toneClass: string;
}>;

export type DiscoverViewModel = Readonly<{
  bodyState: DiscoverBodyState;
  error: string;
  tvRows: readonly DiscoverRow[];
  movieRows: readonly DiscoverRow[];
  collections: readonly DiscoverCollectionItem[];
  genres: Readonly<{
    tv: readonly DiscoverGenreItem[];
    movie: readonly DiscoverGenreItem[];
  }>;
  activeGenreMedia: DiscoverMediaType;
}>;

export type DiscoverRendererActions = Readonly<{
  setGenreMedia: (media: DiscoverMediaType) => void;
  openMedia: (item: DiscoverPosterItem) => Promise<void>;
}>;
