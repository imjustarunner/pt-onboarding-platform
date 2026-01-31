import pool from '../config/database.js';
import User from '../models/User.model.js';

function getCloudTraceId(req) {
  // Cloud Run: "TRACE_ID/SPAN_ID;o=TRACE_TRUE"
  const v = String(req.get?.('x-cloud-trace-context') || '');
  return v ? v.split('/')[0] : null;
}

function install403Tracer(req, res) {
  // Capture the first stack trace that sets status(403) (best-effort).
  // This is intentionally lightweight and only enabled when ACCESS_DEBUG=1.
  if (req._accessDebugTracerInstalled) return;
  req._accessDebugTracerInstalled = true;

  const originalStatus = res.status?.bind(res);
  if (typeof originalStatus === 'function') {
    res.status = (code) => {
      if (Number(code) === 403 && !req._accessDebug403Stack) {
        req._accessDebug403Stack = new Error('[ACCESS_DEBUG] status(403) called').stack || null;
      }
      return originalStatus(code);
    };
  }

  const originalSendStatus = res.sendStatus?.bind(res);
  if (typeof originalSendStatus === 'function') {
    res.sendStatus = (code) => {
      if (Number(code) === 403 && !req._accessDebug403Stack) {
        req._accessDebug403Stack = new Error('[ACCESS_DEBUG] sendStatus(403) called').stack || null;
      }
      return originalSendStatus(code);
    };
  }
}

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

  install403Tracer(req, res);

  res.on('finish', () => {
    if (res.statusCode !== 403) return;

    // Fire-and-forget async diagnostics (never block response).
    setImmediate(async () => {
      try {
        const userId = req.user?.id ? Number(req.user.id) : null;
        const role = req.user?.role || null;
        const email = req.user?.email || null;
        const type = req.user?.type || null;
        const tokenAgencyId = req.user?.agencyId ? Number(req.user.agencyId) : null;
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

        const payload = {
          at: new Date().toISOString(),
          path: requestPath,
          method: req.method,
          traceId: getCloudTraceId(req),
          origin: req.get?.('origin') || null,
          referer: req.get?.('referer') || null,
          user: { id: userId, role, email, type, tokenAgencyId },
          agencyId,
          agenciesCount,
          membership,
          stack: req._accessDebug403Stack || null
        };

        // Cloud Run logging can truncate structured objects; emit one-line JSON.
        console.warn(`[ACCESS_DEBUG] 403 ${JSON.stringify(payload)}`);
      } catch (e) {
        console.warn('[ACCESS_DEBUG] 403 logging failed:', String(e?.message || e));
      }
    });
  });

  return next();
}

