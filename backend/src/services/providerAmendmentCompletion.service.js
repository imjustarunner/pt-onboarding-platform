// Employee completion and agency execution are separate. A countersignature
// must never be fabricated or required to credit the employee's own signature.
export const providerAmendmentsComplete = tasks => tasks.length > 0 && tasks.every(task => task.providerCompleted === true);

export async function syncProviderAmendmentCompletion(db, recipient, section, tasks) {
  if (!section || recipient.locked_at) return;
  section.completed = providerAmendmentsComplete(tasks);
  section.status = section.completed ? 'completed' : 'not_started';
  if (!section.completed || recipient.previewOnly) return;
  await db.execute(`UPDATE provider_update_section_progress
    SET status='completed',completed=1,completed_at=COALESCE(completed_at,UTC_TIMESTAMP()),
      data_json=JSON_SET(COALESCE(data_json,JSON_OBJECT()),'$.amendmentSigned',true,'$.completionSource','employee_document_signature')
    WHERE recipient_id=? AND section_key='amendments' AND completed=0`, [recipient.id]);
}
