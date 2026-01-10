import pool from '../config/database.js';
import PlatformBranding from '../models/PlatformBranding.model.js';
import Agency from '../models/Agency.model.js';

/**
 * Resolves the icon for an item based on hierarchy:
 * 1. Individual item icon (if set)
 * 2. Agency default icon (if agency is set)
 * 3. System-wide default icon
 * 
 * @param {string} type - 'training_focus', 'module', 'user', or 'document'
 * @param {number|null} itemIconId - The icon_id directly on the item
 * @param {number|null} agencyId - The agency ID to check for agency defaults
 * @returns {Promise<number|null>} - The resolved icon ID
 */
export async function resolveIconId(type, itemIconId = null, agencyId = null) {
  // If item has its own icon, use it
  if (itemIconId) {
    return itemIconId;
  }
  
  // Check agency defaults if agency is provided
  if (agencyId) {
    try {
      const agency = await Agency.findById(agencyId);
      if (agency) {
        let agencyDefaultIconId = null;
        switch (type) {
          case 'training_focus':
            agencyDefaultIconId = agency.training_focus_default_icon_id;
            break;
          case 'module':
            agencyDefaultIconId = agency.module_default_icon_id;
            break;
          case 'user':
            agencyDefaultIconId = agency.user_default_icon_id;
            break;
          case 'document':
            agencyDefaultIconId = agency.document_default_icon_id;
            break;
        }
        
        if (agencyDefaultIconId) {
          return agencyDefaultIconId;
        }
      }
    } catch (error) {
      console.error('Error fetching agency for icon resolution:', error);
    }
  }
  
  // Fall back to system-wide defaults
  try {
    const platformBranding = await PlatformBranding.get();
    if (platformBranding) {
      let systemDefaultIconId = null;
      switch (type) {
        case 'training_focus':
          systemDefaultIconId = platformBranding.training_focus_default_icon_id;
          break;
        case 'module':
          systemDefaultIconId = platformBranding.module_default_icon_id;
          break;
        case 'user':
          systemDefaultIconId = platformBranding.user_default_icon_id;
          break;
        case 'document':
          systemDefaultIconId = platformBranding.document_default_icon_id;
          break;
      }
      
      if (systemDefaultIconId) {
        return systemDefaultIconId;
      }
    }
  } catch (error) {
    console.error('Error fetching platform branding for icon resolution:', error);
  }
  
  // No icon found in hierarchy
  return null;
}

/**
 * Resolves the full icon object (with URL) for an item
 * 
 * @param {string} type - 'training_focus', 'module', 'user', or 'document'
 * @param {number|null} itemIconId - The icon_id directly on the item
 * @param {number|null} agencyId - The agency ID to check for agency defaults
 * @returns {Promise<Object|null>} - The resolved icon object with URL, or null
 */
export async function resolveIcon(type, itemIconId = null, agencyId = null) {
  const resolvedIconId = await resolveIconId(type, itemIconId, agencyId);
  
  if (!resolvedIconId) {
    return null;
  }
  
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM icons WHERE id = ? AND is_active = TRUE',
      [resolvedIconId]
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    const icon = rows[0];
    return {
      ...icon,
      url: `/uploads/${icon.file_path}`
    };
  } catch (error) {
    console.error('Error fetching icon:', error);
    return null;
  }
}

