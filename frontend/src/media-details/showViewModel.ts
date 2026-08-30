export interface ShowDetailsViewModel {
  readonly html: string;
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
  ownership: "vue-dom";
}>;
