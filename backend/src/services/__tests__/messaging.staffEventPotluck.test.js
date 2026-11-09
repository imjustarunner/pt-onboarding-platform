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
