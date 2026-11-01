/**
 * Hash router (lot 3, GS-V5-04 / GS-V5-17). No dependency, no reload.
 * - From the home screen, opening a screen pushes one history entry, so the browser back
 *   button returns home. Between two non-home screens the entry is replaced, so back still
 *   returns home in one step.
 * - Direct link and back/forward: the requested screen. Unknown hash: home.
 * - Reload (F5): home, except an interrupted reveal (DEF-GS-08). MVP v1.3 P3-3.
 */
import { useSyncExternalStore } from 'react';

export type Route = 'home' | 'invest' | 'friends' | 'partners' | 'quests' | 'work' | 'settings';
export const ROUTES: readonly Route[] = [
  'home',
  'invest',
  'friends',
  'partners',
  'quests',
  'work',
  'settings',
];
const EVENT = 'tgs:route';

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '');
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : 'home';
}

const isReload = (): boolean => {
  const nav = performance.getEntriesByType?.('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  return nav?.type === 'reload';
};

const write = (route: Route, mode: 'push' | 'replace') => {
  const url = `${location.pathname}${location.search}#${route}`;
  if (mode === 'push') history.pushState({ tgs: 1 }, '', url);
  else history.replaceState(history.state, '', url);
  window.dispatchEvent(new Event(EVENT));
};

/**
 * Called once at startup: normalises the hash (unknown → home, reload → home). A direct link
 * to a screen gets a home entry below it, so the back button returns home (GS-V5-17 c).
 */
export function initRoute(): void {
  const wanted = isReload() ? 'home' : parseRoute(location.hash);
  if (wanted === 'home') {
    if (location.hash !== '#home') write('home', 'replace');
    return;
  }
  if ((history.state as { tgs?: number } | null)?.tgs === 1) return; // already set up
  write('home', 'replace');
  write(wanted, 'push');
}

export function currentRoute(): Route {
  return parseRoute(location.hash);
}

export function navigate(to: Route): void {
  const from = currentRoute();
  if (to === from) return;
  if (to === 'home') return goHome();
  write(to, from === 'home' ? 'push' : 'replace');
}

/** Back to home: pops our own entry when there is one, otherwise replaces it. */
export function goHome(): void {
  if (currentRoute() === 'home') return;
  if ((history.state as { tgs?: number } | null)?.tgs === 1) history.back();
  else write('home', 'replace');
}

/** Replaces the current screen without a history entry (resumed reveal). */
export function replaceRoute(to: Route): void {
  if (currentRoute() !== to) write(to, 'replace');
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
    window.removeEventListener(EVENT, cb);
  };
};

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, currentRoute, () => 'home');
}
