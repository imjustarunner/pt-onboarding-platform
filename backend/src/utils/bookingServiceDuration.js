import { BUSINESS_TYPE_SERVICE_SUITES } from '../config/tenantServiceSuiteCatalog.js';

const templates=new Map(BUSINESS_TYPE_SERVICE_SUITES.mental_health.services.map(service=>[service.serviceCode,service.defaultDurationMinutes]));
const valid=value=>Number.isInteger(Number(value)) && Number(value)>=5 && Number(value)<=480;
// Scheduling defaults are independent of claimable minutes and billing units.
// Explicit tenant durations win; missing defaults use the existing service suite.
export function bookingServiceDuration(service){
  const custom=service.defaultDurationMinutes ?? service.default_duration_minutes;
  if(valid(custom))return Number(custom);
  return templates.get(String(service.code || service.serviceCode || '').trim().toUpperCase()) || null;
}
