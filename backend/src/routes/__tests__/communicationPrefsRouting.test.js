import { describe, it, expect, vi } from 'vitest';
vi.mock('../../controllers/userCommunication.controller.js', () => ({
    getUserCommunications: vi.fn((req, res) => res.json({draftId:req.params.id})),
    getCommunication: vi.fn((req, res) => res.json({draftId:req.params.id})),
    regenerateEmail: vi.fn((req, res) => res.json({draftId:req.params.id})),
    getPendingCommunicationsCount: vi.fn((req, res) => res.json({draftId:req.params.id})),
    listPendingCommunications: vi.fn((req, res) => res.json({draftId:req.params.id})),
    listCommunicationCategories: vi.fn((req, res) => res.json({draftId:req.params.id})),
    getCommunicationDetail: vi.fn((req, res) => res.json({draftId:req.params.id})),
    approveCommunication: vi.fn((req, res) => res.json({draftId:req.params.id})),
    cancelCommunication: vi.fn((req, res) => res.json({draftId:req.params.id})),
    updateCommunicationDraft: vi.fn((req, res) => res.json({draftId:req.params.id})),
    resolveCommunicationQuality: vi.fn((req, res) => res.json({draftId:req.params.id})),
    resolveCommunicationsQualityBulk: vi.fn((req, res) => res.json({draftId:req.params.id})),
    retryCommunicationSend: vi.fn((req, res) => res.json({draftId:req.params.id}))
}));
vi.mock('../../controllers/communicationFailureQueue.controller.js', () => ({removeFailedCommunications: vi.fn()}));
vi.mock('../../middleware/auth.middleware.js', () => ({authenticate: (req, res, next) => {req.user={id:1433,role:'provider'};next();}}));
import router from '../userCommunication.routes.js';
import { updateCommunicationDraft } from '../../controllers/userCommunication.controller.js';
function request(url) {
  return new Promise((resolve, reject) => {
    const req={method:'PATCH',url,headers:{}};
    router.handle(req, {json: data => resolve({data,user:req.user})}, error => error ? reject(error) : resolve({passed:true,user:req.user}));
  });
}
describe('communications preferences in the server mount order', () => {
  it('passes the authenticated self-preferences request to the later inbox router', async () => {
    expect(await request('/communications/prefs')).toEqual({passed:true,user:{id:1433,role:'provider'}});
    expect(updateCommunicationDraft).not.toHaveBeenCalled();
  });
  it('keeps numeric communication draft edits on the existing protected handler', async () => {
    expect(await request('/communications/123')).toMatchObject({data:{draftId:'123'}});
    expect(updateCommunicationDraft).toHaveBeenCalledOnce();
  });
});
