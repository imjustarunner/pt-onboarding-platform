import {it,expect} from 'vitest';
import {searchNav} from '../../utils/navSearchIndex';
import {appPagesAsQuickNavEntries,resolveQuickNavRoute} from '../quickNavCatalog';
it('opens the global FundThred collections workspace from an agency search context',()=>{
 const result=searchNav('FundThred Collections',{orgSlug:'itsco'}).find(r=>r.title==='FundThred Collections');
 expect(result.fullPath).toBe('/fundthred/app/collections');
 const entry=appPagesAsQuickNavEntries({role:'super_admin',user:{role:'super_admin'}}).find(e=>e.label==='FundThred Collections');
 expect(resolveQuickNavRoute(entry,{orgSlug:'itsco'})).toBe('/fundthred/app/collections');
});
