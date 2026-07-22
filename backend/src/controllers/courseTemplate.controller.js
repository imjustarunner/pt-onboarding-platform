import { listTemplates, instantiateTemplate } from '../services/courseTemplate.service.js';
import TrainingCourseTemplate from '../models/TrainingCourseTemplate.model.js';

export const getCourseTemplates = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId != null && req.query.agencyId !== ''
      ? req.query.agencyId
      : null;
    const templates = await listTemplates({ agencyId });
    res.json(templates.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title,
      description: t.description,
      category: t.category,
      formatLabel: t.formatLabel,
      estimatedMinutes: t.estimatedMinutes,
      lessonCount: t.lessonCount,
      tags: t.tags,
      sortOrder: t.sortOrder,
      // Preview first lesson block titles for the picker UI
      outline: (t.payload?.lessons || []).map((l) => ({
        title: l.title,
        estimatedMinutes: l.estimatedMinutes,
        blockCount: (l.blocks || []).length,
        blockTypes: (l.blocks || []).map((b) => b.contentType)
      }))
    })));
  } catch (error) {
    next(error);
  }
};

export const getCourseTemplateById = async (req, res, next) => {
  try {
    const template = await TrainingCourseTemplate.findById(parseInt(req.params.id, 10));
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }
    res.json(template);
  } catch (error) {
    next(error);
  }
};

export const createFromTemplate = async (req, res, next) => {
  try {
    const templateId = parseInt(req.params.id, 10);
    const {
      agencyId = null,
      trainingFocusId = null,
      createFocus = false,
      customTitle = null
    } = req.body || {};

    const result = await instantiateTemplate({
      templateId,
      agencyId: agencyId != null && agencyId !== '' ? Number(agencyId) : null,
      createdByUserId: req.user.id,
      trainingFocusId,
      createFocus: !!createFocus,
      customTitle
    });

    res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: { message: error.message } });
    }
    next(error);
  }
};
