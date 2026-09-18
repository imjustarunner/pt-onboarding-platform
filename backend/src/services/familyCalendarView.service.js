import pool from '../config/database.js';
import { requireHousehold, assertFamilyBenefit } from './familyAuth.service.js';
import { calendarWindow } from './calendarPublicationPolicy.js';
import { familyCalendarEvents, workCalendarEvents } from './calendarEvents.service.js';
import { visibleGoogleFamilyEvents } from './familyCalendar.service.js';
import UserExternalCalendar from '../models/UserExternalCalendar.model.js';
import ExternalBusyCalendarService from './externalBusyCalendar.service.js';
export async function familyCalendarView(session,id,query={}) {
  const household=await requireHousehold(session,id);
  const {start,end}=calendarWindow(query.from,query.to,35);
  const events=await familyCalendarEvents(id,start,end,{details:true}),warnings=[];
  try{events.push(...await visibleGoogleFamilyEvents(session,id,start,end));}catch{warnings.push('Google events could not be loaded. Check the incoming calendar connection below.');}
  if(query.work!=='hidden'){
    const [members]=await pool.execute('SELECT user_id,display_name,color,photo_url FROM family_members WHERE household_id=? AND share_work=1',[id]);
    for(const member of members){
      try{await assertFamilyBenefit(member.user_id,session.agencyId);}catch{continue;}
      const identity={work:true,memberId:member.user_id,memberName:member.display_name,color:member.color,photo:member.photo_url};
      const work=await workCalendarEvents(member.user_id,session.agencyId,start,end);
      events.push(...work.map(e=>({key:`${member.user_id}:${e.key}`,start:e.start,end:e.end,startDate:e.startDate,endDate:e.endDate,...identity,
        title:query.work==='details'?`${member.display_name} · ${e.title.split(' · ')[0]}`:'Work',location:query.work==='details'?(e.location || ''):''})));
      // Existing account feeds are busy overlays, never family copies or client details.
      const calendars=await UserExternalCalendar.listForUser({userId:member.user_id,activeOnly:true});
      const feeds=calendars.flatMap(c=>c.feeds.filter(f=>f.isActive).map(f=>({url:f.icsUrl})));
      if(feeds.length){
        const result=await ExternalBusyCalendarService.getBusyForFeeds({userId:member.user_id,weekStart:start.toISOString().slice(0,10),feeds,timeMinIso:start.toISOString(),timeMaxIso:end.toISOString()});
        if(!result.ok)warnings.push(`${member.display_name}’s external work calendar could not be refreshed.`);
        events.push(...(result.busy || []).map(e=>({key:`external:${member.user_id}:${e.startAt}`,title:query.work==='details'?`${member.display_name} · Work`:'Work',start:e.startAt,end:e.endAt,...identity})));
      }
    }
  }
  return {events,warnings,timezone:household.timezone};
}
