import { describe, it, expect, vi } from 'vitest';
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeDecryptNotePayload: value => value }));
import { intakeDraftReview, validateIntakeDraftReview } from '../intakeDraftReview.service.js';
const sections = [{key:'mse',body:'Not assessed in the source.'},{key:'risk',body:'Not assessed.'}];
const row = { id:1,agency_id:450,client_id:2304,provider_user_id:1433,service_code:'90791',status:'ready',scrubbed_input_enc:'Guardian reports difficulty sleeping.',note_body_enc:'Draft',suggested_dx_json:'{}' };
const request = draft => ({ fingerprint:intakeDraftReview(draft,sections).fingerprint,sectionKeys:['mse','risk'],sourceCompared:true,unsupportedClaimsRemoved:true,appointmentReviewed:true });
describe('intake source review',()=>{
 it('does not treat legacy ready status or long sections as evidence of review',()=>{
  expect(intakeDraftReview(row,sections).reviewedAt).toBeNull();
  expect(()=>validateIntakeDraftReview(row,sections,{})).toThrow(/review every section/);
 });
 it('accepts an explicit review of each current section and the appointment',()=>{
  expect(validateIntakeDraftReview(row,sections,request(row)).fingerprint).toBe(request(row).fingerprint);
 });
 it.each(['note_body_enc','scrubbed_input_enc','confirmed_dx_json','provider_user_id'])('invalidates review when %s changes',field=>{
  expect(()=>validateIntakeDraftReview({...row,[field]:'changed'},sections,request(row))).toThrow(/review every section/);
 });
 it('rejects partial section review, missing sources, and unchecked appointment',()=>{
  expect(()=>validateIntakeDraftReview(row,sections,{...request(row),sectionKeys:['mse']})).toThrow();
  expect(()=>validateIntakeDraftReview({...row,scrubbed_input_enc:''},sections,request(row))).toThrow();
  expect(()=>validateIntakeDraftReview(row,sections,{...request(row),appointmentReviewed:false})).toThrow();
 });
});
