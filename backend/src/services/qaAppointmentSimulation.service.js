import {qaPaymentSimulationConfig} from './qaPaymentSimulator.service.js';
import {utcMysqlToIso} from '../utils/zonedWallTime.util.js';
import {decryptFamilyBilling} from './familyBillingEncryption.service.js';
// This is permission to run the isolated payment simulator, never a live charge.
export async function qaTutoringSimulationAllowed(row,db,payload=null){
 if(row.source_type!=='qa_appointment'||row.service_domain!=='tutoring'||![453,454].includes(Number(row.agency_id)))return false;
 if(!(await qaPaymentSimulationConfig(row.agency_id,db)).enabled)return false;
 const data=payload||(row.source_payload?decryptFamilyBilling(row.source_payload,`receivable:${row.agency_id}:${row.client_id}`):{});
 if(data.syntheticOnly!==true||data.simulationOnly!==true||data.noCollection!==false||Number(data.appointmentId)!==Number(row.source_key))return false;
 const [[source]]=await db.execute(`SELECT a.status,a.end_at,a.cancellation_fee_cents,a.package_entitlement_id,b.amount_cents,b.payment_status,c.is_demo
  FROM appointments a JOIN appointment_billing b ON b.appointment_id=a.id
  JOIN appointment_participants p ON p.appointment_id=a.id AND p.client_id=? JOIN clients c ON c.id=p.client_id
  WHERE a.id=? AND a.agency_id=? AND a.business_type='tutoring' AND a.service_code='TUTORING'`,[row.client_id,Number(row.source_key),row.agency_id]);
 if(!source||Number(source.is_demo)!==1||source.package_entitlement_id||['paid','waived','package_consumed','free_rebook'].includes(source.payment_status))return false;
 if(!['completed','no_show','late_canceled','canceled','canceled_by_client','canceled_by_provider'].includes(source.status))return false;
 if(['completed','no_show'].includes(source.status)){const end=new Date(utcMysqlToIso(source.end_at)||source.end_at);if(!Number.isFinite(+end)||+end>Date.now())return false;}
 const amount=Number(source.status==='completed'?source.amount_cents:source.cancellation_fee_cents||0);
 return Number.isSafeInteger(amount)&&amount>0&&amount===Number(row.amount_cents);
}
