import { callGeminiText } from './geminiText.service.js';
import { extractResumeTextFromUpload } from './resumeTextExtraction.service.js';
import { getTrainingKbContext } from './trainingKnowledgeBase.service.js';
import Module from '../models/Module.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import TrainingModuleGenerationRequest from '../models/TrainingModuleGenerationRequest.model.js';

const MAX_FILE_CHARS = 12_000;
const MAX_TOTAL_UPLOAD_CHARS = 24_000;

const ALLOWED_PAGE_TYPES = new Set(['intro', 'document', 'quiz']);

function safeTruncate(text, max) {
  const t = String(text || '').trim();
  return t.length > max ? t.slice(0, max) : t;
}

function extractJsonFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // try fenced block
  }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      return null;
    }
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeQuizQuestionsForStorage(quizData = {}) {
  const questionsIn = Array.isArray(quizData?.questions) ? quizData.questions : [];
  return {
    title: quizData?.title || '',
    description: quizData?.description || '',
    minimumScore: quizData?.minimumScore ?? 80,
    allowRetake: quizData?.allowRetake !== false,
    questions: questionsIn.map((q, i) => normalizeQuizQuestion(q, i))
  };
}

function normalizeQuizQuestion(q, index) {
  const type = ['multiple_choice', 'true_false', 'text'].includes(q?.type)
    ? q.type
    : 'multiple_choice';
  const question = String(q?.question || '').trim() || `Question ${index + 1}`;

  if (type === 'true_false') {
    const ca = String(q?.correctAnswer || 'true').toLowerCase();
    return {
      type: 'true_false',
      question,
      correctAnswer: ca === 'false' ? 'false' : 'true'
    };
  }

  if (type === 'text') {
    return {
      type: 'text',
      question,
      correctAnswer: String(q?.correctAnswer || '').trim()
    };
  }

  let options = q?.options;
  if (!Array.isArray(options)) options = [];
  const optionTexts = options
    .map((o) => (typeof o === 'string' ? o : o?.text || ''))
    .map((s) => String(s).trim())
    .filter(Boolean);
  while (optionTexts.length < 2) {
    optionTexts.push(`Option ${optionTexts.length + 1}`);
  }

  let correctAnswer = optionTexts[0];
  const ca = q?.correctAnswer;
  if (typeof ca === 'number' || (typeof ca === 'string' && /^\d+$/.test(ca))) {
    const idx = Number.parseInt(ca, 10);
    if (optionTexts[idx]) correctAnswer = optionTexts[idx];
  } else if (typeof ca === 'string' && ca.trim()) {
    const match = optionTexts.find((o) => o.toLowerCase() === ca.toLowerCase());
    if (match) correctAnswer = match;
    else if (!optionTexts.includes(ca)) {
      optionTexts[0] = ca;
      correctAnswer = ca;
    } else {
      correctAnswer = ca;
    }
  }

  const reordered = [correctAnswer, ...optionTexts.filter((o) => o !== correctAnswer)];
  return {
    type: 'multiple_choice',
    question,
    options: reordered,
    correctAnswer: reordered[0]
  };
}

export function validateAndNormalizeDraft(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid draft: expected JSON object');
  }

  const moduleMeta = raw.module && typeof raw.module === 'object' ? raw.module : {};
  const title = String(moduleMeta.title || raw.title || 'Untitled Module').trim().slice(0, 255);
  const description = String(moduleMeta.description || raw.description || '').trim().slice(0, 5000);

  const pagesIn = Array.isArray(raw.pages) ? raw.pages : [];
  const pages = [];

  for (const page of pagesIn) {
    const type = String(page?.type || '').trim();
    if (!ALLOWED_PAGE_TYPES.has(type)) continue;
    const data = page?.data && typeof page.data === 'object' ? page.data : {};

    if (type === 'intro') {
      pages.push({
        type: 'intro',
        data: {
          title: String(data.title || title).trim().slice(0, 255),
          description: String(data.description || description).trim().slice(0, 8000)
        }
      });
    } else if (type === 'document') {
      pages.push({
        type: 'document',
        data: {
          title: String(data.title || 'Lesson content').trim().slice(0, 255),
          textContent: String(data.textContent || data.content || '').trim().slice(0, 50000)
        }
      });
    } else if (type === 'quiz') {
      const questionsIn = Array.isArray(data.questions) ? data.questions : [];
      const questions = questionsIn.slice(0, 25).map((q, i) => normalizeQuizQuestion(q, i));
      if (!questions.length) continue;
      pages.push({
        type: 'quiz',
        data: {
          title: String(data.title || 'Knowledge Check').trim().slice(0, 255),
          description: String(data.description || '').trim().slice(0, 2000),
          minimumScore: Number.isFinite(Number(data.minimumScore))
            ? Math.min(100, Math.max(0, Number(data.minimumScore)))
            : 80,
          allowRetake: data.allowRetake !== false,
          questions
        }
      });
    }
  }

  if (!pages.length) {
    throw new Error('Draft contained no valid content pages');
  }

  const hasQuiz = pages.some((p) => p.type === 'quiz');
  if (!hasQuiz) {
    throw new Error('Draft must include at least one quiz page');
  }

  return {
    module: { title, description },
    pages,
    sourcesUsed: Array.isArray(raw.sourcesUsed) ? raw.sourcesUsed.slice(0, 20) : [],
    alignmentNotes: String(raw.alignmentNotes || '').trim().slice(0, 4000)
  };
}

export function draftPageToBackend(page) {
  switch (page.type) {
    case 'intro':
      return {
        contentType: 'text',
        contentData: {
          title: page.data.title,
          description: page.data.description
        }
      };
    case 'document':
      return {
        contentType: 'text',
        contentData: {
          title: page.data.title,
          content: page.data.textContent,
          textContent: page.data.textContent
        }
      };
    case 'quiz': {
      const quiz = normalizeQuizQuestionsForStorage(page.data);
      return {
        contentType: 'quiz',
        contentData: {
          title: quiz.title,
          description: quiz.description || '',
          minimumScore: quiz.minimumScore ?? 80,
          allowRetake: quiz.allowRetake !== false,
          questions: quiz.questions
        }
      };
    }
    default:
      throw new Error(`Unsupported page type: ${page.type}`);
  }
}

function buildGenerationPrompt({
  title,
  description,
  learningObjectives,
  audienceRoles,
  templateId,
  notes,
  uploadTexts,
  kbContext
}) {
  const roles = Array.isArray(audienceRoles) ? audienceRoles.join(', ') : String(audienceRoles || '');
  const uploadsBlock = uploadTexts.length
    ? uploadTexts.map((u, i) => `--- Upload ${i + 1}: ${u.name} ---\n${u.text}`).join('\n\n')
    : '(none)';

  return [
    'You are an instructional designer creating employee training module drafts for a healthcare / community services organization.',
    'Use ONLY facts from the provided source uploads and agency knowledge base excerpts.',
    'If information is missing, note gaps in alignmentNotes — do not invent policies, dates, or legal requirements.',
    'Return ONLY valid JSON (no markdown fences) matching this schema:',
    '{',
    '  "module": { "title": string, "description": string },',
    '  "pages": [',
    '    { "type": "intro", "data": { "title": string, "description": string } },',
    '    { "type": "document", "data": { "title": string, "textContent": string } },',
    '    { "type": "quiz", "data": { "title": string, "description": string, "minimumScore": number, "allowRetake": boolean,',
    '      "questions": [',
    '        { "type": "multiple_choice"|"true_false"|"text", "question": string,',
    '          "options": [string] (multiple_choice only), "correctAnswer": string or option index }',
    '      ]}',
    '    }',
    '  ],',
    '  "sourcesUsed": [{ "kind": "upload"|"kb", "name": string, "excerptHint": string }],',
    '  "alignmentNotes": string',
    '}',
    '',
    `Template preference: ${templateId || 'rich-text-quiz'} (intro + document lesson + quiz).`,
    `Module title: ${title}`,
    `Module description: ${description || '(none)'}`,
    `Learning objectives: ${learningObjectives || '(none)'}`,
    `Audience roles: ${roles || '(all staff)'}`,
    `Admin notes: ${notes || '(none)'}`,
    '',
    'Agency knowledge base excerpts:',
    kbContext || '(no KB documents loaded — rely on uploads only)',
    '',
    'Uploaded source documents for this generation:',
    uploadsBlock,
    '',
    'Requirements:',
    '- document.textContent: use clear HTML-safe sections with <h2>, <p>, <ul><li> tags',
    '- quiz: 5-10 questions grounded in sources; mix multiple_choice and true_false',
    '- for multiple_choice, put the correct answer text in correctAnswer; include 3-4 options',
    '- keep language practical and appropriate for staff training'
  ].join('\n');
}

export async function extractUploadTexts(files) {
  const results = [];
  let total = 0;
  for (const file of files || []) {
    if (!file?.buffer) continue;
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime && mime !== 'application/pdf' && mime !== 'text/plain') continue;
    const extracted = await extractResumeTextFromUpload({ buffer: file.buffer, mimeType: mime });
    if (extracted?.status !== 'completed' || !extracted?.text) continue;
    const slice = safeTruncate(extracted.text, MAX_FILE_CHARS);
    if (total + slice.length > MAX_TOTAL_UPLOAD_CHARS) {
      results.push({
        name: file.originalname || 'upload',
        text: safeTruncate(slice, MAX_TOTAL_UPLOAD_CHARS - total)
      });
      break;
    }
    total += slice.length;
    results.push({ name: file.originalname || 'upload', text: slice });
  }
  return results;
}

export async function generateModuleDraft({
  agencyId,
  title,
  description,
  learningObjectives,
  audienceRoles,
  templateId,
  notes,
  files,
  actorUserId
}) {
  const requestJson = {
    agencyId,
    title,
    description,
    learningObjectives,
    audienceRoles,
    templateId,
    notes,
    uploadCount: (files || []).length
  };

  const requestId = await TrainingModuleGenerationRequest.createPending({
    agencyId,
    requestJson,
    createdByUserId: actorUserId
  });

  try {
    const uploadTexts = await extractUploadTexts(files);
    const query = [title, description, learningObjectives, notes, uploadTexts.map((u) => u.text).join(' ')].join(' ');
    const kbContext = await getTrainingKbContext({
      agencyId,
      query,
      maxChars: 6000,
      folders: ['handbook', 'policies']
    });

    const prompt = buildGenerationPrompt({
      title,
      description,
      learningObjectives,
      audienceRoles,
      templateId,
      notes,
      uploadTexts,
      kbContext
    });

    let generated = await callGeminiText({
      prompt,
      temperature: 0.25,
      maxOutputTokens: 2800
    });

    let parsed = extractJsonFromText(generated.text);
    if (!parsed) {
      generated = await callGeminiText({
        prompt: `${prompt}\n\nYour previous response was not valid JSON. Return ONLY the JSON object.`,
        temperature: 0.1,
        maxOutputTokens: 2800
      });
      parsed = extractJsonFromText(generated.text);
    }

    if (!parsed) {
      throw new Error('AI response was not valid JSON');
    }

    const draft = validateAndNormalizeDraft(parsed);
    if (!draft.module.title) draft.module.title = title;

    await TrainingModuleGenerationRequest.markCompleted(requestId, {
      outputJson: draft,
      model: generated.modelName,
      provider: generated.provider,
      latencyMs: generated.latencyMs
    });

    return {
      draft,
      generationRequestId: requestId,
      model: generated.modelName,
      latencyMs: generated.latencyMs
    };
  } catch (error) {
    await TrainingModuleGenerationRequest.markFailed(requestId, error?.message || 'Generation failed');
    throw error;
  }
}

export async function applyModuleDraft({
  agencyId,
  draft,
  generationRequestId,
  trainingFocusId,
  trackOrderIndex,
  createdByUserId
}) {
  const normalized = validateAndNormalizeDraft(draft);

  const module = await Module.create({
    title: normalized.module.title,
    description: normalized.module.description || null,
    agencyId,
    orderIndex: 0,
    isActive: true,
    createdByUserId
  });

  for (let i = 0; i < normalized.pages.length; i++) {
    const backend = draftPageToBackend(normalized.pages[i]);
    await ModuleContent.create({
      moduleId: module.id,
      contentType: backend.contentType,
      contentData: backend.contentData,
      orderIndex: i
    });
  }

  if (trainingFocusId) {
    await TrainingTrack.addModule(
      trainingFocusId,
      module.id,
      Number.isFinite(trackOrderIndex) ? trackOrderIndex : 0
    );
  }

  if (generationRequestId) {
    await TrainingModuleGenerationRequest.attachModule(generationRequestId, module.id);
  }

  return { moduleId: module.id, module };
}
