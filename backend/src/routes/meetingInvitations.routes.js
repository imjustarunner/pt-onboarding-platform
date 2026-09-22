import express from 'express';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { authenticate } from '../middleware/auth.middleware.js';
import pool from '../config/database.js';
import { invitationEvents, resolvePersonalMeetingInvitation } from '../services/meetingInvitations.service.js';
import { activeMeetingPrompts } from '../services/activeMeetingPrompts.service.js';

const router = express.Router();
router.post('/interview/:token/rsvp', async (req,res,next) => {
  try {
    if(!/^[\w-]{32}$/.test(String(req.params.token)) || !['accepted','declined'].includes(req.body.response))return res.status(400).json({error:{message:'Invalid response'}});
    const [rows]=await pool.execute(`SELECT hi.candidate_user_id,p.id FROM hiring_interviews hi JOIN provider_schedule_events p ON p.id=hi.provider_schedule_event_id WHERE hi.guest_join_token=? AND p.status='ACTIVE' AND p.meeting_completed_at IS NULL AND p.end_at>UTC_TIMESTAMP()`,[req.params.token]);
    if(!rows[0])return res.status(410).json({error:{message:'This interview invitation is no longer active.'}});
    await pool.execute(`INSERT INTO meeting_participant_preferences (event_id,user_id,rsvp,rsvp_at) VALUES (?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE rsvp=VALUES(rsvp),rsvp_at=VALUES(rsvp_at)`,[rows[0].id,rows[0].candidate_user_id,req.body.response]);
    res.json({ok:true});
  }catch(error){next(error);}
});
router.get('/active' , authenticate, async (req,res,next) => {
  res.set('Cache-Control','no-store');
  try { res.json({prompts: await activeMeetingPrompts(req.user.id)}); }
  catch (error) { next(error); }
});
router.post('/:token/rsvp', authenticate, async (req,res,next) => {
  try {
    if(!['accepted','declined'].includes(req.body.response)) return res.status(400).json({error:{message:'Choose attending or decline.'}});
    const [rows]=await pool.execute('SELECT * FROM meeting_email_invitations WHERE join_token=? AND user_id=?',[String(req.params.token),req.user.id]);
    if(!rows[0] || rows[0].meeting_type!=='team_meeting')return res.status(404).json({error:{message:'Invitation not found'}});
    const events=await invitationEvents(rows[0]);const event=events.find(e=>Number(e.id)===Number(req.body.eventId));
    if(!event || event.meeting_completed_at || parseUtcDate(event.end_at) <= new Date())return res.status(410).json({error:{message:'This invitation is no longer active.'}});
    await pool.execute(`INSERT INTO meeting_participant_preferences (event_id,user_id,rsvp,rsvp_at) VALUES (?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE rsvp=VALUES(rsvp),rsvp_at=VALUES(rsvp_at)`,[event.id,req.user.id,req.body.response]);
    res.json({ok:true,response:req.body.response});
  }catch(error){next(error);}
});
router.get('/:token', authenticate, async (req,res,next) => {
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  try { res.json(await resolvePersonalMeetingInvitation(req.params.token,req.user.id)); }
  catch (error) { next(error); }
});
export default router;
