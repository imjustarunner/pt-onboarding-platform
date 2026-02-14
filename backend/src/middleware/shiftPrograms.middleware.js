import pool from '../config/database.js';

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Returns true if agency has shiftProgramsEnabled */
function agencyHasShiftProgramsEnabled(agency) {
  const flags = parseFeatureFlags(agency?.feature_flags);
  return flags?.shiftProgramsEnabled === true;
}

/** Middleware: require agency to have shiftProgramsEnabled. Use on routes with :agencyId. */
export const requireAgencyShiftProgramsEnabled = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return next();
    const [rows] = await pool.execute('SELECT id, feature_flags FROM agencies WHERE id = ?', [agencyId]);
    const agency = rows?.[0];
    if (!agency) return next();
    if (!agencyHasShiftProgramsEnabled(agency)) {
      return res.status(403).json({ error: { message: 'Shift programs are not enabled for this agency' } });
    }
    next();
  } catch (e) {
    next(e);
  }
};

/** Middleware: require program's agency to have shiftProgramsEnabled. Use on routes with :programId. */
export const requireProgramAgencyShiftProgramsEnabled = async (req, res, next) => {
  try {
    const programId = parseInt(req.params.programId, 10);
    if (!programId) return next();
    const [rows] = await pool.execute(
      'SELECT a.id, a.feature_flags FROM programs p JOIN agencies a ON p.agency_id = a.id WHERE p.id = ?',
      [programId]
    );
    const agency = rows?.[0];
    if (!agency) return next();
    if (!agencyHasShiftProgramsEnabled(agency)) {
      return res.status(403).json({ error: { message: 'Shift programs are not enabled for this agency' } });
    }
    next();
  } catch (e) {
    next(e);
  }
};
