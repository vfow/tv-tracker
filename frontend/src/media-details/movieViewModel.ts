export interface MovieDetailsViewModel {
  readonly html: string;
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
  ownership: "vue-dom";
}>;
