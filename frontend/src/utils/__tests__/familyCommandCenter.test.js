import { describe, it, expect } from 'vitest';
import { inferFamilyEventType, familyEventMetadata, themedFamilyCalendarEvent, isFamilyHost, memberStatus, eventType, eventArtwork, eventArtworkChoices, familyEventTypes, familyStatuses, familyEventCategories, familyCalendarEntries, searchFamilyEventGroups } from '../familyCommandCenter';
import requested from './familyEventCatalog.expected.json';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { familyScheduleProjection } from '../familyScheduleVisibility';
describe('family calendar and routing',()=>{
  it('ships themed artwork for every event category and a fallback for new types',()=>{
    expect(familyEventTypes).toHaveLength(341);
    for(const type of familyEventTypes)expect(existsSync(path.resolve(process.cwd(),'public'+type.artwork)),type.id).toBe(true);
    expect(eventType('something-new').artwork).toBe(eventType('family').artwork);
  });
  it('covers every requested category and label, sharing IDs only for repeated entries',()=>{
    expect(new Set(familyEventTypes.map(t=>t.id)).size).toBe(familyEventTypes.length);
    for(const [category,labels] of Object.entries(requested)){
      if(category==='Status Events'){expect(familyStatuses).toEqual(labels);continue;}
      const group=familyEventCategories.find(g=>g.label===category);
      expect(group,category).toBeTruthy();
      expect(group.ids.map(id=>eventType(id).label)).toEqual(expect.arrayContaining(labels));
    }
    expect(eventType('baseball').id).not.toBe(eventType('softball').id);
    expect(eventType('movie').label).toBe('Movie Night');
    expect(familyEventTypes.every(t=>t.id.length<=40)).toBe(true);
  });
  it('finds specific types across categories without downloading artwork',()=>{
    const ids=q=>searchFamilyEventGroups(q).flatMap(g=>g.types.map(t=>t.id));
    expect(ids('flag football')).toEqual(['flag-football']);
    expect(ids('PICKUP')).toContain('school-pickup');
    expect(ids("parents night")).toContain('parents-night-out');
    expect(searchFamilyEventGroups('dentist','Sports & Fitness')).toEqual([]);
    expect(searchFamilyEventGroups('not-a-real-activity')).toEqual([]);
  });
  it('keeps Camping as one type with five distinct saved picture choices',()=>{
    const choices=eventArtworkChoices('camping');
    expect(choices.map(c=>c.id)).toEqual(['camping','camping-green-tent','camping-tundra-rooftop','camping-coleman-trailer','camping-backyard']);
    for(const choice of choices){
      expect(existsSync(path.resolve(process.cwd(),'public'+choice.artwork))).toBe(true);
      expect(eventArtwork({eventType:'camping',artworkVariant:choice.id})).toBe(choice.artwork);
    }
    expect(eventArtwork({eventType:'camping'})).toBe(eventType('camping').artwork);
    expect(eventArtwork({eventType:'camping',artworkVariant:'../anything'})).toBe(eventType('camping').artwork);
    expect(eventArtwork({eventType:'soccer',artworkVariant:'camping-green-tent'})).toBe(eventType('soccer').artwork);
    expect(eventArtwork({eventType:'camping',artworkVariant:'camping-green-tent',artwork:'https://example.com/family.jpg'})).toBe('https://example.com/family.jpg');
  });
  it('includes all U.S. national parks with a distinct illustration for each',()=>{
    const parks=familyEventCategories.find(g=>g.label==='U.S. National Parks').ids.map(eventType);
    expect(parks).toHaveLength(63);
    expect(new Set(parks.map(p=>p.artwork)).size).toBe(63);
    expect(parks.map(p=>p.id)).toEqual(expect.arrayContaining(['np-american-samoa','np-virgin-islands','np-gateway-arch','np-new-river-gorge','np-yellowstone']));
  });
  it('finds the personalized activities using familiar names',()=>{
    for(const [query,id] of [['rooftop tent camping','camping'],['backyard camping','camping'],['camper trailer','camping'],['malinois','dog-walk'],['traveling','travel'],['chicken coup','chicken-coop'],['snow shoeing','snowshoeing'],['top golf','topgolf'],['gray hiking backpack','hiking'],['working out','weightlifting-strength-training'],['scheels','scheels-shopping'],['paddle boarding','paddle-boarding']]){
      expect(searchFamilyEventGroups(query).flatMap(g=>g.types.map(t=>t.id)),query).toContain(id);
    }
  });
  it('only repurposes the exact designated host',()=>{
    expect(isFamilyHost('qv.app.mentalrange.org')).toBe(true);
    for(const host of ['app.mentalrange.org','qv.app.itsco.health','qv.app.mentalrange.org.evil.test'])expect(isFamilyHost(host)).toBe(false);
  });
  it('manual status overrides inferred status only during its interval',()=>{
    const member={user_id:1};const event={kind:'event',member_user_id:1,start_at:'2026-09-15T18:00:00Z',end_at:'2026-09-15T20:00:00Z',metadata:{eventType:'school'}};
    const manual={...event,kind:'status',title:'Running Late',end_at:'2026-09-15T19:00:00Z'};
    expect(memberStatus(member,[event,manual],[],new Date('2026-09-15T18:30:00Z'))).toBe('Running Late');
    expect(memberStatus(member,[event,manual],[],new Date('2026-09-15T19:30:00Z'))).toBe('School');
    expect(memberStatus(member,[event],[],new Date('2026-09-15T21:00:00Z'))).toBe('Unknown / No Status');
  });
  it('shows status entries in the calendar and applies them only to their assigned member and time',()=>{
    const status={id:9,kind:'status',member_user_id:2,title:'Do Not Disturb',start_at:'2026-09-15T18:00:00Z',end_at:'2026-09-15T19:00:00Z'};
    expect(familyCalendarEntries([status,{kind:'grocery'}])).toEqual([status]);
    const time=new Date('2026-09-15T18:30:00Z');
    expect(memberStatus({user_id:2},[status],[],time)).toBe('Do Not Disturb');
    expect(memberStatus({user_id:1},[status],[],time)).toBe('Unknown / No Status');
    expect(memberStatus({user_id:2},[status],[],new Date(status.end_at))).toBe('Unknown / No Status');
  });
  it('uses an individual status ahead of household status and preserves old status labels',()=>{
    const base={kind:'status',start_at:'2026-09-15T18:00:00Z',end_at:'2026-09-15T19:00:00Z'};
    expect(memberStatus({user_id:1},[{...base,member_user_id:1,title:'Working'},{...base,member_user_id:null,title:'Home',created_at:'2026-09-15T18:15:00Z'}],[],new Date('2026-09-15T18:30:00Z'))).toBe('Work');
  });
  it('infers useful statuses from the expanded types without assuming birthdays mean someone is home',()=>{
    const base={kind:'event',member_user_id:1,start_at:'2026-09-15T18:00:00Z',end_at:'2026-09-15T19:00:00Z'};
    const time=new Date('2026-09-15T18:30:00Z');
    for(const [type,status] of [['softball','At Practice'],['sports-game-competition','At Game'],['work-from-home','Working From Home'],['school-pickup','Pickup']])expect(memberStatus({user_id:1},[{...base,metadata:{eventType:type}}],[],time)).toBe(status);
    expect(memberStatus({user_id:1},[{...base,metadata:{eventType:'birthday'}}],[{...base,provider_id:1}],time)).toBe('Work');
  });
  it('hides or redacts personal events without hiding client appointments',()=>{
    const rows=[{id:1,kind:'PERSONAL_EVENT',title:'Private trip',description:'Private note'},{id:2,kind:'PERSONAL_EVENT',clientId:9,title:'Session'},{id:3,kind:'TEAM_MEETING',title:'Meeting'}];
    expect(familyScheduleProjection(rows,'hidden').map(r=>r.id)).toEqual([2,3]);
    expect(familyScheduleProjection(rows,'busy')[0]).toMatchObject({title:'Personal event',description:null});
    expect(familyScheduleProjection(rows,'details',{1:{title:'Soccer',metadata:{address:'Park'}}})[0]).toMatchObject({title:'Soccer',description:'Park'});
    expect(rows[0].title).toBe('Private trip');
  });
});

describe('automatic personal event themes',()=>{
  it.each([['Pick up Sam from airport','airport'],['Going to zoo','zoo'],['School pickup','school-pickup'],['Camping at the lake','camping'],['Visit Yellowstone National Park','np-yellowstone'],['Parking permit renewal','family']])('matches %s to %s',(title,id)=>{expect(inferFamilyEventType(title).id).toBe(id);});
  it('uses distinct zoo and airport pictures rather than generic covers',()=>{
    expect(eventArtwork(familyEventMetadata('Going to zoo'))).toBe('/assets/family-events/zoo.jpg');
    expect(eventArtwork(familyEventMetadata('Pick up Sam from airport'))).toBe('/assets/family-events/airport.jpg');
  });
  it('updates automatic themes after renaming while preserving explicit selections and photos',()=>{
    const explicit={eventType:'camping',artworkVariant:'camping-green-tent'};
    expect(familyEventMetadata('Zoo',explicit)).toBe(explicit);
    expect(familyEventMetadata('Zoo',{eventType:'airport',autoTheme:true}).eventType).toBe('zoo');
    expect(eventArtwork(familyEventMetadata('Zoo',{autoTheme:true,artwork:'https://example.com/photo.jpg'}))).toBe('https://example.com/photo.jpg');
  });
  it('themes live Google events without modifying work overlays',()=>{
    expect(themedFamilyCalendarEvent({source:'Google',title:'Going to zoo'}).metadata.eventType).toBe('zoo');
    const work={work:true,title:'Airport'};expect(themedFamilyCalendarEvent(work)).toBe(work);
  });
});
