import pool from '../config/database.js';
import User from '../models/User.model.js';

function shouldDebug() {
  const v = String(process.env.ACCESS_DEBUG || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function shouldInspectPath(p) {
  const path = String(p || '');
  return (
    path.startsWith('/api/chat') ||
    path.startsWith('/api/presence') ||
    path.startsWith('/api/payroll') ||
    path.startsWith('/api/weather')
  );
}

async function safeAgencyMembershipFacts({ userId, agencyId }) {
  const uId = Number(userId || 0);
  const aId = Number(agencyId || 0);
  if (!(uId > 0)) return { userId: uId, agencyId: aId, totalMemberships: null, directMembership: null };

  // How many org memberships does this user have?
  let totalMemberships = null;
  try {
    const [[row]] = await pool.execute(
      'SELECT COUNT(*) AS c FROM user_agencies WHERE user_id = ?',
      [uId]
    );
    totalMemberships = Number(row?.c ?? 0);
  } catch {
    totalMemberships = null;
  }

  // Direct membership check for a specific agencyId (when provided).
  let directMembership = null;
  if (aId > 0) {
    try {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [uId, aId]
      );
      directMembership = (rows || []).length > 0;
    } catch {
      directMembership = null;
    }
  }

  return { userId: uId, agencyId: aId || null, totalMemberships, directMembership };
}

/**
 * Logs high-signal information for 403 responses on key endpoints.
 * Enabled only when ACCESS_DEBUG=1.
 *
 * IMPORTANT: Do NOT log authToken or other secrets.
 */
export function accessDebugMiddleware(req, res, next) {
  if (!shouldDebug()) return next();

  const requestPath = String(req.originalUrl || req.path || '');
  if (!shouldInspectPath(requestPath)) return next();

  res.on('finish', () => {
    if (res.statusCode !== 403) return;

    // Fire-and-forget async diagnostics (never block response).
    setImmediate(async () => {
      try {
        const userId = req.user?.id ? Number(req.user.id) : null;
        const role = req.user?.role || null;
        const email = req.user?.email || null;
        const agencyIdFromQuery = req.query?.agencyId ? Number(req.query.agencyId) : null;
        const agencyIdFromBody = req.body?.agencyId ? Number(req.body.agencyId) : null;
        const agencyIdFromParams = req.params?.agencyId ? Number(req.params.agencyId) : null;
        const agencyId = agencyIdFromQuery || agencyIdFromBody || agencyIdFromParams || null;

        let agenciesCount = null;
        try {
          if (userId) {
            const agencies = await User.getAgencies(userId);
            agenciesCount = Array.isArray(agencies) ? agencies.length : null;
          }
        } catch {
          agenciesCount = null;
        }

        const membership = await safeAgencyMembershipFacts({ userId, agencyId });

        console.warn('[ACCESS_DEBUG] 403', {
          path: requestPath,
          method: req.method,
          user: { id: userId, role, email },
          agencyId,
          agenciesCount,
          membership
        });
      } catch (e) {
        console.warn('[ACCESS_DEBUG] 403 logging failed:', String(e?.message || e));
      }
    });
  });

  return next();
}

