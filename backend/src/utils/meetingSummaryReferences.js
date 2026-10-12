// Privacy maps are request-local. Old summaries with leaked tokens must be
// regenerated from their saved transcript, never matched to people by order.
export function hasUnresolvedMeetingReferences(text) {
  return /PRIVATE(?:\\?_)[a-z]+(?:\\?_)\d+/i.test(String(text || ''));
}
