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
  limits: { fileSize: 10 * 1024 * 1024 }
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

async function findUserByNameInAgency(agencyId, name) {
  const nameTrimmed = String(name || '').trim();
  if (!nameTrimmed) return null;

  const [rows] = await pool.execute(
    `SELECT u.id FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?
       AND LOWER(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')))) = LOWER(?)
     LIMIT 1`,
    [agencyId, nameTrimmed]
  );
  return rows?.[0]?.id || null;
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
    res.status(500).json({ error: { message: e.message || 'Failed to list trips' } });
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
      await CompanyCarUsualPlace.upsertAndIncrement({ agencyId, name: d });
    }

    res.status(201).json(trip);
  } catch (e) {
    res.status(500).json({ error: { message: e.message || 'Failed to create trip' } });
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

export async function listAgencyUsersForCompanyCar(req, res) {
  try {
    const access = await requireCompanyCarAccess(req, res, { requireManage: true });
    if (!access) return;
    const { agencyId } = access;

    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [agencyId]
    );
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

    const combined = [...startLocations, ...offices].slice(0, 8);
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

    const [schoolRows] = await pool.execute(
      `SELECT s.id, s.name, s.street_address, s.city, s.state, s.postal_code
       FROM agency_schools asx
       INNER JOIN agencies s ON s.id = asx.school_organization_id
       WHERE asx.agency_id = ? AND asx.is_active = TRUE
         AND s.organization_type = 'school'
       ORDER BY s.name ASC`,
      [agencyId]
    );

    const [affRows] = await pool.execute(
      `SELECT s.id, s.name, s.street_address, s.city, s.state, s.postal_code
       FROM organization_affiliations oa
       INNER JOIN agencies s ON s.id = oa.organization_id
       WHERE oa.agency_id = ? AND oa.is_active = TRUE
         AND s.organization_type = 'school'
       ORDER BY s.name ASC`,
      [agencyId]
    );

    const schoolIds = new Set();
    const schools = [];
    for (const r of [...(schoolRows || []), ...(affRows || [])]) {
      if (schoolIds.has(r.id)) continue;
      schoolIds.add(r.id);
      const addr = formatAddressLine([r.street_address, r.city, r.state, r.postal_code]);
      schools.push({
        id: `school-${r.id}`,
        source: 'school',
        name: r.name || 'School',
        addressLine: addr,
        searchText: `${r.name || ''} ${addr}`.toLowerCase()
      });
    }
    schools.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    const [usualRows] = await pool.execute(
      `SELECT id, name, address
       FROM company_car_usual_places
       WHERE agency_id = ?
       ORDER BY use_count DESC, name ASC
       LIMIT 100`,
      [agencyId]
    );

    const usualNames = new Set();
    const usualPlaces = (usualRows || []).map((r) => {
      const addr = r.address || '';
      const name = r.name || '';
      usualNames.add(name.toLowerCase());
      return {
        id: `usual-${r.id}`,
        source: 'usual',
        name,
        addressLine: addr,
        searchText: `${name} ${addr}`.toLowerCase()
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

      const created = [];
      const skipped = [];
      const errors = [];

      for (const row of rows) {
        if (!row.driveDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.driveDate)) {
          skipped.push({ row: row.rowIndex, reason: 'Invalid or missing date' });
          continue;
        }
        const start = row.startOdometerMiles;
        const end = row.endOdometerMiles;
        if (start == null || end == null || end < start) {
          skipped.push({ row: row.rowIndex, reason: 'Invalid odometer values' });
          continue;
        }

        const userId = await findUserByNameInAgency(agencyId, row.name);
        if (!userId) {
          errors.push({ row: row.rowIndex, name: row.name, reason: 'Driver not found in agency' });
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
            destinations: row.destinations || [],
            reasonForTravel: row.reasonForTravel || 'Imported'
          });
          created.push({ id: trip.id, row: row.rowIndex });

          for (const d of (row.destinations || []).filter(Boolean)) {
            await CompanyCarUsualPlace.upsertAndIncrement({ agencyId, name: d });
          }
        } catch (e) {
          errors.push({ row: row.rowIndex, reason: e.message || 'Insert failed' });
        }
      }

      res.json({
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
        details: { created, skipped, errors }
      });
    } catch (e) {
      res.status(500).json({ error: { message: e.message || 'Import failed' } });
    }
  }
];
