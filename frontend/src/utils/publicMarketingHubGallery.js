/**
 * Public marketing hub `branding.gallery` parsing.
 * Supports legacy string[] or mixed { url, showInGallery } entries.
 */

export function parseHubGalleryFromBranding(galleryRaw) {
  if (!Array.isArray(galleryRaw)) return [];
  const out = [];
  for (const item of galleryRaw) {
    if (item == null) continue;
    if (typeof item === 'string') {
      const url = String(item).trim();
      if (url) out.push({ url, showInGallery: true });
      continue;
    }
    if (typeof item === 'object') {
      const url = String(item.url || item.src || '').trim();
      if (!url) continue;
      const showInGallery = item.showInGallery !== false && item.showInStrip !== false;
      out.push({ url, showInGallery });
    }
  }
  return out;
}

/** All library image URLs in order (placeholders, auto-fill, etc.). */
export function hubGalleryPoolUrls(galleryRaw) {
  return parseHubGalleryFromBranding(galleryRaw).map((e) => e.url);
}

/** URLs that should appear in the public fading gallery strip. */
export function hubGalleryStripUrls(galleryRaw) {
  return parseHubGalleryFromBranding(galleryRaw)
    .filter((e) => e.showInGallery)
    .map((e) => e.url);
}
