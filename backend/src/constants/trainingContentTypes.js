/** Canonical module_content.content_type values for the lesson block library. */
export const TRAINING_CONTENT_TYPES = [
  'video',
  'text',
  'image',
  'pdf',
  'button',
  'divider',
  'spacer',
  'quiz',
  'knowledge_check',
  'survey',
  'acknowledgment',
  'slide',
  'form',
  'callout',
  'accordion',
  'tabs',
  'response',
  'google_form'
];

export const TRAINING_CONTENT_TYPE_SET = new Set(TRAINING_CONTENT_TYPES);

/** Legacy UI page types that previously collapsed into content_type=text. */
export const LEGACY_PAGE_TYPE_TO_CONTENT_TYPE = {
  intro: 'text',
  document: 'text',
  response: 'response',
  'google-form': 'google_form',
  slides: 'slide',
  video: 'video',
  quiz: 'quiz',
  form: 'form',
  acknowledgment: 'acknowledgment',
  'rich-text': 'text',
  knowledge_check: 'knowledge_check',
  callout: 'callout',
  image: 'image',
  pdf: 'pdf',
  button: 'button',
  divider: 'divider',
  spacer: 'spacer',
  survey: 'survey',
  accordion: 'accordion',
  tabs: 'tabs'
};

/**
 * Infer a stable content type from a legacy text-shaped payload.
 * Prefer storing explicit types going forward; this is for read-path compat.
 */
export function inferContentTypeFromData(contentType, contentData = {}) {
  const type = String(contentType || '').toLowerCase();
  if (type && type !== 'text' && TRAINING_CONTENT_TYPE_SET.has(type)) {
    return type;
  }
  if (type === 'slide' || type === 'slides') return 'slide';
  if (type && TRAINING_CONTENT_TYPE_SET.has(type)) return type;

  const d = contentData && typeof contentData === 'object' ? contentData : {};
  if (d.formUrl) return 'google_form';
  if (d.prompt != null || d.responseType) return 'response';
  if (d.googleSlidesUrl || d.slidesUrl) return 'slide';
  if (d.fileUrl || d.googleUrl) return 'pdf';
  if (d.imageUrl) return 'image';
  if (d.variant === 'callout' || d.calloutStyle) return 'callout';
  if (d.blockType === 'knowledge_check' || d.knowledgeCheck === true) return 'knowledge_check';
  // Intro-like: title/description only
  const body = String(d.content || d.textContent || '').trim();
  if (!body && (d.title || d.description)) return 'text';
  return type === 'text' ? 'text' : (TRAINING_CONTENT_TYPE_SET.has(type) ? type : 'text');
}

export function normalizeContentType(inputType, contentData = {}) {
  const raw = String(inputType || '').trim().toLowerCase().replace(/-/g, '_');
  const mapped = LEGACY_PAGE_TYPE_TO_CONTENT_TYPE[inputType]
    || LEGACY_PAGE_TYPE_TO_CONTENT_TYPE[raw]
    || raw;
  const canonical = String(mapped).replace(/-/g, '_');
  if (TRAINING_CONTENT_TYPE_SET.has(canonical)) {
    if (canonical === 'text') {
      return inferContentTypeFromData('text', contentData);
    }
    return canonical;
  }
  return inferContentTypeFromData(canonical || 'text', contentData);
}
