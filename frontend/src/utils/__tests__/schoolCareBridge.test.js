import {describe,it,expect} from 'vitest';
import {getCurrentPortalSlugFromPath,getLoginUrlForRedirect} from '../loginRedirect';
import {publicSitePaths} from '../publicDomainRouting';
import {schoolCareBridgePath,schoolCareBridgeExternalPath,schoolCareBridgeWorkflowPath,isSchoolCareBridgeHost} from '../schoolCareBridge';
import {buildShareMeta} from '../sharePreview';
import {publicBrowserBranding} from '../publicBrowserBranding';
describe('SchoolCareBridge address compatibility',()=>{
 it.each(['mh4kidz.org','schoolcarebridge.org','www.schoolcarebridge.org'])('round trips school routes on %s',host=>{
  const adapter=publicSitePaths(host);const internal=schoolCareBridgePath('ashley');
  expect(adapter.internal(adapter.clean(internal+'?tab=roster#top'))).toBe(internal+'?tab=roster#top');
 });
 it('keeps the MH4Kidz website and app routes intact',()=>{
  const adapter=publicSitePaths('mh4kidz.org');
  expect(adapter.internal('/')).toBe('/p/mh4kidz');expect(adapter.internal('/about')).toBe('/p/mh4kidz/about');expect(adapter.internal('/app')).toBe('/app');
 });
 it('maps the future domain homepage and login',()=>{
  const adapter=publicSitePaths('schoolcarebridge.org');
  expect(adapter.internal('/')).toBe('/schoolcarebridge');expect(adapter.internal('/app')).toBe('/schoolcarebridge/app');
  expect(adapter.clean('/schoolcarebridge')).toBe('/');expect(adapter.internal('/api/auth/identify')).toBe('/api/auth/identify');
 });
 it('leaves ITSCO and unrelated domains alone',()=>{
  expect(publicSitePaths('app.itsco.health')).toBeNull();expect(isSchoolCareBridgeHost('schoolcarebridge.org.evil.test')).toBe(false);
 });
 it('keeps provider, document, password and home links in the school surface',()=>{
  expect(schoolCareBridgeWorkflowPath('/ashley/providers/7','ashley')).toBe('/schoolcarebridge/app/ashley/providers/7');
  expect(schoolCareBridgeWorkflowPath('/ashley/tasks/documents/9/sign','ashley')).toBe('/schoolcarebridge/app/ashley/tasks/documents/9/sign');
  expect(schoolCareBridgeWorkflowPath('/ashley/change-password','ashley')).toBe('/schoolcarebridge/app/ashley/change-password');
  expect(schoolCareBridgeWorkflowPath('/ashley/dashboard','ashley')).toBe('/schoolcarebridge/app/ashley');
  expect(schoolCareBridgeWorkflowPath('/itsco/admin','ashley')).toBeNull();
 });
 it('uses SchoolCareBridge metadata under the MH4Kidz path',()=>{
  expect(buildShareMeta({host:'mh4kidz.org',path:'/schoolcarebridge'}).title).toContain('SchoolCareBridge');
  expect(publicBrowserBranding('mh4kidz.org','/schoolcarebridge/app/ashley').slug).toBe('schoolcarebridge');
 });
 it('uses a clean future-domain destination without leaking the internal prefix',()=>{
  expect(schoolCareBridgeExternalPath('/schoolcarebridge/app/ashley','schoolcarebridge.org')).toBe('/app/ashley');
 });
 it('returns operations sessions to general sign-in without treating operations as a school',()=>{
  const previous=window.location.pathname;window.history.replaceState(null,'','/schoolcarebridge/app/operations?payment_intent_client_secret=must-not-transfer');
  expect(getCurrentPortalSlugFromPath()).toBeNull();const target=getLoginUrlForRedirect(null,null,{timeout:true});
  expect(target).toContain('/schoolcarebridge/app?');expect(decodeURIComponent(target)).toContain('redirect=/schoolcarebridge/app/operations');expect(target).toContain('timeout=true');expect(target).not.toContain('must-not-transfer');
  window.history.replaceState(null,'',previous);
 });
});
