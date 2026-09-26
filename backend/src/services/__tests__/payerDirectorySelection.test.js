import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),connection:vi.fn(),fetch:vi.fn(),save:vi.fn(),list:vi.fn(),get:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:m.get}}));
vi.mock('../clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.access}}));
vi.mock('../claimMdConnection.service.js',()=>({resolveClaimMdConnection:m.connection}));
vi.mock('../claimMd.service.js',()=>({fetchPayers:m.fetch}));
vi.mock('../payerSetupCatalog.service.js',()=>({saveDirectoryPayer:m.save,listPayerSetupRequests:m.list}));
import {payerSetupRequests} from '../../controllers/payerSetupRequest.controller.js';
const req=()=>({method:'POST',query:{},body:{agencyId:377,payerId:'00050',payerName:'Untrusted',capabilities:{era:'yes'}},user:{id:9}});
const response=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.resetAllMocks();m.connection.mockResolvedValue({accountKey:'synthetic'});m.get.mockResolvedValue({release:m.release});m.list.mockResolvedValue([]);});
it('saves the exact current directory result, not caller-supplied name or capabilities',async()=>{
 const payer={payerid:'00050',payer_name:'Verified payer',era:'enrollment'};
 m.fetch.mockResolvedValue({payer:[{payerid:'OTHER'},payer]});const next=vi.fn();
 await payerSetupRequests(req(),response(),next);
 expect(next).not.toHaveBeenCalled();expect(m.access).toHaveBeenCalledWith({reqUser:{id:9},agencyId:377});
 expect(m.save).toHaveBeenCalledWith({agencyId:377,payer,actorUserId:9},expect.anything());expect(m.release).toHaveBeenCalledOnce();
});
it('rejects a legacy alias instead of silently selecting another ID',async()=>{
 m.fetch.mockResolvedValue({payer:{payerid:'OTHER',payer_alt_names:[{alt_payerid:'00050'}]}});
 const res=response();await payerSetupRequests(req(),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(409);expect(m.save).not.toHaveBeenCalled();
});
it('checks agency access before contacting the directory or writing',async()=>{
 m.access.mockRejectedValue(new Error('Forbidden'));const next=vi.fn();
 await payerSetupRequests(req(),response(),next);
 expect(next).toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
});
