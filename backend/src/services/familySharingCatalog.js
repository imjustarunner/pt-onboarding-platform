import { ASSESSMENT_FAMILIES, getFamilyMeta } from './assessmentFamilyRegistry.js';
import { outcomeMeasures } from '../data/outcomeMeasures.js';

export const GUARDIAN_ACCOUNT_DOCUMENT_TYPES = ['acknowledgment','administrative','agreement','authorization','compliance','consent','disclosure','hipaa_security'];

const READY_ASSESSMENTS = new Set(['life_balance']);

export function canAssignFamilyAssessment(key) {
  return READY_ASSESSMENTS.has(getFamilyMeta(key)?.family);
}

export function familyAssessmentChoices() {
  return [
    ...ASSESSMENT_FAMILIES.map(({ family, title }) => ({ family, title, assignable: canAssignFamilyAssessment(family) })),
    ...outcomeMeasures.map(({ id, title }) => ({
      family: id, title: title || id, assignable: false, availabilityLabel: 'Available in Outcome Measures'
    })),
    { family: 'psc-17', title: 'PSC-17 · Parent / guardian report', assignable: false, availabilityLabel: 'Available in enrollment' },
    { family: 'cssrs-screener', title: 'C-SSRS · Suicide ideation screener', assignable: false, availabilityLabel: 'Available in Clinical Forms' }
  ];
}

export function isCurrentFamilyDocument({ name, document_type: type }) {
  const title = String(name || '').trim();
  // School releases come from the child's school and require the interactive consent workflow.
  // Do not change template rows that still back signed records or open enrollment packets.
  if (['school', 'school_roi'].includes(type) || /\broi\b|release of information|autorizaci[oó]n de divulgaci[oó]n/i.test(title)) return false;
  // The family assignment picker has a single path for each of these tasks.
  return !/professional (?:information|disclosure)|disclosure (?:statement|agreement)|informed consent|policy and services|notice of privacy practices|hipaa privacy|communication preferences|notification (?:choices|preferences)|payment (?:authorization|information|method)|credit card authorization|\b(?:phq|gad|psc)[ -](?:a|7|9|17)\b/i.test(title);
}

export function isGuardianAccountDocument(template) {
  return !Number(template.is_archived) && !Number(template.organization_id)
    && GUARDIAN_ACCOUNT_DOCUMENT_TYPES.includes(template.document_type) && isCurrentFamilyDocument(template);
}

const enrollmentOnly = new Set(['enrollment-form', 'intake-questionnaire', 'consent-summary', 'signatures', 'school-roi', 'disclosure', 'schoolcarebridge-acknowledgment', 'packet-acknowledgment', 'insurance-information', 'communications-preferences', 'screening-questionnaires']);

export function isStandaloneEnrollmentForm(key) {
  return !enrollmentOnly.has(key) && !/^(?:intake-|(?:counseling|tutoring)-(?:enrollment|intake)|.*-disclosure|school-roi-|agency-document-|communication[s]?-preferences)/.test(key);
}

export const REFRESH_FOUNDATION_KEYS = ['informed-consent', 'policy-services', 'hipaa-notice'];

export async function familySharingSchool(client) {
  const { default: pool } = await import('../config/database.js');
  const [[school]] = await pool.execute(`SELECT org.id,org.name FROM agencies org
    WHERE org.organization_type='school' AND org.is_active=1 AND COALESCE(org.is_archived,0)=0
      AND (org.id=? OR EXISTS(SELECT 1 FROM client_organization_assignments ca WHERE ca.client_id=? AND ca.organization_id=org.id AND ca.is_active=1))
      AND (EXISTS(SELECT 1 FROM organization_affiliations f WHERE f.organization_id=org.id AND f.agency_id=? AND f.is_active=1)
        OR EXISTS(SELECT 1 FROM agency_schools f WHERE f.school_organization_id=org.id AND f.agency_id=? AND f.is_active=1))
    ORDER BY (org.id=?) DESC,
      EXISTS(SELECT 1 FROM client_organization_assignments ca
        WHERE ca.client_id=? AND ca.organization_id=org.id AND ca.is_active=1 AND ca.is_primary=1) DESC,
      org.name, org.id LIMIT 1`, [
    client.organization_id || null, client.id, client.agency_id, client.agency_id, client.organization_id || null, client.id
  ]);
  return school || null;
}
