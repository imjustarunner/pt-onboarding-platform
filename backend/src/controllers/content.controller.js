import ModuleContent from '../models/ModuleContent.model.js';
import { validationResult } from 'express-validator';
import { normalizeContentType } from '../constants/trainingContentTypes.js';

/** Map legacy / alternate roles onto the roles stored in form visibleToRoles. */
function rolesEquivalentTo(userRole) {
  const r = String(userRole || '').trim().toLowerCase();
  if (!r) return [];
  const aliases = new Set([r]);
  // Legacy collapse left many users on deprecated clinician
  if (r === 'clinician') aliases.add('provider');
  if (r === 'provider_plus') aliases.add('provider');
  if (r === 'assistant_admin') {
    aliases.add('admin');
    aliases.add('support');
  }
  if (r === 'qbha') aliases.add('clinical_practice_assistant');
  return [...aliases];
}

export const getModuleContent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const content = await ModuleContent.findByModuleId(id);
    
    // Parse JSON content_data / settings and normalize legacy content types
    const parsedContent = content.map(item => {
      let data = item.content_data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          data = null;
        }
      }
      let settings = item.settings;
      if (typeof settings === 'string') {
        try {
          settings = JSON.parse(settings);
        } catch {
          settings = null;
        }
      }
      const content_type = normalizeContentType(item.content_type, data || {});
      return { ...item, content_type, content_data: data, settings };
    });

    // Role-gate spec-generated form pages.
    const userRole = String(req.user?.role || '').toLowerCase();
    const userRoleAliases = rolesEquivalentTo(userRole);
    const filtered = parsedContent.filter((item) => {
      if (item.content_type !== 'form') return true;
      if (userRole === 'super_admin') return true;
      const roles = item.content_data?.visibleToRoles;
      if (!Array.isArray(roles) || roles.length === 0) return true;
      const allowed = roles.map((r) => String(r || '').toLowerCase());
      return userRoleAliases.some((alias) => allowed.includes(alias));
    });

    // If role-gating wiped every form page, fall back to unfiltered forms so
    // onboarding modules never render as a blank shell for valid staff roles.
    const hadForms = parsedContent.some((i) => i.content_type === 'form');
    const hasForms = filtered.some((i) => i.content_type === 'form');
    if (hadForms && !hasForms) {
      console.warn(
        `getModuleContent: role "${userRole}" filtered out all form pages for module ${id}; returning unfiltered forms`
      );
      return res.json(parsedContent);
    }

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
    const { contentType, contentData, orderIndex, title, settings } = req.body;

    const content = await ModuleContent.create({
      moduleId: id,
      contentType: normalizeContentType(contentType, contentData),
      contentData,
      orderIndex,
      title,
      settings
    });

    const parsedContent = {
      ...content,
      content_type: normalizeContentType(
        content.content_type,
        typeof content.content_data === 'string' ? JSON.parse(content.content_data) : content.content_data
      ),
      content_data: typeof content.content_data === 'string' 
        ? JSON.parse(content.content_data) 
        : content.content_data,
      settings: typeof content.settings === 'string'
        ? JSON.parse(content.settings)
        : content.settings
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
    const { contentType, contentData, orderIndex, title, settings } = req.body;

    const content = await ModuleContent.update(contentId, {
      contentType: contentType != null ? normalizeContentType(contentType, contentData) : undefined,
      contentData,
      orderIndex,
      title,
      settings
    });

    if (!content) {
      return res.status(404).json({ error: { message: 'Content not found' } });
    }

    const parsedData = typeof content.content_data === 'string' 
      ? JSON.parse(content.content_data) 
      : content.content_data;
    const parsedContent = {
      ...content,
      content_type: normalizeContentType(content.content_type, parsedData || {}),
      content_data: parsedData,
      settings: typeof content.settings === 'string'
        ? JSON.parse(content.settings)
        : content.settings
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

