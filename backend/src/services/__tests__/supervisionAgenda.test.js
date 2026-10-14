import { beforeEach, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>m}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:x=>x}));
import { syncSupervisionAgenda } from '../supervisionAgenda.service.js';
let presenters, items;
beforeEach(()=>{
 vi.clearAllMocks();presenters=[{user_id:7,name:'First'},{user_id:8,name:'Second'}];items=[];
 m.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.startsWith('SELECT * FROM supervision_sessions'))return [[{id:1,agency_id:2,session_type:'group',created_by_user_id:3}]];
  if(sql.startsWith('SELECT p.user_id'))return [presenters];
  if(sql.startsWith('SELECT id FROM meeting_agendas'))return [[{id:10}]];
  if(sql.startsWith('SELECT id,generated_key'))return [items.map(i=>({...i}))];
  if(sql.startsWith('INSERT INTO meeting_agenda_items'))items.push({id:items.length+1,title:args[1],sort_order:args[2],generated_key:args[4]});
  if(sql.startsWith('DELETE FROM meeting_agenda_items'))items=items.filter(i=>i.id!==args[0]);
  if(sql.startsWith('UPDATE meeting_agenda_items SET sort_order'))for(const i of items)if(i.sort_order>=args[1])i.sort_order++;
  return [{affectedRows:1}];
 });
});
it('generates both presentations followed by processing, once, preserving manual ordering and items',async()=>{
 await syncSupervisionAgenda(1);
 expect(items.map(i=>i.title)).toEqual(['Presentation — First','Presentation — Second','Open group processing']);
 items[0].sort_order=2;items[2].sort_order=0;
 items.push({id:99,title:'Welcome',sort_order:-1,generated_key:null});
 const previous=structuredClone(items);await syncSupervisionAgenda(1);
 expect(items).toEqual(previous);expect(m.commit).toHaveBeenCalledTimes(2);
});
it('adds a later second presenter before processing and removes stale generated items only',async()=>{
 presenters=[{user_id:7,name:'First'}];await syncSupervisionAgenda(1);
 presenters.push({user_id:8,name:'Second'});await syncSupervisionAgenda(1);
 expect([...items].sort((a,b)=>a.sort_order-b.sort_order).map(i=>i.title)).toEqual(['Presentation — First','Presentation — Second','Open group processing']);
 items.push({id:99,title:'Custom',sort_order:4,generated_key:null});
 presenters=[];await syncSupervisionAgenda(1);
 expect(items).toEqual([{id:99,title:'Custom',sort_order:4,generated_key:null}]);
});
