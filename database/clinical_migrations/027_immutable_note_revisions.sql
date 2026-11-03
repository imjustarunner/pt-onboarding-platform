-- Signed clinical content is retained independently of mutable operational queues.
-- Apply before deploying version-aware application code. Requires TRIGGER privilege.
-- The runner understands BEGIN/END; do not add client-only DELIMITER commands.
CREATE TABLE IF NOT EXISTS clinical_note_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clinical_note_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  parent_revision_id BIGINT UNSIGNED NULL,
  supersedes_revision_id BIGINT UNSIGNED NULL,
  origin ENUM('original','provider','supervisor','billing') NOT NULL,
  reason TEXT NOT NULL,
  proposed_by_user_id INT NULL,
  original_author_user_id INT NOT NULL,
  responsible_supervisor_user_id INT NULL,
  requires_supervisor_cosign TINYINT(1) NOT NULL DEFAULT 0,
  snapshot_json JSON NOT NULL,
  provenance_json JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uniq_cnr_note_revision (clinical_note_id,revision_number),
  INDEX idx_cnr_agency_note (agency_id,clinical_note_id),
  CONSTRAINT fk_cnr_note FOREIGN KEY (clinical_note_id) REFERENCES clinical_notes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cnr_parent FOREIGN KEY (parent_revision_id) REFERENCES clinical_note_revisions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cnr_supersedes FOREIGN KEY (supersedes_revision_id) REFERENCES clinical_note_revisions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_note_revision_signatures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  revision_id BIGINT UNSIGNED NOT NULL,
  clinical_note_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  signature_action ENUM('initial_author_sign','initial_supervisor_sign','author_sign','supervisor_sign','author_acknowledge','addendum_sign') NOT NULL,
  actor_user_id INT NOT NULL,
  addendum_id BIGINT UNSIGNED NULL,
  signature_slot_id BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(addendum_id,0)) STORED,
  content_hash CHAR(64) NOT NULL,
  attestation_json JSON NOT NULL,
  signed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uniq_cnrs_revision_action (revision_id,signature_action,signature_slot_id),
  UNIQUE KEY uniq_cnrs_addendum (addendum_id),
  CONSTRAINT fk_cnrs_revision FOREIGN KEY (revision_id) REFERENCES clinical_note_revisions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cnrs_addendum FOREIGN KEY (addendum_id) REFERENCES clinical_note_addenda(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_note_revision_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  revision_id BIGINT UNSIGNED NOT NULL,
  clinical_note_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  approved_by_user_id INT NOT NULL,
  signature_id BIGINT UNSIGNED NOT NULL,
  content_hash CHAR(64) NOT NULL,
  approved_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uniq_cnra_revision (revision_id),
  CONSTRAINT fk_cnra_revision FOREIGN KEY (revision_id) REFERENCES clinical_note_revisions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cnra_signature FOREIGN KEY (signature_id) REFERENCES clinical_note_revision_signatures(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_note_revision_heads (
  clinical_note_id BIGINT NOT NULL PRIMARY KEY,
  agency_id INT NOT NULL,
  original_revision_id BIGINT UNSIGNED NOT NULL,
  effective_revision_id BIGINT UNSIGNED NOT NULL,
  pending_revision_id BIGINT UNSIGNED NULL,
  next_revision_number INT UNSIGNED NOT NULL DEFAULT 2,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  INDEX idx_cnrh_pending (agency_id,pending_revision_id),
  CONSTRAINT fk_cnrh_note FOREIGN KEY (clinical_note_id) REFERENCES clinical_notes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cnrh_original FOREIGN KEY (original_revision_id) REFERENCES clinical_note_revisions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cnrh_effective FOREIGN KEY (effective_revision_id) REFERENCES clinical_note_revisions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cnrh_pending FOREIGN KEY (pending_revision_id) REFERENCES clinical_note_revisions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_note_revision_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clinical_note_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  revision_id BIGINT UNSIGNED NOT NULL,
  signature_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_user_id INT NULL,
  content_hash CHAR(64) NOT NULL,
  event_json JSON NOT NULL,
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_cnrau_note (agency_id,clinical_note_id,id),
  CONSTRAINT fk_cnrau_revision FOREIGN KEY (revision_id) REFERENCES clinical_note_revisions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cnrau_signature FOREIGN KEY (signature_id) REFERENCES clinical_note_revision_signatures(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Database-generated audit rows cannot be omitted by an alternate application path.
CREATE TRIGGER clinical_note_revision_insert_audit AFTER INSERT ON clinical_note_revisions FOR EACH ROW
  INSERT INTO clinical_note_revision_audit(clinical_note_id,agency_id,revision_id,event_type,actor_user_id,content_hash,event_json)
  VALUES(NEW.clinical_note_id,NEW.agency_id,NEW.id,'revision_created',NEW.proposed_by_user_id,NEW.content_hash,JSON_OBJECT('origin',NEW.origin,'parentRevisionId',NEW.parent_revision_id,'supersedesRevisionId',NEW.supersedes_revision_id,'provenance',NEW.provenance_json));
CREATE TRIGGER clinical_note_signature_insert_audit AFTER INSERT ON clinical_note_revision_signatures FOR EACH ROW
  INSERT INTO clinical_note_revision_audit(clinical_note_id,agency_id,revision_id,signature_id,event_type,actor_user_id,content_hash,event_json)
  VALUES(NEW.clinical_note_id,NEW.agency_id,NEW.revision_id,NEW.id,NEW.signature_action,NEW.actor_user_id,NEW.content_hash,NEW.attestation_json);
CREATE TRIGGER clinical_note_approval_insert_audit AFTER INSERT ON clinical_note_revision_approvals FOR EACH ROW
  INSERT INTO clinical_note_revision_audit(clinical_note_id,agency_id,revision_id,signature_id,event_type,actor_user_id,content_hash,event_json)
  VALUES(NEW.clinical_note_id,NEW.agency_id,NEW.revision_id,NEW.signature_id,'revision_approved',NEW.approved_by_user_id,NEW.content_hash,JSON_OBJECT('approvalId',NEW.id));

CREATE TRIGGER clinical_notes_signed_no_delete BEFORE DELETE ON clinical_notes FOR EACH ROW
BEGIN
  IF OLD.provider_signed_at IS NOT NULL OR EXISTS(SELECT 1 FROM clinical_note_revisions WHERE clinical_note_id=OLD.id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Signed clinical notes cannot be deleted';
  END IF;
END;
CREATE TRIGGER clinical_notes_signed_content_guard BEFORE UPDATE ON clinical_notes FOR EACH ROW
BEGIN
  IF OLD.provider_signed_at IS NOT NULL AND (
    NOT(OLD.title <=> NEW.title) OR NOT(OLD.note_payload <=> NEW.note_payload) OR NOT(OLD.note_type <=> NEW.note_type)
    OR NOT(OLD.is_billable <=> NEW.is_billable) OR NOT(OLD.clinical_session_id <=> NEW.clinical_session_id)
    OR NOT(OLD.agency_id <=> NEW.agency_id) OR NOT(OLD.client_id <=> NEW.client_id) OR NOT(OLD.created_by_user_id <=> NEW.created_by_user_id)
    OR NOT(OLD.provider_signed_at <=> NEW.provider_signed_at) OR NOT(OLD.provider_signed_by_user_id <=> NEW.provider_signed_by_user_id)
    OR NOT(OLD.content_hash <=> NEW.content_hash) OR (NEW.is_deleted=1 AND OLD.is_deleted=0)
    OR NOT(OLD.primary_diagnosis_id <=> NEW.primary_diagnosis_id) OR NOT(OLD.diagnostic_justification <=> NEW.diagnostic_justification)
    OR (OLD.supervisor_cosigned_at IS NOT NULL AND (NOT(OLD.supervisor_cosigned_at <=> NEW.supervisor_cosigned_at) OR NOT(OLD.supervisor_cosigned_by_user_id <=> NEW.supervisor_cosigned_by_user_id)))
    OR NOT(JSON_REMOVE(COALESCE(OLD.metadata_json,JSON_OBJECT()),'$.supervisorQueue','$.supervisorCosign','$.supervisorCosignHistory','$.reviewRequests','$.serviceDetailAmendments','$.billingAmendments','$.printUpload','$.digitalShare')
      <=> JSON_REMOVE(COALESCE(NEW.metadata_json,JSON_OBJECT()),'$.supervisorQueue','$.supervisorCosign','$.supervisorCosignHistory','$.reviewRequests','$.serviceDetailAmendments','$.billingAmendments','$.printUpload','$.digitalShare'))
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Signed clinical content is immutable; use a linked revision';
  END IF;
END;

CREATE TRIGGER clinical_note_signed_addenda_no_update BEFORE UPDATE ON clinical_note_addenda FOR EACH ROW
BEGIN
  IF OLD.author_signed_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Signed clinical additions are immutable';
  END IF;
END;
CREATE TRIGGER clinical_note_signed_addenda_no_delete BEFORE DELETE ON clinical_note_addenda FOR EACH ROW
BEGIN
  IF OLD.author_signed_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Signed clinical additions cannot be deleted';
  END IF;
END;

-- Backfill is an observation of stored legacy records, never a new e-signature.
-- No rows are inserted into signatures or approvals for this historical evidence.
INSERT INTO clinical_note_revisions(clinical_note_id,agency_id,revision_number,origin,reason,proposed_by_user_id,original_author_user_id,responsible_supervisor_user_id,requires_supervisor_cosign,snapshot_json,provenance_json,content_hash)
SELECT legacy.id,legacy.agency_id,1,'original','Legacy signed record observed during immutable-history migration',NULL,
  legacy.author_user_id,legacy.supervisor_user_id,0,legacy.snapshot_json,legacy.provenance_json,SHA2(CAST(legacy.snapshot_json AS CHAR),256)
FROM (SELECT n.id,n.agency_id,COALESCE(n.provider_signed_by_user_id,n.created_by_user_id) AS author_user_id,n.supervisor_cosigned_by_user_id AS supervisor_user_id,
  JSON_OBJECT('title',n.title,'notePayload',n.note_payload,'noteType',n.note_type,'isBillable',n.is_billable,'primaryDiagnosisId',n.primary_diagnosis_id,'diagnosticJustification',n.diagnostic_justification,
    'metadataJson',COALESCE(n.metadata_json,JSON_OBJECT()),
    'addenda',COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id',a.id,'clinical_note_id',a.clinical_note_id,'agency_id',a.agency_id,'body',a.body,'entry_kind',a.entry_kind,'entry_reason',a.entry_reason,'created_by_user_id',a.created_by_user_id,'created_at',a.created_at,'author_signed_at',a.author_signed_at)) FROM clinical_note_addenda a WHERE a.clinical_note_id=n.id AND a.agency_id=n.agency_id),JSON_ARRAY()),
    'encounterContext',JSON_OBJECT('clinicalSessionId',n.clinical_session_id,'clientId',n.client_id,'metadataJson',COALESCE(s.metadata_json,JSON_OBJECT()),'providerUserId',s.provider_user_id,
      'sourceTimezone',COALESCE(s.source_timezone,'America/Denver'),'scheduledStartAt',s.scheduled_start_at,'scheduledEndAt',s.scheduled_end_at,
      'dateOfService',COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.dateOfService')),DATE(s.scheduled_start_at)),
      'serviceCode',COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.serviceCode')),s.service_code),
      'effectiveServiceCode',s.effective_service_code,'billedUnits',s.billed_units,
      'durationMinutes',COALESCE(JSON_EXTRACT(n.metadata_json,'$.structuredChart.durationMinutes'),s.duration_minutes),
      'startTime',COALESCE(JSON_EXTRACT(n.metadata_json,'$.structuredChart.startTime'),TIME_FORMAT(CONVERT_TZ(s.scheduled_start_at,'+00:00',COALESCE(s.source_timezone,'America/Denver')),'%H:%i')),
      'endTime',COALESCE(JSON_EXTRACT(n.metadata_json,'$.structuredChart.endTime'),TIME_FORMAT(CONVERT_TZ(s.scheduled_end_at,'+00:00',COALESCE(s.source_timezone,'America/Denver')),'%H:%i')),
      'locationLabel',COALESCE(JSON_EXTRACT(n.metadata_json,'$.structuredChart.locationLabel'),JSON_EXTRACT(s.metadata_json,'$.locationLabel'),JSON_EXTRACT(n.metadata_json,'$.locationLabel')),
      'placeOfService',COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.structuredChart.placeOfService')),s.place_of_service),
      'serviceLocationId',s.service_location_id,'billingOfficeLocationId',s.billing_office_location_id,'isTelehealth',s.is_telehealth,
      'renderingProviderUserId',COALESCE(s.rendering_provider_user_id,s.provider_user_id),
      'locationSnapshot',COALESCE(JSON_EXTRACT(n.metadata_json,'$.structuredChart.locationSnapshot'),JSON_EXTRACT(s.metadata_json,'$.locationSnapshot'),JSON_EXTRACT(n.metadata_json,'$.locationSnapshot')),
      'participants',JSON_EXTRACT(n.metadata_json,'$.structuredChart.participants'),'patientPresent',JSON_EXTRACT(n.metadata_json,'$.structuredChart.patientPresent'),
      'billingPrimaryUnits',JSON_EXTRACT(n.metadata_json,'$.billingPrimaryUnits'),'billingAddons',JSON_EXTRACT(n.metadata_json,'$.billingAddons'),'serviceLines',JSON_EXTRACT(n.metadata_json,'$.serviceLines'))) AS snapshot_json,
  JSON_OBJECT('kind','legacy_observed','observedAt',UTC_TIMESTAMP(6),'hashAlgorithm','legacy_observation_sha256',
    'legacyProviderSignedAt',n.provider_signed_at,'legacyProviderSignedByUserId',n.provider_signed_by_user_id,
    'legacySupervisorCosignedAt',n.supervisor_cosigned_at,'legacySupervisorCosignedByUserId',n.supervisor_cosigned_by_user_id,
    'legacyContentHash',n.content_hash,'legacyContentHashScope','unknown_legacy',
    'legacyStoredPayloadHashMatches',IF(n.content_hash IS NULL,NULL,n.content_hash=SHA2(COALESCE(n.note_payload,''),256)),
    'legacyHashComparisonScope','stored_payload_only_not_signature_verification') AS provenance_json
FROM clinical_notes n LEFT JOIN clinical_sessions s ON s.id=n.clinical_session_id AND s.agency_id=n.agency_id
WHERE n.provider_signed_at IS NOT NULL) AS legacy
WHERE NOT EXISTS(SELECT 1 FROM clinical_note_revisions r WHERE r.clinical_note_id=legacy.id AND r.revision_number=1);
INSERT INTO clinical_note_revision_heads(clinical_note_id,agency_id,original_revision_id,effective_revision_id)
SELECT clinical_note_id,agency_id,id,id FROM clinical_note_revisions r WHERE revision_number=1
  AND NOT EXISTS(SELECT 1 FROM clinical_note_revision_heads h WHERE h.clinical_note_id=r.clinical_note_id);

CREATE TRIGGER clinical_note_revisions_no_update BEFORE UPDATE ON clinical_note_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clinical revisions are immutable; create a linked snapshot';
CREATE TRIGGER clinical_note_revisions_no_delete BEFORE DELETE ON clinical_note_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clinical revisions cannot be deleted';
CREATE TRIGGER clinical_note_signatures_no_update BEFORE UPDATE ON clinical_note_revision_signatures FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clinical signatures are immutable';
CREATE TRIGGER clinical_note_signatures_no_delete BEFORE DELETE ON clinical_note_revision_signatures FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clinical signatures cannot be deleted';
CREATE TRIGGER clinical_note_approvals_no_update BEFORE UPDATE ON clinical_note_revision_approvals FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clinical approvals are immutable';
CREATE TRIGGER clinical_note_approvals_no_delete BEFORE DELETE ON clinical_note_revision_approvals FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clinical approvals cannot be deleted';
CREATE TRIGGER clinical_note_audit_no_update BEFORE UPDATE ON clinical_note_revision_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clinical revision audit is append-only';
CREATE TRIGGER clinical_note_audit_no_delete BEFORE DELETE ON clinical_note_revision_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Clinical revision audit cannot be deleted';
