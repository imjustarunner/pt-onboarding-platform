// Stable browser-only record identities. Existing client/note/claim examples keep
// their IDs; added clients use separate ranges instead of shifting saved links.
export function demoClientRecordIds(clientId) {
  const id = Number(clientId);
  const original = id >= 990121 && id <= 990128;
  const added = id >= 991021 && id <= 991028;
  if (!Number.isInteger(id) || (!original && !added)) throw new Error('That client is outside this fictional demo.');
  const local = id - (original ? 990121 : 991021);
  const base = original ? 990000 : 991000;
  return {
    historyNoteId: base + 171 + local,
    claimId: base + 141 + local,
    historySessionId: (original ? 990291 : 991291) + local,
    historyOfficeEventId: (original ? 990241 : 991541) + local,
    diagnosisId: base + 160 + local * 10,
    planId: base + 161 + local * 10,
    goalId: base + 162 + local * 10,
    objectiveId: base + 163 + local * 10,
    intakeNoteId: base + 500 + local
  };
}
