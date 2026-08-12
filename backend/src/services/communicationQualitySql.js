/**
 * SQL heuristic matching scanStoredCommunicationQuality for list/count queries.
 */
export function buildQualityIssueSqlClause(alias = 'uc') {
  const b = alias;
  return `(
    (
      (
        ${b}.body REGEXP '(attach|attached|attachment|see attached)'
        OR ${b}.subject REGEXP '(attach|attached|attachment)'
      )
      AND (
        ${b}.metadata IS NULL
        OR (
          ${b}.metadata NOT LIKE '%"hadAttachments":true%'
          AND ${b}.metadata NOT LIKE '%"hadAttachments": true%'
          AND ${b}.metadata NOT LIKE '%"attachmentCount":%'
        )
      )
    )
    OR (
      (
        ${b}.body REGEXP '(private link|link below|release of information|signing link|download a copy from)'
        OR ${b}.subject REGEXP 'release of information'
      )
      AND ${b}.body NOT LIKE '%/intake/%'
      AND (
        ${b}.metadata IS NULL
        OR JSON_UNQUOTE(JSON_EXTRACT(${b}.metadata, '$.linkUrl')) IS NULL
        OR JSON_UNQUOTE(JSON_EXTRACT(${b}.metadata, '$.linkUrl')) = ''
      )
    )
    OR (
      (
        ${b}.template_type IN ('school_roi_signing', 'school_roi_release', 'smart_school_roi')
        OR ${b}.subject LIKE '%Release of Information%'
        OR ${b}.subject LIKE '%release of information%'
      )
      AND (
        ${b}.client_id IS NULL
        OR (
          ${b}.body NOT LIKE '%/intake/%'
          AND (
            ${b}.metadata IS NULL
            OR JSON_UNQUOTE(JSON_EXTRACT(${b}.metadata, '$.linkUrl')) IS NULL
            OR JSON_UNQUOTE(JSON_EXTRACT(${b}.metadata, '$.linkUrl')) = ''
          )
        )
      )
    )
    OR (
      JSON_EXTRACT(${b}.metadata, '$.usedFallbackSender') = true
      OR ${b}.metadata LIKE '%"code":"fallback_sender"%'
    )
  )`;
}
