import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auricwellAnalyticsPath, demoAnalyticsMetadata, initializeAuricwellAnalytics, readAuricwellAnalyticsContext } from '../analytics';

class IntersectionMock { observe() {} unobserve() {} disconnect() {} }
let instance;
beforeEach(() => {
  vi.useFakeTimers();localStorage.clear();sessionStorage.clear();
  window.IntersectionObserver=IntersectionMock;
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:204}));
  document.body.dataset.auricwellPage='home';
  document.body.innerHTML='<div class="aw-demo"><h1>Private Person</h1><section data-analytics-area="client-chart"><h2>Private note heading</h2><button data-analytics-id="client-chart-open" data-analytics-label="Private secret">Private Person</button><button data-analytics-id="private@example.test">Private draft content</button><input type="search" value="Private search terms"><textarea>Private note body</textarea></section></div>';
});
afterEach(() => { instance?.stop();instance=undefined;vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();document.body.innerHTML='';delete document.body.dataset.auricwellPage; });
describe('AuricWell demo analytics boundary',()=>{
  it('maps routes to fixed public categories, omitting records, queries and private routes',()=>{
    expect(auricwellAnalyticsPath('demo',{params:{section:'clients'},query:{clientId:'secret'}})).toBe('/p/auricwell/demo/clients');
    expect(auricwellAnalyticsPath('demo',{params:{section:'client/123'}})).toBeNull();
    expect(auricwellAnalyticsPath('website',null,'security')).toBe('/p/auricwell/security');
    expect(auricwellAnalyticsPath('website',null,'not-public')).toBeNull();
  });
  it('uses only catalog labels even with arbitrary headings, attributes, buttons and search contents',async()=>{
    instance=initializeAuricwellAnalytics({mode:'demo',context:{visitorId:crypto.randomUUID(),signedIn:false,source:'direct'}});
    for(const button of document.querySelectorAll('button'))button.click();
    document.querySelector('input').dispatchEvent(new Event('change',{bubbles:true}));
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url,options]=fetch.mock.calls[0];
    expect(url).toBe(new URL('/api/public/marketing-pages/auricwell/analytics/events',window.location.origin).href);
    expect(options).toMatchObject({method:'POST',credentials:'omit',keepalive:false,redirect:'error',referrerPolicy:'no-referrer'});
    const events=JSON.parse(options.body).events;
    expect(events.map(e=>e.targetKey)).toEqual(['page','page/action/client-chart-open','page/action/demo-control','page/action/demo-search']);
    expect(events.map(e=>e.kind)).toEqual(['page_view','click','click','search']);
    const payload=JSON.stringify(events);for(const secret of ['Private','private@','secret','terms','body'])expect(payload).not.toContain(secret);
    expect(demoAnalyticsMetadata(document.querySelector('h2'),true)).toBeNull();
  });
  it('never records stored account/token values and opts out signed-in browsers',()=>{
    localStorage.setItem('authToken','secret-auth-token');localStorage.setItem('user','{"email":"private@example.test"}');
    const context=readAuricwellAnalyticsContext(window);
    expect(context).toMatchObject({visitorId:null,signedIn:true});expect(JSON.stringify(context)).not.toMatch(/secret-auth|private@example/);
    instance=initializeAuricwellAnalytics({mode:'demo',context});vi.advanceTimersByTime(30000);expect(fetch).not.toHaveBeenCalled();
  });
  it('honors DNT and GPC without creating a visitor identifier',()=>{
    vi.stubGlobal('navigator',{doNotTrack:'1',globalPrivacyControl:false});
    expect(readAuricwellAnalyticsContext(window).visitorId).toBeNull();
    expect(localStorage.getItem('publicWebsiteVisitor')).toBeNull();
    vi.stubGlobal('navigator',{doNotTrack:'0',globalPrivacyControl:true});
    instance=initializeAuricwellAnalytics({mode:'demo',context:{visitorId:crypto.randomUUID(),signedIn:false,source:'direct'}});
    vi.advanceTimersByTime(30000);expect(fetch).not.toHaveBeenCalled();
  });
  it('flushes a final visible duration on teardown using only the allowlisted keepalive transport',async()=>{
    instance=initializeAuricwellAnalytics({mode:'demo',context:{visitorId:crypto.randomUUID(),signedIn:false,source:'direct'}});
    vi.advanceTimersByTime(2500);instance.stop();instance=undefined;await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);const options=fetch.mock.calls[0][1];expect(options.keepalive).toBe(true);
    expect(JSON.parse(options.body).events.find(e=>e.kind==='page_time')).toMatchObject({durationMs:2500});
  });
});
