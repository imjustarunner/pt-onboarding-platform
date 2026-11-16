import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn(()=>()=>{})}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(async()=>({id:8,role:'support'})),getAgencies:vi.fn(async()=>[{id:2}])}}));
vi.mock('../../services/notificationHiringAccess.service.js',()=>({hiringNotificationAgencyIds:vi.fn(async()=>new Set()),hiringNotificationVisible:vi.fn(()=>false)}));
vi.mock('../../services/agencyAccessProfiles.service.js',()=>({accessProfileSchemaReady:vi.fn(async()=>false),agencyIdsWithPermission:vi.fn(async()=>[])}));
vi.mock('../../models/AgencyNotificationPreferences.model.js',()=>({default:{listByAgencyIds:vi.fn(async()=>[])}}));
vi.mock('../../services/notificationPreferences.service.js',()=>({loadNotificationPreferenceContext:vi.fn(async()=>({})),resolveNotificationTypePreference:vi.fn(()=>({effective:{inApp:true}})),listEffectiveNotificationPreferences:vi.fn(async()=>[])}));
import {getNotificationCounts,getNotificationUpdates} from '../notification.controller.js';
const req=()=>({user:{id:8,role:'support'},query:{},headers:{}}),res=()=>({json:vi.fn(),status:vi.fn().mockReturnThis()});
beforeEach(()=>{vi.clearAllMocks();m.execute.mockImplementation(async sql=>sql.includes('AS unread')?[[{agency_id:2,unread:3}]]:sql.includes('COUNT(*) AS total')?[[{total:2}]]:[[]]);});
it('uses one notification scan for badge counts with the same access and viewer-state boundaries',async()=>{
 const response=res(),next=vi.fn();await getNotificationCounts(req(),response,next);expect(next).not.toHaveBeenCalled();expect(response.json).toHaveBeenCalledWith({'2':3,_total:3});
 const scans=m.execute.mock.calls.filter(([sql])=>sql.includes('FROM notifications n'));expect(scans).toHaveLength(1);expect(scans[0][0]).toContain('GROUP BY n.agency_id');expect(scans[0][0]).toContain('n.agency_id IN');expect(scans[0][0]).toContain('nur.dismissed_at IS NULL');expect(scans[0][0]).toContain('ROW_NUMBER() OVER');expect(scans[0][0]).not.toContain('SELECT n.*');
});
it('cursor polling skips facet scans and retains the cursor, unread count and has-more contract',async()=>{
 m.execute.mockImplementation(async sql=>sql.includes('SELECT n.*')?[Array.from({length:51},(_,i)=>({id:100+i,agency_id:2,type:'other',_is_read_for_viewer:0}))]:sql.includes('COUNT(*) AS total')?[[{total:51}]]:[[]]);
 const request=req();request.query={afterId:99};const response=res(),next=vi.fn();await getNotificationUpdates(request,response,next);expect(next).not.toHaveBeenCalled();expect(response.json.mock.calls[0][0]).toMatchObject({latestId:149,hasMore:true,unreadCount:51});expect(response.json.mock.calls[0][0].items).toHaveLength(50);
 const scans=m.execute.mock.calls.filter(([sql])=>sql.includes('FROM notifications n'));expect(scans).toHaveLength(2);expect(scans.every(([sql])=>!sql.includes('GROUP BY n.type'))).toBe(true);
});
