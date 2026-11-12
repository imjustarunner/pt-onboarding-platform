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
vi.mock('../../middleware/auth.middleware.js', () => ({authenticate: vi.fn((req, res, next) => {req.user={id:1433,role:'provider'};next();})}));
import { authenticate } from '../../middleware/auth.middleware.js';
import router from '../userCommunication.routes.js';
import { updateCommunicationDraft } from '../../controllers/userCommunication.controller.js';
function request(url, method = 'PATCH') {
  return new Promise((resolve, reject) => {
    const req={method,url,headers:{}};
    router.handle(req, {status:vi.fn().mockReturnThis(),json: data => resolve({data,user:req.user})}, error => error ? reject(error) : resolve({passed:true,user:req.user}));
  });
}
describe('communications preferences in the server mount order', () => {
  it('leaves authentication of self-preferences to the later inbox router', async () => {
    expect(await request('/communications/prefs')).toEqual({passed:true,user:undefined});
    expect(updateCommunicationDraft).not.toHaveBeenCalled();
  });
  it('keeps numeric communication draft edits on the existing protected handler', async () => {
    expect(await request('/communications/123')).toMatchObject({data:{draftId:'123'}});
    expect(updateCommunicationDraft).toHaveBeenCalledOnce();
  });
  it('rejects unauthenticated reads and writes on every matched communications route', async () => {
    for (const layer of router.stack.filter(layer => layer.route)) {
      authenticate.mockImplementationOnce((_req,res) => res.status(401).json({denied:true}));
      const url=layer.route.path.replace(/:[a-zA-Z]+(?:\(\\d\+\))?/g,'42');
      expect(await request(url,Object.keys(layer.route.methods)[0].toUpperCase())).toMatchObject({data:{denied:true}});
    }
  });
});
