import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{},clinicalPool:{}}));
import { clinicalAccess, effectiveClinicalAccess, CLINICAL_SCOPES } from '../guardianClinicalAccess.service.js';
import { isGuardianPortalLocked } from '../../utils/guardianWaivers.utils.js';
let choice,link;
beforeEach(()=>{
 choice={};link={relationship_type:'guardian',access_enabled:1,date_of_birth:'2011-01-01',permissions_json:{enrollmentAccessConfirmed:true}};
 m.execute.mockImplementation(async sql=>sql.startsWith('SELECT cg.*')?[[link]]:sql.includes('AS independent_client')?[[choice]]:[[]]);
});
it('provides all care scopes to an enrolled guardian without requiring a separate grant setup',async()=>{
 expect(await clinicalAccess({agencyId:2,clientId:4,userId:8})).toEqual({level:'full',scopes:CLINICAL_SCOPES,reviewRequired:false});
});
it.each([{independent_client:1},{latest_clinical_choice:'client_restriction_requested'}])('honors a self-enrolled client’s recorded parent privacy choice: %j',async value=>{
 choice=value;expect((await clinicalAccess({agencyId:2,clientId:4,userId:8})).scopes).toEqual([]);
});
it('does not remove parent access merely because the client is over twelve',()=>{
 expect(effectiveClinicalAccess({link,dob:'2011-01-01',asOf:'2026-11-18'}).scopes).toEqual(CLINICAL_SCOPES);
});
it('requires enrollment confirmation before the new full-access default applies',()=>{
 expect(effectiveClinicalAccess({link:{...link,permissions_json:{}},dob:'2011-01-01'}).scopes).toEqual([]);
});
it('does not confuse the client’s own account with a parent’s account',async()=>{
 link={...link,relationship_type:'self'};choice={independent_client:1};
 expect((await clinicalAccess({agencyId:2,clientId:4,userId:8})).level).toBe('self');
});
it('does not show an age-only portal lock after a guardian’s full enrollment access was confirmed',()=>{
 expect(isGuardianPortalLocked(link,'2000-01-01',new Date('2026-11-18'))).toBe(false);
 expect(isGuardianPortalLocked({relationship_type:'self'},'2000-01-01',new Date('2026-11-18'))).toBe(false);
 expect(isGuardianPortalLocked({relationship_type:'guardian',permissions_json:{}},'2000-01-01',new Date('2026-11-18'))).toBe(true);
});
