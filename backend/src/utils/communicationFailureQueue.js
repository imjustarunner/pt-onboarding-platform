// Removal clears the work queue while preserving delivery evidence on the record.
export const FAILURE_QUEUE_STATUSES = ['failed', 'bounced', 'undelivered', 'skipped'];

export function activeCommunicationFailureSql(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return `(${prefix}delivery_status NOT IN ('failed', 'bounced', 'undelivered', 'skipped')
    OR JSON_EXTRACT(${prefix}metadata, '$.failedListRemovedAt') IS NULL)`;
}
