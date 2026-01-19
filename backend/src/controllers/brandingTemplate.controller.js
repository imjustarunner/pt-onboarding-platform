import BrandingTemplate from '../models/BrandingTemplate.model.js';
import BrandingTemplateSchedule from '../models/BrandingTemplateSchedule.model.js';
import BrandingTemplateService from '../services/brandingTemplate.service.js';
import PlatformBranding from '../models/PlatformBranding.model.js';
import Agency from '../models/Agency.model.js';
import { validationResult } from 'express-validator';

function computeEffectiveTemplateId({ platformDefaultId, platformCurrentId, agencyDefaultId, agencyCurrentId }) {
  if (agencyCurrentId) return agencyCurrentId;
  if (agencyDefaultId) return agencyDefaultId;
  if (platformCurrentId) return platformCurrentId;
  return platformDefaultId || null;
}

export const getTemplates = async (req, res, next) => {
  try {
    const { scope, agencyId, isShared, includeShared } = req.query;
    const user = req.user;

    const filters = {};
    if (scope) filters.scope = scope;
    if (agencyId !== undefined) {
      filters.agencyId = agencyId === 'null' ? null : parseInt(agencyId);
    }
    if (isShared !== undefined) filters.isShared = isShared === 'true';
    if (includeShared === 'true') filters.includeShared = true;

    // For agency admins, only show their agency's templates or shared platform templates
    if (user.role === 'admin' && !user.agency_id) {
      return res.status(403).json({ error: { message: 'Agency admin must be associated with an agency' } });
    }

    if (user.role === 'admin') {
      filters.scope = 'agency';
      filters.agencyId = user.agency_id;
      filters.includeShared = true; // Include shared platform templates
    }

    const templates = await BrandingTemplate.findAll(filters);
    res.json(templates);
  } catch (error) {
    next(error);
  }
};

export const getTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const template = await BrandingTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Check access permissions
    if (user.role === 'admin') {
      if (template.scope === 'platform' && !template.is_shared) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      if (template.scope === 'agency' && template.agency_id !== user.agency_id) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    res.json(template);
  } catch (error) {
    next(error);
  }
};

export const createTemplate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { name, description, scope, agencyId, isShared, templateData, includeFields } = req.body;
    const user = req.user;

    // Permission checks
    if (scope === 'platform' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can create platform templates' } });
    }

    if (scope === 'agency') {
      if (user.role === 'admin' && (!user.agency_id || (agencyId && parseInt(agencyId) !== user.agency_id))) {
        return res.status(403).json({ error: { message: 'Agency admin can only create templates for their own agency' } });
      }
      if (user.role === 'support') {
        return res.status(403).json({ error: { message: 'Support users cannot create templates' } });
      }
    }

    // If templateData is not provided, extract from current branding
    let finalTemplateData = templateData;
    if (!finalTemplateData && includeFields) {
      if (scope === 'platform') {
        const PlatformBranding = (await import('../models/PlatformBranding.model.js')).default;
        const currentBranding = await PlatformBranding.get();
        finalTemplateData = BrandingTemplateService.extractBrandingData(currentBranding, includeFields);
      } else if (scope === 'agency' && agencyId) {
        const Agency = (await import('../models/Agency.model.js')).default;
        const agency = await Agency.findById(agencyId);
        if (!agency) {
          return res.status(404).json({ error: { message: 'Agency not found' } });
        }
        // Convert agency branding to format expected by extractBrandingData
        const agencyBranding = {
          color_palette: agency.color_palette,
          people_ops_term: agency.onboarding_team_email
        };
        finalTemplateData = BrandingTemplateService.extractBrandingData(agencyBranding, includeFields);
      }
    }

    // Check if templateData is empty or invalid
    if (!finalTemplateData || (typeof finalTemplateData === 'object' && Object.keys(finalTemplateData).length === 0)) {
      console.error('Template creation failed: No template data extracted or empty object');
      console.error('Request body:', JSON.stringify(req.body, null, 2));
      console.error('IncludeFields:', JSON.stringify(includeFields, null, 2));
      console.error('Extracted template data:', finalTemplateData);
      return res.status(400).json({ 
        error: { 
          message: 'Template data or include fields required. Could not extract template data from current branding with the provided include fields. Please ensure at least one field is selected to include.' 
        } 
      });
    }
    
    console.log('Extracted template data:', JSON.stringify(finalTemplateData, null, 2));

    const template = await BrandingTemplate.create({
      name,
      description,
      scope,
      agencyId: agencyId ? parseInt(agencyId) : null,
      createdByUserId: user.id,
      isShared: scope === 'platform' ? (isShared || false) : false,
      templateData: finalTemplateData
    });

    res.status(201).json(template);
  } catch (error) {
    next(error);
  }
};

export const updateTemplate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { name, description, isShared, templateData, includeFields } = req.body;
    const user = req.user;

    const template = await BrandingTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Permission checks
    if (template.scope === 'platform' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can update platform templates' } });
    }

    if (template.scope === 'agency') {
      if (user.role === 'admin' && template.agency_id !== user.agency_id) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      if (user.role === 'support') {
        return res.status(403).json({ error: { message: 'Support users cannot update templates' } });
      }
    }

    // If includeFields is provided, regenerate template data from current branding
    // This ensures templates are updated with the latest branding state
    let finalTemplateData = templateData;
    if (includeFields) {
      // Always regenerate from current branding when includeFields is provided
      if (template.scope === 'platform') {
        const PlatformBranding = (await import('../models/PlatformBranding.model.js')).default;
        const currentBranding = await PlatformBranding.get();
        finalTemplateData = BrandingTemplateService.extractBrandingData(currentBranding, includeFields);
        
        // Validate that we extracted some data
        if (!finalTemplateData || (typeof finalTemplateData === 'object' && Object.keys(finalTemplateData).length === 0)) {
          console.error('Template update failed: No template data extracted from platform branding');
          console.error('IncludeFields:', JSON.stringify(includeFields, null, 2));
          console.error('Current branding keys:', Object.keys(currentBranding || {}));
          return res.status(400).json({ 
            error: { 
              message: 'Could not extract template data from current platform branding with the provided include fields. Please ensure at least one field is selected and that the platform branding has values for those fields.' 
            } 
          });
        }
      } else if (template.scope === 'agency' && template.agency_id) {
        const Agency = (await import('../models/Agency.model.js')).default;
        const agency = await Agency.findById(template.agency_id);
        if (!agency) {
          return res.status(404).json({ error: { message: 'Agency not found' } });
        }
        // Convert agency branding to format expected by extractBrandingData
        const agencyBranding = {
          color_palette: agency.color_palette,
          people_ops_term: agency.onboarding_team_email
        };
        finalTemplateData = BrandingTemplateService.extractBrandingData(agencyBranding, includeFields);
        
        // Validate that we extracted some data
        if (!finalTemplateData || (typeof finalTemplateData === 'object' && Object.keys(finalTemplateData).length === 0)) {
          console.error('Template update failed: No template data extracted from agency branding');
          console.error('IncludeFields:', JSON.stringify(includeFields, null, 2));
          return res.status(400).json({ 
            error: { 
              message: 'Could not extract template data from current agency branding with the provided include fields. Please ensure at least one field is selected and that the agency branding has values for those fields.' 
            } 
          });
        }
      }
    } else if (!finalTemplateData) {
      // If neither templateData nor includeFields provided, return error
      return res.status(400).json({ 
        error: { message: 'Either templateData or includeFields must be provided' } 
      });
    }
    
    // Final validation: ensure templateData is not empty
    if (finalTemplateData && typeof finalTemplateData === 'object' && Object.keys(finalTemplateData).length === 0) {
      return res.status(400).json({ 
        error: { message: 'Template data cannot be empty. Please ensure at least one field is included.' } 
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (template.scope === 'platform' && isShared !== undefined) {
      updateData.isShared = isShared;
    }
    if (finalTemplateData !== undefined) updateData.templateData = finalTemplateData;

    const updated = await BrandingTemplate.update(id, updateData);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const template = await BrandingTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Permission checks
    if (template.scope === 'platform' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can delete platform templates' } });
    }

    if (template.scope === 'agency') {
      if (user.role === 'admin' && template.agency_id !== user.agency_id) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      if (user.role === 'support') {
        return res.status(403).json({ error: { message: 'Support users cannot delete templates' } });
      }
    }

    await BrandingTemplate.delete(id);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get template state (default/current/effective) for platform or a specific agency.
 * GET /api/branding-templates/state?targetScope=platform|agency&targetAgencyId=#
 */
export const getTemplateState = async (req, res, next) => {
  try {
    const user = req.user;
    const targetScope = String(req.query.targetScope || '').toLowerCase();
    const targetAgencyId = req.query.targetAgencyId ? parseInt(req.query.targetAgencyId, 10) : null;

    if (!['platform', 'agency'].includes(targetScope)) {
      return res.status(400).json({ error: { message: 'targetScope must be platform or agency' } });
    }
    if (targetScope === 'platform' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can view platform template state' } });
    }
    if (targetScope === 'agency') {
      if (!targetAgencyId) return res.status(400).json({ error: { message: 'targetAgencyId is required for agency scope' } });
      if (user.role === 'admin' && (!user.agency_id || user.agency_id !== targetAgencyId)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      if (user.role === 'support') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const pb = await PlatformBranding.get();
    const platformDefaultId = pb?.default_branding_template_id || null;
    const platformCurrentId = pb?.current_branding_template_id || null;

    let agencyDefaultId = null;
    let agencyCurrentId = null;
    if (targetScope === 'agency') {
      const agency = await Agency.findById(targetAgencyId);
      if (!agency) return res.status(404).json({ error: { message: 'Agency not found' } });
      agencyDefaultId = agency?.default_branding_template_id || null;
      agencyCurrentId = agency?.current_branding_template_id || null;
    }

    const effectiveId = computeEffectiveTemplateId({
      platformDefaultId,
      platformCurrentId,
      agencyDefaultId,
      agencyCurrentId
    });

    const resolveTemplate = async (id) => {
      if (!id) return null;
      const t = await BrandingTemplate.findById(id);
      if (!t) return null;
      return { id: t.id, name: t.name, scope: t.scope, agency_id: t.agency_id, is_shared: t.is_shared };
    };

    res.json({
      platform: {
        defaultTemplate: await resolveTemplate(platformDefaultId),
        currentTemplate: await resolveTemplate(platformCurrentId)
      },
      agency: targetScope === 'agency'
        ? {
            agencyId: targetAgencyId,
            defaultTemplate: await resolveTemplate(agencyDefaultId),
            currentTemplate: await resolveTemplate(agencyCurrentId)
          }
        : null,
      effectiveTemplate: await resolveTemplate(effectiveId)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Set the default branding template for platform or agency.
 * POST /api/branding-templates/:id/set-default
 */
export const setDefaultTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetScope, targetAgencyId, alsoSetCurrentIfEmpty = true } = req.body;
    const user = req.user;

    const scope = String(targetScope || '').toLowerCase();
    const agencyId = targetAgencyId ? parseInt(targetAgencyId, 10) : null;

    if (!['platform', 'agency'].includes(scope)) {
      return res.status(400).json({ error: { message: 'targetScope must be platform or agency' } });
    }
    if (scope === 'platform' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can set platform default template' } });
    }
    if (scope === 'agency') {
      if (!agencyId) return res.status(400).json({ error: { message: 'targetAgencyId is required for agency scope' } });
      if (user.role === 'admin' && (!user.agency_id || user.agency_id !== agencyId)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      if (user.role === 'support') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const template = await BrandingTemplate.findById(id);
    if (!template) return res.status(404).json({ error: { message: 'Template not found' } });

    // Enforce apply-eligibility rules (platform templates must be shared to be used by agencies)
    if (template.scope === 'agency' && scope === 'platform') {
      return res.status(400).json({ error: { message: 'Agency templates cannot be used as platform defaults' } });
    }
    if (template.scope === 'platform' && scope === 'agency' && !template.is_shared) {
      return res.status(400).json({ error: { message: 'Template is not shared with agencies' } });
    }

    if (scope === 'platform') {
      const pb = await PlatformBranding.get();
      const currentIsEmpty = !pb?.current_branding_template_id;
      // If we are also setting current (because it was empty), apply the template now so the platform actually reflects it.
      if (alsoSetCurrentIfEmpty && currentIsEmpty) {
        await BrandingTemplateService.applyBrandingData(template.template_data, 'platform', null, user.id);
      }
      await PlatformBranding.update(
        {
          defaultBrandingTemplateId: template.id,
          currentBrandingTemplateId: (alsoSetCurrentIfEmpty && currentIsEmpty) ? template.id : undefined
        },
        user.id
      );
    } else {
      const agency = await Agency.findById(agencyId);
      if (!agency) return res.status(404).json({ error: { message: 'Agency not found' } });
      const currentIsEmpty = !agency?.current_branding_template_id;
      // If we are also setting current (because it was empty), apply the template now so the agency actually reflects it.
      if (alsoSetCurrentIfEmpty && currentIsEmpty) {
        await BrandingTemplateService.applyBrandingData(template.template_data, 'agency', agencyId, user.id);
      }
      await Agency.update(agencyId, {
        defaultBrandingTemplateId: template.id,
        currentBrandingTemplateId: (alsoSetCurrentIfEmpty && currentIsEmpty) ? template.id : undefined
      });
    }

    res.json({ message: 'Default template set successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear the current template for platform or agency (falls back to default/inherited).
 * POST /api/branding-templates/clear-current
 */
export const clearCurrentTemplate = async (req, res, next) => {
  try {
    const { targetScope, targetAgencyId } = req.body;
    const user = req.user;

    const scope = String(targetScope || '').toLowerCase();
    const agencyId = targetAgencyId ? parseInt(targetAgencyId, 10) : null;

    if (!['platform', 'agency'].includes(scope)) {
      return res.status(400).json({ error: { message: 'targetScope must be platform or agency' } });
    }
    if (scope === 'platform' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can clear platform current template' } });
    }
    if (scope === 'agency') {
      if (!agencyId) return res.status(400).json({ error: { message: 'targetAgencyId is required for agency scope' } });
      if (user.role === 'admin' && (!user.agency_id || user.agency_id !== agencyId)) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      if (user.role === 'support') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    if (scope === 'platform') {
      await PlatformBranding.update({ currentBrandingTemplateId: null }, user.id);
    } else {
      await Agency.update(agencyId, { currentBrandingTemplateId: null });
    }

    res.json({ message: 'Current template cleared successfully' });
  } catch (error) {
    next(error);
  }
};

export const applyTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetScope, targetAgencyId } = req.body;
    const user = req.user;

    const template = await BrandingTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Permission checks
    if (targetScope === 'platform' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can apply templates to platform' } });
    }

    if (targetScope === 'agency') {
      if (user.role === 'admin' && (!user.agency_id || (targetAgencyId && parseInt(targetAgencyId) !== user.agency_id))) {
        return res.status(403).json({ error: { message: 'Agency admin can only apply templates to their own agency' } });
      }
      if (user.role === 'support') {
        return res.status(403).json({ error: { message: 'Support users cannot apply templates' } });
      }
    }

    // Check if template can be applied to target
    if (template.scope === 'agency' && targetScope === 'platform') {
      return res.status(400).json({ error: { message: 'Agency templates cannot be applied to platform' } });
    }

    if (template.scope === 'platform' && targetScope === 'agency' && !template.is_shared) {
      return res.status(400).json({ error: { message: 'Template is not shared with agencies' } });
    }

    const result = await BrandingTemplateService.applyBrandingData(
      template.template_data,
      targetScope,
      targetAgencyId ? parseInt(targetAgencyId) : null,
      user.id
    );

    // Persist which template is "current" for this scope
    if (String(targetScope).toLowerCase() === 'platform') {
      const pb = await PlatformBranding.get();
      await PlatformBranding.update(
        {
          currentBrandingTemplateId: template.id,
          // Best-effort: if no platform default exists yet, set it too.
          defaultBrandingTemplateId: pb?.default_branding_template_id ? undefined : template.id
        },
        user.id
      );
    } else if (String(targetScope).toLowerCase() === 'agency' && targetAgencyId) {
      const aId = parseInt(targetAgencyId, 10);
      const agency = await Agency.findById(aId);
      await Agency.update(aId, {
        currentBrandingTemplateId: template.id,
        // Best-effort: if no agency default exists yet, set it too (keeps behavior predictable).
        defaultBrandingTemplateId: agency?.default_branding_template_id ? undefined : template.id
      });
    }

    res.json({ message: 'Template applied successfully', branding: result });
  } catch (error) {
    next(error);
  }
};

export const getSchedules = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const template = await BrandingTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Check access permissions
    if (user.role === 'admin') {
      if (template.scope === 'platform' && !template.is_shared) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      if (template.scope === 'agency' && template.agency_id !== user.agency_id) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const schedules = await BrandingTemplateSchedule.findAll({ templateId: parseInt(id) });
    res.json(schedules);
  } catch (error) {
    next(error);
  }
};

export const createSchedule = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { scope, agencyId, startDate, endDate, isActive } = req.body;
    const user = req.user;

    const template = await BrandingTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Permission checks
    if (scope === 'platform' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can schedule platform templates' } });
    }

    if (scope === 'agency') {
      if (user.role === 'admin' && (!user.agency_id || (agencyId && parseInt(agencyId) !== user.agency_id))) {
        return res.status(403).json({ error: { message: 'Agency admin can only schedule templates for their own agency' } });
      }
      if (user.role === 'support') {
        return res.status(403).json({ error: { message: 'Support users cannot schedule templates' } });
      }
    }

    // Check for overlapping schedules
    const overlapping = await BrandingTemplateSchedule.findOverlappingSchedules(
      scope,
      agencyId ? parseInt(agencyId) : null,
      startDate,
      endDate
    );

    if (overlapping.length > 0) {
      return res.status(400).json({ 
        error: { 
          message: 'Overlapping schedule exists', 
          overlapping: overlapping 
        } 
      });
    }

    const schedule = await BrandingTemplateSchedule.create({
      templateId: parseInt(id),
      scope,
      agencyId: agencyId ? parseInt(agencyId) : null,
      startDate,
      endDate,
      isActive: isActive !== undefined ? isActive : true,
      createdByUserId: user.id
    });

    res.status(201).json(schedule);
  } catch (error) {
    next(error);
  }
};

export const updateSchedule = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { startDate, endDate, isActive } = req.body;
    const user = req.user;

    const schedule = await BrandingTemplateSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ error: { message: 'Schedule not found' } });
    }

    // Permission checks
    if (schedule.scope === 'platform' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can update platform schedules' } });
    }

    if (schedule.scope === 'agency') {
      if (user.role === 'admin' && schedule.agency_id !== user.agency_id) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      if (user.role === 'support') {
        return res.status(403).json({ error: { message: 'Support users cannot update schedules' } });
      }
    }

    // Check for overlapping schedules (excluding current one)
    if (startDate || endDate) {
      const finalStartDate = startDate || schedule.start_date;
      const finalEndDate = endDate || schedule.end_date;
      
      const overlapping = await BrandingTemplateSchedule.findOverlappingSchedules(
        schedule.scope,
        schedule.agency_id,
        finalStartDate,
        finalEndDate,
        parseInt(id)
      );

      if (overlapping.length > 0) {
        return res.status(400).json({ 
          error: { 
            message: 'Overlapping schedule exists', 
            overlapping: overlapping 
          } 
        });
      }
    }

    const updateData = {};
    if (startDate !== undefined) updateData.startDate = startDate;
    if (endDate !== undefined) updateData.endDate = endDate;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await BrandingTemplateSchedule.update(id, updateData);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const schedule = await BrandingTemplateSchedule.findById(id);
    if (!schedule) {
      return res.status(404).json({ error: { message: 'Schedule not found' } });
    }

    // Permission checks
    if (schedule.scope === 'platform' && user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can delete platform schedules' } });
    }

    if (schedule.scope === 'agency') {
      if (user.role === 'admin' && schedule.agency_id !== user.agency_id) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
      if (user.role === 'support') {
        return res.status(403).json({ error: { message: 'Support users cannot delete schedules' } });
      }
    }

    await BrandingTemplateSchedule.delete(id);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    next(error);
  }
};
