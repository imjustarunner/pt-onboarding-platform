import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ context: vi.fn(), personal: vi.fn(), execute: vi.fn(), roster: vi.fn(), readCall: vi.fn(), end: vi.fn(), admit: vi.fn(), reconcile: vi.fn(), enabled:true }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../meetingDialInContext.service.js', () => ({ dialInContext: m.context, dialInRoster: m.roster, admitDialInUser: m.admit }));
vi.mock('../meetingDialIn.service.js', () => ({ personalDialIn: m.personal, callWithInvitation: m.readCall, endDialInCall: m.end, reconcileDialInCall: m.reconcile }));
vi.mock('../meetingDialInDelivery.service.js', () => ({ sendMeetingDialIn: vi.fn() }));
vi.mock('../meetingDialInPolicy.js', async original => ({ ...await original(), dialInConfigured: () => m.enabled }));
import { meetingDialInController } from '../../controllers/meetingDialIn.controller.js';
const controller = meetingDialInController('supervision');
let res, next;
beforeEach(() => {
  for (const fn of Object.values(m)) if (typeof fn === 'function') fn.mockReset();
  m.enabled = true;
  m.context.mockResolvedValue({ isHost: false }); m.execute.mockResolvedValue([[]]); m.personal.mockResolvedValue({ pin:'0000000008' });
  res = { json: vi.fn(), set: vi.fn().mockReturnThis() }; next = vi.fn();
});
describe('dial-in invitation access', () => {
  it('does not reveal another participant’s PIN to an ordinary attendee', async () => {
    await controller.details({ params:{id:5},user:{id:8},query:{userId:7} },res,next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403})); expect(m.personal).not.toHaveBeenCalled();
  });
  it('shows only a participant’s own telephone calls and marks the response private', async () => {
    m.execute.mockResolvedValue([[{id:'mine',user_id:8},{id:'someone-else',user_id:7}]]);
    await controller.details({params:{id:5},user:{id:8},query:{}},res,next);
    expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({userId:8,participants:[],calls:[{id:'mine',user_id:8}]}));
  });
  it('lets a host select an invited participant while retaining server-side recipient validation', async () => {
    m.context.mockResolvedValue({isHost:true}); m.roster.mockResolvedValue([{id:7},{id:8}]);
    await controller.details({params:{id:5},user:{id:7},query:{userId:8}},res,next);
    expect(m.personal).toHaveBeenCalledWith('supervision',5,8); expect(next).not.toHaveBeenCalled();
  });
  it('prevents nonhosts from admitting or removing telephone participants', async () => {
    await controller.manage({params:{id:5,callId:'phone'},user:{id:8},body:{action:'admit'}},res,next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403})); expect(m.admit).not.toHaveBeenCalled();
  });
  it('shows configuration readiness only to the authorized host and performs no invitation writes', async () => {
    m.enabled=false;m.context.mockResolvedValue({isHost:true});
    await controller.details({params:{id:5},user:{id:7},query:{}},res,next);
    expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({enabled:false,isHost:true,missing:expect.any(Array)}));
    expect(m.personal).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
    res.json.mockClear();m.context.mockResolvedValue({isHost:false});
    await controller.details({params:{id:5},user:{id:8},query:{}},res,next);
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('missing');
  });
  it('cannot mutate telephone admission or revocation when dedicated configuration is absent', async () => {
    m.enabled=false;m.context.mockResolvedValue({isHost:true});
    await controller.manage({params:{id:5,callId:'phone'},user:{id:7},body:{action:'remove'}},res,next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:503}));
    expect(m.execute).not.toHaveBeenCalled();expect(m.end).not.toHaveBeenCalled();expect(m.readCall).not.toHaveBeenCalled();
  });
  it.each([{ended_at:new Date()},{revoked_at:new Date()},{state:'ending'},{state:'ended'}])('rejects stale ended or revoked telephone admission without creating browser access: %j', async patch => {
    m.context.mockResolvedValue({isHost:true});m.readCall.mockResolvedValue({id:'phone',meeting_type:'supervision',meeting_id:5,user_id:8,...patch});
    await controller.manage({params:{id:5,callId:'phone'},user:{id:7},body:{action:'admit'}},res,next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
    expect(m.admit).not.toHaveBeenCalled();expect(m.reconcile).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();
  });
  it('rejects a call belonging to a different meeting before admission or removal', async () => {
    m.context.mockResolvedValue({isHost:true}); m.readCall.mockResolvedValue({meeting_type:'supervision',meeting_id:99,user_id:8});
    await controller.manage({params:{id:5,callId:'phone'},user:{id:7},body:{action:'remove'}},res,next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404})); expect(m.end).not.toHaveBeenCalled();
  });
});
