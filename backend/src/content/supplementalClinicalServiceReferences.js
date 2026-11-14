import {createHash} from 'node:crypto';

const version='2026-11-13.shared-regular-hours';
const records={
  '99051':{
    code:'99051',title:'After-hours service add-on',policyKind:'addon',
    serviceDescription:'An add-on to an otherwise eligible clinical service. The shared ITSCO, Next Level Up and Inner Strength schedule policy applies when the session starts before 9:00 a.m. or at/after 5:00 p.m. on weekdays, or starts on Saturday or Sunday, in the actual appointment or office source timezone. A weekday session starting before 5:00 p.m. does not qualify solely by continuing past 5:00 p.m. A weekday morning requires separately documented payer authorization for 99051, because the standard descriptor concerns scheduled evening, weekend or holiday office services. A holiday alone does not establish eligibility; apply the saved schedule and payer requirements. It does not create a separate clinical service or establish payer coverage.',
    schedulePolicy:{basis:'session_start',regularWeekdayStartLocal:'09:00',weekdayStartLocal:'17:00',weekendDays:['Saturday','Sunday'],weekdayMorningEligible:true,holidaysAutomaticallyEligible:false,timezoneSource:'persisted_appointment_or_office'},
    documentation:'Identify the actual underlying clinical service, the encounter’s saved local schedule and source timezone, and the provider’s existing eligibility. Apply all existing agency, payer, credential, modality and place-of-service restrictions. The time-based add-on is never documentation of a clinical intervention and must not replace the underlying service’s required note content. Do not add it outside the authorized schedule window or when the saved timing cannot be verified.',
    requirements:[
      {id:'actual_primary_service',text:'Link the add-on to the actual eligible primary clinical service.'},
      {id:'saved_schedule_window',text:'Verify a start outside regular weekday 9 a.m.–5 p.m. hours or a weekend start from the saved encounter schedule and source timezone.'},
      {id:'existing_billing_eligibility',text:'Preserve the agency, payer, credential, modality and place-of-service eligibility restrictions.'}
    ],
    supportingReferences:[
      {title:'CMS transmittal R4007CP — official code descriptor context',url:'https://www.cms.gov/Regulations-and-Guidance/Guidance/Transmittals/2018Downloads/R4007CP.pdf'},
      {title:'HHS OIG — Medicaid payments for after-hours services',url:'https://oig.hhs.gov/reports/all/2011/medicaid-payments-for-after-hours-services/'}
    ]
  },
  'PRO-BONO SERVICE':{
    code:'PRO-BONO SERVICE',title:'Pro bono funding policy',policyKind:'funding',zeroClientCharge:true,requiresUnderlyingClinicalService:true,
    serviceDescription:'Pro bono means no charge to the client. It is a funding designation, not a clinical modality, intervention or substitute procedure code.',
    documentation:'Document the actual clinical service performed using its known underlying service definition and the same clinical documentation standards as a paid service. Use only an explicitly saved underlying clinical service; do not infer psychotherapy, a procedure code, provider qualifications or the service from duration. If the underlying service is unknown, identify that missing context and leave service-specific verification unavailable. Do not automatically charge the client or consume a client-paid package. A payer charge requires a separate, explicit and already-authorized funding policy; pro bono alone does not authorize an insurance claim. Preserve historical claims and fee snapshots.',
    requirements:[
      {id:'no_client_charge',text:'The client owes zero for the pro bono service.'},
      {id:'known_underlying_service',text:'Use an explicitly known underlying clinical service; do not infer one.'},
      {id:'underlying_documentation',text:'Check the actual underlying clinical service’s documentation requirements.'},
      {id:'no_automatic_payer_claim',text:'Do not create an insurance claim without an explicit, already-authorized payer funding policy.'}
    ],supportingReferences:[]
  }
};

export function supplementalClinicalServiceReference(code) {
  const record=records[code];if(!record)return null;
  const sha256=createHash('sha256').update(JSON.stringify({version,record})).digest('hex');
  return {...structuredClone(record),status:'supplemental-policy',providerQualifications:'Existing provider qualifications and agency/payer eligibility remain controlling.',placesOfService:'Existing approved service and payer place-of-service policy.',allowedPlaceOfServiceCodes:[],ageGroups:'Use the underlying clinical service’s approved age and eligibility rules.',manualText:record.documentation,
    source:{kind:'user_agency_policy',id:`auricwell-${code==='99051'?'99051-hours':'pro-bono-funding'}`,version,hash:sha256,sha256,title:code==='99051'?'Shared collective regular-hours policy':'Auricwell owner-defined pro bono funding policy',edition:version,effectiveDate:'2026-11-13',pages:[]},
    reviewNotice:'Supplemental agency policy supplied by the owner. This is not an entry from the October 2026 SBHS billing PDF and does not establish payer coverage or authorization.'};
}
