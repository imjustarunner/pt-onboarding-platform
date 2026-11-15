import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../services/api',()=>({default:{get:m.get}}));
import {useTasksStore} from '../tasks';
beforeEach(()=>{setActivePinia(createPinia());vi.clearAllMocks();});
it('does not let a delayed My Tasks result clear the newer Completed Team search',async()=>{
 const pending=[];m.get.mockImplementation(()=>new Promise(resolve=>pending.push(resolve)));
 const store=useTasksStore();
 const old=store.fetchTasks({view:'mine',agencyId:450});
 const current=store.fetchTasks({view:'all',agencyId:450,status:'completed',q:'2488'});
 pending[1]({data:[{id:2488,status:'completed'}]});await current;
 pending[0]({data:[]});await old;
 expect(store.tasks).toEqual([{id:2488,status:'completed'}]);
 expect(store.lastFilters).toMatchObject({view:'all',status:'completed',q:'2488'});
});
it('keeps the current loading state and error when an earlier request fails',async()=>{
 const pending=[];m.get.mockImplementation(()=>new Promise((resolve,reject)=>pending.push({resolve,reject})));
 const store=useTasksStore(),old=store.fetchTasks({view:'mine'}),current=store.fetchTasks({view:'all'});
 pending[0].reject(new Error('Old failure'));await old;
 expect(store.loading).toBe(true);expect(store.error).toBe('');
 pending[1].resolve({data:[]});await current;expect(store.loading).toBe(false);
});
