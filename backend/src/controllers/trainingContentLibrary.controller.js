import { validationResult } from 'express-validator';
import TrainingContentLibrary from '../models/TrainingContentLibrary.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import Module from '../models/Module.model.js';

export const listLibraryItems = async (req, res, next) => {
  try {
    const { agencyId, contentType } = req.query;
    const items = await TrainingContentLibrary.findAll({
      agencyId: agencyId != null && agencyId !== '' ? agencyId : null,
      contentType: contentType || null
    });
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const createLibraryItem = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    const {
      agencyId = null,
      title,
      contentType,
      contentData,
      settings = null,
      tags = null
    } = req.body;
    const item = await TrainingContentLibrary.create({
      agencyId,
      title,
      contentType,
      contentData,
      settings,
      tags,
      createdByUserId: req.user.id
    });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
};

export const updateLibraryItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await TrainingContentLibrary.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Library item not found' } });
    }
    const item = await TrainingContentLibrary.update(id, {
      title: req.body.title,
      contentType: req.body.contentType,
      contentData: req.body.contentData,
      settings: req.body.settings,
      tags: req.body.tags,
      agencyId: req.body.agencyId
    });
    res.json(item);
  } catch (error) {
    next(error);
  }
};

export const deleteLibraryItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ok = await TrainingContentLibrary.delete(id);
    if (!ok) {
      return res.status(404).json({ error: { message: 'Library item not found' } });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const insertLibraryItemIntoModule = async (req, res, next) => {
  try {
    const moduleId = parseInt(req.params.id, 10);
    const libraryItemId = parseInt(req.body.libraryItemId, 10);
    const mod = await Module.findById(moduleId);
    if (!mod) {
      return res.status(404).json({ error: { message: 'Module not found' } });
    }
    const item = await TrainingContentLibrary.findById(libraryItemId);
    if (!item) {
      return res.status(404).json({ error: { message: 'Library item not found' } });
    }
    const existing = await ModuleContent.findByModuleId(moduleId);
    const orderIndex = req.body.orderIndex != null
      ? Number(req.body.orderIndex)
      : (existing?.length || 0);
    const content = await ModuleContent.create({
      moduleId,
      contentType: item.contentType,
      contentData: item.contentData,
      title: item.title,
      settings: item.settings,
      orderIndex
    });
    res.status(201).json(content);
  } catch (error) {
    next(error);
  }
};
