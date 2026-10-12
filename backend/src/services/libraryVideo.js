export function libraryVideo(rawUrl, explicit = false) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let provider = '', embedUrl = null;
  if (['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
    provider = 'YouTube';
    const id = host === 'youtu.be' ? url.pathname.split('/')[1] : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(id || '')) embedUrl = `https://www.youtube-nocookie.com/embed/${id}`;
  } else if (['vimeo.com', 'player.vimeo.com'].includes(host)) {
    provider = 'Vimeo'; const id = url.pathname.match(/(?:^|\/)(\d+)(?:\/|$)/)?.[1];
    if (id) embedUrl = `https://player.vimeo.com/video/${id}`;
  } else if (host === 'loom.com') {
    provider = 'Loom'; const id = url.pathname.match(/^\/(?:share|embed)\/([a-zA-Z0-9-]+)/)?.[1];
    if (id) embedUrl = `https://www.loom.com/embed/${id}`;
  } else if (explicit && host === 'drive.google.com') {
    provider = 'Google Drive'; const id = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] || url.searchParams.get('id');
    if (/^[a-zA-Z0-9_-]+$/.test(id || '')) embedUrl = `https://drive.google.com/file/d/${id}/preview`;
  } else if (explicit) provider = host;
  return provider ? { provider, embedUrl } : null;
}
