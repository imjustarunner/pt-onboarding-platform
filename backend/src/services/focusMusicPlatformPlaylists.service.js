import FocusMusicPlatformPlaylist from '../models/FocusMusicPlatformPlaylist.model.js';
import { getFocusMusicCatalog } from './focusMusic.service.js';

/** Curated platform playlists — first matching rule wins. */
export const PLATFORM_PLAYLIST_DEFS = [
  {
    slug: 'nature-focus',
    name: 'Nature Focus',
    description: 'Outdoor ambience and natural soundscapes for calm deep work.',
    sortOrder: 10,
    match: (track) => /natural state/i.test(trackText(track))
  },
  {
    slug: 'electronic-focus',
    name: 'Electronic Focus',
    description: 'Trap, glitch, and loop edits for energized focus sessions.',
    sortOrder: 20,
    match: (track) => /(deep state trap|infinite focus loop|neural pulse trap)/i.test(trackText(track))
  },
  {
    slug: 'ambient-ethereal',
    name: 'Ambient & Ethereal',
    description: 'Atmospheric loops, echoes, and reflective moods.',
    sortOrder: 30,
    match: (track) => /(ethereal|hollow echo|midnight prelude|somber descent|shadows of e minor|lady may)/i.test(trackText(track))
  },
  {
    slug: 'flow-momentum',
    name: 'Flow & Momentum',
    description: 'Rhythmic pulses and steady motion to stay in the zone.',
    sortOrder: 40,
    match: (track) => /(flow state|iron flow|kinetic canyon|mountain creek|nylon focus pulse|percussive nylon|steel works|warm horizon)/i.test(trackText(track))
  },
  {
    slug: 'cinematic-landscapes',
    name: 'Cinematic Landscapes',
    description: 'Epic, wide-open themes for big-picture thinking.',
    sortOrder: 50,
    match: (track) => /(mountain blockbuster|elysium fields|event horizon|final ascent|infinite canvas|open horizons|titan'?s resolve)/i.test(trackText(track))
  },
  {
    slug: 'rhythmic-world',
    name: 'Rhythmic & World',
    description: 'Percussion and world-influenced grooves.',
    sortOrder: 60,
    match: (track) => /(marimba|afrobeat|world influence|rhythm focus|amazonian pulse|andean rhythm|caribbean pulse|island rhythm|rhythmic pulse)/i.test(trackText(track))
  },
  {
    slug: 'deep-study',
    name: 'Deep Study',
    description: 'Acoustic and string-forward tracks for reading, writing, and concentration.',
    sortOrder: 70,
    match: (track) => /(deep focus|focus study|baroque|hammer-on|linear focus|minimalist string|nylon study|pine ridge|prelude to solitude|steady strings|vintage mindset)/i.test(trackText(track))
  }
];

const FALLBACK_SLUG = 'deep-study';

function trackText(track) {
  return [track?.title, track?.filename].filter(Boolean).join(' ');
}

export function classifyFocusMusicTrack(track) {
  for (const def of PLATFORM_PLAYLIST_DEFS) {
    if (def.match(track)) return def.slug;
  }
  return FALLBACK_SLUG;
}

function groupTracksByPlaylistSlug(tracks) {
  const groups = new Map(PLATFORM_PLAYLIST_DEFS.map((d) => [d.slug, []]));
  for (const track of tracks || []) {
    const slug = classifyFocusMusicTrack(track);
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push(track.id);
  }
  return groups;
}

let syncPromise = null;

/**
 * Ensure curated platform playlists exist and contain classified tracks.
 * New catalog tracks are auto-added to their matching playlist.
 */
export async function syncPlatformPlaylists({ forceCatalog = false } = {}) {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const tracks = await getFocusMusicCatalog({ force: forceCatalog });
    const groups = groupTracksByPlaylistSlug(tracks);
    const slugToPlaylistId = new Map();

    for (const def of PLATFORM_PLAYLIST_DEFS) {
      let playlist = await FocusMusicPlatformPlaylist.findBySlug(def.slug);
      if (!playlist) {
        playlist = await FocusMusicPlatformPlaylist.create({
          name: def.name,
          slug: def.slug,
          description: def.description,
          sortOrder: def.sortOrder,
          createdByUserId: null
        });
      } else {
        playlist = await FocusMusicPlatformPlaylist.update(playlist.id, {
          name: def.name,
          description: def.description,
          sortOrder: def.sortOrder
        });
      }
      slugToPlaylistId.set(def.slug, playlist.id);
    }

    const allPlaylists = await FocusMusicPlatformPlaylist.listAll();
    const trackMap = await FocusMusicPlatformPlaylist.listTracksForPlaylists(allPlaylists.map((p) => p.id));
    const assignedTrackIds = new Set();
    for (const ids of trackMap.values()) {
      for (const id of ids) assignedTrackIds.add(id);
    }

    for (const def of PLATFORM_PLAYLIST_DEFS) {
      const playlistId = slugToPlaylistId.get(def.slug);
      if (!playlistId) continue;
      const classified = groups.get(def.slug) || [];
      await FocusMusicPlatformPlaylist.setTracks(playlistId, classified);
      for (const id of classified) assignedTrackIds.add(id);
    }

    for (const track of tracks) {
      if (assignedTrackIds.has(track.id)) continue;
      const slug = classifyFocusMusicTrack(track);
      const playlistId = slugToPlaylistId.get(slug);
      if (!playlistId) continue;
      await FocusMusicPlatformPlaylist.addTrack(playlistId, track.id);
      assignedTrackIds.add(track.id);
    }
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}
