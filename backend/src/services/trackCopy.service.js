import TrainingTrack from '../models/TrainingTrack.model.js';
import ModuleCopyService from './moduleCopy.service.js';
import Agency from '../models/Agency.model.js';

class TrackCopyService {
  /**
   * Duplicate a track within the same agency (with all modules)
   * @param {number} sourceTrackId - ID of track to duplicate
   * @param {number} targetAgencyId - Target agency ID (should be same as source for duplication)
   * @param {string} newTrackName - Name for the new track
   * @param {number} createdByUserId - User ID creating the duplicate
   * @returns {Promise<Object>} - New track object with modules
   */
  static async duplicateTrack(sourceTrackId, targetAgencyId, newTrackName, createdByUserId) {
    // Fetch source track
    const sourceTrack = await TrainingTrack.findById(sourceTrackId);
    if (!sourceTrack) {
      throw new Error('Source track not found');
    }
    
    // Get all modules in the track (with order)
    const sourceModules = await TrainingTrack.getModules(sourceTrackId);
    
    // Create new track
    const newTrack = await TrainingTrack.create({
      name: newTrackName || `${sourceTrack.name} (Copy)`,
      description: sourceTrack.description,
      orderIndex: sourceTrack.order_index || 0,
      assignmentLevel: sourceTrack.assignment_level || 'agency',
      agencyId: targetAgencyId,
      role: sourceTrack.role,
      isActive: sourceTrack.is_active !== false,
      sourceTrackId: sourceTrackId, // Reference to original
      isTemplate: false
    });
    
    // Copy all modules in order
    const copiedModules = [];
    for (let i = 0; i < sourceModules.length; i++) {
      const sourceModule = sourceModules[i];
      const orderIndex = sourceModule.track_order !== undefined ? sourceModule.track_order : i;
      
      // Copy module using module copy service
      const copiedModule = await ModuleCopyService.copyModule(
        sourceModule.id,
        targetAgencyId,
        null, // No program_id anymore
        createdByUserId
      );
      
      // Add module to track with same order
      await TrainingTrack.addModule(newTrack.id, copiedModule.id, orderIndex);
      copiedModules.push(copiedModule);
    }
    
    // Return track with modules
    const trackWithModules = await TrainingTrack.findById(newTrack.id);
    trackWithModules.modules = copiedModules;
    
    return trackWithModules;
  }
  
  /**
   * Copy a track from one agency to another (Super Admin only)
   * @param {number} sourceTrackId - ID of track to copy
   * @param {number} targetAgencyId - Target agency ID
   * @param {string} newTrackName - Name for the new track (optional, will use variable substitution)
   * @param {number} createdByUserId - User ID creating the copy
   * @returns {Promise<Object>} - New track object with modules
   */
  static async copyTrackToAgency(sourceTrackId, targetAgencyId, newTrackName, createdByUserId) {
    // Fetch source track
    const sourceTrack = await TrainingTrack.findById(sourceTrackId);
    if (!sourceTrack) {
      throw new Error('Source track not found');
    }
    
    // Get target agency for variable substitution
    const targetAgency = await Agency.findById(targetAgencyId);
    if (!targetAgency) {
      throw new Error('Target agency not found');
    }
    
    // Get all modules in the track (with order)
    const sourceModules = await TrainingTrack.getModules(sourceTrackId);
    
    // Apply variable substitution to track name and description
    const substitutions = {
      agency_name: targetAgency.name,
      agency_slug: targetAgency.slug,
      track_name: sourceTrack.name
    };
    
    let trackName = newTrackName || sourceTrack.name;
    let trackDescription = sourceTrack.description || '';
    
    for (const [key, value] of Object.entries(substitutions)) {
      const placeholder = `{{${key}}}`;
      trackName = trackName.replace(new RegExp(placeholder, 'g'), value);
      trackDescription = trackDescription.replace(new RegExp(placeholder, 'g'), value);
    }
    
    // Create new track in target agency
    const newTrack = await TrainingTrack.create({
      name: trackName,
      description: trackDescription,
      orderIndex: sourceTrack.order_index || 0,
      assignmentLevel: sourceTrack.assignment_level || 'agency',
      agencyId: targetAgencyId,
      role: sourceTrack.role,
      isActive: sourceTrack.is_active !== false,
      sourceTrackId: sourceTrackId, // Reference to original
      isTemplate: false
    });
    
    // Copy all modules in order (with variable substitution for cross-agency copy)
    const copiedModules = [];
    for (let i = 0; i < sourceModules.length; i++) {
      const sourceModule = sourceModules[i];
      const orderIndex = sourceModule.track_order !== undefined ? sourceModule.track_order : i;
      
      // Copy module to target agency (with variable substitution)
      const copiedModule = await ModuleCopyService.copyModule(
        sourceModule.id,
        targetAgencyId,
        null, // No program_id
        createdByUserId
      );
      
      // Add module to track with same order
      await TrainingTrack.addModule(newTrack.id, copiedModule.id, orderIndex);
      copiedModules.push(copiedModule);
    }
    
    // Return track with modules
    const trackWithModules = await TrainingTrack.findById(newTrack.id);
    trackWithModules.modules = copiedModules;
    
    return trackWithModules;
  }
  
  /**
   * Get complete track structure for duplication preview
   * @param {number} trackId - Track ID
   * @returns {Promise<Object>} - Track with modules and order
   */
  static async getTrackWithModules(trackId) {
    const track = await TrainingTrack.findById(trackId);
    if (!track) {
      throw new Error('Track not found');
    }
    
    const modules = await TrainingTrack.getModules(trackId);
    track.modules = modules;
    
    return track;
  }
  
  /**
   * Get track duplication preview with variable substitution
   * @param {number} trackId - Track ID
   * @param {number} targetAgencyId - Target agency ID
   * @returns {Promise<Object>} - Preview with substituted text
   */
  static async getTrackCopyPreview(trackId, targetAgencyId) {
    const track = await TrainingTrack.findById(trackId);
    if (!track) {
      throw new Error('Track not found');
    }
    
    let agencyName = '';
    let agencySlug = '';
    
    if (targetAgencyId) {
      const agency = await Agency.findById(targetAgencyId);
      if (agency) {
        agencyName = agency.name;
        agencySlug = agency.slug;
      }
    }
    
    const substitutions = {
      agency_name: agencyName,
      agency_slug: agencySlug,
      track_name: track.name
    };
    
    let previewName = track.name || '';
    let previewDescription = track.description || '';
    
    for (const [key, value] of Object.entries(substitutions)) {
      const placeholder = `{{${key}}}`;
      previewName = previewName.replace(new RegExp(placeholder, 'g'), value);
      previewDescription = previewDescription.replace(new RegExp(placeholder, 'g'), value);
    }
    
    const modules = await TrainingTrack.getModules(trackId);
    
    return {
      originalName: track.name,
      previewName,
      originalDescription: track.description,
      previewDescription,
      moduleCount: modules.length,
      substitutions
    };
  }
}

export default TrackCopyService;

