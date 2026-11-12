import { describe, expect, it } from 'vitest';
import { tutoringIntakeSteps, isValidEnrollmentEmail, TUTORING_AGREEMENT_KEY } from '../tutoringEnrollmentPolicy.js';
import { buildCounselingDependentEnSteps, mergeCounselingOfficeEnIntoSteps } from '../../../../backend/src/data/counselingIntakeDependentEn.js';

describe('academic tutoring effective enrollment', () => {
  it('removes the real inherited clinical packet and screening content without changing its source', () => {
    const source = mergeCounselingOfficeEnIntoSteps([...buildCounselingDependentEnSteps(), {type:'packet_hipaa_notice'}, {type:'packet_informed_group_consent'}, {type:'smart_disclosure'}], {paymentOnly:true});
    const saved = JSON.stringify(source);
    const result = tutoringIntakeSteps(source);
    expect(JSON.stringify(source)).toBe(saved);
    expect(result.some(step=>step.id?.startsWith('counseling_'))).toBe(false);
    expect(result.some(step=>/hipaa|disclosure|informed_group/.test(step.type))).toBe(false);
    expect(result.find(step=>step.type==='insurance_info')).toMatchObject({paymentRequired:false,paymentOnly:true,enrollmentService:'tutoring'});
    expect(result.find(step=>step.id==='tutoring_services_agreement').fields[0]).toMatchObject({key:TUTORING_AGREEMENT_KEY,required:true,type:'checkbox'});
    expect(tutoringIntakeSteps(result)).toEqual(result);
  });
  it('preserves custom academic steps and optionalizes demographic details with inclusive choices', () => {
    const result=tutoringIntakeSteps([{id:'learning-details',type:'questions',fields:[{key:'learning_goal',required:true},{key:'guardian_dob',required:true},{key:'emergency_phone',required:true},{key:'address_street',required:true},{key:'child_sex',required:true,options:[{value:'female'},{value:'male'}]}]}]);
    const fields=result[0].fields;
    expect(fields[0].required).toBe(true);expect(fields.slice(1).every(f=>f.required===false)).toBe(true);
    expect(fields.at(-1).options.map(o=>o.value)).toEqual(expect.arrayContaining(['nonbinary','self_described','prefer_not_to_say']));
  });
  it('uses Spanish tutoring agreement labels without including a clinical notice', () => {
    const result=tutoringIntakeSteps([{type:'packet_hipaa_notice'}],{locale:'es'});
    expect(result).toHaveLength(2);expect(result.at(-1).label).toBe('Acuerdo de tutoría');
  });
});

it.each(['qa.nlu.parent@','name@domain','name@@example.com','name@.example.com','name@bad_domain.com','name..last@example.com','name @example.com'])('rejects malformed email %s',email=>expect(isValidEnrollmentEmail(email)).toBe(false));
it.each(['qa.nlu.parent@example.com','person+learning@school.example.health'])('accepts valid email %s',email=>expect(isValidEnrollmentEmail(email)).toBe(true));
