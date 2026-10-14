import { it, expect } from 'vitest';
import { enrollmentFormat, matchingEnrollmentProviders, enrollmentMatchingOptions, providerEnrollmentEntry } from '../enrollmentProviderMatching.js';
const provider=(id,status,excluded=[])=>({id,acceptingNewClients:status==='accepting',waitlist:status==='waitlist',intakeStatusByFormat:{VIRTUAL:status,IN_PERSON:'unavailable'},clinicalFocus:{top:{specialties:['Anxiety']},excluded:{specialties:excluded}}});
it('shows Open before Waitlist and excludes Closed for the selected format',()=>{
 const rows=[provider(1,'waitlist'),provider(2,'unavailable'),provider(3,'accepting')];
 expect(matchingEnrollmentProviders(rows,{format:'VIRTUAL'}).map(p=>p.id)).toEqual([3,1]);
 expect(matchingEnrollmentProviders(rows,{format:'IN_PERSON'})).toEqual([]);
});
it('uses clinical answers and optional fit preferences without overriding Closed or exclusions',()=>{
 const rows=[provider(1,'accepting',['Depression']),provider(2,'accepting'),provider(3,'waitlist')];
 expect(matchingEnrollmentProviders(rows,{presentingProblems:['Depression'],preferences:[{specialties:['Anxiety']}]}).map(p=>p.id)).toEqual([2,3]);
});
it('scopes matching choices to Open and Waitlist provider capabilities',()=>{
 const options=enrollmentMatchingOptions([provider(1,'accepting',['Depression']),provider(2,'waitlist',['Depression']),provider(3,'unavailable')],'VIRTUAL');
 expect(options.specialties).toContain('Anxiety');expect(options.specialties).not.toContain('Depression');
 expect(enrollmentMatchingOptions([provider(1,'unavailable')],'VIRTUAL').specialties).toEqual([]);
});
it('records profile origin separately from general full enrollment',()=>{
 expect(providerEnrollmentEntry({providerId:9})).toEqual({});
 expect(providerEnrollmentEntry({enrollmentSource:'provider',providerId:'9',format:'virtual'})).toEqual({enrollment_source:'provider',requested_profile_provider_id:9,preferred_office_provider_ids:['9'],preferred_service_format:'VIRTUAL'});
 expect(providerEnrollmentEntry({enrollmentSource:'provider',providerId:'bad'})).toEqual({});
 expect(enrollmentFormat('in person')).toBe('IN_PERSON');
});
