import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ execute:vi.fn(), getConnection:vi.fn(), levels:vi.fn(), profiles:vi.fn(), rules:vi.fn() }));
vi.mock('../../config/database.js', () => ({ default:mocks }));
vi.mock('../../models/PayrollCompensationLevel.model.js', () => ({ default:{ listForAgency:mocks.levels, getLevelRatesForAgency:vi.fn(async () => ({})) } }));
vi.mock('../../models/PayrollPaySystemRate.model.js', () => ({ default:{ listForAgency:mocks.profiles } }));
vi.mock('../../models/PayrollServiceCodeRule.model.js', () => ({ default:{ listForAgency:mocks.rules } }));
import { applicantReferenceStatus, saveReferenceContact } from '../../models/HiringReferenceContact.model.js';
import { selectedContractCompensation } from '../contractCompensation.service.js';
import { brandedReferenceEmail } from '../hiringReferenceEmail.service.js';
beforeEach(() => vi.clearAllMocks());
describe('reference confidentiality and phone completion', () => {
  it('exposes only completion metadata to applicants', async () => {
    mocks.execute.mockResolvedValue([[{ reference_index:0,reference_name:'Ref',status:'cancelled',sent_at:'2026-10-06' },{ reference_index:0,status:'completed',completed_at:'2026-10-07',completion_method:'phone', note:'PRIVATE', responses_json:{ wouldHire:'no' }, public_link_token:'SECRET' }]]);
    const status = await applicantReferenceStatus(2,1);
    expect(status).toEqual([{ referenceIndex:0,referenceName:undefined,status:'completed',completedAt:'2026-10-07',completionMethod:'phone' }]);
    expect(mocks.execute.mock.calls[0][1]).toEqual([2,1,2,1]); expect(JSON.stringify(status)).not.toMatch(/PRIVATE|SECRET|wouldHire/);
  });
  it('atomically saves phone completion and cancels pending reminders', async () => {
    const db = { execute:vi.fn().mockResolvedValue([{insertId:4}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn() }; mocks.getConnection.mockResolvedValue(db);
    await saveReferenceContact({ profileId:3,agencyId:1,userId:2,referenceIndex:0,method:'phone',outcome:'completed',note:'Completed with PO',authorId:8 });
    expect(db.execute.mock.calls[1][0]).toContain("status = 'cancelled'"); expect(db.execute.mock.calls[1][1]).toEqual([3,1,0]); expect(db.commit).toHaveBeenCalled();
  });
  it('brands email and makes confidentiality explicit', () => {
    const html = brandedReferenceEmail({ agency:{name:'Agency <X>',careers_page_json:{accentColor:'#123456'}},candidateName:'Applicant',referenceName:'Ref',url:'https://example.test/reference/abc',deadline:'2026-10-13T18:00:00Z' });
    expect(html).toContain('Agency &lt;X&gt;'); expect(html).toContain('#123456'); expect(html).toContain('Your answers will not be shared with the applicant.'); expect(html).toContain('October 13, 2026');
  });
});
describe('selected contract compensation', () => {
  it('uses category 2 level 2 and all visible configured codes', async () => {
    mocks.levels.mockResolvedValue([{category:2,level:1,ffs_rate:35},{category:2,level:2,ffs_rate:45,indirect_rate:20}]); mocks.profiles.mockResolvedValue([]);
    mocks.rules.mockResolvedValue(['90791','90837','90834','H2014'].map(service_code => ({service_code,category:'direct',pay_divisor:service_code==='H2014'?4:1,show_in_rate_sheet:1})));
    const { row, rates } = await selectedContractCompensation(1,2,2,'ffs'); expect(row.level).toBe(2); expect(rates).toHaveLength(4); expect(rates[0].rate).toBe('$45.00'); expect(rates[3].rate).toBe('$11.25');
  });
  it('rejects missing rates', async () => { mocks.levels.mockResolvedValue([{category:2,level:2,ffs_rate:null}]); mocks.profiles.mockResolvedValue([]); await expect(selectedContractCompensation(1,2,2,'ffs')).rejects.toThrow('no configured'); });
});

import HiringReferenceRequest from '../../models/HiringReferenceRequest.model.js';
describe('online completion consistency', () => {
  it('saves once and closes older active links for the same reference', async () => {
    const db = { execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn() };mocks.getConnection.mockResolvedValue(db);
    db.execute.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{id:4,hiring_profile_id:3,agency_id:1,reference_index:0,status:'completed'}]]).mockResolvedValueOnce([{affectedRows:1}]);
    expect(await HiringReferenceRequest.markCompleted(4,{wouldHire:'yes'})).toMatchObject({status:'completed'});
    expect(db.execute.mock.calls[2][1]).toEqual([3,1,0,4]);expect(db.commit).toHaveBeenCalled();
  });
  it('rejects duplicate or expired submissions without overwriting answers', async () => {
    const db = {execute:vi.fn().mockResolvedValue([{affectedRows:0}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};mocks.getConnection.mockResolvedValue(db);
    expect(await HiringReferenceRequest.markCompleted(4,{})).toBeNull();expect(db.rollback).toHaveBeenCalled();expect(db.commit).not.toHaveBeenCalled();
  });
  it('rolls back completion if its durable receipt event cannot be queued', async () => {
    const db = {execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};mocks.getConnection.mockResolvedValue(db);
    db.execute.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{id:4,hiring_profile_id:3,candidate_user_id:2,agency_id:1,reference_index:0,status:'completed'}]]).mockResolvedValueOnce([{affectedRows:1}]).mockRejectedValueOnce(new Error('Queue unavailable'));
    await expect(HiringReferenceRequest.markCompleted(4,{})).rejects.toThrow('Queue unavailable');
    expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();
  });
});

describe('request questionnaire snapshot', () => {
  it('retains the invited contact snapshot alongside questions before and after completion', async () => {
    const contact={referenceName:'Taylor',referenceEmail:'taylor@example.test',referencePhone:'555-0100',relationshipType:'coworker'};
    const stored={questionnaireSnapshot:{version:3},referenceContactSnapshot:contact};
    expect(HiringReferenceRequest.mapRow({status:'sent',responses_json:JSON.stringify(stored)})).toMatchObject({referenceContact:contact,responses_json:null});
    expect(HiringReferenceRequest.mapRow({status:'completed',responses_json:stored})).toMatchObject({referenceContact:contact});
    mocks.execute.mockResolvedValueOnce([{insertId:47}]).mockResolvedValueOnce([[{id:47,status:'sent',responses_json:JSON.stringify(stored)}]]);
    const created=await HiringReferenceRequest.insertRow({hiringProfileId:3,agencyId:1,candidateUserId:2,referenceIndex:0,referenceName:'Taylor',referenceEmail:contact.referenceEmail,publicLinkToken:'synthetic',tokenExpiresAt:'2030-01-01',questionnaire:stored.questionnaireSnapshot,referenceContact:contact});
    expect(JSON.parse(mocks.execute.mock.calls[0][1].at(-1))).toEqual(stored);expect(created.referenceContact).toEqual(contact);
  });
  it('exposes questions separately from responses until the reference is complete', () => {
    const questionnaire = {version:2, traits:[{key:'planning',label:'Planning'}]};
    const stored = JSON.stringify({questionnaireSnapshot:questionnaire});
    expect(HiringReferenceRequest.mapRow({status:'sent',responses_json:stored})).toMatchObject({responses_json:null,questionnaire});
    expect(HiringReferenceRequest.mapRow({status:'completed',responses_json:JSON.stringify({questionnaireSnapshot:questionnaire,traits:{planning:5}})})).toMatchObject({questionnaire,responses_json:{traits:{planning:5}}});
    expect(HiringReferenceRequest.mapRow({status:'sent',responses_json:null}).questionnaire.version).toBe(2);
  });
});

it('only declines an active, unexpired request', async () => {
  const db = { execute:vi.fn().mockResolvedValue([{affectedRows:0}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn() };
  mocks.getConnection.mockResolvedValue(db);
  expect(await HiringReferenceRequest.markDeclined(3)).toBe(false);
  expect(db.execute.mock.calls.at(-1)[0]).toContain("status = 'sent' AND token_expires_at > NOW()");
  expect(db.execute).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
});

it('commits a decline and its hiring alert together without storing any questionnaire answers', async () => {
  const db = { execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn() };
  mocks.getConnection.mockResolvedValue(db);
  db.execute.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{id:47,agency_id:463,candidate_user_id:1871,reference_index:1}]]).mockResolvedValueOnce([{affectedRows:1}]);
  expect(await HiringReferenceRequest.markDeclined(47)).toBe(true);
  expect(db.execute.mock.calls[0][1]).toEqual([47]);
  expect(db.execute.mock.calls[2][0]).toContain('INSERT IGNORE INTO hiring_reference_receipt_events');
  expect(db.execute.mock.calls[2][1]).toEqual([463,1871,'online',47,1]);
  expect(db.commit).toHaveBeenCalledOnce();expect(db.rollback).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
});

it('rolls back a decline if the durable hiring alert cannot be queued', async () => {
  const db = { execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn() };
  mocks.getConnection.mockResolvedValue(db);
  db.execute.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([[{id:47,agency_id:463,candidate_user_id:1871,reference_index:1}]]).mockRejectedValueOnce(new Error('Queue unavailable'));
  await expect(HiringReferenceRequest.markDeclined(47)).rejects.toThrow('Queue unavailable');
  expect(db.commit).not.toHaveBeenCalled();expect(db.rollback).toHaveBeenCalled();expect(db.release).toHaveBeenCalled();
});
