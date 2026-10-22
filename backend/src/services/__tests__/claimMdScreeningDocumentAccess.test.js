import { describe, expect, it } from 'vitest';
import { grantScreeningDocumentRead, hasScreeningDocumentRead } from '../h0002DocumentAccess.service.js';
const context=()=>({session:{provider_user_id:8,client_id:5,agency_id:2},source:{client:{id:5},task:{assigned_to_user_id:8,assigned_to_agency_id:2}}});
describe('assigned screening document reads',()=>{
 it('grants only the matched reviewer, client and agency on that request',()=>{
  const req={user:{id:8}};grantScreeningDocumentRead(req,context());
  expect(hasScreeningDocumentRead(req,{id:5,agency_id:2})).toBe(true);
  expect(hasScreeningDocumentRead(req,{id:6,agency_id:2})).toBe(false);
  expect(hasScreeningDocumentRead(req,{id:5,agency_id:3})).toBe(false);
  expect(hasScreeningDocumentRead({...req},{id:5,agency_id:2})).toBe(false);
  req.user={id:9};expect(hasScreeningDocumentRead(req,{id:5,agency_id:2})).toBe(false);
 });
 it('cannot be forged with HTTP fields or a mismatched task',()=>{
  const req={user:{id:8},body:{screeningScope:{clientId:5,agencyId:2}},screeningDocumentScope:{clientId:5,agencyId:2}};
  expect(hasScreeningDocumentRead(req,{id:5,agency_id:2})).toBe(false);
  const mismatched=context();mismatched.source.task.assigned_to_user_id=9;
  expect(()=>grantScreeningDocumentRead(req,mismatched)).toThrow('assignment');
 });
});
