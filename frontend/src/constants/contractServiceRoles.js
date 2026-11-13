// IDs match backend/src/content/contractServiceRoles.js; the server owns clause text.
export const CONTRACT_SERVICE_ROLE_FIELD_LABELS = {
  CHILDCARE_COMPENSATION_TERMS:'Childcare compensation schedule in Assigned services and compensation above',
  CHILDCARE_PAY_LEVEL:'Approved childcare pay level above',
  PSYCHOLOGICAL_TESTING_COMPENSATION_TERMS:'Testing compensation terms above',
  PSYCHOLOGICAL_TESTING_AUTHORIZATION_TERMS:'Approved testing assignment and supervision above'
};
export const CONTRACT_SERVICE_ROLE_OPTIONS = [
  {id:'bachelors_counseling',title:'Bachelor’s-level counseling and skills support',description:'Approved supportive interventions with role-appropriate oversight; separate from psychotherapy.'},
  {id:'psychotherapy',title:'Master’s-level psychotherapy responsibilities',description:'Approved clinical responsibilities subject to actual education, credentials, scope and supervision.'},
  {id:'tutoring',title:'Tutoring and educational support responsibilities',description:'Approved tutoring placement, learning plans, progress records and applicable pay allowances.'},
  {id:'childcare',title:'Childcare and daycare responsibilities',description:'Nonclinical care, active supervision, attendance/staffing records and an individual pay schedule.'},
  {id:'psychological_testing',title:'Psychological testing responsibilities and oversight',description:'Separately authorized testing components, qualifications, direct supervision and actual-time records.'}
];
