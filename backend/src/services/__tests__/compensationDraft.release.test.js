import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn(async()=>m)}}));
import {releaseCompensationDraft} from '../compensationDraft.service.js';
const draft=()=>({draftKind:'provider_update_compensation',pushId:2,countersignerUserId:3,employee:{name:'Provider',originalAgreementDate:'2025 agreement'},schedule:{category:2,level:2,levelDescription:'Approved level',creditRate:44,hcodeRate:40,indirectRate:22,supportRate:22,ptoRate:44},leaveChoice:'sick'});
let row,preview;
beforeEach(()=>{vi.clearAllMocks();preview=false;row={id:14,candidate_user_id:9,rendered_html:'<p><strong>Editable draft — not issued or signed.</strong></p><p>Reviewed terms</p>',token_values_json:draft()};
 m.execute.mockImplementation(async(sql)=>{
  if(sql.includes('FROM contract_generations'))return [[row]];
  if(sql.includes('FROM provider_update_pushes'))return [[{id:2}]];
  if(sql.includes('FROM provider_update_recipients'))return [preview?[{id:1}]:[]];
  if(sql.includes('JOIN user_agencies'))return [[{id:3}]];
  if(sql.includes('FROM user_agencies'))return [[{user_id:9}]];
  return [{insertId:sql.includes('user_specific_documents')?100:200,affectedRows:1}];
 });
});
it.each(['missing rate','stale preview','preview push','already assigned'])('rolls back without document tasks for %s',async reason=>{
 let expectedHtml=row.rendered_html;if(reason==='missing rate')row.token_values_json.schedule.ptoRate=null;if(reason==='stale preview')expectedHtml='old';if(reason==='preview push')preview=true;if(reason==='already assigned')row.task_id=1;
 await expect(releaseCompensationDraft(2,14,{expectedHtml,pushId:2},5)).rejects.toThrow();expect(m.rollback).toHaveBeenCalledOnce();expect(m.commit).not.toHaveBeenCalled();expect(m.execute.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);expect(m.release).toHaveBeenCalledOnce();
});
it('atomically links the reviewed employee document and Haley’s countersign task without payroll or messages',async()=>{
 const result=await releaseCompensationDraft(2,14,{expectedHtml:row.rendered_html,pushId:2},5);expect(result).toEqual({taskId:200,countersignerUserId:3,messagesSent:0});expect(m.commit).toHaveBeenCalledOnce();
 const calls=m.execute.mock.calls;expect(calls[0][1]).toEqual([14,2]);const document=calls.find(([sql])=>sql.includes('INSERT INTO user_specific_documents'));expect(document[1][3]).toBe('<p>Reviewed terms</p>');
 const employee=calls.find(([sql])=>sql.includes('INSERT INTO tasks')&&!sql.includes('countersign_signer_user_id'));expect(JSON.parse(employee[1].at(-1))).toMatchObject({requiredCountersignerUserId:3,pushId:2,generationId:14});
 const counter=calls.find(([sql])=>sql.includes('INSERT INTO tasks')&&sql.includes('countersign_signer_user_id'));expect(counter[1][2]).toBe(3);expect(counter[1][5]).toBe(200);expect(calls.some(([sql])=>/payroll|email|sms/i.test(sql))).toBe(false);
});
