import type { DiscoverListingItem } from './discoverViewModel';
import type { DiscoverMediaType } from './contracts';
import type { CollectionEyeKey } from './collectionViewModel';
export type BrowseChoice = Readonly<{ key: string; value: string; label: string; selected: boolean; multi?: boolean; search?: string; logo?: string }>;
export type BrowseMenu = Readonly<{ key: string; label: string; searchLabel?: string; empty: string; choices: readonly BrowseChoice[] }>;
export type BrowsePickerType = 'theme' | 'company' | 'network';
export type BrowsePickerItem = Readonly<{ id: string; name: string; label: string; country: string; logo: string }>;
export type BrowseControlsModel = Readonly<{
  media: DiscoverMediaType; menus: readonly BrowseMenu[]; yearLabel: string; currentDecade: number; selectedDecade: number; year: string;
  upcoming: boolean; eyes: Readonly<Record<CollectionEyeKey, boolean>>;
  chips: readonly BrowseChoice[]; showClear: boolean;
  selectedPickers: Readonly<Record<BrowsePickerType, readonly BrowseChoice[]>>;
  otherChoices: readonly BrowseChoice[];
}>;
export type BrowseListingModel = Readonly<{
  kind: 'browse' | 'genre' | 'discovery'; identity: string; route: string; media: DiscoverMediaType;
  title: string; showMedia: boolean; controls: BrowseControlsModel | null;
  bodyState: 'ready' | 'loading' | 'error' | 'empty'; error: string; errorTitle: string;
  emptyTitle: string; emptyMessage: string; loadingMore: boolean; hasMore: boolean;
  items: readonly DiscoverListingItem[];
}>;
export type BrowseActions = Readonly<{
  back: () => void; setMedia: (media: DiscoverMediaType) => Promise<void>;
  choose: (choice: BrowseChoice) => Promise<void>; remove: (choice: BrowseChoice) => Promise<void>;
  clear: () => Promise<void>; toggleEye: (key: CollectionEyeKey) => Promise<void>;
  searchPicker: (type: BrowsePickerType, query: string) => Promise<readonly BrowsePickerItem[]>;
  openMedia: (item: DiscoverListingItem) => Promise<void>; viewMore: () => Promise<void>;
}>;
