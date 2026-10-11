import OfficeLocation from '../models/OfficeLocation.model.js';

// Billing identities cannot acquire their own rooms, schedules, or kiosk codes.
// Do not silently redirect destructive operations to the physical building.
export async function requirePhysicalOffice(req, res, next, value) {
  try {
    if (!req.user) return next();
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) return next();
    const office = await OfficeLocation.findById(id);
    if (office?.physical_office_location_id) return res.status(409).json({ error: {
      code: 'use_physical_building',
      message: 'Use the shared physical building for rooms, scheduling, and kiosk setup. This record holds agency billing settings.',
      physicalOfficeId: office.physical_office_location_id
    } });
    next();
  } catch (error) { next(error); }
}
