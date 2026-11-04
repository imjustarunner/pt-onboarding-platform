import fs from 'node:fs/promises';
import {splitSqlStatements,stripSqlLineComments} from '../../../../database/migrationSqlUtils.js';
export const payrollTables=['assistant_payroll_reports','provider_school_assignment_periods','provider_school_assignments','client_provider_assignments','payroll_mileage_claims','payroll_periods','office_locations','agency_mileage_rates','supervision_accounts','supervision_period_entries','supervision_sessions','supervision_session_attendance_rollups','supervision_session_attendees','payroll_summaries','communication_inboxes','email_sender_identities'];
export async function installPayrollSchema(db){
 const sqls=[
 "ALTER TABLE users ADD credential VARCHAR(80),ADD title VARCHAR(120),ADD employment_type VARCHAR(40),ADD is_hourly_worker TINYINT DEFAULT 0",
 'ALTER TABLE agencies ADD new_pay_system_enabled TINYINT DEFAULT 0,ADD supervision_enabled TINYINT DEFAULT 1,ADD supervision_policy_json JSON',
 'ALTER TABLE user_agencies ADD supervision_is_prelicensed TINYINT DEFAULT 1,ADD supervision_start_date DATE,ADD supervision_start_individual_hours DECIMAL(10,2) DEFAULT 0,ADD supervision_start_group_hours DECIMAL(10,2) DEFAULT 0',
 'ALTER TABLE agency_schools ADD id INT AUTO_INCREMENT PRIMARY KEY',
 'ALTER TABLE organization_affiliations ADD id INT AUTO_INCREMENT PRIMARY KEY',
 'ALTER TABLE payroll_time_claims ADD submitted_by_user_id INT,ADD claim_date DATE,ADD created_at DATETIME DEFAULT CURRENT_TIMESTAMP,ADD target_payroll_period_id INT,ADD bucket VARCHAR(32),ADD credits_hours DECIMAL(10,2),ADD applied_amount DECIMAL(10,2),ADD approved_by_user_id INT,ADD approved_at DATETIME,ADD rejection_reason TEXT,ADD rejected_by_user_id INT,ADD rejected_at DATETIME',
 'CREATE TABLE payroll_periods(id INT PRIMARY KEY,agency_id INT,period_start DATE,period_end DATE,status VARCHAR(30),posted_at DATETIME,finalized_at DATETIME,ran_at DATETIME,posted_by_user_id INT,finalized_by_user_id INT)',
 'CREATE TABLE provider_school_assignments(id INT PRIMARY KEY,provider_user_id INT,school_organization_id INT,day_of_week VARCHAR(12),is_active TINYINT,slots_total INT DEFAULT 0,created_at DATETIME,updated_at DATETIME)',
 'CREATE TABLE client_provider_assignments(id INT PRIMARY KEY,provider_user_id INT,organization_id INT,service_day VARCHAR(12),is_active TINYINT,created_at DATETIME,updated_at DATETIME)',
 'CREATE TABLE payroll_mileage_claims(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,user_id INT,submitted_by_user_id INT,status VARCHAR(40),claim_type VARCHAR(40),drive_date DATE,school_organization_id INT,office_location_id INT,office_key VARCHAR(40),home_school_roundtrip_miles DECIMAL(10,2),home_office_roundtrip_miles DECIMAL(10,2),eligible_miles DECIMAL(10,2),miles DECIMAL(10,2),round_trip TINYINT,start_location TEXT,end_location TEXT,trip_purpose TEXT,trip_approved_by VARCHAR(255),trip_preapproved TINYINT,cost_center TEXT,notes TEXT,attestation TINYINT,suggested_payroll_period_id INT,tier_level INT,attachment_file_path TEXT,attachment_original_name TEXT,attachment_mime_type VARCHAR(255),attachment_size_bytes INT,event_travel_report_id INT,target_payroll_period_id INT,rate_per_mile DECIMAL(10,2),applied_amount DECIMAL(10,2),approved_by_user_id INT,approved_at DATETIME,rejection_reason TEXT,rejected_by_user_id INT,rejected_at DATETIME,created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3))',
 'CREATE TABLE office_locations(id INT PRIMARY KEY,timezone VARCHAR(80))',
 'CREATE TABLE agency_mileage_rates(id INT PRIMARY KEY,agency_id INT,tier_level INT,rate_per_mile DECIMAL(10,2))',
 'CREATE TABLE supervision_accounts(id INT PRIMARY KEY,agency_id INT,user_id INT,individual_hours DECIMAL(10,2),group_hours DECIMAL(10,2),updated_at DATETIME)',
 'CREATE TABLE supervision_period_entries(id INT PRIMARY KEY,agency_id INT,user_id INT,payroll_period_id INT,individual_hours DECIMAL(10,2),group_hours DECIMAL(10,2),updated_at DATETIME)',
 'CREATE TABLE supervision_sessions(id INT PRIMARY KEY,agency_id INT,session_type VARCHAR(40),supervisor_user_id INT,supervisee_user_id INT,start_at DATETIME,status VARCHAR(40),finalized_at DATETIME)',
 'CREATE TABLE supervision_session_attendance_rollups(id INT PRIMARY KEY,session_id INT,user_id INT,total_seconds INT,is_finalized TINYINT,manual_correction_id INT,source_version INT,updated_at DATETIME)',
 'CREATE TABLE supervision_session_attendees(session_id INT,user_id INT,is_required TINYINT)',
 'CREATE TABLE payroll_summaries(id INT PRIMARY KEY,agency_id INT,user_id INT,payroll_period_id INT,tier_credits_current DECIMAL(10,2),tier_credits_final DECIMAL(10,2),breakdown JSON,computed_at DATETIME)',
 'CREATE TABLE communication_inboxes(id INT PRIMARY KEY,agency_id INT,identity_key VARCHAR(40),kind VARCHAR(40),is_active TINYINT,from_email VARCHAR(255),sender_identity_id INT)',
 'CREATE TABLE email_sender_identities(id INT PRIMARY KEY,agency_id INT,identity_key VARCHAR(40),is_active TINYINT,from_email VARCHAR(255))'
 ];for(const sql of sqls)await db.query(sql);
 for(const name of ['1748_payroll_assistant_review_sources.sql','1749_external_payroll_daily_reports.sql']){const raw=await fs.readFile(new URL('../../../../database/migrations/'+name,import.meta.url),'utf8');for(const sql of splitSqlStatements(stripSqlLineComments(raw)))await db.query(sql);}
}
