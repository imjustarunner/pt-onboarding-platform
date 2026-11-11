import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../../services/familyBillingPolicy.service.js',()=>({positiveId:v=>Number(v),auditBilling:vi.fn()}));
vi.mock('../../services/stediDiscovery.service.js',()=>({discoveryWorkspace:vi.fn(),startDiscovery:vi.fn(),refreshDiscovery:vi.fn(),reviewDiscovery:vi.fn(),reconcileUncertainDiscovery:vi.fn()}));
import db from '../../config/database.js';
import ClinicalEligibility from '../../services/clinicalEligibility.service.js';
import {startDiscovery,refreshDiscovery} from '../../services/stediDiscovery.service.js';
import {createDiscovery,getDiscoveryResults,getDiscoveryWorkspace} from '../stediDiscovery.controller.js';
const req=()=>({user:{id:17,role:'staff'},params:{clientId:'9',id:'42'},body:{agencyId:2,actorUserId:999,clientId:777},query:{agencyId:2}});
const res=()=>({set:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.clearAllMocks();ClinicalEligibility.ensureAgencyAccess.mockResolvedValue(true);db.execute.mockResolvedValue([[{id:9}]]);});
it('binds tenant, client and actor to authorized request scope rather than body fields',async()=>{
 const next=vi.fn();await createDiscovery(req(),res(),next);expect(next).not.toHaveBeenCalled();expect(startDiscovery).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:9,actorUserId:17}));
 await getDiscoveryResults(req(),res(),next);expect(refreshDiscovery).toHaveBeenCalledWith(expect.objectContaining({id:42,agencyId:2,clientId:9}));
});
it('denies another tenant before reading private results or calling Stedi',async()=>{
 ClinicalEligibility.ensureAgencyAccess.mockRejectedValue(Object.assign(new Error('Access denied'),{status:403}));const next=vi.fn();await createDiscovery(req(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(startDiscovery).not.toHaveBeenCalled();expect(db.execute).not.toHaveBeenCalled();
});
it('blocks submission-only assistant accounts from insurance identities and search',async()=>{
 const next=vi.fn();await getDiscoveryWorkspace({...req(),assistantIdentity:{id:1}},res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(db.execute).not.toHaveBeenCalled();
});
it('rejects a client outside the authorized agency before transmission',async()=>{
 db.execute.mockResolvedValue([[]]);const next=vi.fn();await createDiscovery(req(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(startDiscovery).not.toHaveBeenCalled();expect(db.execute).toHaveBeenCalledWith(expect.any(String),[9,2]);
});
