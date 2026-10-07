import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../staffCommunicationChoices.service.js',()=>({getStaffCommunicationChoices:vi.fn(async()=>({choices:{},accessRequests:{}}))}));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getSupervisors: vi.fn() } }));
vi.mock('../../models/PayrollCompensationLevel.model.js', () => ({ default: { getForUser: vi.fn() }, COMPENSATION_CATEGORIES: { 2: { label: 'Pre-licensed' } } }));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: { getHoursSummaryForSupervisee: vi.fn() } }));
vi.mock('../providerUpdate.service.js', () => ({ assertAgencyAdmin: vi.fn(), listOpenForBookingForProvider: vi.fn(), normalizeSectionAudience: value => value, recipientSeesSection: (key, config, id) => config[key]?.mode !== 'selected' || config[key].userIds.includes(id), listFallActionClientsForProvider: vi.fn() }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Pay from '../../models/PayrollCompensationLevel.model.js';
import Supervision from '../../models/SupervisionSession.model.js';
import { assertAgencyAdmin, listOpenForBookingForProvider } from '../providerUpdate.service.js';
import { previewProviderUpdate } from '../../controllers/providerUpdatePreview.controller.js';
let req, res, next;
beforeEach(() => {
 vi.clearAllMocks(); req = { user: {id:1,role:'admin'}, params: {providerUserId:'9'}, body: {agencyId:2,sectionAudience:{},amendmentPlan:{title:'Fall amendment'}} };
 res = { setHeader:vi.fn(), json:vi.fn(), status:vi.fn().mockReturnThis() }; next=vi.fn();
 assertAgencyAdmin.mockResolvedValue(2); User.getSupervisors.mockResolvedValue([{id:8}]);
 pool.execute.mockImplementation(async sql => [sql.includes('FROM users u') ? [{id:9,first_name:'Sample',last_name:'Provider'}] : [{field_key:'provider_credential_license_type_number',value:'LPCC 123'}]]);
 Pay.getForUser.mockResolvedValue({category:2,level:3,direct_rate:'42.00',indirect_rate:null,bypass:0});
 Supervision.getHoursSummaryForSupervisee.mockResolvedValue({totalHours:120}); listOpenForBookingForProvider.mockResolvedValue([{id:4}]);
});
it('previews the selected person from their agency with no writes or signatures', async () => {
 await previewProviderUpdate(req,res,next); expect(next).not.toHaveBeenCalled();
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({previewOnly:true,compensation:expect.objectContaining({category:2,level:3,directRate:'42.00',indirectRate:null}),supervision:{totalHours:120}}));
 expect(Pay.getForUser).toHaveBeenCalledWith(2,9); expect(pool.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
});
it('refuses another agency’s employee before reading pay', async () => {
 pool.execute.mockResolvedValue([[]]); await previewProviderUpdate(req,res,next); expect(res.status).toHaveBeenCalledWith(404); expect(Pay.getForUser).not.toHaveBeenCalled();
});
it('respects the amendment audience and supervisee applicability', async () => {
 req.body.sectionAudience={amendments:{mode:'selected',userIds:[8]}}; User.getSupervisors.mockResolvedValue([]);
 await previewProviderUpdate(req,res,next); const data=res.json.mock.calls[0][0]; expect(data.sections.map(s=>s.key)).not.toContain('amendments'); expect(data.sections.map(s=>s.key)).not.toContain('supervision_hours'); expect(Pay.getForUser).not.toHaveBeenCalled();
});
it('denies unauthorized administrators before fetching a profile',async()=>{
 assertAgencyAdmin.mockRejectedValue(Object.assign(new Error('Access denied'),{status:403}));await previewProviderUpdate(req,res,next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(pool.execute).not.toHaveBeenCalled();
});
