import Client from '../models/Client.model.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import { clientCareBillingSummary } from '../services/clientCareBillingSummary.service.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';
export async function getClientCareBillingSummary(req,res,next){try{
 const client=await Client.findById(req.params.id);
 if(!client) return res.status(404).json({error:{message:'Client not found'}});
 const role=String(req.user.role||'').toLowerCase();
 if(['school_staff','guardian','client_guardian','client'].includes(role))return res.status(403).json({error:{message:'Agency care-team access required'}});
 const access=await resolveClientRecordAccess({userId:req.user.id,role,clientId:client.id,client});
 if(!access.ok)return res.status(access.status).json({error:{message:access.message}});
 const result=await clientCareBillingSummary(client.agency_id,client.id);
 await logClientAccess(req,client.id,'view_care_coverage_status');
 res.set('Cache-Control','no-store').json(result);
}catch(e){next(e);}}
