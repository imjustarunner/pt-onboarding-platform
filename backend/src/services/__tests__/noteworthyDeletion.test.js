import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {noteworthyDeletionPlan,noteworthyObjectKey} from '../noteworthyDeletion.service.js';
const table=(name,columns)=>({name,columns:columns.map(name=>({name,nullable:false}))});
it('orders derived records before imports and periods while retaining agency predicates and legal records',()=>{
  const schema={tables:[table('agencies',['id']),table('noteworthy_practices',['agency_id']),table('payroll_periods',['id','agency_id']),table('payroll_imports',['id','agency_id','payroll_period_id']),table('payroll_import_rows',['id','payroll_import_id']),table('payroll_shadow',['id','payroll_import_row_id']),table('organization_agreement_records',['id','agency_id'])],references:[]};
  const plan=noteworthyDeletionPlan(schema,17),names=plan.order.map(t=>t.table.name);
  expect(names.indexOf('payroll_shadow')).toBeLessThan(names.indexOf('payroll_import_rows'));
  expect(names.indexOf('payroll_import_rows')).toBeLessThan(names.indexOf('payroll_imports'));
  expect(names.indexOf('payroll_imports')).toBeLessThan(names.indexOf('payroll_periods'));
  expect(names).not.toContain('agencies');expect(names).not.toContain('noteworthy_practices');expect(names).not.toContain('organization_agreement_records');
  expect(plan.scopes.get('payroll_shadow').params).toEqual([17]);expect(plan.scopes.get('payroll_shadow').render('x')).toContain('payroll_import_rows');
});
it('keeps an explicit linked-ticket ID after its thread reference is removed',()=>{
  const schema={tables:[table('support_tickets',['id','agency_id']),table('noteworthy_contact_threads',['id','agency_id','support_ticket_id'])],references:[{child:'noteworthy_contact_threads',parent:'support_tickets',columns:['support_ticket_id'],parentColumns:['id']}]};
  const plan=noteworthyDeletionPlan(schema,17,{linkedTicketIds:[42]});
  expect(plan.order.map(p=>p.table.name)).toEqual(['noteworthy_contact_threads','support_tickets']);expect(plan.scopes.get('support_tickets').params).toEqual([17,42]);expect(plan.scopes.get('support_tickets').render('t')).not.toContain('FROM noteworthy_contact_threads');
});
it('fails closed on circular dependencies rather than disabling foreign-key protection',()=>{
  const schema={tables:[table('a',['id','agency_id']),table('b',['id','agency_id'])],references:[{child:'a',parent:'b',columns:['id'],parentColumns:['id']},{child:'b',parent:'a',columns:['id'],parentColumns:['id']}]};
  expect(()=>noteworthyDeletionPlan(schema,1)).toThrow('circular');
});
it('only resolves owned storage references and rejects traversal and foreign buckets',()=>{
  expect(noteworthyObjectKey('/uploads/reimbursements/report.pdf','owned')).toBe('uploads/reimbursements/report.pdf');
  expect(noteworthyObjectKey('gs://owned/uploads/file.pdf','owned')).toBe('uploads/file.pdf');
  expect(noteworthyObjectKey('https://storage.googleapis.com/owned/uploads/file.pdf','owned')).toBe('uploads/file.pdf');
  expect(()=>noteworthyObjectKey('gs://other/uploads/file.pdf','owned')).toThrow('different bucket');
  expect(()=>noteworthyObjectKey('uploads/%2e%2e/private','owned')).toThrow('requires review');
  expect(noteworthyObjectKey('https://example.test/receipt.pdf','owned')).toBeNull();
});
