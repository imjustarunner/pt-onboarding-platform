import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../config/databasePoolLimits.js',()=>({databasePoolLimits:()=>({connectionLimit:10})}));
import {withHistoricalImportLock} from '../ehrHistoricalImportLock.service.js';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};

it('serializes two first imports so the second source lookup can reuse the first chart record',async()=>{
  let owner=null,stored=null,creates=0;
  const waiting=[],entered=deferred(),releaseFirst=deferred();
  const database={getConnection:vi.fn(async()=>{
    const connection={release:vi.fn()};
    connection.execute=vi.fn(async sql=>{
      if(sql.includes('GET_LOCK')){if(owner){const wait=deferred();waiting.push(wait);await wait.promise;}owner=connection;return[[{acquired:1}]];}
      expect(owner).toBe(connection);owner=null;waiting.shift()?.resolve();return[[{released:1}]];
    });return connection;
  })};
  const importSource=()=>withHistoricalImportLock(2,42,'plan',async()=>{
    if(stored)return stored;entered.resolve();await releaseFirst.promise;creates++;stored={id:11};return stored;
  },database);
  const first=importSource();await entered.promise;const second=importSource();
  await Promise.resolve();expect(creates).toBe(0);releaseFirst.resolve();
  expect(await first).toEqual({id:11});expect(await second).toEqual({id:11});expect(creates).toBe(1);
});
it('fails closed on lock contention and releases its reserved connection',async()=>{
  const connection={execute:vi.fn(async()=>[[{acquired:0}]]),release:vi.fn()},work=vi.fn();
  await expect(withHistoricalImportLock(2,42,'intake',work,{getConnection:async()=>connection})).rejects.toMatchObject({status:409,code:'EHR_IMPORT_BUSY'});
  expect(work).not.toHaveBeenCalled();expect(connection.release).toHaveBeenCalledOnce();
});
it('releases the import lock when source creation fails',async()=>{
  const connection={execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:[[{released:1}]]),release:vi.fn()};
  await expect(withHistoricalImportLock(2,42,'plan',async()=>{throw new Error('Save failed');},{getConnection:async()=>connection})).rejects.toThrow('Save failed');
  expect(connection.execute).toHaveBeenLastCalledWith('SELECT RELEASE_LOCK(?) AS released',['ehr-import:plan:2:42']);expect(connection.release).toHaveBeenCalledOnce();
});
