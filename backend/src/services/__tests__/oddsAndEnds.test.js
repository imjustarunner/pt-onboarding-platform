import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../referralOcr.service.js', () => ({ default: { extractText: vi.fn() } }));
import { fillPublicProviderBlurbs } from '../schoolProviderBlurb.service.js';
import { parseInsuranceCardText } from '../insuranceCardReading.service.js';
import { coloradoMedicaidOcrMemberId } from '../../utils/coloradoMedicaidMemberId.js';
import { validateSuggestions } from '../faxExtraction.service.js';

it('fills a missing school bio from the public profile without replacing a school-specific bio', async () => {
  const execute = vi.fn(async () => [[{user_id:7,public_blurb:'Existing public biography'}]]);
  const providers = [{provider_user_id:7,school_info_blurb:null},{provider_user_id:8,school_info_blurb:'For this school'}];
  await fillPublicProviderBlurbs(providers,{execute});
  expect(providers.map(p=>p.school_info_blurb)).toEqual(['Existing public biography','For this school']);
  expect(execute.mock.calls[0][1]).toEqual([7]);
});
it('handles whitespace, duplicate IDs, and an older schema without hiding existing cards', async () => {
  const execute=vi.fn().mockResolvedValue([[{user_id:7,public_blurb:'Public bio'}]]);
  const providers=[{provider_user_id:7,school_info_blurb:'  '},{provider_user_id:7}];
  await fillPublicProviderBlurbs(providers,{execute}); expect(execute.mock.calls[0][1]).toEqual([7]);
  expect(providers.every(p=>p.school_info_blurb==='Public bio')).toBe(true);
  execute.mockRejectedValue({code:'ER_NO_SUCH_TABLE'});
  await expect(fillPublicProviderBlurbs([{provider_user_id:9}],{execute})).resolves.toHaveLength(1);
});
it.each(['Health First Colorado','Colorado Access','Colorado Medicaid','Eligibility payer ID SKCO0'])('corrects only a leading zero in a known Colorado Medicaid OCR result: %s', context => {
  expect(coloradoMedicaidOcrMemberId('0123456',context)).toBe('O123456');
  expect(coloradoMedicaidOcrMemberId('O123456',context)).toBe('O123456');
  expect(coloradoMedicaidOcrMemberId('A023456',context)).toBe('A023456');
  expect(coloradoMedicaidOcrMemberId('1123456',context)).toBe('1123456');
});
it('preserves leading zero for commercial or unknown insurance and unfamiliar formats',()=>{
  for(const context of ['Aetna','Cigna','Medicare','Medicaid',''])expect(coloradoMedicaidOcrMemberId('0123456',context)).toBe('0123456');
  expect(coloradoMedicaidOcrMemberId('00123456','Health First Colorado')).toBe('00123456');
});
it('corrects card OCR drafts and fax suggestions with the original evidence still attached',()=>{
  expect(parseInsuranceCardText('Health First Colorado\nMember ID 0123456').memberId).toBe('O123456');
  expect(parseInsuranceCardText('Cigna\nMember ID 0123456').memberId).toBe('0123456');
  const evidence='Member ID 0123456';
  const rows=validateSuggestions({candidates:[{field:'insurance_member_id',value:'0123456',evidence,page:1,confidence:'high'}]},[{page:1,text:`Health First Colorado\n${evidence}`}]);
  expect(rows[0]).toMatchObject({value:'O123456',evidence,confidence:'medium'});
});
