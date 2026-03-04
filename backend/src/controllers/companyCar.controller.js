import crypto from 'crypto';
import pool from '../config/database.js';
import path from 'path';
import User from '../models/User.model.js';
import CompanyCar from '../models/CompanyCar.model.js';
import CompanyCarTrip from '../models/CompanyCarTrip.model.js';
import CompanyCarUsualPlace from '../models/CompanyCarUsualPlace.model.js';
import CompanyCarImportParserService from '../services/companyCarImportParser.service.js';
import StorageService from '../services/storage.service.js';
import { getMultiLegDistanceMeters, metersToMiles } from '../services/googleDistance.service.js';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file?.originalname || '').toLowerCase();
    const ok = name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls') ||
      file.mimetype === 'text/csv' || file.mimetype === 'application/csv' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel';
    if (ok) return cb(null, true);
    cb(new Error('Please upload a .csv or .xlsx file.'), false);
  }
});

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'), false);
  }
});

function parseAgencyId(req) {
  const raw = req.query?.agencyId || req.body?.agencyId || req.user?.agencyId;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function userHasAgencyAccess(userId, agencyId) {
  const [rows] = await pool.execute(
    'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [userId, agencyId]
  );
  return rows?.length > 0;
}

async function requireCompanyCarAccess(req, res, { requireManage = false } = {}) {
  if (!req.user?.id) {
    res.status(401).json({ error: { message: 'Authentication required' } });
    return null;
  }
  const agencyId = parseAgencyId(req);
  if (!agencyId) {
    res.status(400).json({ error: { message: 'agencyId is required' } });
    return null;
  }

  const hasAgencyAccess = await userHasAgencyAccess(req.user.id, agencyId);
  if (!hasAgencyAccess) {
    res.status(403).json({ error: { message: 'Access denied to this agency' } });
    return null;
  }

  const user = await User.findById(req.user.id);
  const submitAccess = !!(user?.company_car_submit_access === 1 || user?.company_car_submit_access === true);
  const manageAccess = !!(user?.company_car_manage_access === 1 || user?.company_car_manage_access === true);

  if (requireManage && !manageAccess) {
    res.status(403).json({ error: { message: 'Company car manage access required' } });
    return null;
  }
  if (!requireManage && !submitAccess && !manageAccess) {
    res.status(403).json({ error: { message: 'Company car access required' } });
    return null;
  }

  return { agencyId, manageAccess };
}

function normalizeNameForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u0027']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findUserByNameInAgency(agencyId, name) {
  const nameTrimmed = String(name || '').trim().replace(/\s+/g, ' ');
  if (!nameTrimmed) return null;

  const nameNorm = normalizeNameForMatch(nameTrimmed).replace(/\s/g, '');

  try {
    const [rows] = await pool.execute(
      `SELECT u.id FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND (
           LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')), '  ', ' '))) = LOWER(?)
           OR LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.last_name,''), ', ', COALESCE(u.first_name,'')), '  ', ' '))) = LOWER(?)
           OR LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.preferred_name, u.first_name), ' ', COALESCE(u.last_name,'')), '  ', ' '))) = LOWER(?)
           OR LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.last_name,''), ', ', COALESCE(u.preferred_name, u.first_name)), '  ', ' '))) = LOWER(?)
           OR LOWER(REPLACE(REPLACE(REPLACE(CONCAT(COALESCE(u.first_name,''), COALESCE(u.last_name,'')), '''', ''), CHAR(39), ''), ' ', '')) = LOWER(?)
         )
       LIMIT 1`,
      [agencyId, nameTrimmed, nameTrimmed, nameTrimmed, nameTrimmed, nameNorm]
    );
    return rows?.[0]?.id || null;
  } catch (e) {
    if (e.message && /Unknown column 'preferred_name'/.test(e.message)) {
      const [rows] = await pool.execute(
        `SELECT u.id FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?
           AND (
             LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')), '  ', ' '))) = LOWER(?)
             OR LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.last_name,''), ', ', COALESCE(u.first_name,'')), '  ', ' '))) = LOWER(?)
           )
         LIMIT 1`,
        [agencyId, nameTrimmed, nameTrimmed]
      );
      return rows?.[0]?.id || null;
    }
    throw e;
  }
}

function parseNameToFirstLast(name) {
  const s = String(name || '').trim();
  if (!s) return { firstName: '', lastName: '' };
  const commaIdx = s.indexOf(',');
  if (commaIdx >= 0) {
    return {
      lastName: s.slice(0, commaIdx).trim(),
      firstName: s.slice(commaIdx + 1).trim()
    };
  }
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

async function findUserByNameGlobally(name) {
  const nameTrimmed = String(name || '').trim().replace(/\s+/g, ' ');
  if (!nameTrimmed) return null;
  const nameNorm = normalizeNameForMatch(nameTrimmed).replace(/\s/g, '');
  try {
    const [rows] = await pool.execute(
      `SELECT u.id FROM users u
       WHERE (
         LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')), '  ', ' '))) = LOWER(?)
         OR LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.last_name,''), ', ', COALESCE(u.first_name,'')), '  ', ' '))) = LOWER(?)
         OR LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.preferred_name, u.first_name), ' ', COALESCE(u.last_name,'')), '  ', ' '))) = LOWER(?)
         OR LOWER(REPLACE(REPLACE(REPLACE(CONCAT(COALESCE(u.first_name,''), COALESCE(u.last_name,'')), '''', ''), CHAR(39), ''), ' ', '')) = LOWER(?)
       )
       LIMIT 1`,
      [nameTrimmed, nameTrimmed, nameTrimmed, nameNorm]
    );
    return rows?.[0]?.id || null;
  } catch (e) {
    if (e.message && /Unknown column 'preferred_name'/.test(e.message)) {
      const [rows] = await pool.execute(
        `SELECT u.id FROM users u
         WHERE (
           LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')), '  ', ' '))) = LOWER(?)
           OR LOWER(TRIM(REPLACE(CONCAT(COALESCE(u.last_name,''), ', ', COALESCE(u.first_name,'')), '  ', ' '))) = LOWER(?)
         )
         LIMIT 1`,
        [nameTrimmed, nameTrimmed]
      );
      return rows?.[0]?.id || null;
    }
    throw e;
  }
}

async function findOrCreateDriverInAgency(agencyId, name) {
  let userId = await findUserByNameInAgency(agencyId, name);
  if (userId) return userId;

  userId = await findUserByNameGlobally(name);
  if (userId) {
    await User.assignToAgency(userId, agencyId);
    console.log(`[companyCar import] Added existing user ${userId} to agency ${agencyId} for driver "${name}"`);
    return userId;
  }

  const { firstName, lastName } = parseNameToFirstLast(name);
  if (!firstName && !lastName) return null;
  try {
    const created = await User.create({
      role: 'staff',
      status: 'ACTIVE_EMPLOYEE',
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Driver',
      email: null,
      passwordHash: null
    });
    await User.assignToAgency(created.id, agencyId);
    console.log(`[companyCar import] Created driver "${name}" (id=${created.id}) and added to agency ${agencyId}`);
    return created.id;
  } catch (e) {
    console.error(`[companyCar import] Failed to create driver "${name}":`, e?.message || e);
    return null;
  }
}

export async function listCompanyCars(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId } = access;

    const cars = await CompanyCar.listByAgency({ agencyId, activeOnly: true });
    res.json({ cars });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to list company cars' } });
  }
}

export async function createCompanyCar(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res, { requireManage: true });
    if (!access) return;
    const { agencyId } = access;

    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: { message: 'name is required' } });
    }

    const car = await CompanyCar.create({ agencyId, name, isActive: true });
    res.status(201).json(car);
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to create company car' } });
  }
}

export async function updateCompanyCar(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res, { requireManage: true });
    if (!access) return;
    const { agencyId } = access;

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: { message: 'Invalid car id' } });
    }

    const existing = await CompanyCar.findById(id);
    if (!existing || existing.agency_id !== agencyId) {
      return res.status(404).json({ error: { message: 'Company car not found' } });
    }

    const car = await CompanyCar.update({
      id,
      agencyId,
      name: req.body?.name,
      isActive: req.body?.isActive
    });
    res.json(car);
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to update company car' } });
  }
}

export const uploadCompanyCarPhoto = [
  photoUpload.single('photo'),
  async (req, res) => {
    try {
      const access = await requireCompanyCarAccess(req, res, { requireManage: true });
      if (!access) return;
      const { agencyId } = access;

      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: { message: 'Invalid car id' } });
      }

      const existing = await CompanyCar.findById(id);
      if (!existing || existing.agency_id !== agencyId) {
        return res.status(404).json({ error: { message: 'Company car not found' } });
      }

      if (!req.file?.buffer) {
        return res.status(400).json({ error: { message: 'No photo uploaded' } });
      }

      const ext = path.extname(req.file.originalname) || '.jpg';
      const safeExt = ext.length <= 8 ? ext : '.jpg';
      const filename = `car-${id}-${Date.now()}${safeExt}`;

      const saved = await StorageService.saveCompanyCarPhoto(
        id,
        req.file.buffer,
        filename,
        req.file.mimetype
      );

      const car = await CompanyCar.update({ id, agencyId, photoPath: saved.relativePath });
      res.json(car);
    } catch (e) {
      res.status(500).json({ error: { message: e.message || 'Failed to upload photo' } });
    }
  }
];

export async function getLatestTripEndOdometer(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId } = access;
    const companyCarId = parseInt(req.query.companyCarId, 10);
    if (!Number.isFinite(companyCarId) || companyCarId <= 0) {
      return res.status(400).json({ error: { message: 'companyCarId is required' } });
    }
    const [rows] = await pool.execute(
      `SELECT end_odometer_miles FROM company_car_trips
       WHERE agency_id = ? AND company_car_id = ?
       ORDER BY drive_date DESC, id DESC LIMIT 1`,
      [agencyId, companyCarId]
    );
    const endOdom = rows?.[0]?.end_odometer_miles;
    res.json({
      endOdometerMiles: endOdom != null && Number.isFinite(Number(endOdom)) ? Number(endOdom) : null
    });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to get latest trip' } });
  }
}

export async function listCompanyCarTrips(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId, manageAccess } = access;

    const companyCarId = req.query.companyCarId ? parseInt(req.query.companyCarId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    const fromDate = req.query.fromDate ? String(req.query.fromDate).slice(0, 10) : null;
    const toDate = req.query.toDate ? String(req.query.toDate).slice(0, 10) : null;
    const limit = parseInt(req.query.limit, 10) || 200;
    const offset = parseInt(req.query.offset, 10) || 0;

    const filterUserId = manageAccess ? userId : req.user.id;
    const trips = await CompanyCarTrip.list({
      agencyId,
      companyCarId: Number.isFinite(companyCarId) ? companyCarId : null,
      userId: filterUserId,
      fromDate: fromDate || null,
      toDate: toDate || null,
      limit,
      offset
    });

    const totalMiles = await CompanyCarTrip.getTotalMiles({
      agencyId,
      companyCarId: Number.isFinite(companyCarId) ? companyCarId : null,
      userId: filterUserId,
      fromDate: fromDate || null,
      toDate: toDate || null
    });

    res.json({ trips, totalMiles });
  } catch (e) {
    console.error('[listCompanyCarTrips]', e);
    const msg = e.message || 'Failed to list trips';
    const hint = /doesn't exist|unknown table/i.test(msg)
      ? ' Run migrations: database/migrations/508_create_company_cars.sql, 509_create_company_car_trips.sql, etc.'
      : '';
    res.status(500).json({ error: { message: msg + hint } });
  }
}

export async function createCompanyCarTrip(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId, manageAccess } = access;

    const body = req.body || {};
    const companyCarId = parseInt(body.companyCarId || body.company_car_id, 10);
    const driveDate = String(body.driveDate || body.drive_date || '').slice(0, 10);
    const startOdometerMiles = Number(body.startOdometerMiles ?? body.start_odometer_miles ?? 0);
    const endOdometerMiles = Number(body.endOdometerMiles ?? body.end_odometer_miles ?? 0);
    const milesOverride = body.miles != null ? Number(body.miles) : null;
    const destinations = Array.isArray(body.destinations)
      ? body.destinations
      : (body.destinations ? [body.destinations] : []);
    const reasonForTravel = String(body.reasonForTravel || body.reason_for_travel || '').trim();
    const notes = body.notes ? String(body.notes).trim() : null;

    const driverUserId = manageAccess && body.userId
      ? parseInt(body.userId, 10)
      : req.user.id;

    if (!Number.isFinite(companyCarId)) {
      return res.status(400).json({ error: { message: 'companyCarId is required' } });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(driveDate)) {
      return res.status(400).json({ error: { message: 'driveDate (YYYY-MM-DD) is required' } });
    }
    if (!reasonForTravel) {
      return res.status(400).json({ error: { message: 'reasonForTravel is required' } });
    }
    const startOdom = Number(startOdometerMiles);
    const endOdom = Number(endOdometerMiles);
    if (!Number.isFinite(startOdom) || startOdom < 0) {
      return res.status(400).json({ error: { message: 'Starting odometer (miles) is required and must be 0 or greater' } });
    }
    if (!Number.isFinite(endOdom) || endOdom < startOdom) {
      return res.status(400).json({ error: { message: 'Ending odometer (miles) is required and must be greater than or equal to starting odometer' } });
    }

    const car = await CompanyCar.findById(companyCarId);
    if (!car || car.agency_id !== agencyId) {
      return res.status(404).json({ error: { message: 'Company car not found' } });
    }

    if (manageAccess && driverUserId !== req.user.id) {
      const hasAccess = await userHasAgencyAccess(driverUserId, agencyId);
      if (!hasAccess) {
        return res.status(400).json({ error: { message: 'Driver must belong to this agency' } });
      }
    } else if (!manageAccess && driverUserId !== req.user.id) {
      return res.status(403).json({ error: { message: 'Submit-only users can only add trips for themselves' } });
    }

    const trip = await CompanyCarTrip.create({
      agencyId,
      companyCarId,
      userId: driverUserId,
      driveDate,
      startOdometerMiles,
      endOdometerMiles,
      miles: milesOverride,
      destinations,
      reasonForTravel,
      notes
    });

    for (const d of destinations.filter(Boolean)) {
      const name = typeof d === 'string' ? d : (d?.name || d?.addressLine || String(d));
      await CompanyCarUsualPlace.upsertAndIncrement({
        agencyId,
        name,
        defaultReason: reasonForTravel || null
      });
    }

    res.status(201).json(trip);
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to create trip' } });
  }
}

export async function getCompanyCarTrip(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId, manageAccess } = access;

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: { message: 'Invalid trip id' } });
    }

    const trip = await CompanyCarTrip.findById(id);
    if (!trip || trip.agency_id !== agencyId) {
      return res.status(404).json({ error: { message: 'Trip not found' } });
    }

    if (!manageAccess && trip.user_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'You can only view your own trips' } });
    }

    res.json({ trip });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to get trip' } });
  }
}

export async function updateCompanyCarTrip(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId, manageAccess } = access;

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: { message: 'Invalid trip id' } });
    }

    const trip = await CompanyCarTrip.findById(id);
    if (!trip || trip.agency_id !== agencyId) {
      return res.status(404).json({ error: { message: 'Trip not found' } });
    }

    if (!manageAccess && trip.user_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'You can only edit your own trips' } });
    }

    const body = req.body || {};
    const companyCarId = body.companyCarId != null ? parseInt(body.companyCarId, 10) : undefined;
    const driveDate = body.driveDate != null ? String(body.driveDate).slice(0, 10) : undefined;
    const startOdometerMiles = body.startOdometerMiles;
    const endOdometerMiles = body.endOdometerMiles;
    const milesOverride = body.miles != null ? Number(body.miles) : undefined;
    const destinations = Array.isArray(body.destinations)
      ? body.destinations
      : (body.destinations != null ? [body.destinations] : undefined);
    const reasonForTravel = body.reasonForTravel != null ? String(body.reasonForTravel).trim() : undefined;
    const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : undefined;
    const driverUserId = manageAccess && body.userId != null ? parseInt(body.userId, 10) : undefined;

    if (companyCarId !== undefined) {
      const car = await CompanyCar.findById(companyCarId);
      if (!car || car.agency_id !== agencyId) {
        return res.status(400).json({ error: { message: 'Invalid company car' } });
      }
    }
    if (driveDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(driveDate)) {
      return res.status(400).json({ error: { message: 'driveDate must be YYYY-MM-DD' } });
    }
    if (reasonForTravel !== undefined && !reasonForTravel) {
      return res.status(400).json({ error: { message: 'reasonForTravel is required' } });
    }
    if (startOdometerMiles !== undefined || endOdometerMiles !== undefined) {
      const startOdom = Number(startOdometerMiles ?? trip.start_odometer_miles ?? 0);
      const endOdom = Number(endOdometerMiles ?? trip.end_odometer_miles ?? 0);
      if (!Number.isFinite(startOdom) || startOdom < 0) {
        return res.status(400).json({ error: { message: 'Starting odometer (miles) is required and must be 0 or greater' } });
      }
      if (!Number.isFinite(endOdom) || endOdom < startOdom) {
        return res.status(400).json({ error: { message: 'Ending odometer (miles) is required and must be greater than or equal to starting odometer' } });
      }
    }
    if (driverUserId !== undefined && manageAccess) {
      const hasAccess = await userHasAgencyAccess(driverUserId, agencyId);
      if (!hasAccess) {
        return res.status(400).json({ error: { message: 'Driver must belong to this agency' } });
      }
    }

    const updated = await CompanyCarTrip.update({
      id,
      agencyId,
      companyCarId,
      userId: driverUserId,
      driveDate,
      startOdometerMiles,
      endOdometerMiles,
      miles: milesOverride,
      destinations,
      reasonForTravel,
      notes
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to update trip' } });
  }
}

export async function deleteCompanyCarTrip(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId, manageAccess } = access;

    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: { message: 'Invalid trip id' } });
    }

    const trip = await CompanyCarTrip.findById(id);
    if (!trip || trip.agency_id !== agencyId) {
      return res.status(404).json({ error: { message: 'Trip not found' } });
    }

    if (!manageAccess && trip.user_id !== req.user.id) {
      return res.status(403).json({ error: { message: 'You can only delete your own trips' } });
    }

    await CompanyCarTrip.deleteById({ id, agencyId });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to delete trip' } });
  }
}

function csvEscape(val) {
  const s = val == null ? '' : String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportCompanyCarTripsCsv(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId, manageAccess } = access;

    const companyCarId = req.query.companyCarId ? parseInt(req.query.companyCarId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    const fromDate = req.query.fromDate ? String(req.query.fromDate).slice(0, 10) : null;
    const toDate = req.query.toDate ? String(req.query.toDate).slice(0, 10) : null;

    const filterUserId = manageAccess ? userId : req.user.id;
    const trips = await CompanyCarTrip.list({
      agencyId,
      companyCarId: Number.isFinite(companyCarId) ? companyCarId : null,
      userId: filterUserId,
      fromDate: fromDate || null,
      toDate: toDate || null,
      limit: 10000,
      offset: 0
    });

    const header = 'Date,Car,Driver,Miles,Destinations,Reason,Notes,Created';
    const lines = (trips || []).map((t) => {
      const dests = (() => {
        try {
          const arr = typeof t.destinations_json === 'string' ? JSON.parse(t.destinations_json) : t.destinations_json;
          return Array.isArray(arr) ? arr.join('; ') : '';
        } catch {
          return '';
        }
      })();
      const driver = [t.user_first_name, t.user_last_name].filter(Boolean).join(' ');
      return [
        csvEscape(t.drive_date),
        csvEscape(t.company_car_name),
        csvEscape(driver),
        csvEscape(Number(t.miles || 0).toFixed(1)),
        csvEscape(dests),
        csvEscape(t.reason_for_travel),
        csvEscape(t.notes || ''),
        csvEscape(t.created_at)
      ].join(',');
    });
    const csv = [header, ...lines].join('\n');
    const filename = `company-car-trips-${agencyId}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to export' } });
  }
}

export async function listAgencyUsersForCompanyCar(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res, { requireManage: true });
    if (!access) return;
    const { agencyId } = access;

    let [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       LEFT JOIN company_car_trips t ON t.user_id = u.id AND t.agency_id = ?
       WHERE ua.agency_id = ?
         AND (
           COALESCE(u.company_car_submit_access, 0) = 1
           OR COALESCE(u.company_car_manage_access, 0) = 1
           OR t.id IS NOT NULL
         )
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [agencyId, agencyId]
    );
    if (!rows?.length) {
      [rows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email
         FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [agencyId]
      );
    }
    res.json({ users: rows || [] });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to list users' } });
  }
}

export async function calculateCompanyCarMileage(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId } = access;

    const origin = String(req.query.origin || '').trim();
    const destinationsRaw = req.query.destinations;
    const dests = Array.isArray(destinationsRaw)
      ? destinationsRaw.map((d) => String(d || '').trim()).filter(Boolean)
      : (typeof destinationsRaw === 'string' ? destinationsRaw.split(',').map((s) => s.trim()).filter(Boolean) : []);
    const roundTrip = /^(true|1|yes)$/i.test(String(req.query.roundTrip || ''));

    if (!origin) {
      return res.status(400).json({ error: { message: 'origin is required' } });
    }
    const legs = [origin, ...dests];
    if (legs.length < 2) {
      return res.status(400).json({ error: { message: 'At least one destination required' } });
    }

    let totalMeters = await getMultiLegDistanceMeters(legs);
    if (roundTrip) totalMeters *= 2;
    const miles = Math.round(metersToMiles(totalMeters) * 100) / 100;

    const legsForAudit = roundTrip ? [...legs, ...legs.slice(1).reverse(), legs[0]] : legs;
    res.json({
      miles,
      legs: legsForAudit,
      roundTrip
    });
  } catch (e) {
    if (e.code === 'MAPS_KEY_MISSING' || e.code === 'MAPS_DISTANCE_FAILED') {
      return res.status(400).json({ error: { message: e.message || 'Distance lookup failed' } });
    }
    res.status(500).json({ error: { message: e.message || 'Failed to calculate mileage' } });
  }
}

function formatAddressLine(parts) {
  return (Array.isArray(parts) ? parts : []).filter(Boolean).join(', ').trim() || '';
}

export async function listCompanyCarStartLocations(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId } = access;
    const driverId = parseInt(req.query.driverId, 10);

    const [startRows] = await pool.execute(
      `SELECT id, name, address_line, display_order
       FROM company_car_start_locations
       WHERE agency_id = ?
       ORDER BY display_order ASC, name ASC`,
      [agencyId]
    );

    const [officeRows] = await pool.execute(
      `SELECT ol.id, ol.name, ol.street_address, ol.city, ol.state, ol.postal_code
       FROM office_locations ol
       JOIN office_location_agencies ola ON ola.office_location_id = ol.id
       WHERE ola.agency_id = ? AND COALESCE(ol.is_active, TRUE) = TRUE
       ORDER BY ol.name ASC`,
      [agencyId]
    );

    const startLocations = (startRows || []).map((r) => ({
      id: `start-${r.id}`,
      source: 'start_location',
      name: r.name,
      addressLine: r.address_line || ''
    }));

    const offices = (officeRows || []).map((r) => ({
      id: `office-${r.id}`,
      source: 'office',
      name: r.name || `Office`,
      addressLine: formatAddressLine([r.street_address, r.city, r.state, r.postal_code])
    }));

    const officesAndStart = [...startLocations, ...offices];
    const existingAddrNorm = new Set(
      officesAndStart.map((l) => (l.addressLine || '').toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean)
    );

    const selectedDriverHome = [];
    if (Number.isFinite(driverId) && driverId > 0) {
      const [[userRow]] = await pool.execute(
        `SELECT first_name, last_name, home_street_address, home_city, home_state, home_postal_code
         FROM users WHERE id = ? AND id IN (SELECT user_id FROM user_agencies WHERE agency_id = ?)`,
        [driverId, agencyId]
      );
      if (userRow) {
        const addr = formatAddressLine([
          userRow.home_street_address,
          userRow.home_city,
          userRow.home_state,
          userRow.home_postal_code
        ]);
        if (addr) {
          const name = [userRow.first_name, userRow.last_name].filter(Boolean).join(' ') || 'Driver';
          selectedDriverHome.push({
            id: 'driver-home',
            source: 'driver_home',
            name: `${name}'s home`,
            addressLine: addr
          });
          existingAddrNorm.add(addr.toLowerCase().replace(/\s+/g, ' ').trim());
        }
      }
    }

    const [otherDriverRows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.home_street_address, u.home_city, u.home_state, u.home_postal_code
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       LEFT JOIN company_car_trips t ON t.user_id = u.id AND t.agency_id = ?
       WHERE ua.agency_id = ?
         AND (COALESCE(u.company_car_submit_access, 0) = 1
              OR COALESCE(u.company_car_manage_access, 0) = 1
              OR t.id IS NOT NULL)
         AND (u.home_street_address IS NOT NULL AND u.home_street_address != '')`,
      [agencyId, agencyId]
    );

    const otherDriversHomes = [];
    for (const r of otherDriverRows || []) {
      if (r.id === driverId) continue;
      const addr = formatAddressLine([r.home_street_address, r.home_city, r.home_state, r.home_postal_code]);
      if (!addr) continue;
      const addrNorm = addr.toLowerCase().replace(/\s+/g, ' ').trim();
      if (existingAddrNorm.has(addrNorm)) continue;
      existingAddrNorm.add(addrNorm);
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Driver';
      otherDriversHomes.push({
        id: `driver-home-${r.id}`,
        source: 'driver_home',
        name: `${name}'s home`,
        addressLine: addr
      });
    }
    otherDriversHomes.sort((a, b) => a.name.localeCompare(b.name));

    const combined = [...selectedDriverHome, ...officesAndStart, ...otherDriversHomes].slice(0, 25);
    res.json({ startLocations: combined });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to list start locations' } });
  }
}

export async function listCompanyCarDestinationOptions(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId } = access;

    let schoolRows = [];
    let affRows = [];
    try {
      [schoolRows] = await pool.execute(
        `SELECT s.id, s.name, s.street_address, s.city, s.state, s.postal_code, s.company_car_default_reason
         FROM agency_schools asx
         INNER JOIN agencies s ON s.id = asx.school_organization_id
         WHERE asx.agency_id = ? AND asx.is_active = TRUE
           AND s.organization_type = 'school'
         ORDER BY s.name ASC`,
        [agencyId]
      );
      [affRows] = await pool.execute(
        `SELECT s.id, s.name, s.street_address, s.city, s.state, s.postal_code, s.company_car_default_reason
         FROM organization_affiliations oa
         INNER JOIN agencies s ON s.id = oa.organization_id
         WHERE oa.agency_id = ? AND oa.is_active = TRUE
           AND s.organization_type = 'school'
         ORDER BY s.name ASC`,
        [agencyId]
      );
    } catch (e) {
      if (e.message && /Unknown column 'company_car_default_reason'/.test(e.message)) {
        [schoolRows] = await pool.execute(
          `SELECT s.id, s.name, s.street_address, s.city, s.state, s.postal_code
           FROM agency_schools asx
           INNER JOIN agencies s ON s.id = asx.school_organization_id
           WHERE asx.agency_id = ? AND asx.is_active = TRUE
             AND s.organization_type = 'school'
           ORDER BY s.name ASC`,
          [agencyId]
        );
        [affRows] = await pool.execute(
          `SELECT s.id, s.name, s.street_address, s.city, s.state, s.postal_code
           FROM organization_affiliations oa
           INNER JOIN agencies s ON s.id = oa.organization_id
           WHERE oa.agency_id = ? AND oa.is_active = TRUE
             AND s.organization_type = 'school'
           ORDER BY s.name ASC`,
          [agencyId]
        );
      } else throw e;
    }

    const schoolIds = new Set();
    const schools = [];
    for (const r of [...(schoolRows || []), ...(affRows || [])]) {
      if (schoolIds.has(r.id)) continue;
      schoolIds.add(r.id);
      const addr = formatAddressLine([r.street_address, r.city, r.state, r.postal_code]);
      const defaultReason = r.company_car_default_reason ? String(r.company_car_default_reason).trim() : null;
      schools.push({
        id: `school-${r.id}`,
        source: 'school',
        name: r.name || 'School',
        addressLine: addr,
        searchText: `${r.name || ''} ${addr}`.toLowerCase(),
        defaultReason: defaultReason || undefined
      });
    }
    schools.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    let usualRows = [];
    try {
      [usualRows] = await pool.execute(
        `SELECT id, name, address, default_reason
         FROM company_car_usual_places
         WHERE agency_id = ?
         ORDER BY use_count DESC, name ASC
         LIMIT 100`,
        [agencyId]
      );
    } catch (e) {
      if (e.message && /Unknown column 'default_reason'/.test(e.message)) {
        [usualRows] = await pool.execute(
          `SELECT id, name, address
           FROM company_car_usual_places
           WHERE agency_id = ?
           ORDER BY use_count DESC, name ASC
           LIMIT 100`,
          [agencyId]
        );
      } else throw e;
    }

    const usualNames = new Set();
    const usualPlaces = (usualRows || []).map((r) => {
      const addr = r.address || '';
      const name = r.name || '';
      usualNames.add(name.toLowerCase());
      const defaultReason = r.default_reason ? String(r.default_reason).trim() : null;
      return {
        id: `usual-${r.id}`,
        source: 'usual',
        name,
        addressLine: addr,
        searchText: `${name} ${addr}`.toLowerCase(),
        defaultReason: defaultReason || undefined
      };
    });

    const combined = [...schools, ...usualPlaces];
    res.json({ destinations: combined });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to list destination options' } });
  }
}

export async function listCompanyCarUsualPlaces(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res);
    if (!access) return;
    const { agencyId } = access;

    const search = req.query.search ? String(req.query.search).trim() : null;
    const limit = parseInt(req.query.limit, 10) || 50;

    const places = await CompanyCarUsualPlace.listByAgency({ agencyId, limit, search });
    res.json({ places });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to list usual places' } });
  }
}

export const importCompanyCarTrips = [
  upload.single('file'),
  async (req, res) => {
    try {
      const access = await requireCompanyCarAccess(req, res, { requireManage: true });
      if (!access) return;
      const { agencyId } = access;

      const companyCarId = parseInt(req.body?.companyCarId || req.body?.company_car_id, 10);
      if (!Number.isFinite(companyCarId)) {
        return res.status(400).json({ error: { message: 'companyCarId is required' } });
      }

      const car = await CompanyCar.findById(companyCarId);
      if (!car || car.agency_id !== agencyId) {
        return res.status(404).json({ error: { message: 'Company car not found' } });
      }

      if (!req.file) {
        return res.status(400).json({ error: { message: 'No file uploaded' } });
      }

      const rows = await CompanyCarImportParserService.parse(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      console.log(`[companyCar import] Parsed ${rows.length} rows from ${req.file.originalname}`);
      if (rows.length > 0) {
        const r0 = rows[0];
        console.log(`[companyCar import] First row sample: start=${r0.startOdometerMiles} end=${r0.endOdometerMiles} miles=${r0.endOdometerMiles != null && r0.startOdometerMiles != null ? r0.endOdometerMiles - r0.startOdometerMiles : 'n/a'}`);
      }

      const importBatchId = crypto.randomUUID();
      const created = [];
      const skipped = [];
      const errors = [];
      let totalImportedMiles = 0;

      for (const row of rows) {
        if (!row.driveDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.driveDate)) {
          skipped.push({ row: row.rowIndex, reason: 'Invalid or missing date' });
          continue;
        }
        const start = Number(row.startOdometerMiles);
        const end = Number(row.endOdometerMiles);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
          skipped.push({ row: row.rowIndex, reason: 'Invalid odometer values (need start and end)' });
          continue;
        }

        const driverNames = String(row.name || '')
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean);
        let userId = null;
        for (const name of driverNames) {
          userId = await findOrCreateDriverInAgency(agencyId, name);
          if (userId) break;
        }
        if (!userId) {
          errors.push({ row: row.rowIndex, name: row.name, reason: 'Driver not found and could not be created' });
          continue;
        }

        try {
          const trip = await CompanyCarTrip.create({
            agencyId,
            companyCarId,
            userId,
            driveDate: row.driveDate,
            startOdometerMiles: start,
            endOdometerMiles: end,
            miles: end - start,
            destinations: row.destinations || [],
            reasonForTravel: row.reasonForTravel || 'Imported',
            notes: row.notes || null,
            importBatchId
          });
          created.push({ id: trip.id, row: row.rowIndex, miles: trip.miles || end - start });
          totalImportedMiles += Number(trip.miles || end - start);

          for (const d of (row.destinations || []).filter(Boolean)) {
            await CompanyCarUsualPlace.upsertAndIncrement({ agencyId, name: d });
          }
        } catch (e) {
          errors.push({ row: row.rowIndex, reason: e.message || 'Insert failed' });
        }
      }

      const errorSamples = errors.slice(0, 10).map((e) => e.name ? `${e.reason}: "${e.name}"` : e.reason);
      if (errors.length > 0) {
        console.log(`[companyCar import] Sample errors:`, errorSamples);
      }

      res.json({
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
        totalImportedMiles: Math.round(totalImportedMiles * 100) / 100,
        importBatchId,
        errorSamples,
        details: { created, skipped, errors }
      });
    } catch (e) {
      res.status(500).json({ error: { message: e.message || 'Import failed' } });
    }
  }
];

export async function undoLastImport(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res, { requireManage: true });
    if (!access) return;
    const { agencyId } = access;

    const { deleted } = await CompanyCarTrip.deleteByLastImportBatch({ agencyId });
    res.json({ deleted });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to undo import' } });
  }
}

export async function deleteAllCompanyCarTrips(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res, { requireManage: true });
    if (!access) return;
    const { agencyId } = access;

    const { deleted } = await CompanyCarTrip.deleteAllByAgency({ agencyId });
    res.json({ deleted });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to delete trips' } });
  }
}

export async function recalculateCompanyCarMiles(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res, { requireManage: true });
    if (!access) return;
    const { agencyId } = access;

    const { updated } = await CompanyCarTrip.recalculateMilesForAgency({ agencyId });
    res.json({ updated });
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to recalculate miles' } });
  }
}
