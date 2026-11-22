import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({default:{}}));
import { requiresPublicApplicationCaptcha, isLocalCaptchaDevelopmentRequest } from '../publicApplicationCaptcha.service.js';
const agency = {id:463,is_active:1,is_archived:0,feature_flags:{plotlineOnly:true}};
const link = {form_type:'job_application',organization_id:463};
let db;
beforeEach(()=>{db={execute:vi.fn(async()=>[[{is_qa:1}]])};});
describe('public Plotline application CAPTCHA',()=>{
 it.each([463,464])('exempts only a registered QA company (%s)',async id=>{
  expect(await requiresPublicApplicationCaptcha(null,{...agency,id},{RECAPTCHA_REQUIRED_FOR_ALL:'true'},{...link,organization_id:id},db)).toBe(false);
  expect(db.execute).toHaveBeenCalledWith(expect.any(String),[id]);
 });
 it('requires CAPTCHA for a real Plotline company even if the old intake setting is off',async()=>{
  db.execute.mockResolvedValue([[{is_qa:0}]]);
  expect(await requiresPublicApplicationCaptcha(null,{...agency,id:800},{RECAPTCHA_REQUIRED_FOR_ALL:'false'},{...link,organization_id:800},db)).toBe(true);
 });
 it('does not trust a QA name or flag outside the registry',async()=>{
  db.execute.mockResolvedValue([[]]);
  expect(await requiresPublicApplicationCaptcha(null,{...agency,name:'Synthetic QA',is_qa:1},{},link,db)).toBe(true);
 });
 it('withholds the exemption for a mismatched or inactive company and on lookup failure',async()=>{
  expect(await requiresPublicApplicationCaptcha(null,agency,{}, {...link,organization_id:464},db)).toBe(true);
  expect(await requiresPublicApplicationCaptcha(null,{...agency,is_active:0},{},link,db)).toBe(true);
  expect(db.execute).not.toHaveBeenCalled();db.execute.mockRejectedValue(new Error('Unavailable'));
  await expect(requiresPublicApplicationCaptcha(null,agency,{},link,db)).rejects.toThrow('Unavailable');
 });
 it('preserves the ordinary non-hiring policy',async()=>{
  expect(await requiresPublicApplicationCaptcha(null,{id:800,is_active:1},{RECAPTCHA_REQUIRED_FOR_ALL:'true'},{form_type:'intake',organization_id:800},db)).toBe(true);
  expect(db.execute).not.toHaveBeenCalled();
 });
 it('never accepts localhost headers as a production exemption',()=>{
  const request=host=>({get:name=>name==='host'?host:'http://localhost:5173'});
  expect(isLocalCaptchaDevelopmentRequest(request('localhost'),'production')).toBe(false);
  expect(isLocalCaptchaDevelopmentRequest(request('plotlinepo.com'),'production')).toBe(false);
  expect(isLocalCaptchaDevelopmentRequest(request('localhost.attacker.test'),'development')).toBe(false);
  expect(isLocalCaptchaDevelopmentRequest(request('localhost:5173'),'development')).toBe(true);
 });
});
