import pool from '../config/database.js';
import {loadClientExchangeSummary} from './clientExchangeSummary.service.js';
import {normalizeExchangeSchedule} from '../utils/clientExchangeSchedule.js';
import {assertExchangeEssentials} from '../../../frontend/src/navigation/clientExchangeEssentials.js';
import {exchangeStaffRole} from '../../../frontend/src/navigation/clientExchangePolicy.js';
export async function saveStaffExchangePreferences({clientId,agencyId,actor,input},database=pool) {
  if(!exchangeStaffRole(actor?.role))throw Object.assign(new Error('Support access is required'),{status:403});
  const db=await database.getConnection();
  try {
    await db.beginTransaction();
    const [[client]]=await db.execute('SELECT c.*,i.label AS insurance_type_label FROM clients c LEFT JOIN insurance_types i ON i.id=c.insurance_type_id WHERE c.id=? AND c.agency_id=? FOR UPDATE',[clientId,agencyId]);
    if(!client)throw Object.assign(new Error('Client not found'),{status:404});
    const summary=await loadClientExchangeSummary({client});
    const modality=String(input.modality||'').toLowerCase(),insurance=String(input.insurance||'').trim();
    const serviceLocation=modality==='virtual'?'':String(input.serviceLocation||'');
    const schedule=normalizeExchangeSchedule(input.schedule||{}),concerns=String(input.concerns||'').trim();
    if(insurance.length>200||concerns.length>2000)throw Object.assign(new Error('Insurance or clinical concerns are too long'),{status:400});
    assertExchangeEssentials({preferences:{modality,serviceLocation,insurance,schedule},presentingProblems:concerns?[concerns]:summary.presentingProblems});
    const patch={preferredModality:modality,serviceLocation,serviceLocationSource:'preference',insurance,exchangeSchedule:schedule,...(concerns?{presentingConcern:concerns,submittedAt:new Date().toISOString()}:{})};
    for(const [key,value] of Object.entries(patch)) await db.execute(`UPDATE clients SET intake_preferences_json=JSON_SET(COALESCE(intake_preferences_json,JSON_OBJECT()),'$.${key}',CAST(? AS JSON)) WHERE id=? AND agency_id=?`,[JSON.stringify(value),clientId,agencyId]);
    await db.execute("INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,'exchange_service_preferences',?,?,?)",[clientId,actor.id,JSON.stringify(summary.preferences),JSON.stringify(patch),'Support updated matching details after reviewing the client record or speaking with the family. Insurance coverage still requires verification.']);
    await db.commit();return {saved:true};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
}
