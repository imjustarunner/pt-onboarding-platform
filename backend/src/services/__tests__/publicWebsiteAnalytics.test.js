import {describe,it,expect,vi} from 'vitest';
import {validAnalyticsPage,normalizeAnalyticsEvents,createPublicWebsiteAnalyticsService} from '../publicWebsiteAnalytics.service.js';
const uuid='12345678-1234-1234-1234-123456789abc';
const profile='/p/itsco/providers/megan-geil-crader-496';
describe('provider profile analytics paths',()=>{
 it('accepts public profile paths without accepting another tenant, query strings or deep private routes',()=>{
  expect(validAnalyticsPage('itsco',profile)).toBe(true);
  for(const path of ['/p/other/providers/name-496',profile+'?email=private','/p/itsco/providers/name-496/private','/p/itsco/../private'])expect(validAnalyticsPage('itsco',path)).toBe(false);
  expect(normalizeAnalyticsEvents('itsco',{visitorId:uuid,events:[{eventId:uuid,pagePath:profile,kind:'click',targetKey:'page/profile-496/link'}]})[0].pagePath).toBe(profile);
 });
 it('loads exact profile reports and only recovers historical areas identified with that profile',async()=>{
  const execute=vi.fn().mockResolvedValueOnce([[{id:1,slug:'itsco',title:'ITSCO',is_active:1}]])
   .mockResolvedValue([[]]);
  const report=await createPublicWebsiteAnalyticsService({execute},'test').report({id:1,role:'super_admin'},'itsco',{page:profile});
  expect(report.selectedPage).toBe(profile);
  const [sql,args]=execute.mock.calls[1];expect(sql).toContain('target_key REGEXP ?');expect(args.slice(-3)).toEqual([profile,'/p/itsco/providers','(^|/)profile-496(/|$)']);
 });
});
