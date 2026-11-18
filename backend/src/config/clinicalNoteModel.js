export const DEFAULT_CLINICAL_NOTE_MODEL = 'gemini-4-hydrogen';

// Keep clinical model selection independent of translation, assistants and other AI.
export function clinicalNoteModelOptions({ model, toolModel } = {}) {
  const selectedModel = [model, process.env.CLINICAL_NOTE_MODEL, toolModel, DEFAULT_CLINICAL_NOTE_MODEL]
    .map(value => String(value || '').trim()).find(Boolean);
  return {
    model: selectedModel,
    // A denied model must not silently turn a Hydrogen request into a 2.5 note.
    allowModelFallback: false,
    ...(/^gemini-4(?:-|$)/.test(selectedModel) ? {
      vertexLocation: String(process.env.CLINICAL_NOTE_VERTEX_LOCATION || '').trim() || 'us',
      thinkingLevel: 'MEDIUM'
    } : {})
  };
}
