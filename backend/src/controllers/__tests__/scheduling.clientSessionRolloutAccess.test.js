import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({agency:vi.fn(),access:vi.fn(),read:vi.fn(),providers:vi.fn(),save:vi.fn()}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.agency}}));
vi.mock('../../services/clientSessionBookingRollout.service.js',()=>({clientSessionBookingAccess:m.access,readClientSessionBookingRollout:m.read,sessionBookingProviders:m.providers,saveClientSessionBookingRollout:m.save}));
import {getClientSessionBookingAccess,getClientSessionBookingRollout,putClientSessionBookingRollout} from '../clientSessionBookingRollout.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.agency.mockResolvedValue(true);m.access.mockResolvedValue({enabled:false});m.read.mockResolvedValue({revision:0,entries:[]});m.providers.mockResolvedValue([]);m.save.mockResolvedValue({revision:1,entries:[]});});
const response=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
describe('client session booking rollout authorization',()=>{
 it('lets a provider read capability but prevents self-activation',async()=>{
  const req={user:{id:12,role:'provider'},query:{agencyId:2},body:{agencyId:2,providerUserIds:[12],enabled:true}},res=response(),next=vi.fn();
  await getClientSessionBookingAccess(req,res,next);expect(res.json).toHaveBeenCalledWith({enabled:false});
  await putClientSessionBookingRollout(req,res,next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.save).not.toHaveBeenCalled();
  await getClientSessionBookingRollout(req,res,next);expect(m.providers).not.toHaveBeenCalled();
 });
 it('checks tenant access before allowing even an administrator to change rollout',async()=>{
  m.agency.mockRejectedValue(Object.assign(new Error('Access denied'),{status:403}));const next=vi.fn();
  await putClientSessionBookingRollout({user:{id:12,role:'admin'},body:{agencyId:99}},response(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.save).not.toHaveBeenCalled();
 });
 it('permits authorized practice support and records the real actor',async()=>{
  const req={user:{id:5,role:'support'},body:{agencyId:2,providerUserIds:[12],actorUserId:999}},next=vi.fn();
  await putClientSessionBookingRollout(req,response(),next);
  expect(m.save).toHaveBeenCalledWith({agencyId:2,actorUserId:5,input:req.body});expect(next).not.toHaveBeenCalled();
 });
});
