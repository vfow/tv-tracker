import type { DiscoverListingItem } from './discoverViewModel';
import type { CollectionEyeKey, CollectionOption } from './collectionViewModel';
import type { DiscoverMediaType } from './contracts';

export type PersonViewModel = Readonly<{
  id: string; name: string; role: string; media: DiscoverMediaType;
  bodyState: 'loading' | 'error' | 'ready' | 'empty'; error: string;
  emptyTitle: string; emptyMessage: string;
  tvRoute: string; movieRoute: string; roles: readonly CollectionOption[];
  eyes: Readonly<Record<CollectionEyeKey, boolean>>;
  items: readonly Readonly<DiscoverListingItem & { roleLabel: string }>[];
  profile: Readonly<{ photoUrl: string; biography: string; longBio: boolean; watched: number; total: number; percent: number }> | null;
}>;
export type PersonActions = Readonly<{
  back: () => void;
  setMedia: (media: DiscoverMediaType) => Promise<void>;
  setRole: (role: string) => Promise<void>;
  toggleEye: (key: CollectionEyeKey) => Promise<void>;
  openMedia: (item: DiscoverListingItem) => Promise<void>;
}>;
