import type { DiscoverListingItem } from './discoverViewModel';

export type CollectionEyeKey = 'fadeWatched' | 'hideWatched' | 'hidePlan' | 'hideFavorites';
export type CollectionFilterKey = 'year' | 'decade' | 'genre' | 'language' | 'sort';
export type CollectionFilters = Readonly<Record<CollectionEyeKey, boolean> & {
  year: string; decade: string; genres: readonly string[]; language: string; sort: string;
}>;
export type CollectionOption = Readonly<{ value: string; label: string; selected: boolean }>;
export type CollectionChip = Readonly<{ key: string; value: string; label: string }>;
export type CollectionViewModel = Readonly<{
  id: string; title: string; route: string;
  bodyState: 'loading' | 'error' | 'ready' | 'empty'; error: string; emptyMessage: string;
  showFilters: boolean; countLabel: string; filters: CollectionFilters;
  items: readonly DiscoverListingItem[];
  genres: readonly CollectionOption[]; languages: readonly CollectionOption[];
  sorts: readonly CollectionOption[]; decades: readonly CollectionOption[];
  years: readonly CollectionOption[]; chips: readonly CollectionChip[];
  yearLabel: string; visibleDecade: number; currentDecade: number;
}>;
export type CollectionActions = Readonly<{
  back: () => void;
  setFilter: (key: CollectionFilterKey, value: string) => void;
  removeFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  toggleEye: (key: CollectionEyeKey) => void;
  openMedia: (item: DiscoverListingItem, route: string) => Promise<void>;
}>;
