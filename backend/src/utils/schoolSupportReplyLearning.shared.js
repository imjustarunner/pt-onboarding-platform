/** Pure helpers for school reply learning (no DB). */

export function computeEditSummary(originalDraft, finalAnswer) {
  const draft = String(originalDraft || '').trim();
  const final = String(finalAnswer || '').trim();
  if (!draft || !final) return null;
  if (draft === final) return 'Accepted without changes';

  const tokenize = (text) => new Set(
    String(text).toLowerCase()
      .split(/\W+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2)
  );
  const draftWords = tokenize(draft);
  const finalWords = tokenize(final);
  const added = [...finalWords].filter((w) => !draftWords.has(w)).slice(0, 8);
  const removed = [...draftWords].filter((w) => !finalWords.has(w)).slice(0, 8);

  const parts = [];
  if (final.length < draft.length * 0.85) parts.push('Shortened');
  else if (final.length > draft.length * 1.15) parts.push('Expanded');
  else parts.push('Reworded');
  if (added.length) parts.push(`added: ${added.join(', ')}`);
  if (removed.length) parts.push(`removed: ${removed.join(', ')}`);
  return parts.join(' · ').slice(0, 500);
}

export function buildPromptGuardrailsBlock(notes = []) {
  const list = (notes || [])
    .map((n) => String(n?.promptText || n?.prompt_text || '').trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!list.length) return '';

  return [
    '',
    'Staff feedback — avoid these patterns in school-facing replies:',
    ...list.map((line) => `- ${line}`)
  ].join('\n');
}
