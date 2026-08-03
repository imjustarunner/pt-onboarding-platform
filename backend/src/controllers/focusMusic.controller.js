import fs from 'fs';
import { getFocusMusicCatalog, resolveFocusMusicFile } from '../services/focusMusic.service.js';
import { syncPlatformPlaylists } from '../services/focusMusicPlatformPlaylists.service.js';
import Agency from '../models/Agency.model.js';
import FocusMusicPlatformPlaylist from '../models/FocusMusicPlatformPlaylist.model.js';

export const PLATFORM_CURATOR_EMAIL = 'superadmin@plottwistco.com';

function parseFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveAgencyId(req) {
  const fromHeader = parseInt(req.headers['x-agency-id'], 10);
  const fromUser = Number(req.user?.agencyId || req.user?.agency_id || 0);
  if (Number.isInteger(fromHeader) && fromHeader > 0) return fromHeader;
  return Number.isInteger(fromUser) && fromUser > 0 ? fromUser : 0;
}

export function canManagePlatformPlaylists(req) {
  return String(req.user?.email || '').toLowerCase() === PLATFORM_CURATOR_EMAIL;
}

/** Enabled for all tenants unless explicitly turned off in feature_flags. */
async function isFocusMusicEnabledForAgency(agencyId) {
  if (!agencyId) return false;
  const agency = await Agency.findById(agencyId);
  if (!agency) return false;
  const flags = parseFlags(agency?.feature_flags);
  return flags.focusMusicEnabled !== false;
}

async function requireFocusMusicAccess(req, res) {
  const agencyId = resolveAgencyId(req);
  const enabled = await isFocusMusicEnabledForAgency(agencyId);
  if (!enabled) {
    res.status(403).json({ error: { message: 'Focus Music is not enabled for this organization.' } });
    return false;
  }
  return true;
}

function trackDto(t) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist || '',
    album: t.album || '',
    genre: t.genre || [],
    description: t.description || '',
    durationSec: t.durationSec,
    artDataUrl: t.artDataUrl || null,
    artSource: t.artSource || 'generated',
    streamUrl: `/api/focus-music/stream/${t.id}`
  };
}

async function enrichPlatformPlaylists(playlists) {
  const catalog = await getFocusMusicCatalog();
  const byId = new Map(catalog.map((t) => [t.id, trackDto(t)]));
  const ids = playlists.map((p) => p.id);
  const trackMap = await FocusMusicPlatformPlaylist.listTracksForPlaylists(ids);
  return playlists.map((p) => {
    const trackIds = trackMap.get(p.id) || [];
    const tracks = trackIds.map((id) => byId.get(id)).filter(Boolean);
    return {
      id: p.id,
      slug: p.slug || null,
      name: p.name,
      description: p.description || '',
      sortOrder: p.sort_order,
      trackIds,
      tracks
    };
  });
}

export const getCatalog = async (req, res, next) => {
  try {
    if (!(await requireFocusMusicAccess(req, res))) return;
    const tracks = await getFocusMusicCatalog();
    await syncPlatformPlaylists();
    res.json({
      tracks: tracks.map(trackDto),
      canManagePlatformPlaylists: canManagePlatformPlaylists(req)
    });
  } catch (err) {
    next(err);
  }
};

export const streamTrack = async (req, res, next) => {
  try {
    if (!(await requireFocusMusicAccess(req, res))) return;
    const file = await resolveFocusMusicFile(req.params.slug);
    if (!file) {
      return res.status(404).json({ error: { message: 'Track not found.' } });
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const stream = fs.createReadStream(file.fullPath);
    stream.on('error', (err) => next(err));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
};

export const listPlatformPlaylists = async (req, res, next) => {
  try {
    if (!(await requireFocusMusicAccess(req, res))) return;
    await syncPlatformPlaylists();
    const rows = await FocusMusicPlatformPlaylist.listAll();
    const playlists = await enrichPlatformPlaylists(rows);
    res.json({
      canManage: canManagePlatformPlaylists(req),
      playlists
    });
  } catch (err) {
    next(err);
  }
};

export const createPlatformPlaylist = async (req, res, next) => {
  try {
    if (!(await requireFocusMusicAccess(req, res))) return;
    if (!canManagePlatformPlaylists(req)) {
      return res.status(403).json({ error: { message: 'Only the platform curator can manage platform playlists.' } });
    }
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: { message: 'name is required' } });
    }
    const created = await FocusMusicPlatformPlaylist.create({
      name,
      description: req.body?.description,
      sortOrder: req.body?.sortOrder,
      createdByUserId: req.user?.id
    });
    if (Array.isArray(req.body?.trackIds) && req.body.trackIds.length) {
      await FocusMusicPlatformPlaylist.setTracks(created.id, req.body.trackIds);
    }
    const [enriched] = await enrichPlatformPlaylists([created]);
    res.status(201).json({ playlist: enriched });
  } catch (err) {
    next(err);
  }
};

export const updatePlatformPlaylist = async (req, res, next) => {
  try {
    if (!(await requireFocusMusicAccess(req, res))) return;
    if (!canManagePlatformPlaylists(req)) {
      return res.status(403).json({ error: { message: 'Only the platform curator can manage platform playlists.' } });
    }
    const id = Number(req.params.id);
    const existing = await FocusMusicPlatformPlaylist.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Platform playlist not found.' } });
    }
    const updated = await FocusMusicPlatformPlaylist.update(id, {
      name: req.body?.name,
      description: req.body?.description,
      sortOrder: req.body?.sortOrder
    });
    if (Array.isArray(req.body?.trackIds)) {
      await FocusMusicPlatformPlaylist.setTracks(id, req.body.trackIds);
    }
    const [enriched] = await enrichPlatformPlaylists([updated]);
    res.json({ playlist: enriched });
  } catch (err) {
    next(err);
  }
};

export const deletePlatformPlaylist = async (req, res, next) => {
  try {
    if (!(await requireFocusMusicAccess(req, res))) return;
    if (!canManagePlatformPlaylists(req)) {
      return res.status(403).json({ error: { message: 'Only the platform curator can manage platform playlists.' } });
    }
    const id = Number(req.params.id);
    const ok = await FocusMusicPlatformPlaylist.delete(id);
    if (!ok) {
      return res.status(404).json({ error: { message: 'Platform playlist not found.' } });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const addPlatformPlaylistTrack = async (req, res, next) => {
  try {
    if (!(await requireFocusMusicAccess(req, res))) return;
    if (!canManagePlatformPlaylists(req)) {
      return res.status(403).json({ error: { message: 'Only the platform curator can manage platform playlists.' } });
    }
    const id = Number(req.params.id);
    const existing = await FocusMusicPlatformPlaylist.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Platform playlist not found.' } });
    }
    const trackId = String(req.body?.trackId || '').trim();
    if (!trackId) {
      return res.status(400).json({ error: { message: 'trackId is required' } });
    }
    await FocusMusicPlatformPlaylist.addTrack(id, trackId);
    const [enriched] = await enrichPlatformPlaylists([existing]);
    res.json({ playlist: enriched });
  } catch (err) {
    next(err);
  }
};

export const removePlatformPlaylistTrack = async (req, res, next) => {
  try {
    if (!(await requireFocusMusicAccess(req, res))) return;
    if (!canManagePlatformPlaylists(req)) {
      return res.status(403).json({ error: { message: 'Only the platform curator can manage platform playlists.' } });
    }
    const id = Number(req.params.id);
    const trackId = String(req.params.trackId || '').trim();
    const existing = await FocusMusicPlatformPlaylist.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Platform playlist not found.' } });
    }
    await FocusMusicPlatformPlaylist.removeTrack(id, trackId);
    const [enriched] = await enrichPlatformPlaylists([existing]);
    res.json({ playlist: enriched });
  } catch (err) {
    next(err);
  }
};
