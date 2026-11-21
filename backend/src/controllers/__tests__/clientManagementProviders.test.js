import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../services/schoolPortalDaySync.service.js',()=>({syncSchoolPortalDayProvider:vi.fn()}));
vi.mock('../../services/d11Compliance.service.js',()=>({enqueueD11ComplianceEnsure:vi.fn()}));
import { listProvidersForScheduling } from '../providerScheduling.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[{id:1,role:'provider'}]]);});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
it('requires active provider membership and excludes demo or staff identities for client management',async()=>{
 const res=response(),next=vi.fn();await listProvidersForScheduling({query:{agencyId:'2',activeProvidersOnly:'true'}},res,next);
 expect(next).not.toHaveBeenCalled();expect(m.execute.mock.calls[0][1]).toEqual([2]);
 const sql=m.execute.mock.calls[0][0];expect(sql).toContain('COALESCE(ua.is_active, 1) = 1');expect(sql).toContain('COALESCE(u.is_demo, 0) = 0');expect(sql).toContain('COALESCE(u.sees_clients, 1) = 1');expect(sql).toContain("'SUSPENDED'");
 expect(sql).toContain("'coach','facilitator','admin','super_admin') OR u.has_provider_access = TRUE)");
});
it('preserves the broader scheduling directory for existing consumers',async()=>{
 await listProvidersForScheduling({query:{agencyId:2}},response(),vi.fn());expect(m.execute.mock.calls[0][0]).not.toContain('COALESCE(u.is_demo, 0) = 0');
});
