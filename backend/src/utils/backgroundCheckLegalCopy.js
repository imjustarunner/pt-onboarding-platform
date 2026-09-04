/**
 * Background-check authorization copy for the candidate pre-hire portal.
 * Tenant name + address are substituted into the standard release language.
 */

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia'
};

function expandState(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (STATE_NAMES[upper]) return STATE_NAMES[upper];
  return s;
}

export function formatCompanyAddress({ streetAddress, city, state, postalCode } = {}) {
  const street = String(streetAddress || '').trim();
  const cityPart = String(city || '').trim();
  const statePart = expandState(state);
  const zip = String(postalCode || '').trim();
  const cityStateZip = [cityPart, [statePart, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, cityStateZip].filter(Boolean).join(', ');
}

export function resolveCompanyLegalName(agency = {}) {
  return String(agency.official_name || agency.officialName || agency.name || 'the Company').trim() || 'the Company';
}

/**
 * @returns {{ companyName: string, companyAddress: string, paragraphs: string[] }}
 */
export function buildBackgroundCheckLegalCopy(agency = {}, { legalName = '' } = {}) {
  const companyName = resolveCompanyLegalName(agency);
  const companyAddress = formatCompanyAddress({
    streetAddress: agency.street_address || agency.streetAddress,
    city: agency.city,
    state: agency.state,
    postalCode: agency.postal_code || agency.postalCode
  });
  const ofAddress = companyAddress ? ` of ${companyAddress}` : '';
  const signer = String(legalName || '').trim();
  const iLine = signer
    ? `I, ${signer}, hereby authorize ${companyName} (the "Company")${ofAddress}, and/or its agents`
    : `I hereby authorize ${companyName} (the "Company")${ofAddress}, and/or its agents`;

  const paragraphs = [
    `${iLine} to make investigation of my background, references, character, past employment, consumer reports, education, and criminal history record information which may be in any state or local files, including those maintained by both public and private organizations, and all public records, for the purpose of confirming the information contained on my application and/or obtaining other information which may be material to my qualifications for employment. A telephone facsimile (fax) or xerographic copy of this consent shall be considered as valid as the original consent.`,
    `I hereby consent to the Company's verification of all the information I have provided on my application form. I also agree to execute as a condition of employment or a condition of continued employment any additional written authorization necessary for the Company to obtain access to and copies of records pertaining to this information. I also hereby authorize the Company's access to any medical histories or records pertaining to me (and any other individuals who due to my employment may be covered by any Company medical or other insurance program). With regard to the foregoing disclosures, I hereby agree to release any person, company, or other entity from any and all causes of action that otherwise might arise from supplying the Company with information it may request pursuant to this release. I understand that any false answers or statements, or misrepresentations by omission, made by me on this application or any related document, will be sufficient for rejection of my application or for my immediate discharge should such falsifications or misrepresentations be discovered after I am employed.`
  ];

  return { companyName, companyAddress, paragraphs };
}
