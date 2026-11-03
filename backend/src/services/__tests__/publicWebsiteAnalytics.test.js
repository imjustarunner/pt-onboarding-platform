import {describe,it,expect,vi} from 'vitest';
import {validAnalyticsPage,normalizeAnalyticsEvents,createPublicWebsiteAnalyticsService} from '../publicWebsiteAnalytics.service.js';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../storage.service.js',()=>({default:{}}));
vi.mock('../publicMarketingHub.service.js',()=>({
 buildHubThemeResponse:vi.fn(),computeHubScopedMetrics:vi.fn(),getMarketingPageRowBySlug:vi.fn(),
 hubRequestBaseUrl:vi.fn(),isValidHubSlug:vi.fn(),listSourcesForPage:vi.fn(),loadHubFooterPartners:vi.fn(),
 loadHubPublicEvents:vi.fn(),normalizeSlug:vi.fn(),parseJsonObject:vi.fn(),rankHubEventsByAddress:vi.fn()
}));
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

it('never renders reporting-only registrations through generic public marketing reads, even if activated',async()=>{
 const hub=await import('../publicMarketingHub.service.js');
 const controllers=await import('../../controllers/publicMarketingPages.controller.js');
 hub.getMarketingPageRowBySlug.mockResolvedValue({id:8,slug:'auricwell',isActive:true,pageType:'analytics_only'});
 hub.listSourcesForPage.mockClear();
 for(const name of ['getPublicMarketingPage','getPublicMarketingPageTheme','getPublicMarketingPageEvents','getPublicMarketingPageMetrics','getPublicMarketingPageBookingHints']){
  const response={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
  await controllers[name]({params:{slug:'auricwell'}},response,next);
  expect(response.status).toHaveBeenCalledWith(404);expect(next).not.toHaveBeenCalled();
 }
 expect(hub.listSourcesForPage).not.toHaveBeenCalled();
});

it('accepts document actions while stripping destination URLs and unknown payload fields',()=>{
 const events=['document_view','document_download'].map(kind=>({eventId:uuid,pagePath:'/p/itsco/schools',kind,targetKey:'page/school-partnership-guide/'+kind,url:'private',privateField:'private'}));
 const normalized=normalizeAnalyticsEvents('itsco',{visitorId:uuid,events});
 expect(normalized.map(e=>e.kind)).toEqual(['document_view','document_download']);expect(JSON.stringify(normalized)).not.toContain('private');
 expect(()=>normalizeAnalyticsEvents('itsco',{visitorId:uuid,events:[{...events[0],kind:'document_save_complete'}]})).toThrow('Invalid analytics event');
});

describe('bounded anonymous viewing durations',()=>{
 const event={eventId:uuid,pagePath:'/p/auricwell/demo/clients',kind:'page_time',targetKey:'page',durationMs:15000};
 it('accepts canonical demo categories and strips arbitrary fields while bounding duration values',()=>{
  const [normalized]=normalizeAnalyticsEvents('auricwell',{visitorId:uuid,events:[{...event,clientName:'private',note:'private'}]});
  expect(normalized).toMatchObject({pagePath:'/p/auricwell/demo/clients',kind:'page_time',durationMs:15000});
  expect(JSON.stringify(normalized)).not.toContain('private');
  for(const durationMs of [undefined,0,-1,60001,Infinity,1.1,'15000'])expect(()=>normalizeAnalyticsEvents('auricwell',{visitorId:uuid,events:[{...event,durationMs}]})).toThrow('Invalid viewing duration');
  expect(normalizeAnalyticsEvents('auricwell',{visitorId:uuid,events:[{...event,kind:'click'}]})[0].durationMs).toBe(0);
  for(const path of ['/p/auricwell/demo/clients?name=private','/p/auricwell/demo/clients/123','/p/other/demo/clients'])expect(()=>normalizeAnalyticsEvents('auricwell',{visitorId:uuid,events:[{...event,pagePath:path}]})).toThrow('Invalid analytics event');
 });
 it('stores time alongside events with server timestamps and idempotent event IDs',async()=>{
  const execute=vi.fn().mockResolvedValueOnce([[{id:8,slug:'auricwell',is_active:0,page_type:'analytics_only'}]]).mockResolvedValue([[]]);
  await createPublicWebsiteAnalyticsService({execute},'test').ingest('auricwell',{visitorId:uuid,events:[event]});
  const [sql,args]=execute.mock.calls[1];expect(sql).toContain('INSERT IGNORE');expect(sql).toContain('duration_ms,occurred_at');expect(sql).toContain('UTC_TIMESTAMP()');
  expect(args.at(-1)).toBe(15000);expect(args[2]).toMatch(/^[a-f0-9]{64}$/);expect(args[2]).not.toBe(uuid);
 });
 it('keeps analytics-only registration private and rejects other inactive sites',async()=>{
  const site={id:8,slug:'auricwell',is_active:0,page_type:'analytics_only'};
  const execute=vi.fn().mockResolvedValue([[site]]),service=createPublicWebsiteAnalyticsService({execute},'test');
  await expect(service.authorize({id:1,role:'super_admin'},'auricwell')).resolves.toMatchObject(site);
  await expect(service.authorize({id:2,role:'admin'},'auricwell')).rejects.toMatchObject({status:403});
  expect(execute.mock.calls.every(([sql])=>!sql.includes('public_marketing_page_sources'))).toBe(true);
  execute.mockResolvedValue([[{...site,slug:'other'}]]);
  await expect(service.ingest('other',{visitorId:uuid,events:[{...event,pagePath:'/p/other'}]})).rejects.toMatchObject({status:404});
  execute.mockResolvedValue([[{...site,page_type:'product_website'}]]);
  await expect(service.ingest('auricwell',{visitorId:uuid,events:[event]})).rejects.toMatchObject({status:404});
 });
 it('ranks page/section engagement while keeping page totals free of overlapping section time',async()=>{
  const execute=vi.fn().mockImplementation(async sql=>{
   if(sql.includes('SELECT id, slug'))return [[{id:8,slug:'auricwell',title:'AuricWell',is_active:1}]];
   if(sql.includes('SUM(CASE'))return [[{visitors:2,views:3,durationMs:'45000'}]];
   if(sql.includes('LIMIT 100'))return [[{pagePath:'/p/auricwell/demo/clients',targetKey:'page/client-chart',label:'Client chart',kind:'section_time',durationMs:'30000',visitors:'2',segments:'2'}]];
   return [[]];
  });
  const report=await createPublicWebsiteAnalyticsService({execute},'test').report({id:1,role:'super_admin'},'auricwell');
  expect(report.totals.durationMs).toBe(45000);expect(report.engagement[0]).toMatchObject({durationMs:30000,visitors:2,segments:2});
  expect(execute.mock.calls.find(([sql])=>sql.includes('SUM(CASE'))[0]).toContain("CASE WHEN event_kind='page_time' THEN duration_ms ELSE 0 END");
  const [sql,args]=execute.mock.calls.find(([sql])=>sql.includes('LIMIT 100'));expect(sql).toContain('ORDER BY durationMs DESC');expect(args[0]).toBe(8);
 });
});
