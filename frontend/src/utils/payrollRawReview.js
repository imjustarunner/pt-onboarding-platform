export const RAW_REVIEW_MODES = [
  { mode: 'draft_audit', label: 'Draft Audit' },
  { mode: 'missed_appts_paid_in_full', label: 'Missed Fees' },
  ...['H0031', 'H0032', 'H2014', '90853', 'H2032'].map(code => ({
    mode: `process_${code.toLowerCase()}`, label: code, code
  }))
];

export const paidInBaseline = row => Number(row?.already_paid_in_baseline || 0) === 1;
export const isDraftRow = row => String(row?.note_status || '').trim().toUpperCase() === 'DRAFT';
export const draftWasReviewed = row => row?.draft_reviewed === true || Number(row?.draft_reviewed || 0) === 1;
export const needsDraftReview = row => isDraftRow(row) && !paidInBaseline(row) && !draftWasReviewed(row);
export const processingCode = row => String(row?.service_code || '').trim().toUpperCase().split(/\s*-\s*/)[0];

/** Counts come from all loaded rows, independently of search and pagination. */
export function rawReviewState({ rows = [], missedRows = [], mode = 'draft_audit', catchUpMode = false, readOnlyHistorical = false, loaded = true, loading = false, saving = false, error = '' } = {}) {
  const drafts = rows.filter(row => isDraftRow(row) && !paidInBaseline(row));
  const pendingDrafts = readOnlyHistorical ? [] : drafts.filter(needsDraftReview);
  const counts = { draft_audit: pendingDrafts.length, missed_appts_paid_in_full: missedRows.reduce((sum, row) => sum + Math.max(1, Number(row.row_count) || 0), 0) };
  const rowCounts = { draft_audit: drafts.length, missed_appts_paid_in_full: missedRows.length };
  for (const entry of RAW_REVIEW_MODES.filter(entry => entry.code)) {
    const matches = rows.filter(row => Number(row.requires_processing) === 1 && processingCode(row) === entry.code && (!catchUpMode || !paidInBaseline(row)));
    rowCounts[entry.mode] = matches.length;
    counts[entry.mode] = readOnlyHistorical ? 0 : matches.filter(row => !row.processed_at).length;
  }
  const pendingCount = mode === 'missed_appts_paid_in_full' ? 0 : Number(counts[mode] || 0);
  const rowsCount = Number(rowCounts[mode] || 0);
  const known = loaded && !loading && !error;
  const empty = known && (mode === 'missed_appts_paid_in_full' ? rowsCount === 0 : pendingCount === 0);
  let emptyTitle = 'Nothing to review';
  let emptyMessage = 'This step has no items. Continue to the next step.';
  if (mode === 'draft_audit') {
    emptyTitle = readOnlyHistorical ? 'Posted payroll is read-only' : drafts.length ? 'Draft review complete' : 'No drafts to review';
    emptyMessage = readOnlyHistorical ? 'These sessions belong to the posted payroll. Continue to view its results; review later changes in the destination payroll’s catch-up steps.' : drafts.length ? 'All draft payment decisions have been saved. Continue to the next step.' : 'No new drafts need a payment decision. Sessions already included in the earlier payroll do not need another review.';
  } else if (mode === 'missed_appts_paid_in_full') {
    emptyTitle = 'No missed appointment fees';
    emptyMessage = 'There are no paid-in-full missed appointment fees in this import. Continue to the next step.';
  } else if (mode.startsWith('process_')) {
    const code = RAW_REVIEW_MODES.find(entry => entry.mode === mode)?.code || '';
    emptyTitle = rowsCount ? `${code} processing complete` : `No ${code} sessions to process`;
    emptyMessage = rowsCount ? 'All required minutes and processing decisions are saved. Continue to the next step.' : 'There are no sessions requiring this processing step. Continue to the next step.';
  }
  return { mode, loading: loading || !loaded, saving, error, counts, rowCounts, pendingDraftCount: pendingDrafts.length, pendingProcessingCount: RAW_REVIEW_MODES.filter(entry => entry.code).reduce((sum, entry) => sum + counts[entry.mode], 0), pendingCount, rowsCount, empty, ready: known && !saving && pendingCount === 0, emptyTitle, emptyMessage };
}
