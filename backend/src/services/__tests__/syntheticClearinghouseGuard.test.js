import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
import {uploadClaims,requestEligibilityJson,requestEnrollment} from '../claimMd.service.js';
import {assertLiveClearinghouseAgency} from '../syntheticClearinghouseGuard.service.js';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn());});
it.each([450,451,452])('prevents any payer transmission for QA agency %s even if supplied live credentials',async agencyId=>{
 m.execute.mockResolvedValue([[{id:agencyId,slug:'changed',feature_flags:{}}]]);
 for(const send of [uploadClaims,requestEligibilityJson,requestEnrollment])
  await expect(send({agencyId,accountKey:'synthetic',fileContents:'{}',payload:{}})).rejects.toMatchObject({code:'SYNTHETIC_CLEARINGHOUSE_BLOCKED'});
 expect(fetch).not.toHaveBeenCalled();
});
it('fails closed on absent scope and synthetic flags; allows an ordinary real organization',async()=>{
 await expect(assertLiveClearinghouseAgency(undefined)).rejects.toThrow();
 m.execute.mockResolvedValue([[{id:800,feature_flags:{qaSandbox:{syntheticOnly:true}}}]]);
 await expect(assertLiveClearinghouseAgency(800)).rejects.toThrow();
 m.execute.mockResolvedValue([[{id:2,slug:'itsco',feature_flags:{}}]]);
 await expect(assertLiveClearinghouseAgency(2)).resolves.toBeUndefined();
});
