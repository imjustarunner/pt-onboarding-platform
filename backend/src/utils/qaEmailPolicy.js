// These retained synthetic QA organizations use real email workflows, but
// their transport always delivers to the controlled testing inbox.
export const QA_EMAIL_AGENCY_IDS = Object.freeze([450, 451, 452, 453, 454]);
export const QA_EMAIL_INBOX = 'testing@itsco.health';
export const isQaEmailAgency = agencyId => QA_EMAIL_AGENCY_IDS.includes(Number(agencyId));

// Arguments are internal SQL identifiers, never request values.
export const emailWorkerAccountSql = (user = 'u', agency = 'ua.agency_id') =>
  `(COALESCE(${user}.is_demo,0)=0 OR ${agency} IN (450,451,452,453,454))`;
