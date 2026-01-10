import Module from '../models/Module.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import Agency from '../models/Agency.model.js';

class ModuleCopyService {
  /**
   * Copy a module to a target agency/track with variable substitution
   * @param {number} sourceModuleId - ID of module to copy
   * @param {number} targetAgencyId - Target agency ID (null for platform level)
   * @param {number} targetTrackId - Target track ID (optional)
   * @param {number} createdByUserId - User ID creating the copy
   * @returns {Promise<Object>} - New module object
   */
  static async copyModule(sourceModuleId, targetAgencyId, targetTrackId, createdByUserId) {
    // Fetch source module
    const sourceModule = await Module.findById(sourceModuleId);
    if (!sourceModule) {
      throw new Error('Source module not found');
    }
    
    // Get target agency info for variable substitution
    let agencyName = '';
    let agencySlug = '';
    let trackName = '';
    
    if (targetAgencyId) {
      const agency = await Agency.findById(targetAgencyId);
      if (!agency) {
        throw new Error('Target agency not found');
      }
      agencyName = agency.name;
      agencySlug = agency.slug;
    }
    
    if (targetTrackId) {
      const TrainingTrack = (await import('../models/TrainingTrack.model.js')).default;
      const track = await TrainingTrack.findById(targetTrackId);
      if (track) {
        trackName = track.name;
      }
    }
    
    // Prepare variable substitutions
    const substitutions = {
      agency_name: agencyName,
      agency_slug: agencySlug,
      track_name: trackName
    };
    
    // Apply variable substitution to title and description
    let newTitle = sourceModule.title || '';
    let newDescription = sourceModule.description || '';
    
    for (const [key, value] of Object.entries(substitutions)) {
      const placeholder = `{{${key}}}`;
      newTitle = newTitle.replace(new RegExp(placeholder, 'g'), value);
      newDescription = newDescription.replace(new RegExp(placeholder, 'g'), value);
    }
    
    // Create new module (independent copy)
    const newModule = await Module.create({
      title: newTitle,
      description: newDescription,
      orderIndex: sourceModule.order_index || 0,
      isActive: sourceModule.is_active !== false,
      agencyId: targetAgencyId,
      trackId: targetTrackId || null,
      isShared: false, // Copied modules are not shared
      sourceModuleId: sourceModuleId, // Reference to original (informational only)
      createdByUserId: createdByUserId
    });
    
    // Copy all module content with variable substitution
    await ModuleContent.copyContent(sourceModuleId, newModule.id, substitutions);
    
    // Return new module with content
    const moduleWithContent = await Module.findById(newModule.id);
    const content = await ModuleContent.findByModuleId(newModule.id);
    
    return {
      ...moduleWithContent,
      content: content
    };
  }
  
  /**
   * Get variable substitution preview for a module
   * @param {number} moduleId - Module ID
   * @param {number} targetAgencyId - Target agency ID
   * @param {number} targetTrackId - Target track ID (optional)
   * @returns {Promise<Object>} - Preview with substituted text
   */
  static async getSubstitutionPreview(moduleId, targetAgencyId, targetTrackId) {
    const module = await Module.findById(moduleId);
    if (!module) {
      throw new Error('Module not found');
    }
    
    let agencyName = '';
    let agencySlug = '';
    let trackName = '';
    
    if (targetAgencyId) {
      const agency = await Agency.findById(targetAgencyId);
      if (agency) {
        agencyName = agency.name;
        agencySlug = agency.slug;
      }
    }
    
    if (targetTrackId) {
      const TrainingTrack = (await import('../models/TrainingTrack.model.js')).default;
      const track = await TrainingTrack.findById(targetTrackId);
      if (track) {
        trackName = track.name;
      }
    }
    
    const substitutions = {
      agency_name: agencyName,
      agency_slug: agencySlug,
      track_name: trackName
    };
    
    let previewTitle = module.title || '';
    let previewDescription = module.description || '';
    
    for (const [key, value] of Object.entries(substitutions)) {
      const placeholder = `{{${key}}}`;
      previewTitle = previewTitle.replace(new RegExp(placeholder, 'g'), value);
      previewDescription = previewDescription.replace(new RegExp(placeholder, 'g'), value);
    }
    
    return {
      originalTitle: module.title,
      previewTitle,
      originalDescription: module.description,
      previewDescription,
      substitutions
    };
  }
}

export default ModuleCopyService;

