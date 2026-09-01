import type { DetailNodeList } from './detailNode';

export interface ShowDetailsViewModel {
  readonly surface: 'show';
  readonly showId: string;
  readonly title: string;
  readonly backdropStyle: string;
  readonly poster: DetailNodeList;
  readonly meta: DetailNodeList;
  readonly externalLinks: DetailNodeList;
  readonly actions: DetailNodeList;
  readonly tabs: DetailNodeList;
  readonly tabContent: DetailNodeList;
  readonly similar: DetailNodeList;
}

export type ShowDetailsVueOwner = Readonly<{
  render: (model: ShowDetailsViewModel) => void;
  unmount: () => void;
}>;

export type ShowDetailsVueBridge = Readonly<{
  attachVueOwner: (owner: ShowDetailsVueOwner) => void;
  render: (show?: unknown, options?: unknown) => void;
  renderLoadFailure: () => void;
  buildViewModel: (show?: unknown, options?: unknown) => ShowDetailsViewModel;
  ownership: 'vue-dom';
}>;
