import ModuleContent from '../models/ModuleContent.model.js';
import { validationResult } from 'express-validator';

export const getModuleContent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const content = await ModuleContent.findByModuleId(id);
    
    // Parse JSON content_data
    const parsedContent = content.map(item => {
      let data = item.content_data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          data = null;
        }
      }
      return { ...item, content_data: data };
    });

    // Role-gate spec-generated form pages.
    const userRole = String(req.user?.role || '').toLowerCase();
    const filtered = parsedContent.filter((item) => {
      if (item.content_type !== 'form') return true;
      if (userRole === 'super_admin') return true;
      const roles = item.content_data?.visibleToRoles;
      if (!Array.isArray(roles) || roles.length === 0) return true;
      return roles.map((r) => String(r || '').toLowerCase()).includes(userRole);
    });

    res.json(filtered);
  } catch (error) {
    next(error);
  }
};

export const addModuleContent = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { contentType, contentData, orderIndex } = req.body;

    const content = await ModuleContent.create({
      moduleId: id,
      contentType,
      contentData,
      orderIndex
    });

    const parsedContent = {
      ...content,
      content_data: typeof content.content_data === 'string' 
        ? JSON.parse(content.content_data) 
        : content.content_data
    };

    res.status(201).json(parsedContent);
  } catch (error) {
    next(error);
  }
};

export const updateModuleContent = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { contentId } = req.params;
    const { contentType, contentData, orderIndex } = req.body;

    const content = await ModuleContent.update(contentId, {
      contentType,
      contentData,
      orderIndex
    });

    if (!content) {
      return res.status(404).json({ error: { message: 'Content not found' } });
    }

    const parsedContent = {
      ...content,
      content_data: typeof content.content_data === 'string' 
        ? JSON.parse(content.content_data) 
        : content.content_data
    };

    res.json(parsedContent);
  } catch (error) {
    next(error);
  }
};

export const deleteModuleContent = async (req, res, next) => {
  try {
    const { contentId } = req.params;
    const deleted = await ModuleContent.delete(contentId);

    if (!deleted) {
      return res.status(404).json({ error: { message: 'Content not found' } });
    }

    res.json({ message: 'Content deleted successfully' });
  } catch (error) {
    next(error);
  }
};

