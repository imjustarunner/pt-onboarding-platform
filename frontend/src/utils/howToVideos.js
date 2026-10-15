const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

export function parseHowToVideoUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    let id;
    if (url.hostname === 'youtu.be' && parts.length === 1) id = parts[0];
    else if (YOUTUBE_HOSTS.has(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (['embed', 'shorts', 'live'].includes(parts[0]) && parts.length === 2) id = parts[1];
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) return null;
    const rawStart = url.searchParams.get('start') || url.searchParams.get('t') || '';
    const time = rawStart.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    const start = /^\d+$/.test(rawStart) ? Number(rawStart) : time ? Number(time[1] || 0) * 3600 + Number(time[2] || 0) * 60 + Number(time[3] || 0) : 0;
    const params = new URLSearchParams({ playsinline: '1', rel: '0', enablejsapi: '1' });
    if (Number.isSafeInteger(start) && start > 0) params.set('start', String(start));
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${params}`,
      watchUrl: `https://www.youtube.com/watch?v=${id}${start > 0 && Number.isSafeInteger(start) ? `&t=${start}s` : ''}`
    };
  } catch {
    return null;
  }
}

export function availableHowToVideos(catalog, { role, agencyId }) {
  return catalog.flatMap((video) => {
    if (!video.id || !video.title) return [];
    if (video.roles?.length && !video.roles.includes(String(role || '').toLowerCase())) return [];
    if (video.agencyIds?.length && !video.agencyIds.some((id) => String(id) === String(agencyId))) return [];
    const urls = parseHowToVideoUrl(video.url);
    return urls ? [{ ...video, ...urls }] : [];
  });
}

export function isHowToVideoRelevant(video, route) {
  if (!video.routeNames?.length && !video.pathPrefixes?.length && !video.routeQueries?.length) return true;
  return video.routeNames?.includes(route.name) || video.routeQueries?.some((query) =>
    Object.entries(query).every(([key, value]) => route.query?.[key] === value)
  ) || video.pathPrefixes?.some((prefix) => {
    const path = prefix.replace(/\/+$/, '');
    return route.path === path || route.path.startsWith(`${path}/`);
  }) || false;
}
