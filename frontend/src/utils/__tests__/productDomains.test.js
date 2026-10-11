import {describe,it,expect} from 'vitest';
import {publicSitePaths} from '../publicDomainRouting';
import {isFamilyWebsiteHost,isMichaelHost,productBrowserBranding} from '../productDomains';
import {schoolCareBridgeUrl,isSchoolCareBridgeHost} from '../schoolCareBridge';
import {isFundthredHost} from '../fundthred';

describe('dedicated product domains',()=>{
 it.each([
  ['fundthred.com','/','/fundthred'],['www.fundthred.com','/pricing','/fundthred/pricing'],
  ['fundthred.com','/app','/fundthred/app'],['fundthred.com','/app/itsco','/itsco/finance-operations'],
  ['plotlinepo.com','/','/plotline'],['plotlinepo.com','/app','/plotline/app'],
  ['schoolcarebridge.org','/','/schoolcarebridge'],['schoolcarebridge.org','/app/ashley','/schoolcarebridge/app/ashley'],
  ['schoolcarebridge.org','/app/partners/partner','/schoolcarebridge/app/partners/partner'],
  ['familycommandcenterhub.com','/','/family-website'],['familycommandcenterhub.com','/app','/family'],
  ['michaelvmendez.com','/','/michael'],['michaelvmendez.com','/packages','/michael/packages'],
  ['kiosk.auricwell.com','/','/office-kiosk']
 ])('round-trips %s%s through the existing route %s',(host,external,internal)=>{
  const paths=publicSitePaths(host);
  expect(paths.internal(external+'?from=website#top')).toBe(internal+'?from=website#top');
  expect(paths.clean(internal+'?from=website#top')).toBe(external+'?from=website#top');
 });
 it('keeps shared authentication, intake and API routes intact',()=>{
  for(const host of ['schoolcarebridge.org','fundthred.com','familycommandcenterhub.com','michaelvmendez.com']){
   for(const path of ['/api/users/me','/assets/main.js','/reset-password?token=test','/intake/public-key'])expect(publicSitePaths(host).internal(path)).toBe(path);
  }
 });
 it('uses exact hosts, preserving other tenants and Quick View',()=>{
  for(const predicate of [isFamilyWebsiteHost,isMichaelHost,isSchoolCareBridgeHost,isFundthredHost])for(const host of ['evil.example','app.itsco.health','schoolcarebridge.org.evil.test','fundthred.com.evil.test'])expect(predicate(host)).toBe(false);
  expect(publicSitePaths('qv.app.schoolcarebridge.org')).toBeNull();
 });
 it('recognizes school app aliases and clean login addresses',()=>{
  expect(isSchoolCareBridgeHost('app.schoolcarebridge.org')).toBe(true);
  expect(publicSitePaths('schoolcarebridge.org').internal('/login?redirect=%2Fapp')).toBe('/schoolcarebridge/app?redirect=%2Fapp');
  expect(publicSitePaths('familycommandcenterhub.com').internal('/login')).toBe('/family');
  expect(schoolCareBridgeUrl('ashley')).toBe('https://schoolcarebridge.org/app/ashley');
 });
 it('sets public family identity independently of a workplace tenant',()=>{
  expect(productBrowserBranding('familycommandcenterhub.com').title).toContain('Family Command Center');
 });
 it('does not treat the unused SchoolCareBridge .com domains as school hosts',()=>{
  for(const host of ['schoolcarebridge.com','www.schoolcarebridge.com','app.schoolcarebridge.com'])expect(isSchoolCareBridgeHost(host)).toBe(false);
 });
});
