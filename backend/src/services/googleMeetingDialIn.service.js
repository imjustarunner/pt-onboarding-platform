import pool from '../config/database.js';
import {parseMeetingSettings} from './meetingSettingsPolicy.js';
import {currentGoogleConference,googleDialInContent} from './googleMeetingConference.service.js';

export async function optionalGoogleMeetingDialIn(event,userId,{db=pool,conference=currentGoogleConference}={}) {
 if(parseMeetingSettings(event.meeting_settings_json).includeGoogleDialIn!==true||!event.google_meet_link||!event.google_event_id)return null;
 // A Google phone number joins Google Meet, so it must not be offered for an
 // event whose Join action enters the app's video room.
 if(event.supervisor_user_id||Number(event.platform_video_link)!==0)return null;
 const [[recipient]]=await db.execute(`SELECT e.id FROM provider_schedule_events e JOIN users u ON u.id=? AND u.is_active=1
   WHERE e.id=? AND e.agency_id=? AND e.status='ACTIVE' AND e.meeting_completed_at IS NULL
     AND (e.provider_id=u.id OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=e.id AND a.user_id=u.id))`,[userId,event.id,event.agency_id]);
 if(!recipient)return null;
 return googleDialInContent(await conference({providerUserId:event.provider_id,eventId:event.google_event_id,startAt:event.start_at,endAt:event.end_at,meetLink:event.google_meet_link}));
}
