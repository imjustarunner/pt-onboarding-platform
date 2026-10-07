import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/ProviderPublicProfile.model.js',()=>({default:{}}));
vi.mock('../../models/UserInfoValue.model.js',()=>({default:{}}));
import {decodeField,supervisionBreakdown} from '../providerUpdateRecords.service.js';
describe('provider update record interpretation',()=>{
 it('keeps reported and app hours separate and exposes balance discrepancies',()=>{const r=supervisionBreakdown({individual:25.5,group:.99},{individual:28.5,group:9.1},{individual:2,group:1},{individual:54,group:10.09});expect(r.reported.total).toBe(64.09);expect(r.app.total).toBe(3);expect(r.calculated.total).toBe(67.09);expect(r.current.total).toBe(64.09);expect(r.difference).toBe(-3);});
 it('uses calculated hours only when no stored account exists',()=>{expect(supervisionBreakdown({},{},{individual:2},null).current.total).toBe(2);});
 it('decodes stored checkbox arrays without splitting labels',()=>{expect(decodeField('["Children (6-10)","Teen (14-18)"]')).toEqual(['Children (6-10)','Teen (14-18)']);expect(decodeField('plain text')).toBe('plain text');});
});
