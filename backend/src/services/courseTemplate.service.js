import TrainingCourseTemplate from '../models/TrainingCourseTemplate.model.js';
import Module from '../models/Module.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import TrainingFocusStep from '../models/TrainingFocusStep.model.js';
import { PLATFORM_COURSE_TEMPLATES } from '../data/courseTemplates.seed.js';

export async function ensurePlatformTemplates() {
  const count = await TrainingCourseTemplate.countPlatform();
  // Always refresh platform templates so seed improvements land on deploy
  for (const tpl of PLATFORM_COURSE_TEMPLATES) {
    await TrainingCourseTemplate.upsertPlatform(tpl);
  }
  return count;
}

export async function listTemplates({ agencyId } = {}) {
  await ensurePlatformTemplates();
  return TrainingCourseTemplate.findAll({ agencyId });
}

async function createLessonFromBlocks({
  lesson,
  agencyId,
  createdByUserId,
  trackId = null,
  orderIndex = 0
}) {
  const module = await Module.create({
    title: lesson.title,
    description: lesson.description || null,
    agencyId: agencyId || null,
    trackId: trackId || null,
    orderIndex,
    isActive: false,
    publishStatus: 'draft',
    estimatedTimeMinutes: lesson.estimatedMinutes ?? null,
    createdByUserId
  });

  const blocks = lesson.blocks || [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    await ModuleContent.create({
      moduleId: module.id,
      contentType: b.contentType,
      contentData: b.contentData || {},
      title: b.title || null,
      settings: b.settings || null,
      orderIndex: i
    });
  }

  return module;
}

/**
 * Instantiate a template into editable draft modules (and optional training focus).
 */
export async function instantiateTemplate({
  templateId,
  agencyId,
  createdByUserId,
  trainingFocusId = null,
  createFocus = false,
  customTitle = null
}) {
  const template = await TrainingCourseTemplate.findById(templateId);
  if (!template || !template.isActive) {
    throw Object.assign(new Error('Template not found'), { statusCode: 404 });
  }

  const lessons = template.payload?.lessons || [];
  if (!lessons.length) {
    throw Object.assign(new Error('Template has no lessons'), { statusCode: 400 });
  }

  let focusId = trainingFocusId ? Number(trainingFocusId) : null;
  let createdFocus = null;

  const multiLesson = lessons.length > 1;
  if (!focusId && (createFocus || multiLesson)) {
    createdFocus = await TrainingTrack.create({
      name: customTitle || template.title,
      description: template.description || null,
      agencyId: agencyId || null,
      orderIndex: 0,
      isActive: true,
      assignmentLevel: agencyId ? 'agency' : 'platform'
    });
    focusId = createdFocus.id;
  }

  const modules = [];
  for (let i = 0; i < lessons.length; i++) {
    const lesson = {
      ...lessons[i],
      title: i === 0 && customTitle && !multiLesson
        ? customTitle
        : lessons[i].title
    };
    const mod = await createLessonFromBlocks({
      lesson,
      agencyId,
      createdByUserId,
      trackId: focusId,
      orderIndex: i
    });
    modules.push(mod);

    if (focusId) {
      await TrainingFocusStep.create({
        trainingFocusId: focusId,
        stepType: 'module',
        referenceId: mod.id,
        orderIndex: i,
        dueDateDays: null
      });
      try {
        await TrainingTrack.addModule(focusId, mod.id, i);
      } catch {
        // legacy link may already exist
      }
    }
  }

  return {
    template: {
      id: template.id,
      slug: template.slug,
      title: template.title,
      formatLabel: template.formatLabel
    },
    trainingFocusId: focusId,
    trainingFocus: createdFocus,
    modules,
    primaryModuleId: modules[0]?.id || null
  };
}
