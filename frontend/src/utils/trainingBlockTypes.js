/**
 * Canonical lesson block types + helpers for Course Builder / Training Player.
 * Mirrors backend/src/constants/trainingContentTypes.js
 */

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

/** Phase-1 ship set shown in the block library. */
export const PHASE1_BLOCK_LIBRARY = [
  { type: 'video', label: 'Video', description: 'YouTube, Vimeo, or direct URL' },
  { type: 'text', label: 'Text', description: 'Rich text lesson content' },
  { type: 'image', label: 'Image', description: 'Image URL or embed' },
  { type: 'pdf', label: 'PDF / Doc', description: 'PDF or Google Doc link' },
  { type: 'slide', label: 'Slides', description: 'Google Slides embed' },
  { type: 'quiz', label: 'Quiz', description: 'Scored assessment' },
  { type: 'knowledge_check', label: 'Knowledge Check', description: 'In-flow multiple choice' },
  { type: 'callout', label: 'Callout', description: 'Highlighted tip or note' },
  { type: 'divider', label: 'Divider', description: 'Visual separator' },
  { type: 'spacer', label: 'Spacer', description: 'Vertical space' },
  { type: 'acknowledgment', label: 'Acknowledgment', description: 'Policy acknowledgment' },
  { type: 'form', label: 'Form (User Info)', description: 'Profile field collection' },
  { type: 'response', label: 'Response', description: 'Free-text learner answer' },
  { type: 'google_form', label: 'Google Form', description: 'Embedded Google Form' }
];

const LEGACY_PAGE_TYPE_TO_CONTENT_TYPE = {
  intro: 'text',
  document: 'text',
  response: 'response',
  'google-form': 'google_form',
  google_form: 'google_form',
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
  tabs: 'tabs',
  text: 'text',
  slide: 'slide'
};

export function parseContentData(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && raw !== null) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

export function inferContentTypeFromData(contentType, contentData = {}) {
  const type = String(contentType || '').toLowerCase().replace(/-/g, '_');
  if (type && type !== 'text' && TRAINING_CONTENT_TYPE_SET.has(type)) {
    return type;
  }
  const d = contentData && typeof contentData === 'object' ? contentData : {};
  if (d.formUrl) return 'google_form';
  if (d.prompt != null || d.responseType) return 'response';
  if (d.googleSlidesUrl || d.slidesUrl) return 'slide';
  if (d.fileUrl || d.googleUrl) return 'pdf';
  if (d.imageUrl) return 'image';
  if (d.variant === 'callout' || d.calloutStyle) return 'callout';
  if (d.blockType === 'knowledge_check' || d.knowledgeCheck === true) return 'knowledge_check';
  return TRAINING_CONTENT_TYPE_SET.has(type) ? type : 'text';
}

export function normalizeContentType(inputType, contentData = {}) {
  const raw = String(inputType || '').trim().toLowerCase();
  const underscored = raw.replace(/-/g, '_');
  const mapped = LEGACY_PAGE_TYPE_TO_CONTENT_TYPE[raw]
    || LEGACY_PAGE_TYPE_TO_CONTENT_TYPE[underscored]
    || underscored;
  if (TRAINING_CONTENT_TYPE_SET.has(mapped)) {
    if (mapped === 'text') return inferContentTypeFromData('text', contentData);
    return mapped;
  }
  return inferContentTypeFromData(mapped || 'text', contentData);
}

export function defaultBlockData(type) {
  switch (type) {
    case 'video':
      return { title: '', videoUrl: '' };
    case 'text':
      return { title: '', content: '', description: '' };
    case 'image':
      return { title: '', imageUrl: '', alt: '' };
    case 'pdf':
      return { title: '', fileUrl: '', googleUrl: '' };
    case 'slide':
      return { title: '', googleSlidesUrl: '', slidesUrl: '' };
    case 'quiz':
      return {
        title: 'Quiz',
        description: '',
        minimumScore: 80,
        allowRetake: true,
        randomizeAnswers: false,
        questions: [
          {
            id: 'q-1',
            question: '',
            type: 'multiple_choice',
            options: [
              { id: 'opt-1', text: 'Option A' },
              { id: 'opt-2', text: 'Option B' }
            ],
            correctAnswer: 'Option A'
          }
        ]
      };
    case 'knowledge_check':
      return {
        title: 'Check Your Understanding',
        blockType: 'knowledge_check',
        knowledgeCheck: true,
        question: '',
        options: ['', '', '', ''],
        correctAnswer: 0,
        explanation: '',
        shuffleOptions: false
      };
    case 'callout':
      return { title: '', content: '', calloutStyle: 'info', variant: 'callout' };
    case 'divider':
      return {};
    case 'spacer':
      return { height: 32 };
    case 'acknowledgment':
      return { title: '', text: '', requireSignature: false };
    case 'form':
      return { categoryKey: null, fieldDefinitionIds: [], requireAll: false };
    case 'response':
      return { prompt: '', responseType: 'textarea' };
    case 'google_form':
      return { title: '', formUrl: '' };
    case 'button':
      return { label: 'Continue', url: '', openInNewTab: true };
    case 'survey':
      return { title: '', questions: [] };
    case 'accordion':
      return { items: [{ title: '', content: '' }] };
    case 'tabs':
      return { tabs: [{ title: 'Tab 1', content: '' }] };
    default:
      return { title: '', content: '' };
  }
}

export function defaultBlockSettings(type) {
  const interactive = ['quiz', 'knowledge_check', 'acknowledgment', 'form', 'response'].includes(type);
  return {
    required: interactive,
    shuffleOptions: false,
    explanation: '',
    feedbackCorrect: '',
    feedbackIncorrect: ''
  };
}

export function blockTypeLabel(type) {
  const found = PHASE1_BLOCK_LIBRARY.find((b) => b.type === type);
  if (found) return found.label;
  const labels = {
    survey: 'Survey',
    accordion: 'Accordion',
    tabs: 'Tabs',
    button: 'Button'
  };
  return labels[type] || String(type || 'Block').replace(/_/g, ' ');
}

/** Map API module_content row → builder/player block. */
export function apiRowToBlock(item, index = 0) {
  const data = parseContentData(item.content_data);
  const settings = parseContentData(item.settings);
  const type = normalizeContentType(item.content_type, data);
  return {
    id: item.id,
    clientKey: item.id ? `block-${item.id}` : `new-${index}-${Date.now()}`,
    content_type: type,
    title: item.title || data.title || '',
    content_data: data,
    settings: {
      ...defaultBlockSettings(type),
      ...settings
    },
    order_index: item.order_index ?? index
  };
}

/** Map builder block → API write payload. */
export function blockToApiPayload(block, orderIndex) {
  const type = normalizeContentType(block.content_type, block.content_data);
  const contentData = { ...(block.content_data || {}) };
  if (block.title && !contentData.title) contentData.title = block.title;
  if (type === 'knowledge_check') {
    contentData.blockType = 'knowledge_check';
    contentData.knowledgeCheck = true;
  }
  if (type === 'callout') {
    contentData.variant = 'callout';
  }
  return {
    contentType: type,
    contentData,
    orderIndex,
    title: block.title || contentData.title || null,
    settings: block.settings || defaultBlockSettings(type)
  };
}
