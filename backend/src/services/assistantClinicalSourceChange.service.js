/** Called only after a clinical transaction commits. The queue receives server
 * references, never clinical text; review/privacy work runs outside signing. */
export function queueCommittedClinicalSourceChange({ agencyId, clientId, sourceKind, sourceId } = {}) {
  const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
  if (![agencyId, clientId, sourceId].every(positive) || !['note', 'note_revision', 'note_entry'].includes(sourceKind)) return;
  const reference = { agencyId: Number(agencyId), clientId: Number(clientId), sourceKind, sourceId: Number(sourceId) };
  void Promise.resolve().then(() => import('./assistantTeams.service.js'))
    .then(({ queueAssistantSourceChange }) => queueAssistantSourceChange(reference))
    .catch(() => console.warn('[assistantTeams] Committed clinical review queue needs attention'));
}
