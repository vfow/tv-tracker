import type { DetailNodeList } from './detailNode';

export interface MovieDetailsViewModel {
  readonly surface: 'movie';
  readonly state: 'ready' | 'loading' | 'error';
  readonly title: string;
  readonly message: string;
  readonly backdropStyle: string;
  readonly poster: DetailNodeList;
  readonly meta: DetailNodeList;
  readonly externalLinks: DetailNodeList;
  readonly actions: DetailNodeList;
  readonly tabs: DetailNodeList;
  readonly tabContent: DetailNodeList;
}

export type MovieDetailsVueOwner = Readonly<{
  render: (model: MovieDetailsViewModel) => void;
  unmount: () => void;
}>;

export type MovieDetailsVueBridge = Readonly<{
  attachVueOwner: (owner: MovieDetailsVueOwner) => void;
  render: (state?: unknown) => void;
  renderLoadFailure: () => void;
  buildViewModel: (state?: unknown) => MovieDetailsViewModel;
  ownership: 'vue-dom';
}>;
