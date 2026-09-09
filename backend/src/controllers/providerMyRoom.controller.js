import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import ProviderMyRoom from '../models/ProviderMyRoom.model.js';
import User from '../models/User.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTO_DIR = path.join(__dirname, '../../uploads/my-room-lobby');

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only image uploads are allowed'), false);
  }
}).single('photo');

export function myRoomPhotoUpload(req, res, next) {
  photoUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: { message: err.message || 'Photo upload failed' } });
    }
    next();
  });
}

async function saveLobbyPhoto({ buffer, mimeType, slug }) {
  await fs.mkdir(PHOTO_DIR, { recursive: true });
  const ext = mimeType === 'image/png' ? 'png'
    : mimeType === 'image/webp' ? 'webp'
      : mimeType === 'image/gif' ? 'gif'
        : 'jpg';
  const name = `${String(slug || 'room').replace(/[^a-z0-9_-]/gi, '')}-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(PHOTO_DIR, name), buffer);
  return `/uploads/my-room-lobby/${name}`;
}

async function resolvePhotoUrl(req, slug) {
  if (req.file?.buffer?.length) {
    return saveLobbyPhoto({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      slug
    });
  }
  const raw = String(
    req.body?.photoDataUrl
    || req.body?.photoUrl
    || req.body?.photo
    || req.body?.guestPhotoUrl
    || ''
  ).trim();
  if (!raw) return null;
  if (raw.startsWith('/uploads/') || /^https?:\/\//i.test(raw)) {
    return raw.slice(0, 1024);
  }
  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    const buffer = Buffer.from(dataUrlMatch[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      throw Object.assign(new Error('Photo is too large (max 5 MB)'), { status: 413 });
    }
    return saveLobbyPhoto({
      buffer,
      mimeType: dataUrlMatch[1] || 'image/jpeg',
      slug
    });
  }
  // bare base64
  if (raw.length > 80 && !raw.includes(' ')) {
    try {
      const buffer = Buffer.from(raw, 'base64');
      if (buffer.length > 5 * 1024 * 1024) {
        throw Object.assign(new Error('Photo is too large (max 5 MB)'), { status: 413 });
      }
      return saveLobbyPhoto({ buffer, mimeType: 'image/jpeg', slug });
    } catch (e) {
      if (e?.status) throw e;
    }
  }
  return null;
}

async function assertOwnsLobbyGuest(req, lobbyId) {
  const guest = await ProviderMyRoom.findLobbyById(lobbyId);
  if (!guest) return { error: { status: 404, message: 'Lobby guest not found' } };
  const room = await ProviderMyRoom.findByUserId(req.user.id);
  if (!room || Number(room.id) !== Number(guest.myRoomId)) {
    return { error: { status: 403, message: 'Access denied' } };
  }
  return { guest, room };
}

/** GET /api/my-room/me — get or create current user's My Room */
export const getMyRoomMe = async (req, res, next) => {
  try {
    const agencyId = Number(req.query?.agencyId || req.body?.agencyId || 0) || null;
    let resolvedAgencyId = agencyId;
    if (!resolvedAgencyId) {
      try {
        const agencies = await User.getAgencies(req.user.id);
        resolvedAgencyId = agencies?.[0]?.id ? Number(agencies[0].id) : null;
      } catch {
        resolvedAgencyId = null;
      }
    }
    const room = await ProviderMyRoom.getOrCreateForUser(req.user.id, resolvedAgencyId);
    res.json({ ok: true, room });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** GET /api/my-room/me/lobby — host waiting list (never auto-admits) */
export const getMyRoomLobby = async (req, res, next) => {
  try {
    const room = await ProviderMyRoom.getOrCreateForUser(req.user.id, null);
    const waiting = await ProviderMyRoom.listLobbyWaiting(room.id);
    res.json({ ok: true, roomId: room.id, waiting });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** GET /api/my-room/:slug/public — public room info (no auth) */
export const getMyRoomPublic = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const room = await ProviderMyRoom.findBySlug(slug);
    if (!room || !room.isActive) {
      return res.status(404).json({ error: { message: 'Room not found' } });
    }
    res.json({
      ok: true,
      room: {
        slug: room.slug,
        displayName: room.displayName,
        isActive: room.isActive
      }
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/my-room/:slug/lobby — guest join (requires photo; never auto-admits) */
export const joinMyRoomLobby = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const room = await ProviderMyRoom.findBySlug(slug);
    if (!room || !room.isActive) {
      return res.status(404).json({ error: { message: 'Room not found' } });
    }
    const displayName = String(req.body?.displayName || req.body?.guestDisplayName || '').trim();
    if (!displayName) {
      return res.status(400).json({ error: { message: 'displayName is required' } });
    }
    const ackRaw = req.body?.photoRequiredAck;
    const photoAck = ackRaw === true || ackRaw === 1 || ackRaw === '1' || ackRaw === 'true';
    if (!photoAck) {
      return res.status(400).json({ error: { message: 'Photo acknowledgment is required' } });
    }
    let photoUrl;
    try {
      photoUrl = await resolvePhotoUrl(req, slug);
    } catch (e) {
      if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
      throw e;
    }
    if (!photoUrl) {
      return res.status(400).json({ error: { message: 'Photo is required to join the waiting lobby' } });
    }
    const guest = await ProviderMyRoom.addLobbyGuest({
      myRoomId: room.id,
      guestDisplayName: displayName,
      guestPhotoUrl: photoUrl,
      clientId: req.body?.clientId || null,
      appointmentId: req.body?.appointmentId || null,
      photoRequiredAck: true
    });
    // Explicit: status is waiting — host must admit
    res.status(201).json({
      ok: true,
      lobby: {
        id: guest.id,
        status: guest.status,
        guestDisplayName: guest.guestDisplayName,
        createdAt: guest.createdAt
      }
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** GET /api/my-room/:slug/lobby/:lobbyId — guest poll status (public, no PII beyond status) */
export const getMyRoomLobbyGuestStatus = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const lobbyId = Number(req.params.lobbyId || 0);
    const room = await ProviderMyRoom.findBySlug(slug);
    if (!room || !room.isActive) {
      return res.status(404).json({ error: { message: 'Room not found' } });
    }
    const guest = await ProviderMyRoom.findLobbyById(lobbyId);
    if (!guest || Number(guest.myRoomId) !== Number(room.id)) {
      return res.status(404).json({ error: { message: 'Lobby guest not found' } });
    }
    res.json({
      ok: true,
      lobby: {
        id: guest.id,
        status: guest.status,
        guestDisplayName: guest.guestDisplayName,
        admittedAt: guest.admittedAt || null
      }
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/my-room/lobby/:lobbyId/admit — host admit only (manual) */
export const admitMyRoomLobbyGuest = async (req, res, next) => {
  try {
    const lobbyId = Number(req.params.lobbyId || 0);
    const check = await assertOwnsLobbyGuest(req, lobbyId);
    if (check.error) {
      return res.status(check.error.status).json({ error: { message: check.error.message } });
    }
    const guest = await ProviderMyRoom.admitGuest(lobbyId, req.user.id);
    res.json({ ok: true, lobby: guest });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** POST /api/my-room/lobby/:lobbyId/dismiss */
export const dismissMyRoomLobbyGuest = async (req, res, next) => {
  try {
    const lobbyId = Number(req.params.lobbyId || 0);
    const check = await assertOwnsLobbyGuest(req, lobbyId);
    if (check.error) {
      return res.status(check.error.status).json({ error: { message: check.error.message } });
    }
    const guest = await ProviderMyRoom.dismissGuest(lobbyId);
    res.json({ ok: true, lobby: guest });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
