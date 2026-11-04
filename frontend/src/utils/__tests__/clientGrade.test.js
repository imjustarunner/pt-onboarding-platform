import {expect,it} from 'vitest';
import {STANDARD_GRADE_VALUES,gradeSelectOptionsForModel,normalizeGradeForSave,normalizeGradeToStandard} from '../clientGrade.js';
import {normalizeGradeForSave as serverGrade,bumpGradeCanonical} from '../../../../backend/src/utils/clientGrade.js';

it.each(['Pre-K','PreK','pre k','PK','prekindergarten','Pre Kindergarten'])('retains %s as Pre-K in the editor and server',value=>{
 expect(normalizeGradeToStandard(value)).toBe('Pre-K');expect(normalizeGradeForSave(value)).toBe('Pre-K');expect(serverGrade(value)).toBe('Pre-K');
});
it('offers Pre-K separately from Kindergarten and advances it once on school-year rollover',()=>{
 expect(STANDARD_GRADE_VALUES.slice(0,3)).toEqual(['Pre-K','K','1st']);
 expect(gradeSelectOptionsForModel('Pre-K')[0]).toEqual({value:'Pre-K',label:'Pre-K'});
 expect(bumpGradeCanonical('Pre-K')).toBe('K');expect(bumpGradeCanonical('K')).toBe('1st');
 expect(serverGrade('Kindergarten')).toBe('K');expect(normalizeGradeForSave('K')).toBe('K');
});
