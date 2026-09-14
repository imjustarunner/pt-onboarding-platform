import pool from '../config/database.js';
import TenantService from '../models/TenantService.model.js';
import {resolveSelfPayQuote} from './selfPayRates.service.js';
import {normalizePackagePricing,calculateProviderPackagePrice} from './bookingPackagePricing.js';
export async function quoteBookingPackage({agencyId,pkg,providerId,tenantServiceId}){
 const pricing=normalizePackagePricing(pkg.domainConfig?.pricing);
 if(pricing.mode==='fixed')return {mode:'fixed',amountCents:pkg.priceCents,sessionCount:pkg.sessionCount,policies:pkg.policies};
 const allowed=pkg.allowedTenantServiceIds||[];
 const sid=Number(tenantServiceId||(allowed.length===1?allowed[0]:0)),pid=Number(providerId);
 if(!Number.isSafeInteger(pid)||pid<=0||!Number.isSafeInteger(sid)||sid<=0)throw Object.assign(new Error('Select a provider and service to calculate this package.'),{status:400});
 const service=await TenantService.findById(sid,agencyId);
 if(!service?.isActive||service.businessType!==pkg.businessType||!service.packageEligible||(allowed.length&&!allowed.map(Number).includes(sid)))throw Object.assign(new Error('This package is not available for the selected service.'),{status:400});
 const modality=pricing.format==='virtual'?'TELEHEALTH':pricing.format==='in-person'?'IN_PERSON':null;
 const [rows]=await pool.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
 WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.status='ACTIVE_EMPLOYEE'
 AND EXISTS (SELECT 1 FROM staff_service_assignments s WHERE s.agency_id=ua.agency_id AND s.user_id=u.id AND s.tenant_service_id=? AND s.is_active=1 AND (? IS NULL OR s.modality IS NULL OR s.modality='EITHER' OR s.modality=?))`,[agencyId,pid,sid,modality,modality]);
 if(!rows.length)throw Object.assign(new Error('This provider is not assigned to this service.'),{status:400});
 if(modality&&service.modality!=='EITHER'&&service.modality!==modality)throw Object.assign(new Error('Service format does not match this package.'),{status:400});
 if(pricing.format==='small-group'&&!service.allowsGroup)throw Object.assign(new Error('This service does not offer small groups.'),{status:400});
 const rate=await resolveSelfPayQuote({agencyId,providerId:pid,service,durationMinutes:pricing.minutes,modality,learningFormat:pricing.format});
 if(rate?.rateUnit!=='hour')throw Object.assign(new Error('Configure an hourly client fee for this provider or service before using a percentage package.'),{status:400});
 return {...calculateProviderPackagePrice({rateCents:rate.rateCents,sessionCount:pkg.sessionCount,pricing}),providerId:pid,tenantServiceId:sid,policies:pkg.policies};
}
