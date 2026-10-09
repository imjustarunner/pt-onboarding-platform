import pool from '../config/database.js';
import {hiringCommunicationContext,saveHiringChoice} from '../services/hiringCommunication.service.js';
export async function portalHiringChoices(req,res,next){
 try {
  // Use the same agency resolution as the portal manifest. Ignore body IDs.
  const [[agency]]=await pool.execute('SELECT a.id FROM agencies a JOIN user_agencies ua ON ua.agency_id=a.id WHERE ua.user_id=? LIMIT 1',[req.portalUser.id]);
  if(!agency)throw Object.assign(new Error('Organization not found.'),{status:404});
  res.json(req.method==='GET'?await hiringCommunicationContext(agency.id,req.portalUser.id):
    await saveHiringChoice({userId:req.portalUser.id,agencyId:agency.id,input:req.body,ip:req.ip,userAgent:req.get('user-agent')}));
 }catch(e){next(e);}
}
