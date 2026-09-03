-- Migration 1360: job posting work schedule + credential collection; applicant extras on hiring_profiles

ALTER TABLE hiring_job_descriptions
  ADD COLUMN schedule_text VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Work schedule shown on the apply card (hours, days, evenings)',
  ADD COLUMN credential_mode VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none'
    COMMENT 'none | expected | mandatory — collect credential/license on apply';

ALTER TABLE hiring_profiles
  ADD COLUMN credential VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Applicant credential / licensure text',
  ADD COLUMN license_number VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'License number (e.g. Colorado DORA LPC.002383)',
  ADD COLUMN best_time_to_contact VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Preferred time to be contacted',
  ADD COLUMN interview_availability TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'General interview availability',
  ADD COLUMN independently_credentialed TINYINT(1) NULL DEFAULT NULL
    COMMENT '1=independently credentialed, 0=group practice, NULL=n/a',
  ADD COLUMN group_practice_insurances TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'Payers/insurances if group practice',
  ADD COLUMN willing_to_supervise TINYINT(1) NULL DEFAULT NULL
    COMMENT 'Eligible/willing to supervise unlicensed or prelicensed staff';
