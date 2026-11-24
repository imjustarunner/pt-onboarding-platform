import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),user:vi.fn(),agency:vi.fn(),decline:vi.fn(),complete:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/HiringReferenceRequest.model.js',()=>({default:{expireStaleRows:vi.fn(),findByPublicLinkToken:m.find,markDeclined:m.decline,markCompleted:m.complete}}));
vi.mock('../hiringReferenceReceipt.service.js',()=>({runReferenceReceiptNotifications:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../hiringReferenceActivity.service.js',()=>({logHiringReferenceEvent:vi.fn(),appendEmailOpenPixel:html=>html,buildReferenceOpenPixelUrl:()=>''}));
import {getReferenceFormMeta,postReferenceFormSubmit} from '../../controllers/publicHiringReference.controller.js';
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn(),setHeader:vi.fn()});
beforeEach(()=>vi.clearAllMocks());
it.each([
  [{status:'cancelled',declined:true},409,'already marked this reference request as unable to provide'],
  [{status:'cancelled',declined:false},410,'no longer available'],
  [{status:'expired'},410,'has expired'],
  [{status:'completed'},409,'already submitted'],
  [null,404,'not found']
])('returns the correct terminal state without identity, questions or answers (%j)',async(row,status,message)=>{
  m.find.mockResolvedValue(row?{...row,reference_name:'PRIVATE REFEREE',responses_json:{privateAnswer:'PRIVATE ANSWERS'},public_link_token:'PRIVATE TOKEN'}:null);
  const res=response(),next=vi.fn();await getReferenceFormMeta({params:{token:'synthetic-token'}},res,next);
  expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json.mock.calls[0][0]).toEqual({error:{message:expect.stringContaining(message)}});
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('PRIVATE');
  expect(m.user).not.toHaveBeenCalled();expect(m.agency).not.toHaveBeenCalled();
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
  expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy','no-referrer');
});
it('does not turn a repeat decline into another write or alert',async()=>{
  m.find.mockResolvedValue({status:'cancelled',declined:true});const res=response();
  await postReferenceFormSubmit({params:{token:'synthetic-token'},body:{declined:true}},res,vi.fn());
  expect(res.status).toHaveBeenCalledWith(409);expect(m.decline).not.toHaveBeenCalled();expect(m.complete).not.toHaveBeenCalled();
});
