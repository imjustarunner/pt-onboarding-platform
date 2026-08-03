/** Secondary line under track title: artist, description, or album — never a generic label. */
export function trackSubtitle(track) {
  if (!track) return '';
  const artist = String(track.artist || '').trim();
  if (artist) return artist;
  const description = String(track.description || '').trim();
  if (description) return description;
  const album = String(track.album || '').trim();
  if (album) return album;
  const genre = Array.isArray(track.genre) ? track.genre.filter(Boolean).join(', ') : String(track.genre || '').trim();
  if (genre) return genre;
  return '';
}

export function trackArtUrl(track) {
  return track?.artDataUrl || track?.artUrl || '';
}
