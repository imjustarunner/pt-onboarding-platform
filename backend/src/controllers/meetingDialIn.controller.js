import pool from '../config/database.js';
import { dialInConfigured, dialInReadiness, dialInError } from '../services/meetingDialInPolicy.js';
import { dialInContext, dialInRoster, admitDialInUser } from '../services/meetingDialInContext.service.js';
import { personalDialIn, callWithInvitation, reconcileDialInCall, endDialInCall } from '../services/meetingDialIn.service.js';
import { sendMeetingDialIn } from '../services/meetingDialInDelivery.service.js';

export function meetingDialInController(type) {
  const id=req=>Number(req.params.id || req.params.eventId);
  return {
    details:async(req,res,next)=>{try{
      const actor=await dialInContext(type,id(req),req.user.id);
      res.set('Cache-Control','no-store');
      if(!dialInConfigured()) { const {reason,missing}=dialInReadiness(); return res.json({enabled:false,isHost:actor.isHost,reason,...(actor.isHost?{missing}: {})}); }
      const target=Number(req.query.userId || req.user.id);
      if(target!==Number(req.user.id)&&!actor.isHost)throw dialInError('Only the host can view another participant’s invitation.',403);
      const details=await personalDialIn(type,id(req),target);
      const [calls]=await pool.execute(`SELECT c.id,c.state,c.connected_at,c.audio_status,i.user_id,
        CONCAT_WS(' ',COALESCE(NULLIF(u.preferred_name,''),u.first_name),u.last_name) name
        FROM meeting_dial_in_calls c JOIN meeting_dial_in_invitations i ON i.id=c.invitation_id JOIN users u ON u.id=i.user_id
        WHERE i.meeting_type=? AND i.meeting_id=? AND c.ended_at IS NULL AND c.state IN ('waiting','connecting','connected')`,[type,id(req)]);
      res.set('Cache-Control','no-store').json({enabled:true,details,userId:target,isHost:actor.isHost,
        participants:actor.isHost?await dialInRoster(actor):[],calls:actor.isHost?calls:calls.filter(c=>Number(c.user_id)===Number(req.user.id))});
    }catch(error){next(error);}},
    send:async(req,res,next)=>{try{res.json(await sendMeetingDialIn({type,meetingId:id(req),actorUserId:req.user.id,
      userId:Number(req.body.userId||req.user.id),channel:req.body.channel,requestKey:req.body.requestKey}));}catch(error){next(error);}},
    manage:async(req,res,next)=>{try{
      const actor=await dialInContext(type,id(req),req.user.id);
      if(!dialInConfigured())throw dialInError('Telephone joining is not configured or enabled.',503);
      if(!actor.isHost)throw dialInError('Only the meeting host can manage telephone participants.',403);
      const call=await callWithInvitation(req.params.callId);
      if(!call||call.meeting_type!==type||Number(call.meeting_id)!==id(req))throw dialInError('Telephone participant not found.',404);
      if(call.revoked_at||call.ended_at||['ending','ended'].includes(call.state))throw dialInError('This telephone connection has ended or its access was removed. Refresh the meeting.',409);
      if(req.body.action==='admit'){
        await admitDialInUser(await dialInContext(type,id(req),call.user_id));await reconcileDialInCall(call.id);
      }else if(req.body.action==='remove'){
        await pool.execute('UPDATE meeting_dial_in_invitations SET revoked_at=UTC_TIMESTAMP(3) WHERE id=?',[call.invitation_id]);
        await endDialInCall(call.id);
      }else throw dialInError('Choose admit or remove.',400);
      res.json({ok:true});
    }catch(error){next(error);}}
  };
}
