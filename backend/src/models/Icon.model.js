import pool from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Icon {
  static async findAll(includeInactive = false, filters = {}) {
    // Check if agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'icons' AND COLUMN_NAME = 'agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for agency_id column:', err);
    }

    let query;
    if (hasAgencyColumn) {
      query = 'SELECT i.*, a.name as agency_name FROM icons i LEFT JOIN agencies a ON i.agency_id = a.id';
    } else {
      query = 'SELECT i.*, NULL as agency_name FROM icons i';
    }
    
    const params = [];
    const conditions = [];
    
    if (!includeInactive) {
      conditions.push('i.is_active = TRUE');
    }
    
    // Filter by agency (only if column exists)
    if (hasAgencyColumn && filters.agencyId !== undefined) {
      if (filters.agencyId === null || filters.agencyId === 'null') {
        // Filter for platform icons only (agency_id IS NULL)
        conditions.push('i.agency_id IS NULL');
        console.log('Icon.findAll - Filtering for platform icons only (agency_id IS NULL)');
      } else {
        // Filter for specific agency (agency_id = number)
        // This should EXCLUDE platform icons (agency_id IS NULL)
        // Ensure we're comparing with the correct type
        const agencyIdNum = typeof filters.agencyId === 'string' ? parseInt(filters.agencyId, 10) : filters.agencyId;
        if (!isNaN(agencyIdNum) && agencyIdNum > 0) {
          conditions.push('i.agency_id = ?');
          params.push(agencyIdNum);
          console.log('Icon.findAll - Filtering by agency:', agencyIdNum, 'type:', typeof agencyIdNum);
        } else {
          console.warn('Icon.findAll - Invalid agencyId provided:', filters.agencyId);
        }
      }
    }
    
    // Filter by category
    if (filters.category) {
      conditions.push('i.category = ?');
      params.push(filters.category);
    }
    
    // Filter by search term
    if (filters.search) {
      conditions.push('(i.name LIKE ? OR i.description LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
      console.log('Icon.findAll - Final query:', query);
      console.log('Icon.findAll - Query params:', params);
    } else {
      console.log('Icon.findAll - No conditions, showing all icons');
    }
    
    // Sorting
    const sortBy = filters.sortBy || 'name';
    const sortOrder = filters.sortOrder || 'asc';
    const validSortBy = ['name', 'category', 'agency_name', 'created_at'];
    const validSortOrder = ['asc', 'desc'];
    
    if (validSortBy.includes(sortBy) && validSortOrder.includes(sortOrder.toLowerCase())) {
      if (sortBy === 'agency_name' && hasAgencyColumn) {
        // Sort by agency name, with NULL values (platform icons) at the end
        if (sortOrder.toLowerCase() === 'asc') {
          query += ` ORDER BY a.name IS NULL, a.name ASC`;
        } else {
          query += ` ORDER BY a.name IS NULL, a.name DESC`;
        }
      } else if (sortBy === 'agency_name' && !hasAgencyColumn) {
        query += ' ORDER BY i.name ASC'; // Fallback to name if agency column doesn't exist
      } else {
        query += ` ORDER BY i.${sortBy} ${sortOrder.toUpperCase()}`;
      }
      if (sortBy !== 'name') {
        query += ', i.name ASC'; // Secondary sort by name
      }
    } else {
      query += ' ORDER BY i.name ASC';
    }
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findById(id) {
    // Check if agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'icons' AND COLUMN_NAME = 'agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for agency_id column:', err);
    }

    let query;
    if (hasAgencyColumn) {
      query = 'SELECT i.*, a.name as agency_name FROM icons i LEFT JOIN agencies a ON i.agency_id = a.id WHERE i.id = ?';
    } else {
      query = 'SELECT i.*, NULL as agency_name FROM icons i WHERE i.id = ?';
    }
    
    const [rows] = await pool.execute(query, [id]);
    return rows[0] || null;
  }

  static async findByName(name, agencyId = null) {
    // Check if agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'icons' AND COLUMN_NAME = 'agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for agency_id column:', err);
    }
    
    let query;
    let params;
    
    if (hasAgencyColumn) {
      // If agencyId is provided, check for same name in same agency
      // If agencyId is null, check for same name in platform (agency_id IS NULL)
      query = 'SELECT * FROM icons WHERE name = ? AND (agency_id = ? OR (agency_id IS NULL AND ? IS NULL))';
      params = [name, agencyId, agencyId];
    } else {
      // No agency column - just check by name
      query = 'SELECT * FROM icons WHERE name = ?';
      params = [name];
    }
    
    const [rows] = await pool.execute(query, params);
    return rows[0] || null;
  }

  static async findByCategory(category, includeInactive = false) {
    let query = 'SELECT * FROM icons WHERE category = ?';
    const params = [category];
    
    if (!includeInactive) {
      query += ' AND is_active = TRUE';
    }
    
    query += ' ORDER BY name ASC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async search(searchTerm, includeInactive = false) {
    let query = 'SELECT * FROM icons WHERE (name LIKE ? OR description LIKE ?)';
    const params = [`%${searchTerm}%`, `%${searchTerm}%`];
    
    if (!includeInactive) {
      query += ' AND is_active = TRUE';
    }
    
    query += ' ORDER BY name ASC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async create(iconData) {
    const {
      name,
      filePath,
      fileName,
      fileSize,
      mimeType,
      category,
      description,
      createdByUserId,
      agencyId
    } = iconData;

    // Check if agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'icons' AND COLUMN_NAME = 'agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for agency_id column:', err);
    }

    // Handle agencyId - preserve null, but convert valid IDs
    // Don't use || null because 0 would be falsy, but we want to preserve null vs undefined
    let finalAgencyId = null;
    
    console.log('Icon.create - RAW agencyId received:', agencyId, 'type:', typeof agencyId, 'value:', JSON.stringify(agencyId));
    
    // Handle different input types (number, string, null, undefined)
    if (agencyId !== null && agencyId !== undefined) {
      let parsed;
      
      if (typeof agencyId === 'number') {
        // Already a number, use it directly if valid
        parsed = agencyId;
        console.log('Icon.create - agencyId is number:', parsed);
      } else if (typeof agencyId === 'string') {
        // String input - trim and parse
        const trimmed = agencyId.trim();
        console.log('Icon.create - agencyId is string, trimmed:', trimmed);
        if (trimmed === '' || trimmed === 'null' || trimmed.toLowerCase() === 'null') {
          parsed = null;
          console.log('Icon.create - String is "null" or empty, setting parsed to null');
        } else {
          parsed = parseInt(trimmed, 10);
          console.log('Icon.create - Parsed string to number:', parsed, 'isNaN:', isNaN(parsed));
        }
      } else {
        // Try to parse as integer
        parsed = parseInt(agencyId, 10);
        console.log('Icon.create - Parsed other type to number:', parsed, 'isNaN:', isNaN(parsed));
      }
      
      // Only set finalAgencyId if we have a valid positive integer
      if (parsed !== null && !isNaN(parsed) && parsed > 0) {
        finalAgencyId = parsed;
        console.log('Icon.create - Setting finalAgencyId to:', finalAgencyId, 'type:', typeof finalAgencyId);
      } else {
        console.log('Icon.create - parsed is invalid (null, NaN, or <= 0), keeping finalAgencyId as null');
      }
    } else {
      console.log('Icon.create - agencyId is null or undefined, keeping finalAgencyId as null');
    }
    
    console.log('Icon.create - FINAL finalAgencyId:', finalAgencyId, 'type:', typeof finalAgencyId);

    let query;
    let params;
    
    if (hasAgencyColumn) {
      query = `INSERT INTO icons 
               (name, file_path, file_name, file_size, mime_type, category, description, created_by_user_id, agency_id, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`;
      // Ensure finalAgencyId is explicitly null (not undefined) for platform icons
      const agencyIdParam = finalAgencyId !== null && finalAgencyId !== undefined ? finalAgencyId : null;
      params = [name, filePath, fileName, fileSize, mimeType, category || null, description || null, createdByUserId || null, agencyIdParam];
      console.log('Icon.create - SQL INSERT params array:', params);
      console.log('Icon.create - agency_id param (index 8):', params[8], 'type:', typeof params[8], 'value:', JSON.stringify(params[8]));
      console.log('Icon.create - finalAgencyId:', finalAgencyId, 'agencyIdParam:', agencyIdParam);
      console.log('Icon.create - SQL query will insert agency_id as:', agencyIdParam === null ? 'NULL' : agencyIdParam);
    } else {
      query = `INSERT INTO icons 
               (name, file_path, file_name, file_size, mime_type, category, description, created_by_user_id, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`;
      params = [name, filePath, fileName, fileSize, mimeType, category || null, description || null, createdByUserId || null];
    }

    console.log('Icon.create - Executing SQL query:', query);
    console.log('Icon.create - With params:', params.map((p, i) => `[${i}]: ${p} (${typeof p})`).join(', '));
    
    const [result] = await pool.execute(query, params);
    
    console.log('Icon.create - SQL executed, insertId:', result.insertId);
    console.log('Icon.create - About to fetch created icon with findById');
    
    const createdIcon = await this.findById(result.insertId);
    
    console.log('Icon.create - Created icon from findById:', {
      id: createdIcon?.id,
      name: createdIcon?.name,
      agency_id: createdIcon?.agency_id,
      agency_name: createdIcon?.agency_name,
      agency_id_type: typeof createdIcon?.agency_id
    });
    
    return createdIcon;
  }

  static async update(id, iconData) {
    // Check if agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'icons' AND COLUMN_NAME = 'agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for agency_id column:', err);
    }

    const updates = [];
    const values = [];

    console.log('Icon.update - Starting update for id:', id);
    console.log('Icon.update - iconData received:', iconData);
    console.log('Icon.update - hasAgencyColumn:', hasAgencyColumn);

    if (iconData.name !== undefined) {
      updates.push('name = ?');
      values.push(iconData.name);
    }
    if (iconData.category !== undefined) {
      updates.push('category = ?');
      values.push(iconData.category || null);
    }
    if (iconData.description !== undefined) {
      updates.push('description = ?');
      values.push(iconData.description || null);
    }
    if (iconData.agencyId !== undefined && hasAgencyColumn) {
      updates.push('agency_id = ?');
      // Handle 'null' string or actual null value
      let finalAgencyId = null;
      
      if (iconData.agencyId === 'null' || iconData.agencyId === '' || iconData.agencyId === null || iconData.agencyId === undefined) {
        finalAgencyId = null;
        console.log('Icon.update - Setting agency_id to NULL (platform)');
      } else {
        // Handle both string and number types
        let parsedId;
        if (typeof iconData.agencyId === 'number') {
          parsedId = iconData.agencyId;
        } else if (typeof iconData.agencyId === 'string') {
          const trimmed = iconData.agencyId.trim();
          if (trimmed === '' || trimmed === 'null' || trimmed.toLowerCase() === 'null') {
            parsedId = null;
          } else {
            parsedId = parseInt(trimmed, 10);
          }
        } else {
          parsedId = parseInt(iconData.agencyId, 10);
        }
        
        if (parsedId === null || isNaN(parsedId) || parsedId <= 0) {
          console.error('Icon.update - Invalid agency ID:', iconData.agencyId, 'parsed:', parsedId);
          throw new Error(`Invalid agency ID: ${iconData.agencyId}`);
        }
        finalAgencyId = parsedId;
        console.log('Icon.update - Setting agency_id to:', finalAgencyId, 'type:', typeof finalAgencyId);
      }
      values.push(finalAgencyId);
    } else if (iconData.agencyId !== undefined && !hasAgencyColumn) {
      console.warn('Icon.update - agencyId provided but agency_id column does not exist, ignoring');
    }
    if (iconData.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(iconData.isActive);
    }
    if (iconData.filePath !== undefined) {
      updates.push('file_path = ?');
      values.push(iconData.filePath);
    }
    if (iconData.fileName !== undefined) {
      updates.push('file_name = ?');
      values.push(iconData.fileName);
    }
    if (iconData.fileSize !== undefined) {
      updates.push('file_size = ?');
      values.push(iconData.fileSize);
    }
    if (iconData.mimeType !== undefined) {
      updates.push('mime_type = ?');
      values.push(iconData.mimeType);
    }

    if (updates.length === 0) {
      console.log('Icon.update - No updates to perform, returning existing icon');
      return this.findById(id);
    }

    values.push(id);
    
    const query = `UPDATE icons SET ${updates.join(', ')} WHERE id = ?`;
    console.log('Icon.update - Executing SQL:', query);
    console.log('Icon.update - With params:', values.map((v, i) => `[${i}]: ${v} (${typeof v})`).join(', '));
    
    try {
      await pool.execute(query, values);
      console.log('Icon.update - SQL executed successfully');
    } catch (error) {
      console.error('Icon.update - SQL execution error:', error);
      console.error('Icon.update - Error details:', {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState
      });
      throw error;
    }

    const updatedIcon = await this.findById(id);
    console.log('Icon.update - Updated icon from findById:', {
      id: updatedIcon?.id,
      name: updatedIcon?.name,
      agency_id: updatedIcon?.agency_id,
      agency_name: updatedIcon?.agency_name
    });
    
    return updatedIcon;
  }

  static async delete(id) {
    try {
      const icon = await this.findById(id);
      if (!icon) {
        console.log('Icon not found for deletion:', id);
        return false;
      }

      console.log('Deleting icon:', icon.name, 'file_path:', icon.file_path);

      // Delete the file using StorageService (handles both local and GCS)
      if (icon.file_path) {
        try {
          // Extract filename from path (handles both "icons/filename" and full paths)
          const filename = icon.file_path.includes('/') 
            ? icon.file_path.split('/').pop() 
            : icon.file_path.replace('icons/', '');
          
          const StorageService = (await import('../services/storage.service.js')).default;
          await StorageService.deleteIcon(filename);
          console.log('Icon file deleted successfully:', filename);
        } catch (err) {
          console.error(`Failed to delete icon file: ${err.message}`);
          console.error('File path attempted:', icon.file_path);
          // Continue with database deletion even if file deletion fails
        }
      } else {
        console.log('No file_path found for icon, skipping file deletion');
      }

      // Delete from database
      console.log('Deleting icon from database, ID:', id);
      const [result] = await pool.execute('DELETE FROM icons WHERE id = ?', [id]);
      console.log('Database delete result:', result.affectedRows, 'rows affected');
      
      if (result.affectedRows === 0) {
        console.error('No rows were deleted from database');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error in Icon.delete:', error);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  static async bulkUpdate(iconIds, updateData) {
    if (!iconIds || iconIds.length === 0) {
      throw new Error('iconIds array is required and must not be empty');
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      throw new Error('updateData must contain at least one field to update');
    }

    const updates = [];
    const values = [];

    // Build update query dynamically
    if (updateData.name !== undefined) {
      updates.push('name = ?');
      values.push(updateData.name);
    }
    if (updateData.category !== undefined) {
      updates.push('category = ?');
      values.push(updateData.category);
    }
    if (updateData.description !== undefined) {
      updates.push('description = ?');
      values.push(updateData.description);
    }
    if (updateData.agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(updateData.agencyId);
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Build WHERE clause for all icon IDs
    const placeholders = iconIds.map(() => '?').join(',');
    const query = `UPDATE icons SET ${updates.join(', ')} WHERE id IN (${placeholders})`;
    values.push(...iconIds);

    await pool.execute(query, values);

    // Fetch and return updated icons
    const [rows] = await pool.execute(
      `SELECT * FROM icons WHERE id IN (${placeholders})`,
      iconIds
    );

    return rows;
  }

  static async bulkDelete(iconIds) {
    if (!iconIds || iconIds.length === 0) {
      throw new Error('iconIds array is required and must not be empty');
    }

    const StorageService = (await import('../services/storage.service.js')).default;

    // Fetch icons to get file paths before deletion
    const placeholders = iconIds.map(() => '?').join(',');
    const [icons] = await pool.execute(
      `SELECT id, file_path FROM icons WHERE id IN (${placeholders})`,
      iconIds
    );

    // Delete files from GCS
    for (const icon of icons) {
      if (icon.file_path) {
        try {
          await StorageService.deleteIcon(icon.file_path.replace('icons/', ''));
        } catch (error) {
          console.error(`Failed to delete icon file ${icon.file_path} from GCS:`, error);
          // Continue with database deletion even if file deletion fails
        }
      }
    }

    // Delete from database
    const [result] = await pool.execute(
      `DELETE FROM icons WHERE id IN (${placeholders})`,
      iconIds
    );

    return result.affectedRows;
  }

  static getIconUrl(icon) {
    if (!icon || !icon.file_path) {
      return null;
    }
    // file_path is stored as "uploads/icons/filename.png" (from StorageService.saveIcon)
    // Don't prepend /uploads/ if it's already there
    let filePath = icon.file_path;
    
    // Remove leading slash if present
    if (filePath.startsWith('/')) {
      filePath = filePath.substring(1);
    }
    
    // If path already starts with uploads/, use it as-is
    if (filePath.startsWith('uploads/')) {
      return `/${filePath}`;
    }
    
    // Old format: icons/filename.png - convert to new format
    if (filePath.startsWith('icons/')) {
      return `/uploads/${filePath}`;
    }
    
    // Just a filename - prepend uploads/icons/
    return `/uploads/icons/${filePath}`;
  }
}

export default Icon;

