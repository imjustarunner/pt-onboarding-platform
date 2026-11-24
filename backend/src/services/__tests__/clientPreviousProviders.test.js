import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {previousProviderOptionsForAgencies,attachPreviousClientProviders} from '../clientPreviousProviders.service.js';
it('scopes every direct history lookup to the authorized agencies and returns only providers',async()=>{
 const db={execute:vi.fn(async()=>[[{id:7,name:'Former Provider'}]])};expect(await previousProviderOptionsForAgencies([2,4,2],{db})).toEqual([{id:7,name:'Former Provider'}]);
 const [sql,args]=db.execute.mock.calls[0];expect(args).toEqual([2,4,2,4,2,4,2,4,2,4]);expect(sql.match(/c.agency_id IN/g)).toHaveLength(5);expect(sql).toContain(' UNION ');expect(sql).not.toContain('actor_user_id');expect(sql).not.toContain('uploaded_by');
});
it('does not broaden an empty or invalid agency scope',async()=>{const db={execute:vi.fn()};expect(await previousProviderOptionsForAgencies([0,'bad',-2],{db})).toEqual([]);expect(db.execute).not.toHaveBeenCalled();});
it('attaches only historical providers belonging to the supplied client page',async()=>{
 const db={execute:vi.fn(async()=>[[{client_id:8,provider_id:7,provider_name:'Former Provider'}]])};expect(await attachPreviousClientProviders([{id:8},{id:9}],{db})).toEqual([{id:8,previous_providers:[{id:7,name:'Former Provider'}]},{id:9,previous_providers:[]}]);expect(db.execute.mock.calls[0][1]).toEqual([8,9,8,9,8,9]);
});
