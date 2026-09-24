import pool from '../config/database.js';
import { getWorkspaceClientsForEmployee } from './googleWorkspaceAuth.service.js';
import { assertFamilyBenefit, requireHousehold } from './familyAuth.service.js';
import { familyError } from './familyPolicy.js';
import { familyTransaction, saveFamilyEntry } from './family.service.js';
import { zonedWallTimeToUtc } from '../utils/zonedWallTime.util.js';

async function employeeCalendar(userId) {
  const [users] = await pool.execute('SELECT email FROM users WHERE id=?', [userId]);
  const email = users[0]?.email;
  if (!email || email.endsWith('@members.invalid')) throw familyError('Connect an adult’s existing Google Workspace account.',400);
  try { return { ...(await getWorkspaceClientsForEmployee({subjectEmail:email})), email }; }
  catch { throw familyError('Google Calendar access is not configured for this account. An administrator must enable Workspace calendar access first.',503); }
}
export async function listFamilyCalendars(session, id) {
  await requireHousehold(session,id,pool,true);
  const {calendar} = await employeeCalendar(session.userId);
  const calendars=[]; let pageToken;
  do {
    const {data}=await calendar.calendarList.list({maxResults:250,pageToken});
    for(const c of data.items || []) if(!c.primary && !c.deleted && ['owner','writer','reader'].includes(c.accessRole)) calendars.push({id:c.id,name:c.summaryOverride || c.summary,access:c.accessRole});
    pageToken=data.nextPageToken;
  } while(pageToken);
  return calendars;
}
export async function connectFamilyCalendar(session,id,body) {
  const calendars=await listFamilyCalendars(session,id);
  const selected=calendars.find(c=>c.id===body.calendarId);
  if(!selected)throw familyError('Choose a shared calendar available to your account.');
  const [users]=await pool.execute('SELECT email FROM users WHERE id=?',[session.userId]);
  try {
    await familyTransaction(async db=>{
      await requireHousehold(session,id,db,true);
      await db.execute('SELECT id FROM family_households WHERE id=? FOR UPDATE',[id]);
      const [existing]=await db.execute('SELECT calendar_id FROM family_calendar_connections WHERE household_id=?',[id]);
      if(existing[0]&&existing[0].calendar_id!==selected.id)throw familyError('Disconnect the current calendar before choosing another.');
      if(existing[0]) await db.execute('UPDATE family_calendar_connections SET calendar_name=?,connected_by_user_id=?,subject_email=?,last_error=NULL WHERE household_id=?',[selected.name,session.userId,users[0].email,id]);
      else await db.execute('INSERT INTO family_calendar_connections (household_id,calendar_id,calendar_name,connected_by_user_id,subject_email) VALUES (?,?,?,?,?)',[id,selected.id,selected.name,session.userId,users[0].email]);
    });
  } catch(e){if(e.code==='ER_DUP_ENTRY')throw familyError('This calendar is already connected to another household.',409);throw e;}
  return {name:selected.name};
}
async function connectedCalendar(session,id) {
  const household=await requireHousehold(session,id,pool,true);
  const [rows]=await pool.execute('SELECT * FROM family_calendar_connections WHERE household_id=?',[id]);
  const connection=rows[0];
  if(!connection)throw familyError('Choose a shared Google calendar first.');
  await assertFamilyBenefit(connection.connected_by_user_id,session.agencyId);
  await requireHousehold({userId:connection.connected_by_user_id,agencyId:session.agencyId},id,pool,true);
  const client=await employeeCalendar(connection.connected_by_user_id);
  // Reading calendar metadata rechecks the connector’s current Google ACL access.
  await client.calendar.calendars.get({calendarId:connection.calendar_id});
  return {...client,connection,household};
}
export function googleFamilyEvent(event,timezone) {
  const time=part=>{
    if(part?.dateTime)return part.dateTime;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(part?.date || ''))throw familyError('This event has no usable date.');
    const [year,month,day]=part.date.split('-').map(Number);
    return zonedWallTimeToUtc({year,month,day,hour:0,minute:0,timeZone:timezone}).toISOString();
  };
  return {id:event.id,title:event.summary || 'Family event',startAt:time(event.start),endAt:time(event.end),allDay:!!event.start?.date,address:event.location || '',notes:String(event.description || '').replace(/<[^>]*>/g,'').slice(0,4000)};
}
export async function previewFamilyCalendar(session,id) {
  const {calendar,connection,household}=await connectedCalendar(session,id);
  const events=[];let pageToken;
  const now=Date.now();
  do{
    const {data}=await calendar.events.list({calendarId:connection.calendar_id,timeMin:new Date(now-86400000).toISOString(),timeMax:new Date(now+90*86400000).toISOString(),singleEvents:true,orderBy:'startTime',maxResults:250,pageToken});
    for(const e of data.items || [])if(e.status!=='cancelled'&&e.start)events.push(googleFamilyEvent(e,household.timezone));
    pageToken=data.nextPageToken;
  }while(pageToken&&events.length<1000);
  const [links]=await pool.execute('SELECT google_event_id FROM family_google_event_links WHERE household_id=? AND calendar_id=?',[id,connection.calendar_id]);
  const imported=new Set(links.map(l=>l.google_event_id));
  await pool.execute('UPDATE family_calendar_connections SET last_synced_at=NOW(),last_error=NULL WHERE household_id=?',[id]);
  return {events:events.map(e=>({...e,imported:imported.has(e.id)})),calendarName:connection.calendar_name};
}
export async function importFamilyCalendarEvent(session,id,body) {
  const {calendar,connection,household}=await connectedCalendar(session,id);
  const eventId=String(body.eventId || '');
  if(!eventId || eventId.length>255)throw familyError('Choose a Google calendar event.');
  const {data}=await calendar.events.get({calendarId:connection.calendar_id,eventId});
  if(data.status==='cancelled')throw familyError('This Google event has been cancelled.');
  const event=googleFamilyEvent(data,household.timezone);
  // All metadata comes from the authorized calendar, never a caller-supplied calendar/subject.
  // Unique link insert shares the entry transaction: retry/parallel imports cannot duplicate schedules.
  try{
    return await saveFamilyEntry(session,id,{kind:'event',title:event.title.slice(0,200),memberUserId:body.memberUserId,startAt:event.startAt,endAt:event.endAt,metadata:{eventType:body.eventType || 'family',autoTheme:body.autoTheme === true || !body.eventType,artworkVariant:body.artworkVariant,address:event.address,notes:event.notes,allDay:event.allDay,googleSource:true}},null,async(db,entryId)=>{
      const [current]=await db.execute('SELECT calendar_id FROM family_calendar_connections WHERE household_id=?',[id]);
      if(current[0]?.calendar_id!==connection.calendar_id)throw familyError('The calendar connection changed. Refresh and try again.',409);
      await db.execute('INSERT INTO family_google_event_links (household_id,calendar_id,entry_id,google_event_id,google_etag) VALUES (?,?,?,?,?)',[id,connection.calendar_id,entryId,eventId,data.etag || null]);
    });
  }catch(e){if(e.code==='ER_DUP_ENTRY')throw familyError('This event is already on your family calendar.',409);throw e;}
}
export async function disconnectFamilyCalendar(session,id) {
  await familyTransaction(async db=>{
    await requireHousehold(session,id,db,true);
    await db.execute('SELECT id FROM family_households WHERE id=? FOR UPDATE',[id]);
    await db.execute('DELETE FROM family_calendar_connections WHERE household_id=?',[id]);
  });
}

// Read a selected incoming calendar live; imported copies are not duplicated in the view.
export async function visibleGoogleFamilyEvents(session,id,from,to) {
  await requireHousehold(session,id);
  const [rows]=await pool.execute('SELECT connected_by_user_id FROM family_calendar_connections WHERE household_id=?',[id]);
  if(!rows[0])return [];
  const connector={userId:rows[0].connected_by_user_id,agencyId:session.agencyId};
  const {calendar,connection,household}=await connectedCalendar(connector,id);
  const [links]=await pool.execute('SELECT google_event_id FROM family_google_event_links WHERE household_id=? AND calendar_id=?',[id,connection.calendar_id]);
  const imported=new Set(links.map(l=>l.google_event_id));const events=[];let pageToken;
  do{
    const {data}=await calendar.events.list({calendarId:connection.calendar_id,timeMin:from.toISOString(),timeMax:to.toISOString(),singleEvents:true,orderBy:'startTime',maxResults:250,pageToken});
    for(const raw of data.items || [])if(raw.status!=='cancelled' && raw.start && !imported.has(raw.id)){
      const e=googleFamilyEvent(raw,household.timezone);
      events.push({key:`google:${connection.calendar_id}:${e.id}`,title:e.title,start:e.startAt,end:e.endAt,source:'Google',location:e.address,
        ...(e.allDay?{startDate:raw.start.date,endDate:raw.end.date}:{})});
    }
    pageToken=data.nextPageToken;
    if(events.length>2000)throw familyError('Too many Google events in this range. Choose a shorter range.');
  }while(pageToken);
  return events;
}
