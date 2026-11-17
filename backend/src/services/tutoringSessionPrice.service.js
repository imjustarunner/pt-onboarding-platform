import TenantService from '../models/TenantService.model.js';
import { assertSelfPayRateAccess } from './selfPayRates.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// Uses the existing customer-rate permission; this never grants payroll or claims access.
export async function canSetTutoringSessionPrice(actor, agencyId, providerId) {
  try { await assertSelfPayRateAccess(actor, agencyId, providerId); return true; }
  catch (error) { if (error.status === 403) return false; throw error; }
}

export async function tutoringSessionPriceBilling({ actor, agencyId, providerId, tenantServiceId, packageEntitlementId, price }) {
  if (price == null) return null;
  if (!await canSetTutoringSessionPrice(actor, agencyId, providerId))
    throw fail('Ask an authorized pricing administrator to set this session price.', 403);
  const service = await TenantService.findById(tenantServiceId, agencyId);
  if (!service?.isActive || service.businessType !== 'tutoring' || service.serviceCode !== 'TUTORING')
    throw fail('A custom tutoring price requires an active tutoring service in this organization.');
  if (packageEntitlementId) throw fail('Choose either a package credit or a custom session price.');
  if (!price || typeof price !== 'object' || !Number.isSafeInteger(price.amountCents)
      || price.amountCents < 0 || price.amountCents > 2147483647)
    throw fail('Enter a session price of zero or more with at most two decimal places.');
  const reason = String(price.reason || '').trim();
  if (!reason || reason.length > 500) throw fail('Add a short reason for this session price (up to 500 characters).');
  return { amountCents: price.amountCents,
    notes: `Individual tutoring session price approved by account ${actor.id}: ${reason}` };
}
