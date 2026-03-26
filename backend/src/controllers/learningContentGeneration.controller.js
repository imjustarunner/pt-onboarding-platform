import { callGeminiText } from '../services/geminiText.service.js';
import LearningGeneratedContent from '../models/LearningGeneratedContent.model.js';
import { assertLearningClientAccess } from '../utils/learningAccess.js';

const asInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
};

const buildSourceBasedPrompt = (payload) => {
  const {
    targetGradeLevel,
    theme,
    domainId,
    skillId,
    standardId,
    sourceText = '',
    sourceDocumentUrl = ''
  } = payload;
  return [
    'You are generating standards-aligned instructional content.',
    'Task type: source-based adaptation.',
    `Target grade level: ${targetGradeLevel || 'unspecified'}`,
    `Theme/interests: ${theme || 'none provided'}`,
    `Domain ID: ${domainId}`,
    `Skill ID: ${skillId}`,
    `Standard ID: ${standardId || 'not provided'}`,
    `Source document URL: ${sourceDocumentUrl || 'not provided'}`,
    'Adapt the source content while preserving instructional intent.',
    'Return JSON with keys: title, instructions, practiceItems[], assessmentItems[], alignmentNotes.',
    `Source text:\n${String(sourceText || '').slice(0, 12000)}`
  ].join('\n');
};

const buildGenerativePrompt = (payload) => {
  const {
    targetGradeLevel,
    theme,
    domainId,
    skillId,
    standardId,
    currentLevelSummary = '',
    goalTarget = ''
  } = payload;
  return [
    'You are generating fully personalized standards-aligned instructional content.',
    'Task type: profile-driven generation.',
    `Target grade level: ${targetGradeLevel || 'unspecified'}`,
    `Theme/interests: ${theme || 'none provided'}`,
    `Domain ID: ${domainId}`,
    `Skill ID: ${skillId}`,
    `Standard ID: ${standardId || 'not provided'}`,
    `Current level summary: ${currentLevelSummary || 'not provided'}`,
    `Goal target: ${goalTarget || 'not provided'}`,
    'Return JSON with keys: title, miniLesson, practiceItems[], assessmentItems[], differentiationTips[], alignmentNotes.',
    'Keep content measurable and linked to the target skill progression.'
  ].join('\n');
};

const runGeneration = async ({ requestPayload, generationPath, prompt }) => {
  const requestId = await LearningGeneratedContent.createRequest(requestPayload, requestPayload.actorUserId);
  try {
    const generated = await callGeminiText({
      prompt,
      temperature: 0.3,
      maxOutputTokens: 1200
    });

    let parsed = null;
    try {
      parsed = JSON.parse(generated.text);
    } catch {
      parsed = { rawText: generated.text };
    }

    const record = await LearningGeneratedContent.markCompleted(requestId, {
      generationPath,
      model: generated.modelName,
      provider: generated.provider,
      latencyMs: generated.latencyMs,
      content: parsed
    });

    return { requestId, record, generatedContent: parsed };
  } catch (error) {
    await LearningGeneratedContent.markFailed(requestId, error?.message || 'Generation failed');
    throw error;
  }
};

export const generateSourceAdaptedLearningContent = async (req, res, next) => {
  try {
    const clientId = asInt(req.body.clientId);
    const domainId = asInt(req.body.domainId);
    const skillId = asInt(req.body.skillId);
    const subdomainId = asInt(req.body.subdomainId);
    const standardId = asInt(req.body.standardId);

    if (!clientId || !domainId || !skillId) {
      return res.status(400).json({ error: { message: 'clientId, domainId, and skillId are required' } });
    }
    await assertLearningClientAccess(req, clientId);

    const requestPayload = {
      ...req.body,
      clientId,
      domainId,
      subdomainId,
      standardId,
      skillId,
      generationPath: 'source_based',
      actorUserId: req.user?.id || null
    };

    const prompt = buildSourceBasedPrompt(requestPayload);
    const result = await runGeneration({
      requestPayload,
      generationPath: 'source_based',
      prompt
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const generatePersonalizedLearningContent = async (req, res, next) => {
  try {
    const clientId = asInt(req.body.clientId);
    const domainId = asInt(req.body.domainId);
    const skillId = asInt(req.body.skillId);
    const subdomainId = asInt(req.body.subdomainId);
    const standardId = asInt(req.body.standardId);

    if (!clientId || !domainId || !skillId) {
      return res.status(400).json({ error: { message: 'clientId, domainId, and skillId are required' } });
    }
    await assertLearningClientAccess(req, clientId);

    const requestPayload = {
      ...req.body,
      clientId,
      domainId,
      subdomainId,
      standardId,
      skillId,
      generationPath: 'generative',
      actorUserId: req.user?.id || null
    };

    const prompt = buildGenerativePrompt(requestPayload);
    const result = await runGeneration({
      requestPayload,
      generationPath: 'generative',
      prompt
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
