import {it,expect,vi} from 'vitest';
import {collectionOrganizations} from '../familyLedger/collectionHandoff.js';
it('lists only active billing agencies authorized for this user without inferring collections privileges',async()=>{
 const base={organization_type:'agency',is_active:1,is_archived:0};
 const db={execute:vi.fn(async sql=>sql.startsWith('SELECT id')?[[{...base,id:1,name:'Manager',slug:'manager'},{...base,id:2,name:'Other',slug:'other'},{...base,id:3,feature_flags:{billingAccountExcluded:true}}]]:[[]])};
 const authorizeBilling=vi.fn(async(user,id)=>{if(id===2)throw Object.assign(new Error('Denied'),{status:403});});
 expect(await collectionOrganizations({id:9},{db,authorizeBilling})).toEqual({organizations:[{id:1,name:'Manager',slug:'manager',ready:false}]});
 expect(authorizeBilling).not.toHaveBeenCalledWith(expect.anything(),3,expect.anything());
});
