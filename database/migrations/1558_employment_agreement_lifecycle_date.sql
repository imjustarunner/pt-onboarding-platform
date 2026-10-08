-- Original employment and first-client dates remain historical milestones.
-- The newest completed amendment is also resolved from signed documents at read time.
INSERT INTO user_info_field_definitions
 (field_key,field_label,field_type,options,is_required,is_platform_template,agency_id,parent_field_id,order_index,created_by_user_id)
SELECT 'employment_agreement_date','Employment Agreement Date','date',NULL,FALSE,TRUE,NULL,NULL,15,NULL
WHERE NOT EXISTS (SELECT 1 FROM user_info_field_definitions WHERE field_key='employment_agreement_date' AND agency_id IS NULL);
-- Retain existing values for audit/history; retired fields are no longer shown or edited by lifecycle.
