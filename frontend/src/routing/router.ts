export type ParsedAppRoute = Readonly<{
  valid: boolean;
  canonicalRoute: string;
  type: string;
} & Record<string, unknown>>;

export type NavigateOptions = Readonly<{
  replace?: boolean;
  source?: string;
}>;

type LegacyRouter = Readonly<{
  parseRoute: (pathname: string, search?: string) => ParsedAppRoute;
  setPathRoute: (route: string, replace?: boolean) => void;
  applyRoute: (source?: string) => void;
}>;

type RouterRuntime = typeof globalThis & {
  TVTrackerRouter?: LegacyRouter;
};

function legacyRouter(): LegacyRouter {
  const owner = (globalThis as RouterRuntime).TVTrackerRouter;
  if (!owner) {
    throw new Error('TV Tracker router is not available');
  }
  return owner;
}

function parse(pathname: string, search = ''): ParsedAppRoute {
  return legacyRouter().parseRoute(pathname, search);
}

function navigate(route: string, options: NavigateOptions = {}): boolean {
  const owner = legacyRouter();
  const url = new URL(route, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/app')) {
    return false;
  }

  const parsed = owner.parseRoute(url.pathname, url.search);
  if (!parsed.valid || !parsed.canonicalRoute) {
    return false;
  }

  owner.setPathRoute(parsed.canonicalRoute, options.replace === true);
  owner.applyRoute(options.source ?? 'vue');
  return true;
}

export const router = Object.freeze({
  parse,
  navigate
});
