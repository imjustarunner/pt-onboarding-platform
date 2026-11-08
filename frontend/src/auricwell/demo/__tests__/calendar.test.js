import {it,expect} from 'vitest';
import {demoResponse,actor,practice,clients,providers} from '../fixtures.js';
import {scheduleBlockColorKey,scheduleTypePalette} from '../../../utils/scheduleAppearance.js';

it.each(['2026-11-02','2026-07-06'])('projects distinct one-hour visits and real calendar event kinds in %s',weekStart=>{
 const summary=demoResponse(`/users/${actor.id}/schedule-summary`,{params:{weekStart}});
 const visits=summary.scheduleEvents.filter(event=>event.clientId),meetings=summary.scheduleEvents.filter(event=>!event.clientId);
 expect(visits.length).toBeGreaterThan(0);expect(visits.every(event=>Date.parse(event.endAt)-Date.parse(event.startAt)===3600000)).toBe(true);
 expect(visits.some(event=>event.serviceCode==='90847' && event.title.includes('Couples'))).toBe(true);
 expect(visits.some(event=>event.modality==='VIRTUAL' && event.locationLabel.includes('Virtual'))).toBe(true);
 expect(visits.filter(event=>event.isCancelled)).toHaveLength(1);expect(visits.find(event=>event.isCancelled)).toMatchObject({clientId:991022,appointmentStatus:'canceled_by_client',status:'CANCELLED'});
 expect(visits.some(event=>event.appointmentStatus==='client_confirmed')).toBe(true);expect(visits.some(event=>event.appointmentStatus==='scheduled')).toBe(true);
 const colors=meetings.map(event=>scheduleBlockColorKey({kind:'sevt',eventKind:event.kind,meetingSubtype:event.meetingSubtype,attendeeCount:event.attendeeCount}));
 expect(colors.sort()).toEqual(['cpa_meeting','team_meeting','town_hall']);
 expect(summary.supervisionSessions).toHaveLength(1);expect(summary.supervisionSessions[0]).toMatchObject({supervisorUserId:990113,superviseeUserId:actor.id,counterpartyName:'Dr. Tessa Brooks',role:'supervisee',sessionType:'individual'});
 const styles=[...meetings.map(event=>scheduleTypePalette({kind:'sevt',eventKind:event.kind,meetingSubtype:event.meetingSubtype,attendeeCount:event.attendeeCount})),scheduleTypePalette({kind:'supv',sessionType:'individual'})];expect(new Set(styles.map(style=>style.fill)).size).toBe(4);
 for(const event of [...meetings,...summary.supervisionSessions])expect(Date.parse(event.endAt)-Date.parse(event.startAt)).toBe(3600000);
 const mirror=demoResponse('/users/990113/schedule-summary',{params:{weekStart}}).supervisionSessions[0];expect(mirror).toMatchObject({id:997402,counterpartyName:'Avery Lane',role:'supervisor'});
 expect(mirror.startAt).toBe(summary.supervisionSessions[0].startAt);
});

it('keeps events within the provider scope and out of clinical appointment lists',()=>{
 for(const provider of providers){
   const summary=demoResponse(`/users/${provider.id}/schedule-summary`,{params:{weekStart:'2026-11-02'}});
   const ordered=[...summary.scheduleEvents,...summary.supervisionSessions].sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));
   for(let index=1;index<ordered.length;index++)expect(Date.parse(ordered[index].startAt)).toBeGreaterThanOrEqual(Date.parse(ordered[index-1].endAt));
   const appointments=demoResponse('/appointments',{params:{providerId:provider.id}}).appointments;expect(appointments.every(event=>clients.some(client=>client.id===event.clientId && client.provider_id===provider.id))).toBe(true);
 }
 const all=demoResponse('/auricwell-preview/agenda',{params:{scope:'mine',start:'2026-11-02',end:'2026-11-09'}});expect(new Set(all.items.map(event=>event.kind))).toEqual(new Set(['appointment','meeting','supervision']));
 const canceled=demoResponse('/auricwell-preview/agenda',{params:{scope:'mine',start:'2026-11-02',status:'canceled'}});expect(canceled.items).toHaveLength(1);
 expect(practice.id).toBe(990101);
});
