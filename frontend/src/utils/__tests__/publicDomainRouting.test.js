// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';
import { isItscoPublicHost, publicDomainHistory, publicSupportSlugFromHost, cleanItscoPath, internalItscoPath } from '../publicDomainRouting.js';
import { itscoPublicResponse, itscoSitemap, updateItscoDocumentMeta } from '../itscoPublicSeo.js';

describe('ITSCO public domain routing', () => {
 it.each(['app.itsco.health','qv.app.itsco.health','qv.itsco.health','itsco.health.evil.example','app.nextleveluplcc.com','localhost'])('leaves %s unchanged', host => {
  const history = { location:'/p/itsco' };
  expect(isItscoPublicHost(host)).toBe(false);
  expect(publicDomainHistory(history,host)).toBe(history);
  expect(itscoPublicResponse(host,'/p/itsco')).toBeNull();
 });
 it.each([
  ['/p/itsco','/'], ['/p/itsco/providers?school=42#list','/providers?school=42#list'],
  ['/careers/itsco','/careers'], ['/careers/itsco/jobs/17?ref=site','/careers/jobs/17?ref=site'],
  ['/join/itsco/counseling','/join/itsco/counseling'], ['/p/itsco-other','/p/itsco-other']
 ])('maps %s to %s', (internal,external) => expect(cleanItscoPath(internal)).toBe(external));
 it('keeps tenant parameters, query state, hrefs, reload and back navigation',async()=>{
  window.history.replaceState(null,'','/providers?school=42');
  const history = publicDomainHistory(createWebHistory(),'www.itsco.health');
  const router = createRouter({history,routes:[
   {path:'/p/itsco/:section?',component:{}},
   {path:'/careers/:agencySlug',component:{}},
   {path:'/careers/:agencySlug/jobs/:jobId',component:{}}
  ]});
  await router.push(history.location);
  expect(router.currentRoute.value.path).toBe('/p/itsco/providers');
  expect(router.currentRoute.value.query.school).toBe('42');
  expect(router.resolve('/p/itsco/about').href).toBe('/about');
  await router.push('/careers/itsco/jobs/17');
  expect(window.location.pathname).toBe('/careers/jobs/17');
  expect(router.currentRoute.value.params).toEqual({agencySlug:'itsco',jobId:'17'});
  expect(internalItscoPath(window.location.pathname)).toBe('/careers/itsco/jobs/17');
  const back = new Promise(resolve=>{const remove=router.afterEach(()=>{remove();resolve();});});
  router.back();await back;
  expect(router.currentRoute.value.path).toBe('/p/itsco/providers');
  expect(router.currentRoute.value.query.school).toBe('42');
  history.destroy();
 });
 it('updates canonical metadata after navigation without affecting app pages',()=>{
  updateItscoDocumentMeta(document,'www.itsco.health','/p/itsco/providers?school=42');
  expect(document.head.querySelector('meta[name="robots"]').content).toBe('noindex');
  updateItscoDocumentMeta(document,'www.itsco.health','/careers/itsco');
  expect(document.title).toBe('Careers at ITSCO');
  expect(document.head.querySelector('link[rel="canonical"]').href).toBe('https://www.itsco.health/careers');
  expect(document.head.querySelector('meta[name="robots"]').content).toBe('index,follow');
  updateItscoDocumentMeta(document,'qv.app.itsco.health','/t/token');
  expect(document.title).toBe('Careers at ITSCO');
 });
 it('redirects legacy and prefixed pages in one hop, retaining queries',()=>{
  expect(itscoPublicResponse('itsco.health','/p/itsco/providers?school=42')).toEqual({status:301,redirect:'https://www.itsco.health/providers?school=42'});
  expect(itscoPublicResponse('www.itsco.health','/schools-we-are-in')).toEqual({status:301,redirect:'https://www.itsco.health/schools'});
  expect(itscoPublicResponse('www.itsco.health','/app').redirect).toBe('https://app.itsco.health/itsco/login');
 });
 it('provides clean canonicals, crawlable careers, noindex filters and real 404s',()=>{
  expect(itscoPublicResponse('www.itsco.health','/careers')).toMatchObject({status:200,noindex:false,canonical:'https://www.itsco.health/careers'});
  expect(itscoPublicResponse('www.itsco.health','/providers?school=42').noindex).toBe(true);
  expect(itscoPublicResponse('www.itsco.health','/unknown')).toMatchObject({status:404,noindex:true});
  expect(itscoSitemap()).toContain('https://www.itsco.health/careers');
  expect(itscoSitemap()).not.toContain('/p/');
 });
});

describe('organization website custom domains', () => {
 it.each([['plottwistco.com','ptco'],['www.nextleveluplcc.com','nlu'],['mentalrange.org','range'],['mh4kidz.org','mh4kidz'],['kimicain.com','kimi'],['risereviveco.com','rise'],['theinnerstrengthinstitute.com','tisi']])('opens %s as its public page', async(host,slug)=>{
  window.history.replaceState(null,'','/');
  const history=publicDomainHistory(createWebHistory(),host);
  const router=createRouter({history,routes:[{path:`/p/${slug}/:section?`,component:{}},{path:'/login',component:{}},{path:'/join/:agency/:service',component:{}}]});
  await router.push(history.location);
  expect(router.currentRoute.value.path).toBe(`/p/${slug}`);
  expect(router.resolve(`/p/${slug}/about`).href).toBe('/about');
  await router.push(`/p/${slug}/about?ref=test`);
  expect(window.location.pathname).toBe('/about');
  expect(history.location).toBe(`/p/${slug}/about?ref=test`);
  expect(router.resolve('/join/nlu/counseling').href).toBe('/join/nlu/counseling');
  history.destroy();
 });
});

it('serves the standards page and keeps tokenized support referrals out of the sitemap',()=>{
 expect(internalItscoPath('/community-standards')).toBe('/p/itsco/community-standards');
 expect(internalItscoPath('/live-chat-support?ref=abc')).toBe('/p/itsco/live-chat-support?ref=abc');
 expect(itscoPublicResponse('www.itsco.health','/community-standards').status).toBe(200);
 expect(itscoPublicResponse('www.itsco.health','/live-chat-support?ref=abc')).toMatchObject({status:200,noindex:true});
 expect(itscoSitemap()).not.toContain('live-chat-support');
});

describe('public support host slugs', () => {
 it.each([
  ['theinnerstrengthinstitute.com','tisi'],
  ['www.mh4kidz.org','mh4kidz'],
  ['nextleveluplcc.com','nlu'],
  ['plottwistco.com','ptco'],
  ['www.plottwistco.com','ptco'],
  ['itsco.health','itsco'],
  ['www.itsco.health','itsco']
 ])('maps %s /support to %s', (host, slug) => {
  expect(publicSupportSlugFromHost(host)).toBe(slug);
 });
 it('does not treat SSTC hosts as tenant support sites', () => {
  expect(publicSupportSlugFromHost('summitstatsteamchallenge.com')).toBeNull();
  expect(publicSupportSlugFromHost('app.summitstatsteamchallenge.com')).toBeNull();
 });
 it('keeps marketing /support as /support in the browser and /support/{slug} internally', () => {
  window.history.replaceState(null,'','/support');
  const history=publicDomainHistory(createWebHistory(),'nextleveluplcc.com');
  expect(history.location).toBe('/support/nlu');
  expect(history.createHref('/support/nlu')).toBe('/support');
  history.destroy();
 });
});

