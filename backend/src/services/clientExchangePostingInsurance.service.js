import { assertClientCoverageAdmission } from './clientCoverageAdmission.service.js';
const parse=value=>{if(typeof value!=='string')return value||{};try{return JSON.parse(value);}catch{return {};}};
export function isManualExchangeClient(client) {
  return client?.source==='ADMIN_CREATED' && /^[a-f0-9-]{36}$/i.test(parse(client.intake_preferences_json)?.exchangeReferral?.requestId || '');
}
export async function assertExchangePostingInsurance({client,database}) {
  if(isManualExchangeClient(client))return {required:false,reason:'manual_exchange_add'};
  return assertClientCoverageAdmission(client.id,{db:database});
}
