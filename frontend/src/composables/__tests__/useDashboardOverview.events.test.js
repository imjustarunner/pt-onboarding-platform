import { afterEach, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { flushPromises } from '@vue/test-utils';
import api from '../../services/api';
import { useDashboardOverview } from '../useDashboardOverview';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
let scope;
afterEach(() => { scope?.stop(); vi.useRealTimers(); vi.clearAllMocks(); });

it('includes calendar-only staffing discoveries and filters after adding capacity and request status', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2030-10-09T12:00:00Z'));
  const base = { agencyId: 2, startsAt: '2030-10-10T14:00:00Z', endsAt: '2030-10-10T18:00:00Z' };
  const session = { sessionDateId: 20, ...base, requiredProviders: 1, approvedProvidersCount: 1 };
  const company = { ...base, id: 1, eventType: 'company_event', title: 'Company invitation' };
  const full = { ...base, id: 2, eventType: 'school_outreach', title: 'Full outreach', canRequestOutreachShift: true };
  const dayOff = { ...base, id: 3, eventType: 'school_day_off', title: 'No school' };
  const available = { ...base, id: 4, eventType: 'school_outreach', title: 'Available outreach', schoolName: 'Twain', schoolCity: 'Denver', schoolAddress: '123 Example Street', canRequestOutreachShift: true, sessions: [{ ...session, approvedProvidersCount: 0 }] };
  api.get.mockImplementation(async (url) => ({ data: url === '/me/company-events/calendar'
    ? [company, { ...full, sessions: [session] }, dayOff, available] : [] }));
  scope = effectScope();
  const state = scope.run(() => useDashboardOverview({ userId: 7, agencyId: 2, companyEvents: [company, full, dayOff], includeSubmissionUpdates: false }));
  await flushPromises();
  expect(state.upcomingEvents.value.find(event => event.title === 'Available outreach').whereLine).toBe('Twain · 123 Example Street · Denver');
  expect(state.upcomingEvents.value.map((event) => event.title)).toEqual(['Company invitation', 'Available outreach']);
});

it('does not show the voting window of a team poll as a live event', async () => {
 vi.useFakeTimers();vi.setSystemTime(new Date('2030-11-09T19:00:00Z'));
 const poll={id:20,eventType:'team_poll',title:'Choose a dinner date',startsAt:'2030-11-01T19:00:00Z',endsAt:'2030-12-01T19:00:00Z'};
 const actual={id:21,eventType:'company_event',title:'Actual dinner',startsAt:'2030-11-20T19:00:00Z',endsAt:'2030-11-20T21:00:00Z'};
 api.get.mockImplementation(async url=>({data:url==='/me/company-events/calendar'?[poll,actual]:[]}));
 scope=effectScope();const state=scope.run(()=>useDashboardOverview({userId:7,agencyId:2,companyEvents:[poll,actual],includeSubmissionUpdates:false}));await flushPromises();
 expect(state.upcomingEvents.value.map(event=>event.title)).toEqual(['Actual dinner']);expect(state.featuredEvent.value.isLive).toBe(false);
});

it('retains undated and declined invitations separately from existing school staffing and never overwrites a No with stale calendar data',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2030-10-09T12:00:00Z'));
 const base={agencyId:2,eventType:'company_event',isInvitedCompanyEvent:true,startsAt:'2030-10-10T14:00:00Z',endsAt:'2030-10-10T18:00:00Z',canRsvp:true};
 const declined={...base,id:10,title:'Declined invitation',myRsvp:'no',staffPageUrl:'/company-events/10/staff/private'};
 const planned={...base,id:11,title:'Date planning',myRsvp:null,dateToBeDecided:true,startsAt:null,endsAt:null};
 const going={...base,id:12,title:'Going invitation',myRsvp:'yes'};
 const outreach={...base,id:13,title:'Available outreach',eventType:'school_outreach',isInvitedCompanyEvent:false,canRequestOutreachShift:true,sessions:[{sessionDateId:20,startsAt:base.startsAt,endsAt:base.endsAt,requiredProviders:1,approvedProvidersCount:0}]};
 api.get.mockImplementation(async url=>({data:url==='/me/company-events/calendar'?[{...declined,myRsvp:'yes'},going,outreach]:[]}));
 scope=effectScope();const state=scope.run(()=>useDashboardOverview({userId:7,agencyId:2,companyEvents:[declined,planned,going],includeSubmissionUpdates:false}));await flushPromises();
 expect(state.invitedCompanyEvents.value.map(e=>e.title)).toEqual(['Declined invitation','Date planning','Going invitation']);
 expect(state.invitedCompanyEvents.value.find(e=>e.id===10)).toMatchObject({myRsvp:'no',staffPageUrl:'/company-events/10/staff/private'});
 expect(state.upcomingEvents.value.map(e=>e.title)).toEqual(['Available outreach']);
});
