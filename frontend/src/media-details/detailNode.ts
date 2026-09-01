export type DetailNodeAttribute = string | number | boolean;

export type DetailTextNode = Readonly<{
  kind: 'text';
  text: string;
}>;

export type DetailElementNode = Readonly<{
  kind: 'element';
  tag: string;
  attrs: Readonly<Record<string, DetailNodeAttribute>>;
  children: readonly DetailNode[];
}>;

export type DetailNode = DetailTextNode | DetailElementNode;

export type DetailNodeList = readonly DetailNode[];
