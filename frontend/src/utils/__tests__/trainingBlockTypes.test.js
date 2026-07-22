import { describe, expect, it } from 'vitest';
import {
  normalizeContentType,
  apiRowToBlock,
  blockToApiPayload,
  inferContentTypeFromData
} from '../trainingBlockTypes.js';

describe('trainingBlockTypes', () => {
  it('maps legacy page types to canonical content types', () => {
    expect(normalizeContentType('google-form', { formUrl: 'https://forms.google.com/x' })).toBe('google_form');
    expect(normalizeContentType('slides', { googleSlidesUrl: 'https://docs.google.com/presentation/d/x' })).toBe('slide');
    expect(normalizeContentType('response', { prompt: 'Reflect' })).toBe('response');
    expect(normalizeContentType('rich-text', { content: '<p>Hi</p>' })).toBe('text');
  });

  it('infers subtypes from legacy text payloads', () => {
    expect(inferContentTypeFromData('text', { formUrl: 'https://forms.gle/x' })).toBe('google_form');
    expect(inferContentTypeFromData('text', { prompt: 'Answer', responseType: 'textarea' })).toBe('response');
    expect(inferContentTypeFromData('text', { fileUrl: 'https://docs.google.com/document/d/x' })).toBe('pdf');
    expect(inferContentTypeFromData('text', { knowledgeCheck: true, question: 'Q?' })).toBe('knowledge_check');
  });

  it('round-trips api rows through builder payloads', () => {
    const block = apiRowToBlock({
      id: 9,
      content_type: 'text',
      title: null,
      content_data: { title: 'Intro', description: 'Welcome', knowledgeCheck: true, question: 'Q', options: ['A', 'B'], correctAnswer: 0 },
      settings: null,
      order_index: 0
    });
    expect(block.content_type).toBe('knowledge_check');
    const payload = blockToApiPayload(block, 0);
    expect(payload.contentType).toBe('knowledge_check');
    expect(payload.contentData.knowledgeCheck).toBe(true);
    expect(payload.orderIndex).toBe(0);
  });
});
