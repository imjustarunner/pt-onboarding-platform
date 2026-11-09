import { expect, it, vi } from 'vitest';
import { createSchedulingWorkerGate } from '../schedulingWorkerGate.js';

const environment = () => ({K_REVISION:'backend-new',APP_BUILD_ID:'new',SCHEDULING_WORKER_AUTHORITY_URL:'https://backend-example.run.app/api/app-version'});
const response = buildId => ({ok:true,json:async()=>({buildId,ready:true})});
it('keeps candidate and retired workers idle, then permits promotion and honors rollback',async()=>{
  let now=0, live='old';
  const fetchImpl=vi.fn(async()=>response(live));
  const gate=createSchedulingWorkerGate({env:environment(),fetchImpl,now:()=>now});
  expect(await gate()).toBe(false);
  live='new';now=11000;expect(await gate()).toBe(true);
  live='old';now=42000;expect(await gate()).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});
it('fails closed on unavailable, unready, malformed or redirected authority responses',async()=>{
  for(const fetchImpl of [async()=>{throw Error('timeout');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({buildId:'new',ready:false})}),async()=>({ok:true,json:async()=>{throw Error('invalid json');}})]){
    expect(await createSchedulingWorkerGate({env:environment(),fetchImpl,warn:vi.fn()})()).toBe(false);
  }
});
it('never trusts local processes or arbitrary authority URLs by default',async()=>{
  const fetchImpl=vi.fn();
  for(const env of [{},{SCHEDULING_WORKERS_ENABLED:'false'},{...environment(),APP_BUILD_ID:''},{...environment(),SCHEDULING_WORKER_AUTHORITY_URL:'https://example.org/api/app-version'},{...environment(),SCHEDULING_WORKER_AUTHORITY_URL:'http://backend-example.run.app/api/app-version'},{...environment(),SCHEDULING_WORKER_AUTHORITY_URL:'https://backend-example.run.app/api/app-version?preview=1'}]){
    expect(await createSchedulingWorkerGate({env,fetchImpl})()).toBe(false);
  }
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await createSchedulingWorkerGate({env:{SCHEDULING_WORKERS_ENABLED:'true'},fetchImpl})()).toBe(true);
});
it('shares in-flight verification and never reuses success after its bounded cache expires',async()=>{
  let now=0, release;
  const fetchImpl=vi.fn(()=>new Promise(resolve=>{release=resolve;}));
  const gate=createSchedulingWorkerGate({env:environment(),fetchImpl,now:()=>now,warn:vi.fn()});
  const first=gate(),second=gate();release(response('new'));
  expect(await first).toBe(true);expect(await second).toBe(true);expect(fetchImpl).toHaveBeenCalledOnce();
  expect(await gate()).toBe(true);now=31000;fetchImpl.mockRejectedValueOnce(Error('offline'));
  expect(await gate()).toBe(false);expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl.mock.calls[0][1]).toMatchObject({redirect:'error',cache:'no-store',signal:expect.any(AbortSignal)});
});
