import { expect, it, vi } from 'vitest';
import { reportCalendarDate, reportViewerDateTime, payrollPersonName } from '../reportDateTime';
import { loadStaffAnnouncementToasts } from '../staffAnnouncementToasts';
import { formatViewerEventWhen, formatViewerEventReportTime, formatViewerTimeRangeMs, viewerTimezoneAbbrev } from '../timezones';
import { canRequestCompanyEventShift, companyEventRequestStatusLabel } from '../companyEventStaffing';

it('formats recorded dates without UTC artifacts or shifting a midnight DATE to the previous day',()=>{
  expect(reportCalendarDate('2026-10-30T00:00:00.000Z')).toBe('Oct 30, 2026');
  expect(reportCalendarDate('2026-10-30')).toBe('Oct 30, 2026');
  expect(reportCalendarDate('2026-02-31')).toBe('—');
  expect(reportCalendarDate('bad')).toBe('—');
  expect(reportViewerDateTime('2026-11-02T15:30:00.000Z')).not.toMatch(/T15|000Z/);
});
it('uses the provider saved with the claim when the directory excludes an inactive or withdrawn worker',()=>{
  expect(payrollPersonName(596,{provider_first_name:'Piper',provider_last_name:'Finch'},[])).toBe('Piper Finch');
  expect(payrollPersonName(596,{first_name:'Piper',last_name:'Finch'},[])).toBe('Piper Finch');
  expect(payrollPersonName(596,{},[{id:596,first_name:'Piper',last_name:'Finch'}])).toBe('Piper Finch');
});
it('shows local event times while retaining the original event time and zone',()=>{
  const start='2026-11-02T15:30:00Z',end='2026-11-02T16:00:00Z';
  const label=formatViewerEventWhen(start,end,'America/Denver');
  expect(label).toContain('America/Denver'); expect(label).toContain('8:30 AM'); expect(label).toContain('MST');
  if(Intl.DateTimeFormat().resolvedOptions().timeZone==='America/New_York')expect(label).toContain('10:30 AM');
  if(Intl.DateTimeFormat().resolvedOptions().timeZone==='UTC')expect(label).toContain('3:30 PM UTC');
  expect(formatViewerEventReportTime('08:00:00',start,'America/Denver')).toContain('8:00 AM');
});
it('uses the daylight-saving abbreviation at the event date, rather than today',()=>{
  const june=new Date('2027-06-04T18:00:00Z'),nov=new Date('2026-11-02T18:00:00Z');
  const label=formatViewerTimeRangeMs(june.getTime(),june.getTime()+3600000);
  expect(label).toContain(viewerTimezoneAbbrev(june));
  if(Intl.DateTimeFormat().resolvedOptions().timeZone==='America/New_York'){
    expect(label).toContain('EDT'); expect(viewerTimezoneAbbrev(nov)).toBe('EST');
  }
});
it('delivers only personally targeted agency toasts in platform context, never another person’s or a general notice',async()=>{
  const request=vi.fn(async()=>({data:[{id:1,recipient_user_ids:[501]},{id:2,recipient_user_ids:[539]},{id:3,recipient_user_ids:[]}]}));
  const items=await loadStaffAnnouncementToasts({request,userId:501,agencies:[{id:2,organization_type:'agency'},{id:9,organization_type:'school'}]});
  expect(items).toEqual([{id:1,recipient_user_ids:[501],agency_id:2}]);expect(request).toHaveBeenCalledTimes(1);
  const selected=await loadStaffAnnouncementToasts({request,userId:501,currentAgencyId:2});expect(selected).toHaveLength(3);
});
it('allows another request after a provider is unassigned, and preserves active assignment and pending-request blocks',()=>{
  const session={sessionDateId:635,startsAt:'2030-11-02T15:30:00Z',endsAt:'2030-11-02T16:00:00Z',requiredProviders:2,approvedProvidersCount:0,myRequest:{status:'approved'}};
  const event={id:339,eventType:'school_outreach',canRequestOutreachShift:true,sessions:[session],startsAt:session.startsAt,endsAt:session.endsAt};
  const now=Date.parse('2030-11-01T12:00:00Z');
  expect(canRequestCompanyEventShift(event,session,now)).toBe(true);
  expect(companyEventRequestStatusLabel(event,session)).toBe('Not assigned — request again');
  expect(canRequestCompanyEventShift(event,{...session,myRequest:{status:'withdrawn'}},now)).toBe(true);
  expect(canRequestCompanyEventShift(event,{...session,myAssignment:{assignmentStatus:'finalized'}},now)).toBe(false);
  expect(canRequestCompanyEventShift(event,{...session,myRequest:{status:'pending'}},now)).toBe(false);
});
