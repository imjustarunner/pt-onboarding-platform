import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ execute: vi.fn(), find: vi.fn(), update: vi.fn(), agencies: vi.fn(), history: vi.fn(), status: vi.fn(), stamp: vi.fn(), notify: vi.fn(), log: vi.fn(), clinical:vi.fn(), connection:vi.fn(), commit:vi.fn(), rollback:vi.fn(), release:vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: h.execute,getConnection:h.connection }, onTableWrite: vi.fn() }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: h.find, update: h.update } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: h.agencies } }));
vi.mock('../../models/ClientStatusHistory.model.js', () => ({ default: { create: h.history } }));
vi.mock('../../utils/clientStatusCatalog.js', () => ({ getClientStatusIdByKey: h.status }));
vi.mock('../../services/clientTerminationSchoolYear.service.js', () => ({ stampClientTerminationSchoolYear: h.stamp }));
vi.mock('../../services/clientNotifications.service.js', () => ({ notifyClientBecameCurrent: vi.fn(), notifyClientChecklistUpdated: vi.fn(), notifyPaperworkReceived: vi.fn(), notifyClientTerminated: h.notify }));
vi.mock('../../services/clientAccessLog.service.js', () => ({ logClientAccess: h.log }));

vi.mock('../../services/clientSchedulingGuard.service.js',()=>({withClientSchedulingLock:async(ids,work)=>work()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:h.clinical}}));
import {clientClosureReview} from '../../services/clientClosureReview.service.js';
import { markClientInactive, getClientTerminationProviders, terminateClient, updateClient } from '../client.controller.js';

let req, res, next;
beforeEach(async () => {
  vi.clearAllMocks();
  req = { params: { id: '51' }, user: { id: 8, role: 'admin' }, body: {termination_reason:'Services completed',confirmClientClosure:true} };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  next = vi.fn();
  h.find.mockResolvedValue({ id: 51, agency_id: 2, organization_id: 9, provider_id: null, client_status_id: 3 });
  h.update.mockResolvedValue({ id: 51, status: 'ARCHIVED', client_status_key: 'terminated' });
  h.agencies.mockResolvedValue([{ id: 2 }]);
  h.status.mockResolvedValue(7);
  h.history.mockResolvedValue({ id: 1 });
  h.stamp.mockResolvedValue(null);
  h.notify.mockResolvedValue(undefined);
  h.log.mockResolvedValue(undefined);
  h.clinical.mockResolvedValue([[{id:91,created_at:'2026-11-23'}]]);
  h.connection.mockResolvedValue({execute:vi.fn(async()=>[[await h.find()]]),beginTransaction:vi.fn(),commit:h.commit,rollback:h.rollback,release:h.release});
  h.execute.mockResolvedValue([[{ id: 37, first_name: 'Former', last_name: 'Provider', is_active: 0 }]]);
  req.body.closureReviewToken=(await clientClosureReview(await h.find())).reviewToken;
});

describe('termination action', () => {
  it('uses the authenticated actor and records the reviewed documentation decision', async () => {
    await terminateClient(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith('51', {
      client_status_id: 7, termination_reason: 'Services completed', termination_note_required:true,termination_note_not_required_reason:null,termination_effective_date: null,
      termination_last_provider_id: null, termination_last_provider_name: null,
      terminated_at: expect.any(Date), terminated_by_user_id: 8, roi_expires_at: null
    }, 8,expect.objectContaining({hydrate:false,executor:expect.any(Object)}));
    expect(h.history).toHaveBeenCalledWith(expect.objectContaining({ changed_by_user_id: 8, note: expect.stringContaining('Termination date: Not recorded') }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 51 }));
  });

  it('records historical details without creating a current provider assignment', async () => {
    req.body = { ...req.body, termination_reason: 'Moved', termination_date: '2025-03-02', termination_last_provider_id: 37 };
    await terminateClient(req, res, next);
    expect(next).not.toHaveBeenCalled();
    const patch = h.update.mock.calls[0][1];
    expect(patch).toMatchObject({ termination_reason: 'Moved', termination_effective_date: '2025-03-02', termination_last_provider_id: 37, termination_last_provider_name: 'Former Provider' });
    expect(patch).not.toHaveProperty('provider_id');
    expect(h.history.mock.calls[0][0].note).toContain('Last provider: Former Provider');
    expect(h.stamp).toHaveBeenCalledWith(expect.objectContaining({ effectiveDate: '2025-03-02' }));
  });

  it('rejects invalid details before changing status', async () => {
    req.body.termination_date = '2026-02-30';
    await terminateClient(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it.each([terminateClient, getClientTerminationProviders])('rejects access outside the actor’s agency', async action => {
    h.agencies.mockResolvedValue([{ id: 99 }]);
    await action(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it.each([terminateClient, getClientTerminationProviders])('rejects school users even with agency membership', async action => {
    req.user.role = 'school_staff';
    await action(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('retains existing assigned-provider access', async () => {
    req.user.role = 'provider';
    await terminateClient(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledOnce();
  });

  it('does not terminate for an unassigned provider', async () => {
    req.user.role = 'provider';
    h.execute.mockResolvedValue([[]]);
    await terminateClient(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns a roster conflict without reporting success or adding termination history', async () => {
    h.update.mockRejectedValueOnce(Object.assign(new Error('Withdraw the available referral first.'), { status: 409 }));
    await terminateClient(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(h.history).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('does not report success when the atomic roster update fails', async () => {
    const failure = new Error('Storage unavailable');
    h.update.mockRejectedValueOnce(failure);
    await terminateClient(req, res, next);
    expect(next).toHaveBeenCalledWith(failure);
    expect(res.json).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('offers the scoped former providers to authorized staff', async () => {
    await getClientTerminationProviders(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ providers: [expect.objectContaining({ id: 37, is_active: 0 })] });
  });

  it('requires the authorized termination action for historical metadata', async () => {
    req.body.termination_last_provider_id = 37;
    await updateClient(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(h.update).not.toHaveBeenCalled();
  });
});

it.each(['provider','provider_plus','intern','staff','clinical_practice_assistant'])('rejects direct inactive changes for %s before accessing the client',async role=>{
 req.user.role=role;h.find.mockClear();await markClientInactive(req,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(h.find).not.toHaveBeenCalled();expect(h.update).not.toHaveBeenCalled();
});
it('requires explicit confirmation even for an administrator',async()=>{delete req.body.confirmClientClosure;await terminateClient(req,res,next);expect(res.status).toHaveBeenCalledWith(400);expect(h.update).not.toHaveBeenCalled();});
it('marks inactive separately from clinical termination for authorized support',async()=>{req.user.role='support';await markClientInactive(req,res,next);expect(h.status).toHaveBeenCalledWith({agencyId:2,statusKey:'inactive'});expect(h.history.mock.calls[0][0].note).toContain('Action: Marked inactive');});

it('blocks the ordinary update endpoint from bypassing the inactive review',async()=>{
 req.user.role='provider';req.body={status:'ARCHIVED'};await updateClient(req,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(h.update).not.toHaveBeenCalled();
});
it('blocks terminated and inactive catalog choices in ordinary profile updates',async()=>{
 req.body={client_status_id:10};h.execute.mockResolvedValue([[{id:10,status_key:'inactive',label:'Inactive'}]]);await updateClient(req,res,next);expect(res.status).toHaveBeenCalledWith(400);expect(h.update).not.toHaveBeenCalled();
 expect(res.json.mock.calls[0][0].error.message).toContain('bottom of the profile');
});
