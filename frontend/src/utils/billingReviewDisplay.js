// Service dates are calendar dates; audit timestamps are UTC instants.
export function formatBillingDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : 'Date unavailable';
}
export function formatBillingTimestamp(value) {
  if (!value) return 'Time unavailable';
  const raw = String(value).replace(' ', 'T');
  const date = value instanceof Date ? value : new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', {timeZone:'America/Denver',month:'2-digit',day:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'}).format(date);
}

const claimFields={payerid:'Claim.MD payer ID',ins_number:'Member ID',pat_name_f:'Client first name',pat_name_l:'Client last name',pat_dob:'Client date of birth',pat_sex:'Client sex on claim',pat_addr_1:'Client address',pat_city:'Client city',pat_state:'Client state',pat_zip:'Client ZIP code',pat_rel:'Relationship to subscriber',ins_name_f:'Subscriber first name',ins_name_l:'Subscriber last name',ins_dob:'Subscriber date of birth',ins_sex:'Subscriber sex on claim',ins_addr_1:'Subscriber address',ins_city:'Subscriber city',ins_state:'Subscriber state',ins_zip:'Subscriber ZIP code',bill_npi:'Billing NPI',prov_npi:'Rendering NPI',bill_name:'Billing practice name',bill_taxid:'Billing tax ID',bill_phone:'Billing phone',bill_addr_1:'Billing address',bill_city:'Billing city',bill_state:'Billing state',bill_zip:'Billing ZIP code'};
export const claimIssueText = issue => issue?.fields?.length ? `Complete: ${issue.fields.map(field=>claimFields[field] || field).join('; ')}.` : issue?.message || '';
