import { createHash } from 'node:crypto';

export const PLOTLINE_SENDER_PROCEDURE = 'provision_plotline_sender_20261126';
export const PLOTLINE_SENDER_DATABASE_USER = 'plotline_sms_auto_20261126';
export const PLOTLINE_SENDER_SERVICE_ACCOUNT = 'plotline-sms-provisioning@ptonboard-dev.iam.gserviceaccount.com';
export const PLOTLINE_SMS_CALLBACK = 'https://plottwisthq.com/api/vonage/inbound';
export const plotlineSenderPlan = {
  phoneNumber: '+17197165766', numberPurpose: 'platform_contact', friendlyName: 'Plotline People Operations — Interview Reminders',
  registration: {
    provider: 'vonage', brandId: 'BCGLCIL', campaignId: 'VCZOP4JO', resellerId: 'R000000',
    brandName: 'Plotline People Operations', legalName: 'Plot Twist Co', supportContact: 'support@plotlinepo.com',
    website: 'https://plotlinepo.com', privacyUrl: 'https://plotlinepo.com/privacy', termsUrl: 'https://plotlinepo.com/terms',
    evidenceUrl: 'https://plotlinepo.com/sms-consent', purposes: ['workforce'], keywordOwner: 'application',
    helpKeywordOwner: 'application', approved: true, numberLinked: true, interviewOnly: true, platformInterviewSender: true
  }
};
export const PLOTLINE_SENDER_PLAN_HASH = createHash('sha256').update(JSON.stringify(plotlineSenderPlan)).digest('hex');
export const plotlineInterviewRuntimeConfig = {
  platform: { from: plotlineSenderPlan.phoneNumber, brandId: plotlineSenderPlan.registration.brandId,
    campaignId: plotlineSenderPlan.registration.campaignId, scope: 'all_agencies' }
};

// This is installed by the release coordinator as a schema operation. Application
// records are inserted only when the procedure-only automation user calls APPLY.
// The fixed manifest cannot register a different number, campaign, or purpose.
export function plotlineSenderProcedureSql() {
  const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
  const registration = literal(JSON.stringify(plotlineSenderPlan.registration));
  return `CREATE PROCEDURE ${PLOTLINE_SENDER_PROCEDURE}(IN p_plan_hash CHAR(64), IN p_apply BOOLEAN)
SQL SECURITY DEFINER
main: BEGIN
  DECLARE v_locked INT DEFAULT 0;
  DECLARE v_count INT DEFAULT 0;
  DECLARE v_number_id INT DEFAULT NULL;
  DECLARE v_had_number BOOLEAN DEFAULT FALSE;
  DECLARE v_had_registration BOOLEAN DEFAULT FALSE;
  DECLARE v_registration JSON;
  DECLARE v_existing JSON;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN
    ROLLBACK;
    IF v_locked=1 THEN DO RELEASE_LOCK('plotline_sender_20261126'); END IF;
    RESIGNAL;
  END;
  IF SUBSTRING_INDEX(USER(),'@',1) <> '${PLOTLINE_SENDER_DATABASE_USER}'
    OR p_plan_hash IS NULL OR p_plan_hash <> '${PLOTLINE_SENDER_PLAN_HASH}' OR p_apply IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_UNAUTHORIZED_MANIFEST';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()
    AND table_name IN ('twilio_numbers','sms_sender_registrations','hiring_interview_sms_consents','user_activity_log')) <> 4 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_REQUIRED_SCHEMA_MISSING';
  END IF;
  SET v_registration=CAST(${registration} AS JSON);
  IF p_apply THEN
    SELECT GET_LOCK('plotline_sender_20261126',0) INTO v_locked;
    IF v_locked <> 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_PROVISIONING_BUSY'; END IF;
    START TRANSACTION;
  END IF;
  SELECT COUNT(*),MIN(id) INTO v_count,v_number_id FROM twilio_numbers WHERE phone_number='${plotlineSenderPlan.phoneNumber}';
  IF v_count>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_AMBIGUOUS_NUMBER'; END IF;
  SET v_had_number=(v_count=1);
  IF v_had_number AND NOT EXISTS(SELECT 1 FROM twilio_numbers WHERE id=v_number_id AND agency_id IS NULL
    AND number_purpose='platform_contact' AND is_active=1 AND status='active') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_NUMBER_OWNERSHIP_CONFLICT';
  END IF;
  IF EXISTS(SELECT 1 FROM sms_sender_registrations r JOIN twilio_numbers n ON n.id=r.number_id
    WHERE (r.campaign_id='VCZOP4JO' AND NOT (r.registration_json <=> v_registration))
      OR ((r.campaign_id='VCZOP4JO' OR JSON_UNQUOTE(JSON_EXTRACT(r.registration_json,'$.brandId'))='BCGLCIL')
        AND n.agency_id IS NOT NULL)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_CAMPAIGN_OWNERSHIP_CONFLICT';
  END IF;
  SELECT COUNT(*) INTO v_count FROM sms_sender_registrations WHERE number_id=v_number_id;
  SET v_had_registration=(v_count=1);
  IF v_had_registration THEN
    SELECT registration_json INTO v_existing FROM sms_sender_registrations WHERE number_id=v_number_id;
    IF NOT (v_existing <=> v_registration) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_EXISTING_REGISTRATION_CONFLICT';
    END IF;
  END IF;
  IF NOT p_apply THEN
    SELECT 'preview' AS provisioning_status,v_number_id AS number_id,v_had_number AS number_present,
      v_had_registration AS registration_present,'${PLOTLINE_SENDER_PLAN_HASH}' AS manifest_hash;
    LEAVE main;
  END IF;
  IF NOT v_had_number THEN
    INSERT INTO twilio_numbers(agency_id,phone_number,twilio_sid,friendly_name,capabilities,status,is_active,number_purpose)
      VALUES(NULL,'${plotlineSenderPlan.phoneNumber}','17197165766',${literal(plotlineSenderPlan.friendlyName)},
        JSON_OBJECT('sms',TRUE,'voice',TRUE,'mms',TRUE),'active',TRUE,'platform_contact');
    SET v_number_id=LAST_INSERT_ID();
  END IF;
  IF NOT v_had_registration THEN
    INSERT INTO sms_sender_registrations(number_id,campaign_id,registration_json,updated_by_user_id)
      VALUES(v_number_id,'VCZOP4JO',v_registration,NULL);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM user_activity_log WHERE action_type='api_call' AND user_id IS NULL
    AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.automation_identity'))='${PLOTLINE_SENDER_DATABASE_USER}'
    AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.provisioning_manifest_hash'))='${PLOTLINE_SENDER_PLAN_HASH}') THEN
    INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata)
      VALUES('api_call',NULL,NULL,JSON_OBJECT('event','automation_plotline_sender_registered',
        'actor_type','automation','automation_identity','${PLOTLINE_SENDER_DATABASE_USER}',
        'configured_cloud_service_account','${PLOTLINE_SENDER_SERVICE_ACCOUNT}','database_session_user',USER(),
        'provisioning_manifest_hash','${PLOTLINE_SENDER_PLAN_HASH}','number_id',v_number_id,
        'phone','${plotlineSenderPlan.phoneNumber}','brand_id','BCGLCIL','campaign_id','VCZOP4JO',
        'number_already_present',v_had_number,'registration_already_present',v_had_registration,
        'scope','all_agencies_interviews_only','authorization','User approved scoped Plotline provisioning and all-agency interview rollout; release coordinator executes'));
  END IF;
  COMMIT;
  DO RELEASE_LOCK('plotline_sender_20261126');
  SET v_locked=0;
  SELECT IF(v_had_number AND v_had_registration,'already_configured','applied') AS provisioning_status,
    v_number_id AS number_id,'${PLOTLINE_SENDER_PLAN_HASH}' AS manifest_hash;
END`;
}

export function plotlineSenderGrantSql(database) {
  if (!/^[A-Za-z0-9_]+$/.test(database || '')) throw new Error('PLOTLINE_INVALID_DATABASE');
  return `GRANT EXECUTE ON PROCEDURE \`${database}\`.\`${PLOTLINE_SENDER_PROCEDURE}\` TO '${PLOTLINE_SENDER_DATABASE_USER}'@'%'`;
}
