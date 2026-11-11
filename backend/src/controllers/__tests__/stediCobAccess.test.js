import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../../services/familyBillingPolicy.service.js',()=>({positiveId:v=>Number(v),auditBilling:vi.fn()}));
vi.mock('../../services/stediDiscovery.service.js',()=>({discoveryWorkspace:vi.fn(),startDiscovery:vi.fn(),refreshDiscovery:vi.fn(),reviewDiscovery:vi.fn(),reconcileUncertainDiscovery:vi.fn()}));
vi.mock('../../services/stediCob.service.js',()=>({cobWorkspace:vi.fn(),cobPayers:vi.fn(),startCob:vi.fn(),reviewCob:vi.fn()}));
import db from '../../config/database.js';
import ClinicalEligibility from '../../services/clinicalEligibility.service.js';
import {startCob,reviewCob,cobPayers} from '../../services/stediCob.service.js';
import {createCob,getCobWorkspace,getCobPayers,reconcileCob} from '../stediCob.controller.js';
const req=()=>({user:{id:17,role:'staff'},params:{clientId:'9',id:'42'},body:{agencyId:2,actorUserId:999,clientId:777},query:{agencyId:2,slot:'primary'}});
const res=()=>({set:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.clearAllMocks();ClinicalEligibility.ensureAgencyAccess.mockResolvedValue(true);db.execute.mockResolvedValue([[{id:9}]]);});
it('binds client, tenant and authenticated actor for paid requests and reconciliation',async()=>{
 const next=vi.fn();await createCob(req(),res(),next);expect(next).not.toHaveBeenCalled();expect(startCob).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:9,actorUserId:17}));await reconcileCob(req(),res(),next);expect(reviewCob).toHaveBeenCalledWith(expect.objectContaining({id:42,agencyId:2,clientId:9,actorUserId:17}));
});
it('denies unauthorized agencies and clients before reading or transmitting data',async()=>{
 const next=vi.fn();ClinicalEligibility.ensureAgencyAccess.mockRejectedValueOnce(Object.assign(new Error('Denied'),{status:403}));await createCob(req(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(startCob).not.toHaveBeenCalled();db.execute.mockResolvedValue([[]]);await getCobPayers(req(),res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(cobPayers).not.toHaveBeenCalled();
});
it('blocks submission-only assistants from private identities, directory and COB actions',async()=>{
 for(const handler of [getCobWorkspace,getCobPayers,createCob,reconcileCob]){const next=vi.fn();await handler({...req(),assistantIdentity:{id:1}},res(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));}expect(db.execute).not.toHaveBeenCalled();expect(startCob).not.toHaveBeenCalled();
});
