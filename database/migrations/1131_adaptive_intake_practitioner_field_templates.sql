-- Migration 1131: Seed framed basic intake field templates for practitioner verticals
-- Templates live in agency_intake_field_templates when that table exists; agencies
-- can attach them to intake_links via admin UI. Seed is platform-catalog style rows
-- keyed by template_type so bootstrap code can find them.

-- Only insert when the catalog table exists (created in migration 345).
SET @tbl := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agency_intake_field_templates'
);
SET @has_type := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agency_intake_field_templates' AND COLUMN_NAME = 'template_type'
);

-- Store seed definitions in a small platform table so we do not require a specific agency_id.
CREATE TABLE IF NOT EXISTS adaptive_intake_pathway_templates (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vertical_key VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(512) NULL,
  fields_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_aipt_vertical (vertical_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO adaptive_intake_pathway_templates (vertical_key, name, description, fields_json)
VALUES
(
  'life_coach',
  'Life Coach — Basic Intake Frame',
  'Lightweight full-intake starter fields for life coach tenants',
  JSON_ARRAY(
    JSON_OBJECT('key','respondent_first_name','label','Your first name','type','text','required',true,'section','guardian'),
    JSON_OBJECT('key','respondent_last_name','label','Your last name','type','text','required',true,'section','guardian'),
    JSON_OBJECT('key','respondent_email','label','Email','type','email','required',true,'section','guardian'),
    JSON_OBJECT('key','respondent_phone','label','Phone','type','phone','required',true,'section','guardian'),
    JSON_OBJECT('key','client_first_name','label','Client first name','type','text','required',true,'section','client'),
    JSON_OBJECT('key','client_last_name','label','Client last name','type','text','required',true,'section','client'),
    JSON_OBJECT('key','client_dob','label','Date of birth (optional)','type','date','required',false,'section','client'),
    JSON_OBJECT('key','support_goals','label','What support are you looking for?','type','textarea','required',true,'section','referral'),
    JSON_OBJECT('key','preferred_modality','label','Preferred format','type','select','required',false,'section','preferences','options',JSON_ARRAY(
      JSON_OBJECT('value','virtual','label','Virtual'),
      JSON_OBJECT('value','in_person','label','In person'),
      JSON_OBJECT('value','either','label','No preference')
    )),
    JSON_OBJECT('key','preferred_time_of_day','label','Preferred time of day','type','select','required',false,'section','preferences','options',JSON_ARRAY(
      JSON_OBJECT('value','morning','label','Morning'),
      JSON_OBJECT('value','afternoon','label','Afternoon'),
      JSON_OBJECT('value','evening','label','Evening'),
      JSON_OBJECT('value','flexible','label','Flexible')
    ))
  )
),
(
  'consultant',
  'Consultant — Basic Intake Frame',
  'Lightweight full-intake starter fields for consultant tenants',
  JSON_ARRAY(
    JSON_OBJECT('key','respondent_first_name','label','Your first name','type','text','required',true,'section','guardian'),
    JSON_OBJECT('key','respondent_last_name','label','Your last name','type','text','required',true,'section','guardian'),
    JSON_OBJECT('key','respondent_email','label','Email','type','email','required',true,'section','guardian'),
    JSON_OBJECT('key','respondent_phone','label','Phone','type','phone','required',true,'section','guardian'),
    JSON_OBJECT('key','client_first_name','label','Client first name','type','text','required',true,'section','client'),
    JSON_OBJECT('key','client_last_name','label','Client last name','type','text','required',true,'section','client'),
    JSON_OBJECT('key','support_goals','label','What outcomes are you hoping for?','type','textarea','required',true,'section','referral'),
    JSON_OBJECT('key','preferred_modality','label','Preferred format','type','select','required',false,'section','preferences','options',JSON_ARRAY(
      JSON_OBJECT('value','virtual','label','Virtual'),
      JSON_OBJECT('value','in_person','label','In person'),
      JSON_OBJECT('value','either','label','No preference')
    ))
  )
),
(
  'tutoring',
  'Tutoring — Basic Intake Frame',
  'Lightweight full-intake starter fields for tutoring programs',
  JSON_ARRAY(
    JSON_OBJECT('key','respondent_first_name','label','Your first name','type','text','required',true,'section','guardian'),
    JSON_OBJECT('key','respondent_last_name','label','Your last name','type','text','required',true,'section','guardian'),
    JSON_OBJECT('key','respondent_email','label','Email','type','email','required',true,'section','guardian'),
    JSON_OBJECT('key','respondent_phone','label','Phone','type','phone','required',true,'section','guardian'),
    JSON_OBJECT('key','client_first_name','label','Student first name','type','text','required',true,'section','client'),
    JSON_OBJECT('key','client_last_name','label','Student last name','type','text','required',true,'section','client'),
    JSON_OBJECT('key','client_dob','label','Date of birth (optional)','type','date','required',false,'section','client'),
    JSON_OBJECT('key','support_goals','label','What subjects or skills do you want support with?','type','textarea','required',true,'section','referral'),
    JSON_OBJECT('key','preferred_modality','label','Preferred format','type','select','required',false,'section','preferences','options',JSON_ARRAY(
      JSON_OBJECT('value','virtual','label','Virtual'),
      JSON_OBJECT('value','in_person','label','In person'),
      JSON_OBJECT('value','either','label','No preference')
    ))
  )
),
(
  'clinical',
  'Clinical — Quick Prospective Concerns Catalog',
  'Concern option catalog used by Quick Prospective for counseling/clinical tenants',
  JSON_ARRAY(
    JSON_OBJECT('value','anxiety','label','Anxiety'),
    JSON_OBJECT('value','depression','label','Depression'),
    JSON_OBJECT('value','behavior','label','Behavior'),
    JSON_OBJECT('value','adhd','label','Attention / ADHD'),
    JSON_OBJECT('value','emotional_regulation','label','Emotional regulation'),
    JSON_OBJECT('value','school','label','School concerns'),
    JSON_OBJECT('value','relationships','label','Relationships'),
    JSON_OBJECT('value','trauma','label','Trauma'),
    JSON_OBJECT('value','parenting','label','Parenting support'),
    JSON_OBJECT('value','life_transitions','label','Life transitions'),
    JSON_OBJECT('value','other','label','Other')
  )
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  fields_json = VALUES(fields_json),
  updated_at = CURRENT_TIMESTAMP;
