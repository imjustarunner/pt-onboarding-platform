import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute:vi.fn(), busy:vi.fn() }));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../providerCalendarBusy.service.js',()=>({readProviderCalendarBusy:mocks.busy}));
vi.mock('../privateReplacementSlots.service.js',()=>({readPrivateReplacementSlots:async()=>[]}));
vi.mock('../publicProviderHold.service.js',()=>({withProviderSelectionLock:vi.fn()}));
import { reviewBookingConflicts } from '../bookingConflictReview.service.js';
import { assertAppointmentWindowAvailable } from '../appointmentConflict.service.js';
const occurrences = ['2026-11-30','2026-12-14','2026-12-28'].map(date=>({startAt:date+'T17:00:00Z',endAt:date+'T18:00:00Z'}));
const scope = {providerId:9,agencyId:2,occurrences,timeZone:'America/Denver'};
const request = () => ({user:{id:9,role:'provider'},body:{reviewBookingConflicts:true}});
const response = () => {const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res;};
beforeEach(()=>{
 vi.clearAllMocks();mocks.execute.mockResolvedValue([[]]);
 mocks.busy.mockImplementation(async(_db,{startAt})=>startAt.startsWith('2026-12-14') ? [{
  id:3,kind:'SCHEDULE_HOLD',reasonCode:'PLANNED_OUT',allDay:true,startDate:'2026-12-14',endDate:'2026-12-15',
  start:new Date('2026-12-14T07:00:00Z'),end:new Date('2026-12-15T07:00:00Z')
 }] : []);
});
it('skips the vacation date and keeps the original alternating-week dates',async()=>{
 const req=request(),res=response();
 expect(await reviewBookingConflicts(req,res,scope)).toBeNull();
 const review=res.json.mock.calls[0][0].error;
 expect(review).toMatchObject({canBookAvailable:true,availableCount:2,requestedCount:3,conflicts:[{date:'2026-12-14'}]});
 req.body.bookingConflictChoice='available';req.body.bookingConflictReview=review.review;
 const result=await reviewBookingConflicts(req,res,scope);
 expect(result.occurrences).toEqual([occurrences[0],occurrences[2]]);
 expect(result.skippedDates).toMatchObject([{date:'2026-12-14'}]);
 expect(result.acknowledgedTimeConflicts).toEqual([]);
});
it('accepts an explicit overlap only for unchanged reviewed events',async()=>{
 const req=request(),res=response();
 await reviewBookingConflicts(req,res,scope);
 req.body.bookingConflictChoice='overlap';req.body.bookingConflictReview=res.json.mock.calls[0][0].error.review;
 const result=await reviewBookingConflicts(req,res,scope);
 expect(result.occurrences).toEqual(occurrences);
 const row={providerUserId:9,startAt:'2026-12-14 17:00:00',endAt:'2026-12-14 18:00:00',sourceTimezone:'America/Denver',acknowledgedTimeConflicts:result.acknowledgedTimeConflicts};
 await expect(assertAppointmentWindowAvailable({execute:mocks.execute},row)).resolves.toBeUndefined();
 mocks.busy.mockResolvedValue([{id:4,kind:'TEAM_MEETING',start:new Date('2026-12-14T17:00:00Z'),end:new Date('2026-12-14T18:00:00Z')}]);
 await expect(assertAppointmentWindowAvailable({execute:mocks.execute},row)).rejects.toMatchObject({code:'PROVIDER_TIME_CONFLICT'});
 expect(await reviewBookingConflicts(req,res,scope)).toBeNull();
});
it('permits reviewing a one-time meeting overlap without offering to skip the only date',async()=>{
 const req=request(),res=response();
 await reviewBookingConflicts(req,res,{...scope,occurrences:[occurrences[1]]});
 expect(res.json.mock.calls[0][0].error).toMatchObject({canBookAvailable:false,canOverlap:true});
});
it('reports room conflicts and never approves overlapping room occupancy',async()=>{
 const req=request(),res=response();
 const context={...scope,checkRoom:async()=>({key:'room',reason:'the selected room is unavailable',allowOverlap:false})};
 await reviewBookingConflicts(req,res,context);
 const review=res.json.mock.calls[0][0].error;
 expect(review).toMatchObject({canOverlap:false,canBookAvailable:false,availableCount:0});
 req.body.bookingConflictChoice='available';req.body.bookingConflictReview=review.review;
 expect(await reviewBookingConflicts(req,res,context)).toBeNull();
});
it('does not offer immediate subset booking while a new room request still needs approval',async()=>{
 const req=request(),res=response();await reviewBookingConflicts(req,res,{...scope,allowAvailableDates:false});
 const review=res.json.mock.calls[0][0].error;expect(review.canBookAvailable).toBe(false);
 req.body.bookingConflictChoice='available';req.body.bookingConflictReview=review.review;
 expect(await reviewBookingConflicts(req,res,{...scope,allowAvailableDates:false})).toBeNull();
});
it('keeps legacy and public callers on their existing conflict checks',async()=>{
 const req=request(),res=response();req.body={};
 expect((await reviewBookingConflicts(req,res,scope)).occurrences).toEqual(occurrences);
 expect(mocks.busy).not.toHaveBeenCalled();
});
it('never accepts client-supplied acknowledgment keys or another provider without staff access',async()=>{
 const req=request(),res=response();req.body.acknowledgedTimeConflicts=['forged'];req.body.bookingConflictChoice='overlap';req.body.bookingConflictReview='forged';
 expect(await reviewBookingConflicts(req,res,scope)).toBeNull();
 req.user.id=11;mocks.busy.mockClear();
 expect((await reviewBookingConflicts(req,res,scope)).acknowledgedTimeConflicts).toEqual([]);
 expect(mocks.busy).not.toHaveBeenCalled();
});
it('requires a fresh review when an additional client appointment appears in the same window',async()=>{
 mocks.busy.mockResolvedValue([]);
 let rows=[{id:1,start_at:'2026-12-14 17:00:00',end_at:'2026-12-14 18:00:00',updated_at:'2026-11-23 18:00:00'}];
 mocks.execute.mockImplementation(async sql=>sql.startsWith('SELECT id,start_at,end_at,updated_at FROM appointments') ? [rows] : [[]]);
 const req=request(),res=response();await reviewBookingConflicts(req,res,scope);
 req.body.bookingConflictChoice='overlap';req.body.bookingConflictReview=res.json.mock.calls[0][0].error.review;
 const approved=await reviewBookingConflicts(req,res,scope);
 rows=[...rows,{...rows[0],id:2}];
 await expect(assertAppointmentWindowAvailable({execute:mocks.execute},{providerUserId:9,status:'scheduled',
  startAt:'2026-12-14 17:00:00',endAt:'2026-12-14 18:00:00',acknowledgedTimeConflicts:approved.acknowledgedTimeConflicts})).rejects.toMatchObject({code:'PROVIDER_TIME_CONFLICT'});
 expect(await reviewBookingConflicts(req,res,scope)).toBeNull();
});
