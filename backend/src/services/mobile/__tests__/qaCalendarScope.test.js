import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../../models/User.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../../models/ProviderScheduleEvent.model.js',()=>({default:{listForUserInWindow:vi.fn()}}));
vi.mock('../../../models/SupervisionSession.model.js',()=>({default:{listForUserInWindow:vi.fn()}}));
vi.mock('../../../models/Agency.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../../models/Task.model.js',()=>({default:{findForHub:vi.fn()}}));
vi.mock('../../../controllers/quickViewPresence.controller.js',()=>({recordQuickPresenceActivity:vi.fn()}));
vi.mock('../../quickViewAuth.service.js',()=>({touchSession:vi.fn()}));
vi.mock('../../quickViewIdentity.service.js',()=>({quickViewRequiresPassword:vi.fn(),assertQuickViewAccountMatch:vi.fn()}));
vi.mock('../../emailSettings.service.js',()=>({getAgencyEmailSettings:vi.fn()}));
vi.mock('../../mobileClinicalCalendar.service.js',()=>({enrichMobileClinicalCalendar:vi.fn(async({items})=>items)}));
import pool from '../../../config/database.js';
import User from '../../../models/User.model.js';
import ProviderScheduleEvent from '../../../models/ProviderScheduleEvent.model.js';
import SupervisionSession from '../../../models/SupervisionSession.model.js';
import Task from '../../../models/Task.model.js';
import {touchSession} from '../../quickViewAuth.service.js';
import {getQuickDayCalendar,getQuickTasks,requireQuickViewSession} from '../../../controllers/quickView.controller.js';
const quickView={userId:1433,agencyId:450,mobileDeviceSessionId:2,qaAgencyIds:[450]};
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[]]);User.findById.mockResolvedValue({id:1433,role:'provider'});ProviderScheduleEvent.listForUserInWindow.mockResolvedValue([{agency_id:456,client_id:999}]);SupervisionSession.listForUserInWindow.mockResolvedValue([]);});
it('uses exact synthetic calendar queries before client enrichment, avoiding broad all-agency models',async()=>{
 const res={json:vi.fn()},next=vi.fn();await getQuickDayCalendar({quickView,query:{day:'2026-11-06',timeZone:'America/Denver'}},res,next);
 expect(next).not.toHaveBeenCalled();expect(ProviderScheduleEvent.listForUserInWindow).not.toHaveBeenCalled();
 expect(SupervisionSession.listForUserInWindow).toHaveBeenCalledWith(expect.objectContaining({allAgencies:false,agencyId:450,userId:1433}));
 const eventQuery=pool.execute.mock.calls.find(([sql])=>sql.includes('SELECT pse.*'));expect(eventQuery[0]).toContain('pse.agency_id=?');expect(eventQuery[1][0]).toBe(450);expect(eventQuery[1].slice(-2)).toEqual([1433,1433]);
 const officeQuery=pool.execute.mock.calls.find(([sql])=>sql.includes('FROM office_events'));expect(officeQuery[0]).toContain('qa_appointment.agency_id=?');expect(officeQuery[1].slice(-2)).toEqual([450,1433]);
 expect(pool.execute.mock.calls.some(([sql])=>sql.includes('FROM clients'))).toBe(false);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({items:[]}));
});
it('scopes task reads to explicit tenant records and the current actor rather than global role tasks',async()=>{
 const res={json:vi.fn()},next=vi.fn();await getQuickTasks({quickView,query:{agencyId:456}},res,next);
 expect(next).not.toHaveBeenCalled();expect(Task.findForHub).not.toHaveBeenCalled();expect(pool.execute.mock.calls[0][1]).toEqual([450,1433,1433,1433]);
});
it('enforces the QA boundary on direct-ID routes before ordinary route handlers run',async()=>{
 touchSession.mockResolvedValue(quickView);const next=vi.fn();await requireQuickViewSession({headers:{'x-quick-view-session':'scoped'},method:'GET',originalUrl:'/api/quick-view/task-projects/456',query:{},params:{id:456}}, {}, next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({code:'MOBILE_QA_SURFACE_UNAVAILABLE'}));expect(pool.execute).not.toHaveBeenCalled();
});
