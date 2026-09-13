// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';
import { isItscoPublicHost, publicDomainHistory, cleanItscoPath, internalItscoPath } from '../publicDomainRouting.js';
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
