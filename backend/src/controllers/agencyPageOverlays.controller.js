import AgencyPageOverlay from '../models/AgencyPageOverlay.model.js';

const normalizeRouteName = (raw) => {
  const v = String(raw || '').trim();
  // keep route names stable and small (vue-router route.name strings)
  if (!v) return null;
  if (v.length > 128) return v.slice(0, 128);
  return v;
};

const normalizeTourId = (agencyId, routeName, rawId) => {
  const fromClient = String(rawId || '').trim();
  if (fromClient) return fromClient;
  return `agency_${agencyId}_${String(routeName || '').toLowerCase()}`;
};

export const getRouteOverlays = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId);
    const routeName = normalizeRouteName(req.params.routeName);

    if (!agencyId || !routeName) {
      return res.status(400).json({ error: { message: 'Agency ID and routeName are required' } });
    }

    const data = await AgencyPageOverlay.getForRoute(agencyId, routeName);
    res.json({
      agencyId,
      routeName,
      tutorial: data.tutorial,
      helper: data.helper,
      missingTable: data.missingTable === true
    });
  } catch (e) {
    next(e);
  }
};

export const upsertTutorialOverlay = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId);
    const routeName = normalizeRouteName(req.params.routeName);
    const actorUserId = req.user?.id || null;

    if (!agencyId || !routeName) {
      return res.status(400).json({ error: { message: 'Agency ID and routeName are required' } });
    }

    const tour = req.body?.tour || req.body?.tutorial || null;
    if (!tour || typeof tour !== 'object') {
      return res.status(400).json({ error: { message: 'Missing tour payload' } });
    }

    const steps = Array.isArray(tour.steps) ? tour.steps : [];
    const enabled = req.body?.enabled !== false;

    // Versioning: if client doesn't specify, auto-bump (so users see updates).
    let version = Number(tour.version || 0);
    if (!version) {
      const existing = await AgencyPageOverlay.getOverlay(agencyId, routeName, 'tutorial');
      version = existing ? Number(existing.version || 1) + 1 : 1;
    }

    const id = normalizeTourId(agencyId, routeName, tour.id);

    const saved = await AgencyPageOverlay.upsert({
      agencyId,
      routeName,
      overlayType: 'tutorial',
      enabled,
      version,
      config: { id, version, steps },
      actorUserId
    });

    res.json({ message: 'Tutorial overlay saved', overlay: saved });
  } catch (e) {
    next(e);
  }
};

export const upsertHelperOverlay = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId);
    const routeName = normalizeRouteName(req.params.routeName);
    const actorUserId = req.user?.id || null;

    if (!agencyId || !routeName) {
      return res.status(400).json({ error: { message: 'Agency ID and routeName are required' } });
    }

    const helper = req.body?.helper || null;
    if (!helper || typeof helper !== 'object') {
      return res.status(400).json({ error: { message: 'Missing helper payload' } });
    }

    const enabled = helper.enabled !== false && req.body?.enabled !== false;
    const position = String(helper.position || 'bottom_right');
    const message = helper.message == null ? null : String(helper.message);

    // Optional: contextual placements (ex: modal steps). If provided, helper UI will show only when a placement matches.
    // Placement format: { selector: string, message?: string, side?: 'right'|'left'|'top'|'bottom' }
    const rawPlacements = Array.isArray(helper.placements) ? helper.placements : [];
    const placements = rawPlacements
      .map((p) => {
        const selector = String(p?.selector || '').trim();
        if (!selector) return null;
        const side = String(p?.side || 'right');
        const sideNorm = ['right', 'left', 'top', 'bottom'].includes(side) ? side : 'right';
        const msg = p?.message == null ? null : String(p.message);
        return { selector: selector.slice(0, 400), side: sideNorm, message: msg };
      })
      .filter(Boolean);

    // Platform-level image only (do not store per-org image URLs).
    const imageUrl = null;

    const saved = await AgencyPageOverlay.upsert({
      agencyId,
      routeName,
      overlayType: 'helper',
      enabled,
      version: 1,
      config: { enabled, position, message, placements, imageUrl },
      actorUserId
    });

    res.json({ message: 'Helper overlay saved', overlay: saved });
  } catch (e) {
    next(e);
  }
};

export const deleteTutorialOverlay = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId);
    const routeName = normalizeRouteName(req.params.routeName);
    if (!agencyId || !routeName) {
      return res.status(400).json({ error: { message: 'Agency ID and routeName are required' } });
    }
    const result = await AgencyPageOverlay.remove({ agencyId, routeName, overlayType: 'tutorial' });
    res.json({ message: 'Tutorial overlay deleted', ...result });
  } catch (e) {
    next(e);
  }
};

export const deleteHelperOverlay = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId);
    const routeName = normalizeRouteName(req.params.routeName);
    if (!agencyId || !routeName) {
      return res.status(400).json({ error: { message: 'Agency ID and routeName are required' } });
    }
    const result = await AgencyPageOverlay.remove({ agencyId, routeName, overlayType: 'helper' });
    res.json({ message: 'Helper overlay deleted', ...result });
  } catch (e) {
    next(e);
  }
};

