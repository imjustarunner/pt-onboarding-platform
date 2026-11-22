import { it, expect } from 'vitest';
import { chartOrganizationLabel, chartServiceLabel, isLegacyClinicalOrganization, hasSchoolRosterContext, rosterServiceLabel, rosterOrganizationLabel, rosterStatusLabel } from '../clientRosterContext.js';
const office={id:1,client_type:'clinical',organization_type:'clinical',organization_name:'Counseling and Therapy',client_status_key:'current',status:'ACTIVE'};
it('does not turn an office program or tutoring identifier into a school placement or fall prompt',()=>{
 expect(hasSchoolRosterContext(office)).toBe(false);
 expect(hasSchoolRosterContext({client_type:'learning',organization_type:'learning'})).toBe(false);
 expect(rosterStatusLabel(office)).toBe('Active services');
 expect(rosterOrganizationLabel(office)).toBe('—');
});
it('retains fall status for actual school care',()=>{
 const school={...office,client_type:'school',organization_type:'school'};
 expect(hasSchoolRosterContext(school)).toBe(true);
 expect(rosterStatusLabel(school)).toBe('Fall Confirmation Pending');
});
it('shows distinct agency offerings instead of a generic Clinical type',()=>{
 const client={...office,service_contexts:[
 {agency_id:2,agency_name:'Practice A',service_kind:'consultation',is_active:1},
 {agency_id:3,agency_name:'Practice B',service_kind:'counseling',is_active:1} ]};
 expect(rosterServiceLabel(client)).toBe('Consulting · Practice A; Clinical · Practice B');
});
it('never converts a stored school follow-up to a new clinical status',()=>{
 const client={...office,client_status_key:'confirmation_pending',client_status_label:'Fall Confirmation Pending'};
 expect(rosterStatusLabel(client)).toBe('Review service status');
 expect(client.client_status_label).toBe('Fall Confirmation Pending');
});
it('does not imply ended services are active',()=>{
 expect(rosterStatusLabel({...office,service_contexts:[{service_kind:'tutoring',is_active:0,service_status:'completed'}]})).toBe('Completed services');
});

it('preserves a terminated chart status even when an old enrollment is active',()=>{expect(rosterStatusLabel({...office,client_status_key:'terminated',client_status_label:'Terminated',service_contexts:[{service_kind:'counseling',is_active:1}]})).toBe('Terminated');});

it.each(['Counseling and Therapy','Counseling and Psychotherapy'])('shows %s only once as Clinical, not as a separate program',name=>{
 const client={...office,organization_name:name,service_contexts:[{agency_id:2,agency_name:'Practice A',service_kind:'counseling',is_active:1,organization_name:name},{agency_id:2,agency_name:'Practice A',service_kind:'counseling',is_active:1,organization_name:'Counseling and Therapy'}]};
 expect(rosterServiceLabel(client)).toBe('Clinical · Practice A');expect(rosterOrganizationLabel(client)).toBe('—');
});
it('preserves a named program that offers both counseling and tutoring',()=>{
 const client={...office,organization_name:'Student Support',service_contexts:[{agency_id:2,agency_name:'Practice A',service_kind:'counseling',is_active:1,organization_name:'Student Support',organization_type:'program'},{agency_id:2,agency_name:'Practice A',service_kind:'tutoring',is_active:1,organization_name:'Student Support',organization_type:'program'}]};
 expect(rosterOrganizationLabel(client)).toBe('Student Support');expect(rosterServiceLabel(client)).toBe('Clinical · Practice A; Learning · Practice A');
});
it('does not put a clinical practice name in School / program',()=>{expect(rosterOrganizationLabel({...office,organization_name:'Fictional Practice',organization_type:'clinical'})).toBe('—');});

it('preserves an explicit Counseling and Psychotherapy program instead of treating it as an agency bucket',()=>{expect(rosterOrganizationLabel({...office,organization_type:'program',organization_name:'Counseling and Psychotherapy'})).toBe('Counseling and Psychotherapy');});

it('normalizes the verified clinical grouping and preserves named programs, subjects and clinics',()=>{
 const group='Counseling and Psychotherapy';
 expect(chartOrganizationLabel(group,'clinical')).toBe('Clinical');
 expect(chartOrganizationLabel(group,'program')).toBe(group);
 expect(isLegacyClinicalOrganization('Clinical','program')).toBe(false);
 expect(chartOrganizationLabel('North Clinic','clinical')).toBe('North Clinic');
 expect(chartServiceLabel('counseling',group)).toBe('Clinical');
 expect(chartServiceLabel('tutoring','Algebra')).toBe('Learning · Algebra');
});
