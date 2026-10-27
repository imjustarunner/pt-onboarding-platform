import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';

export async function notifyReferralSupport({agencyId,ticketId,actorUserId=null,title='Referral support request'}) {
  const [members] = await pool.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE ua.agency_id=? AND ua.is_active=1 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
      AND LOWER(COALESCE(NULLIF(ua.agency_role,''),u.role)) IN ('support','admin','super_admin')`,[agencyId]);
  for(const member of members) await Notification.create({type:'support_ticket_created',severity:'info',
    title,message:'A conversation is available in the shared support queue.',
    userId:member.id,agencyId,relatedEntityType:'support_ticket',relatedEntityId:ticketId,actorUserId,actorSource:'Referral support'});
}
