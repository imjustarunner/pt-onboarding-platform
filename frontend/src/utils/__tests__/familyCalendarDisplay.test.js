import { describe, it, expect } from 'vitest';
import { calendarEventColor, calendarEventStyle, mergeFamilyCalendarEntries,filterCalendarEvents } from '../familyCalendarDisplay';

const members = [{user_id:1,color:'#2244aa'}, {user_id:2,color:'#aa2244'}];
const event = {memberId:1,color:'#000000',metadata:{color:'#22aa44',eventType:'baseball'}};
describe('family calendar display', () => {
  it('uses the saved event color for activity mode and current profile color for person mode', () => {
    expect(calendarEventColor(event,'activity',members)).toBe('#22aa44');
    expect(calendarEventColor(event,'person',members)).toBe('#2244aa');
    expect(calendarEventColor({...event,memberId:2},'person',members)).toBe('#aa2244');
  });
  it('falls back safely for unassigned, work, Google and legacy events', () => {
    expect(calendarEventColor({metadata:{eventType:'baseball'}})).toBe('#719269');
    expect(calendarEventColor({work:true})).toBe('#376c9c');
    expect(calendarEventColor({source:'Google'})).toBe('#287652');
    expect(calendarEventColor({color:'red; background:red',metadata:{color:'invalid'}})).toBe('#6552a8');
    expect(calendarEventColor(event,'person',[])).toBe('#000000');
  });
  it.each(['#ffffff','#ffff00','#000000','#2244aa','#22aa44'])('keeps text contrast above 4.5:1 for %s',color=>{
    const style=calendarEventStyle({metadata:{color}});
    const luminance=value=>value.match(/\d+/g).map(Number).map(c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;}).reduce((total,c,i)=>total+c*[0.2126,0.7152,0.0722][i],0);
    expect((luminance(style['--event-fill'])+0.05)/(luminance(style['--event-ink'])+0.05)).toBeGreaterThan(4.5);
  });
  it('combines member and source filters, retaining shared household plans',()=>{
    const events=[{key:'dad',memberId:1},{key:'mom',memberId:2},{key:'shared'},{key:'work',memberId:1,work:true},{key:'google',source:'Google'}];
    expect(filterCalendarEvents(events,'1').map(e=>e.key)).toEqual(['dad','shared','work','google']);
    expect(filterCalendarEvents(events,'1','family').map(e=>e.key)).toEqual(['dad','shared']);
    expect(filterCalendarEvents(events,'all','work').map(e=>e.key)).toEqual(['work']);
    expect(filterCalendarEvents(events,'2','work')).toEqual([]);
    expect(filterCalendarEvents(events,'all','google').map(e=>e.key)).toEqual(['google']);
  });
});

describe('saved Family events during external calendar refresh',()=>{
 const saved={id:42,kind:'event',title:'Get Vince',start_at:'2026-09-24T18:15:00Z',end_at:'2026-09-24T21:15:00Z',member_user_id:1,metadata:{eventType:'airport'}};
 it('shows a saved app event even when the external response is empty',()=>{
   expect(mergeFamilyCalendarEntries([], [saved],7,[{user_id:1,display_name:'Dad'}])).toMatchObject([{key:'family:7:42',title:'Get Vince',memberName:'Dad',start:saved.start_at}]);
 });
 it('replaces a stale API copy without hiding other days or Google events',()=>{
   const result=mergeFamilyCalendarEntries([{key:'family:7:42',title:'Old title'},{key:'family:7:1',title:'Yesterday zoo'},{key:'google:external',title:'Get Vince'}],[saved],7);
   expect(result).toHaveLength(3);expect(result.find(e=>e.key==='family:7:42').title).toBe('Get Vince');
 });
 it('preserves all-day dates in the household timezone and ignores other entry kinds',()=>{
   const result=mergeFamilyCalendarEntries([], [{...saved,metadata:{allDay:true},start_at:'2026-09-24T06:00:00Z',end_at:'2026-09-25T06:00:00Z'},{...saved,id:43,kind:'grocery'}],7,[],'America/Denver');
   expect(result).toHaveLength(1);expect(result[0]).toMatchObject({startDate:'2026-09-24',endDate:'2026-09-25'});
 });
});
