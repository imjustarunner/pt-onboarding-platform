import {describe,it,expect,vi} from 'vitest';
import {providerClickCounts,createPublicWebsiteAnalyticsService} from '../publicWebsiteAnalytics.service.js';
describe('provider popularity privacy',()=>{
 it('counts distinct browsers across provider actions within the tenant and 30-day window',async()=>{
  const db={execute:vi.fn(async()=>[[{providerId:'496',visitors:'12',clicks:'31'}]])};
  expect(await providerClickCounts(db,7)).toEqual([{providerId:496,visitors:12,clicks:31}]);
  const [sql,params]=db.execute.mock.calls[0];expect(params).toEqual([7]);expect(sql).toContain('COUNT(DISTINCT visitor_hash)');expect(sql).toContain('page_id = ?');expect(sql).toContain('INTERVAL 30 DAY');expect(sql).toContain("event_kind IN ('click','profile_open')");
 });
 it('rejects anonymous report access before any database read',async()=>{
  const db={execute:vi.fn()},service=createPublicWebsiteAnalyticsService(db,'test');await expect(service.authorize(null,'itsco')).rejects.toMatchObject({status:403});expect(db.execute).not.toHaveBeenCalled();
 });
 it('does not allow a signed-in provider to read tenant analytics',async()=>{
  const db={execute:vi.fn().mockResolvedValueOnce([[{id:7,slug:'itsco'}]]).mockResolvedValueOnce([[{source_type:'agency',source_id:1,organization_type:'agency'}]]).mockResolvedValueOnce([[{role:'provider'}]])};
  await expect(createPublicWebsiteAnalyticsService(db,'test').authorize({id:42,role:'provider'},'itsco')).rejects.toMatchObject({status:403});
 });
});
