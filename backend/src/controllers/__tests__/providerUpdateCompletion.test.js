import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({getRecipientByToken:vi.fn(),getMyOpenRecipient:vi.fn(),getMyCompletedRecipient:vi.fn(),getRecipientBundle:vi.fn(),recordViewEvent:vi.fn(),finalizeRecipient:vi.fn()}));
vi.mock('../../services/providerUpdate.service.js',()=>m);
vi.mock('../../services/providerUpdateTasks.service.js',()=>({providerUpdateTasks:{syncUser:vi.fn()}}));
vi.mock('../../services/providerUpdateTime.service.js',()=>({updateTimeSummary:vi.fn()}));
vi.mock('../providerUpdateReview.controller.js',()=>({persistReviewSection:vi.fn()}));
vi.mock('../../services/providerUpdatePreviewLink.service.js',()=>({createProviderUpdatePreviewLink:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../../services/adminUpdate.service.js',()=>({}));
import {getPublicByToken,finalizePublic,finalizeMyUpdate,getMyCompletionReceipt,getMyUpdateReminders} from '../providerUpdate.controller.js';
import {providerUpdateTasks} from '../../services/providerUpdateTasks.service.js';
let req,res,next;
const open={id:7,agency_id:2,provider_user_id:9,first_name:'Staff',status:'in_progress'};
const complete={...open,status:'finalized',finalized_at:'2026-10-10T13:00:00Z',locked_at:'2026-10-10T13:00:00Z',snapshot_json:{private:'answer'}};
beforeEach(()=>{vi.clearAllMocks();req={params:{token:'invitation'},body:{agencyId:2},user:{id:9}};res={json:vi.fn(),status:vi.fn().mockReturnThis()};next=vi.fn();m.getRecipientByToken.mockResolvedValue(open);m.getMyOpenRecipient.mockResolvedValue(open);m.finalizeRecipient.mockResolvedValue(complete);});
it('returns a completion receipt from the successful token submission without reloading the locked editor',async()=>{await finalizePublic(req,res,next);expect(next).not.toHaveBeenCalled();expect(m.getRecipientByToken).toHaveBeenCalledTimes(1);expect(m.getRecipientBundle).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({finalized:true,recipient:expect.objectContaining({finalizedAt:complete.finalized_at}),sections:[]}));expect(res.json.mock.calls[0][0].recipient).not.toHaveProperty('snapshot_json');});
it('reopening a completed link returns only its receipt, without writing events or starting review',async()=>{m.getRecipientByToken.mockResolvedValue(complete);await getPublicByToken(req,res,next);expect(m.getRecipientByToken).toHaveBeenCalledWith('invitation',{allowCompletedReceipt:true});expect(m.recordViewEvent).not.toHaveBeenCalled();expect(m.getRecipientBundle).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].finalized).toBe(true);});
it('retrying an accepted submission does not finalize or create time claims again',async()=>{m.getRecipientByToken.mockResolvedValue(complete);await finalizePublic(req,res,next);expect(m.finalizeRecipient).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].finalized).toBe(true);});
it('authenticated completion also returns a receipt instead of reopening a missing open update',async()=>{await finalizeMyUpdate(req,res,next);expect(m.finalizeRecipient).toHaveBeenCalledWith({recipientId:7,actorType:'provider',actorUserId:9});expect(res.json.mock.calls[0][0].recipient.finalizedAt).toBe(complete.finalized_at);});
it('keeps failed validation a failure without presenting a receipt',async()=>{m.finalizeRecipient.mockRejectedValue(Object.assign(Error('Complete all sections first'),{status:400}));await finalizePublic(req,res,next);expect(res.status).toHaveBeenCalledWith(400);expect(res.json.mock.calls[0][0]).not.toHaveProperty('finalized');});

it('scopes an authenticated receipt to the signed-in user, agency and update without exposing answers',async()=>{
 req.query={agencyId:'2',providerUserId:'999'};req.params.recipientId='7';res.setHeader=vi.fn();m.getMyCompletedRecipient.mockResolvedValue(complete);
 await getMyCompletionReceipt(req,res,next);expect(next).not.toHaveBeenCalled();expect(m.getMyCompletedRecipient).toHaveBeenCalledWith(9,2,7);
 expect(res.json.mock.calls[0][0]).toMatchObject({finalized:true,sections:[],recipient:{id:7}});expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('private');expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
});

it('does not expose a receipt for another account or an unfinished update',async()=>{
 req.query={agencyId:'2'};req.params.recipientId='7';m.getMyCompletedRecipient.mockResolvedValue(null);
 await getMyCompletionReceipt(req,res,next);expect(res.status).toHaveBeenCalledWith(404);expect(res.json.mock.calls[0][0]).not.toHaveProperty('finalized');
});

it.each(['0','-1','oops','1.5'])('rejects invalid receipt identifiers %s before reading data',async id=>{
 req.query={agencyId:'2'};req.params.recipientId=id;await getMyCompletionReceipt(req,res,next);expect(res.status).toHaveBeenCalledWith(400);expect(m.getMyCompletedRecipient).not.toHaveBeenCalled();
});

it('returns only the logged-in user’s unfinished reminders without counting the splash as review time or opening the update',async()=>{
 req.query={providerUserId:'999'};res.set=vi.fn();
 providerUpdateTasks.syncUser.mockResolvedValue([{recipientId:7,agencyId:2,link:'https://example.test/provider-update/own-link'}]);
 m.getRecipientBundle.mockResolvedValue({progress:{completed:0,total:19,percent:0}});
 await getMyUpdateReminders(req,res,next);
 expect(next).not.toHaveBeenCalled();
 expect(providerUpdateTasks.syncUser).toHaveBeenCalledWith(9);
 expect(m.getRecipientBundle).toHaveBeenCalledWith(expect.objectContaining({previewOnly:true}),{progressOnly:true});
 expect(m.recordViewEvent).not.toHaveBeenCalled();
 expect(res.json.mock.calls[0][0].reminders[0].progress.completed).toBe(0);
 expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');
});
it('returns no reminder after completion or withdrawal',async()=>{
 res.set=vi.fn();providerUpdateTasks.syncUser.mockResolvedValue([]);
 await getMyUpdateReminders(req,res,next);
 expect(res.json).toHaveBeenCalledWith({reminders:[]});
 expect(m.getRecipientBundle).not.toHaveBeenCalled();
});
