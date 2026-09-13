import {describe,it,expect} from 'vitest';
import {shouldShowPublicTranslate} from '../publicTranslateWidget';
describe('public language navigation',()=>{
 it('keeps language controls on websites, provider pages, join pages, and careers',()=>{
  for(const [name,path] of [['ItscoPublicWebsite','/p/itsco'],['PublicProviderProfile','/itsco/provider/7'],['AdaptiveJoinService','/join/itsco/counseling'],['PublicCareers','/careers/itsco']])expect(shouldShowPublicTranslate({name,path,matched:[]})).toBe(true);
 });
 it('leaves staff routes and linked Spanish intake forms to their existing language rules',()=>{
  for(const path of ['/itsco/admin/users','/intake/public-key','/i/public-key','/itsco/login'])expect(shouldShowPublicTranslate({path,matched:[]})).toBe(false);
 });
});
