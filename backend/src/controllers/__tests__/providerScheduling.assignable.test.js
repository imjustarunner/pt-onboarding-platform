import {expect,it,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn().mockResolvedValue([[]]));
vi.mock('../../config/database.js',()=>({default:{execute}}));
vi.mock('../../services/schoolPortalDaySync.service.js',()=>({syncSchoolPortalDayProvider:vi.fn()}));vi.mock('../../services/d11Compliance.service.js',()=>({enqueueD11ComplianceEnsure:vi.fn()}));
import {listProvidersForScheduling} from '../providerScheduling.controller.js';
import {PROVIDER_ROLE_SQL} from '../../services/clientAssignmentScope.service.js';
it('offers only roles accepted by assignment validation in the selected agency',async()=>{
 const res={json:vi.fn()},next=vi.fn();await listProvidersForScheduling({query:{agencyId:'2',activeProvidersOnly:'true',clientAssignmentsOnly:'true'}},res,next);
 expect(next).not.toHaveBeenCalled();const[sql,args]=execute.mock.calls[0];expect(sql).toContain(PROVIDER_ROLE_SQL);expect(sql).toContain('COALESCE(ua.is_active, 1) = 1');expect(sql).not.toContain("'employee'");expect(args).toEqual([2]);
});
