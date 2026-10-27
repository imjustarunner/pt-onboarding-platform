import { allowQaExchangeRecipient, AURICWELL_QA_SLUG } from './auricwellQaPolicy.js';

export const exchangeProviderSql = `COALESCE(ua.is_active, 1) = 1
  AND COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_archived, 0) = 0
  AND UPPER(COALESCE(u.status, '')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED','PROSPECTIVE','TERMINATED_PENDING')
  AND (u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant') OR u.has_provider_access = 1)`;

export function eligibleExchangeProvider(user, agency) {
  if (!user || [false, 0, '0'].includes(user.is_active) || [false, 0, '0'].includes(user.membership_active) || [false, 0, '0'].includes(user.agency_active)
    || Number(user.is_archived) === 1
    || ['INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED','PROSPECTIVE','TERMINATED_PENDING'].includes(String(user.status || '').toUpperCase())) return false;
  if (agency?.slug === AURICWELL_QA_SLUG) return allowQaExchangeRecipient(agency, user);
  return Number(user.is_demo) !== 1;
}
