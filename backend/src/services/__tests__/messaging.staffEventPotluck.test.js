import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {saveStaffPotluckContribution} from '../staffEventPotluck.service.js';
const args={eventId:20,agencyId:4,userId:2,itemId:8,customItemName:'Fruit salad'};
function fixture(item={}){const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.startsWith('SELECT id')?[[{id:20,is_active:1,potluck_enabled:1,ends_at:'2099-01-01'}]]:sql.startsWith('SELECT *')?[[{id:8,item_name:'Food',item_notes:'[OPEN_REQUEST_SLOT]',...item}]]:[{}])};return{conn,db:{getConnection:async()=>conn}};}
it('saves a specific dish against the existing requested category',async()=>{const{conn,db}=fixture();await saveStaffPotluckContribution(args,db);expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('SET claimed_by_user_id = ?, claimed_at'),[2,'Fruit salad',8,20]);expect(conn.commit).toHaveBeenCalled();});
it('rejects an item already claimed by another staff member',async()=>{const{conn,db}=fixture({claimed_by_user_id:9});await expect(saveStaffPotluckContribution(args,db)).rejects.toMatchObject({status:409});expect(conn.rollback).toHaveBeenCalled();expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);});
it('protects guest claims too',async()=>{const{db}=fixture({claimed_by_guest_email:'guest@example.test'});await expect(saveStaffPotluckContribution(args,db)).rejects.toMatchObject({status:409});});
it('requires an answer for an open request',async()=>{const{db}=fixture();await expect(saveStaffPotluckContribution({...args,customItemName:''},db)).rejects.toMatchObject({status:400});});
it('allows someone to update their own dish',async()=>{const{conn,db}=fixture({claimed_by_user_id:2});await saveStaffPotluckContribution(args,db);expect(conn.commit).toHaveBeenCalled();});


function customFixture(items = [], {failInsert = false} = {}) {
 const conn = {
  beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
  execute: vi.fn(async (sql) => {
   if (sql.startsWith('SELECT id')) return [[{id:20,is_active:1,potluck_enabled:1,ends_at:null}]];
   if (sql.startsWith('SELECT *')) return [items];
   if (sql.startsWith('INSERT') && failInsert) throw new Error('database unavailable');
   return [{insertId:91}];
  })
 };
 return {conn,db:{getConnection:async()=>conn}};
}
it('creates an invitee-proposed dish for an undated event even when the organizer requested no items',async()=>{
 const {conn,db}=customFixture();
 await saveStaffPotluckContribution({...args,itemId:null,customItemName:'Fresh fruit salad'},db);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('FROM company_events WHERE id = ? AND agency_id = ? FOR UPDATE'),[20,4]);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('FROM company_event_need_list_items WHERE company_event_id = ? AND agency_id = ? FOR UPDATE'),[20,4]);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining("'[INVITEE_CONTRIBUTION]'"),[20,4,'Fresh fruit salad',2,2]);
 expect(conn.commit).toHaveBeenCalledTimes(1);expect(conn.rollback).not.toHaveBeenCalled();expect(conn.release).toHaveBeenCalledTimes(1);
});
it('updates an invitee’s own proposed dish without creating duplicate requests',async()=>{
 const {conn,db}=customFixture([{id:91,item_name:'Fruit',item_notes:'[INVITEE_CONTRIBUTION]',claimed_by_user_id:2}]);
 await saveStaffPotluckContribution({...args,itemId:null,customItemName:'Watermelon and berries'},db);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('SET item_name=?,claimed_by_user_id=?'),['Watermelon and berries',2,91,20]);
 expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 expect(conn.commit).toHaveBeenCalledTimes(1);
});
it('releases and removes a personal suggestion when switching to an organizer request',async()=>{
 const {conn,db}=customFixture([{id:91,item_name:'Fruit',item_notes:'[INVITEE_CONTRIBUTION]',claimed_by_user_id:2},{id:8,item_name:'Dessert',item_notes:''}]);
 await saveStaffPotluckContribution({...args,customItemName:''},db);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('SET claimed_by_user_id = ?, claimed_at'),[2,'Dessert',8,20]);
 expect(conn.execute).toHaveBeenCalledWith('DELETE FROM company_event_need_list_items WHERE id=? AND company_event_id=?',[91,20]);
 expect(conn.commit).toHaveBeenCalledTimes(1);
});
it('removes the personal suggestion when the invitee withdraws their contribution',async()=>{
 const {conn,db}=customFixture([{id:91,item_name:'Fruit',item_notes:'[INVITEE_CONTRIBUTION]',claimed_by_user_id:2}]);
 await saveStaffPotluckContribution({...args,itemId:null,customItemName:''},db);
 expect(conn.execute).toHaveBeenCalledWith('DELETE FROM company_event_need_list_items WHERE id=? AND company_event_id=?',[91,20]);
 expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 expect(conn.commit).toHaveBeenCalledTimes(1);
});
it('rolls back a failed custom insertion instead of losing the invitee’s previous claim',async()=>{
 const {conn,db}=customFixture([{id:8,item_name:'Dessert',claimed_by_user_id:2}],{failInsert:true});
 await expect(saveStaffPotluckContribution({...args,itemId:null},db)).rejects.toThrow('database unavailable');
 expect(conn.rollback).toHaveBeenCalledTimes(1);expect(conn.commit).not.toHaveBeenCalled();expect(conn.release).toHaveBeenCalledTimes(1);
});
it('rejects an overlong proposed dish before releasing existing claims',async()=>{
 const {conn,db}=customFixture();
 await expect(saveStaffPotluckContribution({...args,itemId:null,customItemName:'A'.repeat(256)},db)).rejects.toMatchObject({status:400});
 expect(conn.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(conn.rollback).toHaveBeenCalledTimes(1);
});
