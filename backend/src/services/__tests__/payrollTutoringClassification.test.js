import { expect, it } from 'vitest';
import { payrollReportingBucketForCode } from '../payrollServiceCodeDefaults.js';
it.each(['Tutoring','TUTORING 15 MIN','TUTORING VIRTUAL','TUTORING IN PERSON'])('classifies %s as Direct even with a legacy indirect rate category', code => {
 const card={indirect_rate:21,direct_rate:26,other_rate_1:25,other_rate_1_bucket:'indirect'};
 expect(payrollReportingBucketForCode(code,'indirect',1,card)).toBe('direct');
 expect(payrollReportingBucketForCode(code,'other',1,card)).toBe('direct');
 expect(card).toEqual({indirect_rate:21,direct_rate:26,other_rate_1:25,other_rate_1_bucket:'indirect'});
});
it('keeps indirect allowances separate and respects other activities’ assigned buckets',()=>{
 expect(payrollReportingBucketForCode('AUTO INDIRECT','indirect')).toBe('indirect');
 expect(payrollReportingBucketForCode('MEETING','meeting')).toBe('indirect');
 expect(payrollReportingBucketForCode('Custom tutoring service','tutoring')).toBe('direct');
 expect(payrollReportingBucketForCode('Other service','other',2,{other_rate_2_bucket:'indirect'})).toBe('indirect');
 expect(payrollReportingBucketForCode('Other service','other',2,{other_rate_2_bucket:'direct'})).toBe('direct');
 expect(payrollReportingBucketForCode('MILEAGE','mileage')).toBe('flat');
});
