/**
 * Resolve the next page by identity before an optional-page filter changes the
 * list. Reusing the old numeric position can jump past required pages.
 * Returns -1 only when there is no retained successor or the original page is
 * unknown; callers must handle completion through the normal validation path.
 */
export function nextRetainedOfficeStepIndex(previousSteps, currentStepId, retainedSteps) {
  const previous = Array.isArray(previousSteps) ? previousSteps : [];
  const retained = Array.isArray(retainedSteps) ? retainedSteps : [];
  const currentIndex = previous.findIndex(step => String(step?.id || '') === String(currentStepId || ''));
  if (currentIndex < 0 || !currentStepId) return -1;
  const retainedIndexes = new Map(retained.map((step, index) => [String(step?.id || ''), index]));
  for (const step of previous.slice(currentIndex + 1)) {
    const index = retainedIndexes.get(String(step?.id || ''));
    if (index !== undefined) return index;
  }
  return -1;
}
