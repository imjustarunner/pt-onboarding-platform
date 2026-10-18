import fs from "node:fs/promises";

// Disposable-test projection of the shared organization/client schema. This is
// not a production migration runner or a rehearsal of the entire legacy schema.
export async function installSharedClientTestSchema(db) {
  for (const name of [
    "000_create_core_tables.sql",
    "001_add_agencies.sql",
    "099_add_organization_type.sql",
    "429_agencies_add_clinical_organization_type.sql",
    "100_create_clients_table.sql",
    "114_add_client_contact_phone.sql",
    "616_client_demographics.sql",
    "1302_clients_note_aid_demographics_enc.sql",
    "978_unified_booking_catalog.sql",
    "979_unified_appointments.sql",
    "982_appointment_reminders.sql",
    "201_create_support_tickets.sql",
    "574_support_tickets_external_sources.sql",
  ]) {
    await db.query(
      await fs.readFile(
        new URL(`../../../../../database/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  }
  // Ticket routing projection: the desk priority column from migration 1002;
  await db.query('ALTER TABLE agencies ADD feature_flags JSON NULL, ADD is_archived BOOLEAN NOT NULL DEFAULT FALSE');
  // unrelated support-message features are not exercised by AuricWell tests.
  await db.query("ALTER TABLE support_tickets ADD COLUMN priority VARCHAR(16) NOT NULL DEFAULT 'medium'");
  // Columns used by the current Client model; unrelated module tables are not
  // fabricated to make a full-suite end-to-end claim.
  await db.query(`ALTER TABLE clients
    ADD full_name VARCHAR(255) NULL,
    ADD date_of_birth DATE NULL,
    ADD client_type ENUM('basic_nonclinical','school','learning','clinical') NOT NULL DEFAULT 'basic_nonclinical',
    ADD client_type_transitioned_at DATETIME NULL,
    ADD client_type_transitioned_by_user_id INT NULL,
    ADD guardian_portal_enabled TINYINT(1) NOT NULL DEFAULT 0,
    ADD billing_insurance_payload JSON NULL,
    ADD insurance_member_id VARCHAR(255) NULL,
    ADD insurance_group_number VARCHAR(255) NULL,
    ADD insurance_subscriber_name VARCHAR(255) NULL`);
  // Identity projection only; full-suite authentication/onboarding schemas are
  // not installed or represented as production migration acceptance.
  await db.query(`ALTER TABLE users
    MODIFY role ENUM('admin','employee','provider','client') DEFAULT 'employee',
    ADD status ENUM('ACTIVE_EMPLOYEE','INACTIVE_EMPLOYEE','PENDING_SETUP','ARCHIVED') NOT NULL DEFAULT 'ACTIVE_EMPLOYEE',
    ADD credential VARCHAR(255) NULL,
    ADD is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD is_archived BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.query(`CREATE TABLE user_agencies (
    user_id INT NOT NULL, agency_id INT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (user_id,agency_id),
    FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (agency_id) REFERENCES agencies(id)
  )`);
  // Current canonical appointment columns, projected from later migrations.
  await db.query(`ALTER TABLE appointments
    ADD office_booking_request_id INT NULL,
    ADD cancellation_policy_id INT NULL,
    ADD cancel_deadline_at DATETIME NULL,
    ADD cancellation_reason TEXT NULL,
    ADD cancellation_fee_cents INT NULL,
    ADD cancellation_recommendation_json JSON NULL,
    ADD canceled_at DATETIME NULL,
    ADD canceled_by_user_id INT NULL,
    ADD others_present_names VARCHAR(500) NULL,
    ADD video_room_mode VARCHAR(32) NULL DEFAULT 'unique_session',
    ADD notification_mode VARCHAR(32) NULL DEFAULT 'default',
    ADD service_code VARCHAR(32) NULL,
    ADD addon_service_codes_json JSON NULL,
    ADD service_location_id INT NULL,
    ADD source_timezone VARCHAR(64) NULL`);
  const replacementMigration = await fs.readFile(new URL('../../../../../database/migrations/1636_private_cancellation_offers.sql', import.meta.url), 'utf8');
  await db.query(replacementMigration.split('ALTER TABLE user_communications')[0]);

  // Empty shared calendar projections preserve the real conflict checks.
  await db.query(`CREATE TABLE public_appointment_requests (id INT PRIMARY KEY, status VARCHAR(32));
    CREATE TABLE office_events (id INT PRIMARY KEY, booked_provider_id INT, assigned_provider_id INT, client_id INT, status VARCHAR(32), start_at DATETIME, end_at DATETIME);
    CREATE TABLE supervision_sessions (id INT PRIMARY KEY, status VARCHAR(32), start_at DATETIME, end_at DATETIME, supervisor_user_id INT, co_facilitator_user_id INT, supervisee_user_id INT, session_type VARCHAR(32));
    CREATE TABLE supervision_session_attendees (session_id INT, user_id INT, is_required BOOLEAN, status VARCHAR(32));
    CREATE TABLE provider_schedule_events (id INT PRIMARY KEY, provider_id INT, kind VARCHAR(32), status VARCHAR(32), all_day BOOLEAN, start_at DATETIME, end_at DATETIME, start_date DATE, end_date DATE, event_timezone VARCHAR(64));
    CREATE TABLE provider_schedule_event_attendees (event_id INT, user_id INT);`);

  for (const name of ['1635_appointment_cancellation_notifications.sql','1637_schedule_notice_buffer.sql'])
    await db.query(await fs.readFile(new URL(`../../../../../database/migrations/${name}`, import.meta.url), 'utf8'));

}
