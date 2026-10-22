import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../clientIndependence.service.js',()=>({requireIndependenceReviewer:vi.fn()}));
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:vi.fn(()=>'{encrypted}'),decryptFamilyBilling:vi.fn(()=>({message:'Requested change'}))}));
import pool from '../../config/database.js';import {supportDetails,submitSupportRequest,resolveSupportRequest} from '../clientSupport.service.js';
let db,scopes;
beforeEach(()=>{vi.resetAllMocks();scopes=['scheduling'];db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async q=>{
 if(q.includes('SELECT g.scopes_json'))return [[{scopes_json:scopes}]];
 if(q.includes('SELECT * FROM client_support_requests'))return [[{id:9,client_id:8,agency_id:2,helper_user_id:5,scope:'scheduling'}]];
 if(q.includes('SELECT organization_id'))return [[{organization_id:2}]];
 if(q.startsWith('SELECT'))return [[]];return [{insertId:9,affectedRows:1}];
 })};pool.getConnection.mockResolvedValue(db);});
it('requires the specific current assistance scope before accepting a change request',async()=>{
 await expect(submitSupportRequest(5,8,2,{scope:'contact',message:'Change address'})).rejects.toMatchObject({status:403});expect(db.commit).not.toHaveBeenCalled();expect(db.execute.mock.calls.some(([q])=>q.startsWith('INSERT'))).toBe(false);
});
it('saves an encrypted request for review without directly changing the chart or appointment',async()=>{
 expect(await submitSupportRequest(5,8,2,{scope:'scheduling',message:'Please move this appointment'})).toEqual({id:9,status:'pending'});
 const sql=db.execute.mock.calls.map(([q])=>q).join(' ');expect(sql).not.toMatch(/UPDATE (appointments|clients|users)/);expect(db.execute.mock.calls.find(([q])=>q.includes('INSERT INTO client_support_requests'))[1].at(-1)).toBe('{encrypted}');expect(db.commit).toHaveBeenCalledOnce();
});
it('cannot complete a pending request after its permission has been removed',async()=>{
 scopes=[];await expect(resolveSupportRequest({id:1,role:'super_admin'},8,9)).rejects.toMatchObject({status:403});expect(db.execute.mock.calls.some(([q])=>q.startsWith('UPDATE'))).toBe(false);expect(db.rollback).toHaveBeenCalled();
});
it('a billing-only helper never receives contact information, appointments, or requests for removed scopes',async()=>{
 pool.execute.mockImplementation(async q=>q.includes('FROM client_support_grants')?[[{clientId:8,agencyId:2,scopes_json:['billing']}]]:q.includes('FROM client_support_requests')?[[{id:9,scope:'scheduling',status:'pending'}]]:[[]]);
 expect(await supportDetails(5,8,2)).toMatchObject({scopes:['billing'],contact:null,appointments:[],requests:[]});expect(pool.execute.mock.calls.some(([q])=>q.includes('FROM appointments')||q.includes('SELECT contact_phone'))).toBe(false);
 await expect(supportDetails(5,8,7)).rejects.toMatchObject({status:403});
});
