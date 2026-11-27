DELIMITER $$
CREATE PROCEDURE upgrade_plotline_hiring_sender_20261126(IN p_manifest CHAR(64),IN p_approval CHAR(64),IN p_apply BOOLEAN)
SQL SECURITY DEFINER
main: BEGIN
 DECLARE v_locked INT DEFAULT 0;
 DECLARE v_id INT DEFAULT NULL;
 DECLARE v_count INT DEFAULT 0;
 DECLARE v_before JSON;
 DECLARE v_after JSON;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN
  ROLLBACK;
  IF v_locked=1 THEN DO RELEASE_LOCK('plotline_hiring_upgrade_20261126'); END IF;
  RESIGNAL;
 END;
 IF SUBSTRING_INDEX(USER(),'@',1)<>'plotline_hiring_auto_20261126' OR p_manifest IS NULL OR p_manifest<>'3988867ae3b98e0ff426766f2bbe8c5870752bfac116581d1d3eabf0a5676e55'
  OR p_apply IS NULL OR p_approval IS NULL OR p_approval NOT REGEXP '^[a-f0-9]{64}$' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_HIRING_UNAUTHORIZED_PLAN';
 END IF;
 SELECT COUNT(*),MIN(n.id) INTO v_count,v_id FROM twilio_numbers n
  WHERE n.phone_number='+17197165766' AND n.agency_id IS NULL AND n.number_purpose='platform_contact' AND n.status='active' AND n.is_active=1;
 IF v_count<>1 OR (SELECT COUNT(*) FROM twilio_numbers WHERE phone_number='+17197165766')<>1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_HIRING_NUMBER_CONFLICT';
 END IF;
 SET v_after=JSON_SET(CAST('{"provider":"vonage","brandId":"BCGLCIL","campaignId":"VCZOP4JO","resellerId":"R000000","brandName":"Plotline People Operations","legalName":"Plot Twist Co","supportContact":"support@plotlinepo.com","website":"https://plotlinepo.com","privacyUrl":"https://plotlinepo.com/privacy","termsUrl":"https://plotlinepo.com/terms","evidenceUrl":"https://plotlinepo.com/hiring-sms-consent","purposes":["workforce"],"keywordOwner":"application","helpKeywordOwner":"application","approved":true,"numberLinked":true,"interviewOnly":false,"platformInterviewSender":true,"platformHiringSender":true,"hiringJourneyApproved":true,"applicationOptInApproved":true,"hiringConsentVersion":"plotline-hiring-2026-11-26.1"}' AS JSON),'$.hiringJourneyApprovalDigest',p_approval);
 IF p_apply THEN
  SELECT GET_LOCK('plotline_hiring_upgrade_20261126',0) INTO v_locked;
  IF v_locked<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_HIRING_UPGRADE_BUSY'; END IF;
  START TRANSACTION;
 END IF;
 SELECT registration_json INTO v_before FROM sms_sender_registrations WHERE number_id=v_id AND campaign_id='VCZOP4JO';
 IF v_before IS NULL OR NOT (v_before <=> CAST('{"provider":"vonage","brandId":"BCGLCIL","campaignId":"VCZOP4JO","resellerId":"R000000","brandName":"Plotline People Operations","legalName":"Plot Twist Co","supportContact":"support@plotlinepo.com","website":"https://plotlinepo.com","privacyUrl":"https://plotlinepo.com/privacy","termsUrl":"https://plotlinepo.com/terms","evidenceUrl":"https://plotlinepo.com/sms-consent","purposes":["workforce"],"keywordOwner":"application","helpKeywordOwner":"application","approved":true,"numberLinked":true,"interviewOnly":true,"platformInterviewSender":true}' AS JSON))
  AND NOT (JSON_REMOVE(v_before,'$.hiringJourneyApprovalDigest') <=> CAST('{"provider":"vonage","brandId":"BCGLCIL","campaignId":"VCZOP4JO","resellerId":"R000000","brandName":"Plotline People Operations","legalName":"Plot Twist Co","supportContact":"support@plotlinepo.com","website":"https://plotlinepo.com","privacyUrl":"https://plotlinepo.com/privacy","termsUrl":"https://plotlinepo.com/terms","evidenceUrl":"https://plotlinepo.com/hiring-sms-consent","purposes":["workforce"],"keywordOwner":"application","helpKeywordOwner":"application","approved":true,"numberLinked":true,"interviewOnly":false,"platformInterviewSender":true,"platformHiringSender":true,"hiringJourneyApproved":true,"applicationOptInApproved":true,"hiringConsentVersion":"plotline-hiring-2026-11-26.1"}' AS JSON)) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_HIRING_REGISTRATION_CONFLICT';
 END IF;
 IF EXISTS(SELECT 1 FROM sms_sender_registrations WHERE campaign_id='VCZOP4JO' AND number_id<>v_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PLOTLINE_HIRING_CAMPAIGN_PEERS_REQUIRE_REVIEW';
 END IF;
 IF NOT p_apply THEN SELECT 'preview' AS upgrade_status,v_id AS number_id,p_approval AS approval_digest; LEAVE main; END IF;
 IF v_before <=> v_after THEN
  COMMIT;DO RELEASE_LOCK('plotline_hiring_upgrade_20261126');SET v_locked=0;
  SELECT 'already_configured' AS upgrade_status,v_id AS number_id;LEAVE main;
 END IF;
 UPDATE sms_sender_registrations SET registration_json=v_after,updated_by_user_id=NULL WHERE number_id=v_id AND campaign_id='VCZOP4JO';
 INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES('api_call',NULL,NULL,
  JSON_OBJECT('event','automation_plotline_hiring_scope_updated','actor_type','automation',
   'automation_identity','plotline_hiring_auto_20261126','database_session_user',USER(),'manifest_hash','3988867ae3b98e0ff426766f2bbe8c5870752bfac116581d1d3eabf0a5676e55',
   'approval_digest',p_approval,'number_id',v_id,'before',v_before,'after',v_after,
   'reason','User requested one application opt-in across the hiring journey; release coordinator verified expanded carrier approval'));
 COMMIT;DO RELEASE_LOCK('plotline_hiring_upgrade_20261126');SET v_locked=0;
 SELECT 'applied' AS upgrade_status,v_id AS number_id,p_approval AS approval_digest;
END$$
DELIMITER ;
