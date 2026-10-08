import versions from '../content/plotlineExampleVersions.json' with { type: 'json' };

// Public assets keep stable filenames; a content version refreshes browser/CDN caches.
export function plotlineExampleUrl(screen) {
  return `/assets/plotline/examples/${screen}.jpg?v=${versions[screen]}`;
}
