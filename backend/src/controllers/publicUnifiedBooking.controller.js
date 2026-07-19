/**
 * Phase 5 scaffold: public/guardian booking through the same resolver + appointments layer.
 * Does not replace legacy public agency-services finders; provides a unified path for new clients.
 */

import Agency from '../models/Agency.model.js';
import {
  resolveBookingOptions,
  createAppointment
} from '../services/appointment.service.js';
import { getCapabilitiesForAgency } from '../services/businessTypeCapabilities.service.js';

async function resolveAgencyBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return null;
  if (typeof Agency.findBySlug === 'function') {
    return Agency.findBySlug(s);
  }
  if (typeof Agency.findByPortalUrl === 'function') {
    return Agency.findByPortalUrl(s);
  }
  return null;
}

export const publicBookingOptions = async (req, res, next) => {
  try {
    const agency = await resolveAgencyBySlug(req.params.agencySlug);
    if (!agency) return res.status(404).json({ error: { message: 'Agency not found' } });

    const caps = await getCapabilitiesForAgency(agency.id, {
      ensureDefaults: true,
      organizationType: agency.organization_type || agency.organizationType
    });

    const options = await resolveBookingOptions({
      agencyId: agency.id,
      serviceId: req.query.serviceId ? Number(req.query.serviceId) : null,
      providerId: req.query.providerId ? Number(req.query.providerId) : null,
      clientId: req.query.clientId ? Number(req.query.clientId) : null
    });

    // Public path: only publicly bookable services
    const services = (options.services || []).filter((s) => s.isPubliclyBookable);
    res.json({
      ok: true,
      agency: {
        id: Number(agency.id),
        name: agency.name,
        slug: agency.slug || agency.portal_url || req.params.agencySlug,
        organizationType: agency.organization_type || agency.organizationType
      },
      capabilities: {
        enabledBusinessTypes: caps.enabledBusinessTypes,
        allowedPublicServiceTypes: caps.allowedPublicServiceTypes
      },
      businessTypes: options.businessTypes,
      services,
      providers: options.providers,
      packagePreview: options.packagePreview
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const publicCreateAppointmentRequest = async (req, res, next) => {
  try {
    const agency = await resolveAgencyBySlug(req.params.agencySlug);
    if (!agency) return res.status(404).json({ error: { message: 'Agency not found' } });

    const tenantServiceId = Number(req.body?.tenantServiceId || req.body?.serviceId || 0);
    const providerUserId = Number(req.body?.providerUserId || req.body?.providerId || 0) || null;
    if (!tenantServiceId) {
      return res.status(400).json({ error: { message: 'tenantServiceId is required' } });
    }

    const options = await resolveBookingOptions({
      agencyId: agency.id,
      serviceId: tenantServiceId,
      providerId: providerUserId
    });
    const service = (options.services || []).find((s) => Number(s.id) === tenantServiceId);
    if (!service || !service.isPubliclyBookable) {
      return res.status(400).json({ error: { message: 'Service is not publicly bookable' } });
    }

    const clientId = Number(req.body?.clientId || 0) || null;
    const participants = clientId
      ? [{ role: 'client', clientId, isBillingResponsible: true }]
      : (Array.isArray(req.body?.participants) ? req.body.participants : []);

    // Public path defaults to draft for staff review. Opt into confirmed only when
    // the caller explicitly sets requireStaffApproval=false (e.g. pre-validated slot).
    const requireStaffApproval = req.body?.requireStaffApproval !== false
      && req.body?.requireStaffApproval !== 0
      && String(req.body?.requireStaffApproval || 'true').toLowerCase() !== 'false';
    const status = requireStaffApproval ? 'draft' : 'confirmed';

    const appointment = await createAppointment({
      agencyId: agency.id,
      tenantServiceId,
      providerUserId,
      startAt: req.body?.startAt,
      endAt: req.body?.endAt,
      modality: req.body?.modality || service.modality || null,
      status,
      packageEntitlementId: req.body?.packageEntitlementId || null,
      source: 'public',
      title: req.body?.title || service.name,
      notes: req.body?.notes || null,
      participants,
      billing: req.body?.billing || null
    });

    res.status(201).json({
      ok: true,
      appointment,
      pendingStaffApproval: requireStaffApproval
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message, code: e.code } });
    next(e);
  }
};
