// Materialize account-level login choices once instead of rescanning for each notification.
export function firstLoginDedupSql(agencyIds) {
  return `(
      n.type NOT IN ('first_login', 'first_login_pending')
      OR n.id IN (
        SELECT first_login_id FROM (
          SELECT n2.id AS first_login_id,ROW_NUMBER() OVER (
            PARTITION BY COALESCE(n2.related_entity_id,n2.user_id)
            ORDER BY CASE WHEN oa2.organization_id IS NULL AND axs2.school_organization_id IS NULL THEN 0 ELSE 1 END,n2.agency_id ASC,n2.id ASC
          ) AS account_rank
          FROM notifications n2
          LEFT JOIN organization_affiliations oa2 ON oa2.organization_id=n2.agency_id AND oa2.is_active=TRUE
          LEFT JOIN agency_schools axs2 ON axs2.school_organization_id=n2.agency_id AND axs2.is_active=TRUE
          WHERE n2.type IN ('first_login','first_login_pending')
            AND COALESCE(n2.related_entity_id,n2.user_id) IS NOT NULL
            AND n2.agency_id IN (${agencyIds.map(() => '?').join(',')})
        ) first_login_accounts WHERE account_rank=1
      )
    )`;
}
