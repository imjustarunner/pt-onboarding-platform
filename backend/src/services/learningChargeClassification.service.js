import { learningServiceMetadata, selectedLearningServiceCode } from './learningServiceCompensation.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

const review = () => Object.assign(new Error('Confirm the completed tutoring service, student and agreed customer price before collecting this charge.'), { status: 409, statusCode: 409 });

// A saved code or a pay category is not proof of patient responsibility. Only
// the explicitly linked, completed nonclinical appointment opens this path.
export async function resolveLearningChargeDomain(charge, agencyId, db) {
  if (!charge.learning_class_session_id) {
    const [rows] = await db.execute('SELECT ls.service_type FROM learning_program_sessions s JOIN learning_services ls ON ls.id=s.learning_service_id AND ls.agency_id=s.agency_id WHERE s.id=? AND s.agency_id=?', [charge.learning_program_session_id, agencyId]);
    return String(rows[0]?.service_type || '').toLowerCase();
  }
  if (charge.learning_program_session_id || Number(charge.agency_id) !== Number(agencyId) || charge.charge_type !== 'SESSION_FEE') throw review();
  const [rows] = await db.execute(`SELECT s.status,s.actual_started_at,s.ends_at,s.metadata_json,
      a.status AS appointment_status,a.business_type,
      COALESCE(NULLIF(a.service_code,''),service.service_code) AS appointment_service_code,
      price.payment_policy,price.session_rate_cents
    FROM learning_class_sessions s
    JOIN learning_program_classes program ON program.id=s.learning_class_id AND program.organization_id=?
    JOIN tutoring_appointment_sessions link ON link.session_id=s.id
    JOIN appointments a ON a.id=link.appointment_id AND a.agency_id=program.organization_id AND a.provider_user_id=s.provider_user_id
    LEFT JOIN tenant_services service ON service.id=a.tenant_service_id AND service.agency_id=a.agency_id
    JOIN tutoring_session_clients roster ON roster.session_id=s.id AND roster.client_id=?
    JOIN clients c ON c.id=roster.client_id
    JOIN provider_tutoring_profiles price ON price.user_id=s.provider_user_id AND price.agency_id=a.agency_id
    WHERE s.id=? AND s.session_subtype='tutoring'
      AND (c.agency_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))
      AND (SELECT COUNT(*) FROM tutoring_session_clients students WHERE students.session_id=s.id)=1
      AND EXISTS(SELECT 1 FROM appointment_participants student WHERE student.appointment_id=a.id AND student.client_id=c.id)
      AND (SELECT COUNT(DISTINCT student.client_id) FROM appointment_participants student WHERE student.appointment_id=a.id)=1
    FOR UPDATE`, [agencyId, charge.client_id, charge.learning_class_session_id, agencyId, agencyId]);
  if (rows.length !== 1) throw review();
  const row = rows[0];
  const start = parseUtcDate(row.actual_started_at), end = parseUtcDate(row.ends_at);
  if (row.status !== 'ended' || !start || !end || +end <= +start || +end - +start > 12 * 3600000 || +end > Date.now()) throw review();
  if (!['scheduled','confirmed','client_confirmed','in_progress','completed'].includes(row.appointment_status) || !['learning','tutoring'].includes(row.business_type)) throw review();
  // Require an explicit academic service on both records; Homework Help and
  // H2014 cannot inherit a tutoring customer price or collection permission.
  if (learningServiceMetadata(row).learningServiceCode !== 'TUTORING') throw review();
  try { if (selectedLearningServiceCode(row.appointment_service_code, '') !== 'TUTORING') throw review(); } catch { throw review(); }
  const price = Number(row.session_rate_cents);
  if (row.payment_policy !== 'POST_SESSION' || !Number.isSafeInteger(price) || price <= 0 || Number(charge.amount_cents) !== price || Number(charge.total_cents) !== price || String(charge.currency).toUpperCase() !== 'USD') throw review();
  return 'tutoring';
}
