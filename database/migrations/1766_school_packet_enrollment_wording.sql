-- Migration 1766: replace family-facing "intake" wording in stored school packet consent templates
UPDATE school_packet_templates
SET html_content =
      REPLACE(REPLACE(
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(html_content,
        'inferred from the completed intake questionnaire', 'inferred from the completed enrollment questionnaire'),
        'specific documentation provided at intake that states otherwise', 'specific documentation provided at enrollment that states otherwise'),
        'guardian on the intake documentation authorizes', 'guardian on the enrollment documentation authorizes'),
        'parent/guardian at the time of intake and accurate', 'parent/guardian at the time of enrollment and accurate'),
        '(such as intake materials or educational plans)', '(such as enrollment materials or educational plans)'),
        'del cuestionario de ingreso completado', 'del cuestionario de inscripción completado'),
        'documentación específica en el momento del ingreso que indique', 'documentación específica en el momento de la inscripción que indique'),
        'en la documentación de ingreso autoriza', 'en la documentación de inscripción autoriza'),
        'padre/tutor en el momento del ingreso, y se', 'padre/tutor en el momento de la inscripción, y se'),
        '(como materiales de ingreso o planes educativos)', '(como materiales de inscripción o planes educativos)'),
        'any food allergies on their intake document to ensure safety', 'any food allergies on their enrollment documents to ensure safety'),
        'alergia alimentaria en su documento de ingreso para garantizar', 'alergia alimentaria en sus documentos de inscripción para garantizar'),
    version = COALESCE(version, 1) + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE html_content LIKE BINARY '%completed intake questionnaire%'
   OR html_content LIKE BINARY '%provided at intake that states otherwise%'
   OR html_content LIKE BINARY '%on the intake documentation authorizes%'
   OR html_content LIKE BINARY '%at the time of intake and accurate%'
   OR html_content LIKE BINARY '%(such as intake materials or educational plans)%'
   OR html_content LIKE BINARY '%cuestionario de ingreso completado%'
   OR html_content LIKE BINARY '%momento del ingreso que indique%'
   OR html_content LIKE BINARY '%documentación de ingreso autoriza%'
   OR html_content LIKE BINARY '%momento del ingreso, y se%'
   OR html_content LIKE BINARY '%(como materiales de ingreso o planes educativos)%'
   OR html_content LIKE BINARY '%food allergies on their intake document%'
   OR html_content LIKE BINARY '%alergia alimentaria en su documento de ingreso%';

INSERT INTO school_packet_template_versions (agency_id, locale, version, html_content, created_by_user_id, created_at)
SELECT
  t.agency_id,
  COALESCE(NULLIF(TRIM(t.locale), ''), 'en'),
  COALESCE(t.version, 1),
  t.html_content,
  NULL,
  CURRENT_TIMESTAMP
FROM school_packet_templates t
WHERE t.html_content IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM school_packet_template_versions v
    WHERE v.agency_id = t.agency_id
      AND v.locale = COALESCE(NULLIF(TRIM(t.locale), ''), 'en')
      AND v.version = COALESCE(t.version, 1)
  );
