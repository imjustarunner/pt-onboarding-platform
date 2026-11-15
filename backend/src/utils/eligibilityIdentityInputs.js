import {isColoradoMedicaidPolicy} from '../../../frontend/src/navigation/paperInsuranceReview.js';

export function eligibilityIdentityInputs(insurance,slot) {
  const policy=insurance?.[slot] || {},patient=insurance?.patient || {},colorado=isColoradoMedicaidPolicy(policy);
  const missing=(values,fields)=>fields.filter(([key])=>!values[key]).map(([,label])=>label);
  const patientFields=[['firstName','client legal first name'],['lastName','client legal last name'],['dateOfBirth','client birth date']];
  const core=colorado?missing(patient,patientFields):missing({...policy,route:policy.eligibilityPayerId||policy.payerId},[['route','configured payer'],['memberId','member ID'],['subscriberFirstName','subscriber first name'],['subscriberLastName','subscriber last name'],['subscriberDob','subscriber birth date']]);
  const relationship=!colorado&&!['self','child','spouse','other'].includes(policy.relationshipToSubscriber);
  const dependent=!colorado&&policy.relationshipToSubscriber!=='self'?missing(patient,patientFields):[];
  return {colorado,core,dependent,relationship,missing:[...core,...(relationship?['relationship to subscriber']:[]),...dependent]};
}
