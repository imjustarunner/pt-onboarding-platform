import { invitationSnoozedUntil } from '../services/trainingRegistrationPolicy.js';
import { canViewDeclinedMeetingParticipants, visibleMeetingRsvpParticipants } from '../services/meetingRsvpVisibility.js';
import { saveTrainingRsvp } from '../services/scheduledTrainingRsvp.service.js';
import { trainingReminderDescription } from '../services/meetingReminderPolicy.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import { resolveTeamMeetingInvitationAccess } from '../services/teamMeetingInvitationAccess.service.js';
import express from 'express';
import { huddleTitle } from '../services/huddlePolicy.js';
import { supervisionCalendar, supervisionEmailPeople } from '../services/supervisionEmail.service.js';
import { saveSupervisionRsvp } from '../services/supervisionRsvp.service.js';
import { supervisionAttendance } from '../services/supervisionAttendancePolicy.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { authenticate } from '../middleware/auth.middleware.js';
import pool from '../config/database.js';
import { invitationEvents } from '../services/meetingInvitations.service.js';
import { invitationResponseContext } from '../services/meetingInvitationResponse.service.js';
import { meetingParticipantRows } from '../services/meetingParticipants.service.js';
import { mapMeetingAgendaItem } from '../models/MeetingAgendaItem.model.js';
import { activeMeetingPrompts } from '../services/activeMeetingPrompts.service.js';
import { upcomingMeetingInvitations } from '../services/upcomingMeetingInvitations.service.js';
import { resolveSupervisionInvitationAccess } from '../services/supervisionInvitationAccess.service.js';

const router = express.Router();
router.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();});
router.post('/interview/:token/rsvp', async (req,res,next) => {
  try {
    if(!/^[\w-]{32}$/.test(String(req.params.token)) || !['accepted','declined'].includes(req.body.response))return res.status(400).json({error:{message:'Invalid response'}});
    const [rows]=await pool.execute(`SELECT hi.candidate_user_id,p.id FROM hiring_interviews hi JOIN provider_schedule_events p ON p.id=hi.provider_schedule_event_id WHERE hi.guest_join_token=? AND p.status='ACTIVE' AND p.meeting_completed_at IS NULL AND p.end_at>UTC_TIMESTAMP()`,[req.params.token]);
    if(!rows[0])return res.status(410).json({error:{message:'This interview invitation is no longer active.'}});
    await pool.execute(`INSERT INTO meeting_participant_preferences (event_id,user_id,rsvp,rsvp_at) VALUES (?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE rsvp=VALUES(rsvp),rsvp_at=VALUES(rsvp_at)`,[rows[0].id,rows[0].candidate_user_id,req.body.response]);
    res.json({ok:true});
  }catch(error){next(error);}
});
router.get('/:token/calendar.ics', async (req,res,next) => {
  try {
    if(!/^[\w-]{32}$/.test(String(req.params.token)))return res.sendStatus(404);
    const [rows]=await pool.execute("SELECT * FROM meeting_email_invitations WHERE join_token=?",[req.params.token]);
    if(!rows[0])return res.sendStatus(404);
    const event=(await invitationEvents(rows[0])).find(e=>Number(e.id)===Number(req.query.eventId));
    if(!event || (rows[0].meeting_type!=='supervision' && event.kind!=='HUDDLE'))return res.sendStatus(404);
    const calendarEvent=event.participant_join_token||event.join_token?event:await (event.kind==='HUDDLE'?ProviderScheduleEvent:SupervisionSession).resolveByJoinRef(String(event.id));
    const calendar=supervisionCalendar({...event,...calendarEvent},`${await tenantMeetingBase(event.agency_id)}/join/invitation/${req.params.token}`);
    if(!calendar)return res.sendStatus(404);
    res.set({'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':`attachment; filename="${event.kind==='HUDDLE'?'huddle':'supervision'}.ics"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}).send(calendar.ics);
  }catch(error){next(error);}
});
router.get('/active' , authenticate, async (req,res,next) => {
  res.set('Cache-Control','no-store');
  try { res.json({prompts: await activeMeetingPrompts(req.user.id)}); }
  catch (error) { next(error); }
});
router.get('/upcoming', authenticate, async (req,res,next) => {
  try { res.json({prompts: await upcomingMeetingInvitations(req.user.id)}); }
  catch (error) { next(error); }
});
router.post('/snooze', authenticate, async (req,res,next) => {
  try {
    const now = new Date();
    const prompts = await upcomingMeetingInvitations(req.user.id, now, { includeSnoozed: true });
    const prompt = prompts.find(p => p.key === req.body.key);
    if (!prompt) return res.status(404).json({error:{message:'This invitation is no longer available.'}});
    const until = invitationSnoozedUntil(prompt, now);
    if (!until) return res.status(409).json({error:{message:'Please RSVP that you are attending or not attending. Registration closes within 12 hours and a decision must be made. Thank you for your understanding.'}});
    await pool.execute(`INSERT INTO dashboard_invitation_snoozes (user_id,invitation_key,snoozed_until) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE snoozed_until=VALUES(snoozed_until)`, [req.user.id,prompt.snoozeKey || prompt.key,until]);
    res.json({ok:true,snoozedUntil:until.toISOString()});
  } catch(error) { next(error); }
});
router.post('/:token/rsvp', async (req,res,next) => {
  try {
    if(!['accepted','declined'].includes(req.body.response)) return res.status(400).json({error:{message:'Choose attending or decline.'}});
    const {invitation,event,userId}=await invitationResponseContext(req.params.token,req.body.eventId);
    if(invitation.meeting_type==='supervision') {
      return res.json(await saveSupervisionRsvp({sessionId:event.id,userId,response:req.body.response,reason:req.body.reason,scope:req.body.scope,untilDate:req.body.untilDate}));
    }
    if(event.meeting_subtype==='training') return res.json(await saveTrainingRsvp(event,userId,req.body.response,req.body.reason));
    await pool.execute(`INSERT INTO meeting_participant_preferences (event_id,user_id,rsvp,rsvp_at) VALUES (?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE rsvp=VALUES(rsvp),rsvp_at=VALUES(rsvp_at)`,[event.id,userId,req.body.response]);
    res.json({ok:true,response:req.body.response});
  }catch(error){next(error);}
});
router.get('/:token', async (req,res,next) => {
  res.set({ 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' });
  try {
    if (!req.query.details) {
      const supervision = await resolveSupervisionInvitationAccess(req.params.token);
      if (supervision) return res.json(supervision);
      const team=await resolveTeamMeetingInvitationAccess(req.params.token);
      if(team) return res.json(team);
    }
    if (!req.query.details) return res.status(404).json({error:{message:'This personal invitation was not found.'}});
    return next();
  } catch (error) { next(error); }
}, async (req,res,next) => {
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  try {
    if(req.query.details) {
      const {invitation,event,userId}=await invitationResponseContext(req.params.token,req.query.eventId);
      const people=invitation.meeting_type==='supervision'||event.kind==='HUDDLE'?await supervisionEmailPeople(event):await meetingParticipantRows(event);
      const [agendaRows]=await pool.execute(`SELECT i.title FROM meeting_agenda_items i JOIN meeting_agendas a ON a.id=i.meeting_agenda_id WHERE a.agency_id=? AND a.meeting_type=? AND a.meeting_id=? ORDER BY i.sort_order,i.id`,[invitation.agency_id,invitation.meeting_type==='supervision'?'supervision_session':'provider_schedule_event',event.id]);
      const tz=event.event_timezone||'America/Denver';
      const recipient=people.find(p=>Number(p.id)===Number(userId));
      const attendance=recipient && invitation.meeting_type==='supervision' ? supervisionAttendance(event,recipient) : event.meeting_subtype==='training' ? {
        tier:Number(recipient?.is_required) ? 'mandatory' : 'optional',
        label:Number(recipient?.is_required) ? 'Mandatory training' : 'Optional training',
        description:`${Number(recipient?.is_required) ? 'Your attendance is required.' : 'You are welcome to attend.'} RSVP applies to all remaining training dates. ${trainingReminderDescription(event,{isRequired:Number(recipient?.is_required)===1})}`
      } : null;
      const [[recipientAccount]] = await pool.execute('SELECT id,role FROM users WHERE id=?',[userId]);
      const canSeeDeclineReasons = canViewDeclinedMeetingParticipants(event,recipientAccount || {id:userId},people);
      if(event.meeting_subtype==='training') {
        const [reasons]=await pool.execute('SELECT user_id,rsvp_decline_reason FROM meeting_participant_preferences WHERE event_id=? AND (?=1 OR user_id=?)',[event.id,Number(canSeeDeclineReasons),userId]);
        for(const person of people)person.rsvp_decline_reason=reasons.find(r=>Number(r.user_id)===Number(person.id))?.rsvp_decline_reason || null;
      }
      const format = new Intl.DateTimeFormat('en-US', {dateStyle:'full', timeStyle:'short', timeZone:tz});
      return res.json({meeting:{
        isTraining:event.meeting_subtype==='training',
        recipientName:recipient?.name || '',
        agenda:agendaRows.map(mapMeetingAgendaItem).map(i=>({title:i.title})),
        attendance, rsvp:recipient?.status || recipient?.rsvp || null, declineReason:recipient?.rsvp_decline_reason || recipient?.decline_reason || null,
        canSkipRecurring:attendance?.tier==='mandatory' && invitation.meeting_type==='supervision' && event.session_type==='group' && !!event.recurrence_series_id && event.enrollment_mode!=='signup_only',
        sessionDate:new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(parseUtcDate(event.start_at)),
        title:event.kind==='HUDDLE'?huddleTitle(event):event.session_type==='group'?'Group supervision':event.title||(invitation.meeting_type==='supervision'?'Supervision':'Meeting'),
        when:format.format(parseUtcDate(event.start_at))+' – '+format.format(parseUtcDate(event.end_at))+` (${tz})`,
        location:event.location_text || (['IN_PERSON','IN-PERSON'].includes(String(event.modality).toUpperCase())?'In person':'Virtual'),
        canSeeDeclined:canSeeDeclineReasons,
        participants:visibleMeetingRsvpParticipants(people,canSeeDeclineReasons).map(p=>({name:p.name,status:p.status||p.rsvp,isRequired:!!Number(p.is_required),isPresenter:p.isPresenter,
          ...((canSeeDeclineReasons || Number(p.id)===Number(userId)) && (p.decline_reason || p.rsvp_decline_reason) ? {declineReason:p.decline_reason || p.rsvp_decline_reason} : {})}))
      }});
    }
    return res.status(404).json({error:{message:'Invitation not found.'}});
  }
  catch (error) { next(error); }
});
export default router;
