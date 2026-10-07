import pool from '../config/database.js';
import { isCommunicationStaffActive } from '../utils/communicationReceptionPolicy.js';
import { createPhoneFollowupTicket } from '../services/phoneFollowupTicket.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
export const postPhoneFollowup = async (req,res,next) => {
  try {
    const agencyId=Number(req.params.agencyId);
    if(!Number.isSafeInteger(agencyId)||agencyId<1)return res.status(400).json({error:{message:'Invalid agency.'}});
    const [actors]=await pool.execute('SELECT * FROM users WHERE id=? LIMIT 1',[req.user.id]);
    const actor=actors[0];
    if(!isCommunicationStaffActive(actor)||!['admin','super_admin','support','clinical_practice_assistant'].includes(actor.role))return res.status(403).json({error:{message:'Phone follow-up requires current agency support access.'}});
    if(actor.role!=='super_admin'){
      const [membership]=await pool.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=TRUE LIMIT 1',[actor.id,agencyId]);
      if(!membership.length)return res.status(403).json({error:{message:'Access denied for this agency.'}});
    }
    const result=await createPhoneFollowupTicket({agencyId,userId:actor.id,body:req.body});
    await logAuditEvent(req,{actionType:'phone_followup_ticket_created',agencyId,metadata:result});
    res.set('Cache-Control','no-store');res.status(result.duplicate?200:201).json(result);
  } catch(e){next(e);}
};
