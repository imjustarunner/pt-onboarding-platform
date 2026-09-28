import pool from '../config/database.js';
import {requireProviderAvailabilityAccess} from '../services/providerAvailabilityAccess.service.js';
import Availability from '../services/providerAvailability.service.js';
import Hours from '../models/ProviderVirtualWorkingHours.model.js';

async function scope(req) {
 const agencyId=Number(req.query.agencyId || req.body?.agencyId),providerId=Number(req.params.providerId);
 await requireProviderAvailabilityAccess({actor:req.user,agencyId,providerId});
 return {agencyId,providerId};
}
const tables={weekly:'provider_virtual_working_hours',virtual:'provider_virtual_slot_availability',inPerson:'provider_in_person_slot_availability'};
export async function getWorkspace(req,res,next) {try {
 const ids=await scope(req);
 const weekStartYmd=String(req.query.weekStart||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStartYmd)||!Number.isFinite(Date.parse(weekStartYmd)))return res.status(400).json({error:{message:'Choose a valid week'}});
 const availability=await Availability.computeWeekAvailability({...ids,weekStartYmd,intakeOnly:true,includeDiagnostics:true});
 const sourceAgencyId=availability.scheduleAgencyId||ids.agencyId;
 // Shared schedules are viewable through the destination, but their edits need source-tenant authorization.
 let canEditSource=true;
 try {await requireProviderAvailabilityAccess({actor:req.user,...ids,agencyId:sourceAgencyId});} catch(e) {if(e.status===403)canEditSource=false;else throw e;}
 const weekly=await Hours.listForProvider({...ids,agencyId:sourceAgencyId});
 const publications=[];
 for(const kind of ['virtual','inPerson']) {
  const [rows]=await pool.execute(`SELECT id,agency_id AS agencyId,start_at AS startAt,end_at AS endAt,office_location_id AS buildingId,
   available_for_intake AS availableForIntake,available_for_session AS availableForSession
   FROM ${tables[kind]} WHERE provider_id=? AND agency_id IN (?,?) AND is_active=1 AND end_at>=UTC_TIMESTAMP() ORDER BY start_at`,
   [ids.providerId,ids.agencyId,sourceAgencyId]);
  publications.push(...rows.map(row=>({...row,kind,canEdit:Number(row.agencyId)===ids.agencyId||canEditSource})));
 }
 res.json({...availability,weekly,publications,canEditSource});
 }catch(e){next(e);}}
export async function deletePublication(req,res,next) {try {
 const ids=await scope(req),kind=req.params.kind,id=Number(req.params.id),table=tables[kind];
 if(!table||!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:{message:'Invalid published availability'}});
 const [result]=await pool.execute(kind==='weekly'
  ? `DELETE FROM ${table} WHERE id=? AND agency_id=? AND provider_id=?`
  : `UPDATE ${table} SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=? AND provider_id=? AND is_active=1`,
  [id,ids.agencyId,ids.providerId]);
 if(!result.affectedRows)return res.status(404).json({error:{message:'Published availability no longer exists. Refresh the list.'}});
 res.json({ok:true});
 }catch(e){next(e);}}
