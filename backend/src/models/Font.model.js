import pool from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Font {
  static async findAll(includeInactive = false, filters = {}) {
    let query = 'SELECT f.*, a.name as agency_name FROM fonts f LEFT JOIN agencies a ON f.agency_id = a.id';
    const params = [];
    const conditions = [];
    
    if (!includeInactive) {
      conditions.push('f.is_active = TRUE');
    }
    
    // Filter by agency
    if (filters.agencyId !== undefined) {
      if (filters.agencyId === null || filters.agencyId === 'null') {
        conditions.push('f.agency_id IS NULL');
      } else {
        const agencyIdNum = typeof filters.agencyId === 'string' ? parseInt(filters.agencyId, 10) : filters.agencyId;
        if (!isNaN(agencyIdNum) && agencyIdNum > 0) {
          conditions.push('f.agency_id = ?');
          params.push(agencyIdNum);
        }
      }
    }

    // Filter by family name
    if (filters.familyName) {
      conditions.push('f.family_name = ?');
      params.push(filters.familyName);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY f.family_name ASC, f.name ASC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT f.*, a.name as agency_name FROM fonts f LEFT JOIN agencies a ON f.agency_id = a.id WHERE f.id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static async findByFamilyName(familyName, agencyId = null) {
    let query = 'SELECT * FROM fonts WHERE family_name = ? AND is_active = TRUE';
    const params = [familyName];
    
    if (agencyId === null) {
      query += ' AND agency_id IS NULL';
    } else {
      query += ' AND agency_id = ?';
      params.push(agencyId);
    }
    
    query += ' ORDER BY name ASC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async create(fontData) {
    const {
      name,
      familyName,
      filePath,
      fileType,
      agencyId
    } = fontData;

    const [result] = await pool.execute(
      `INSERT INTO fonts (name, family_name, file_path, file_type, agency_id)
       VALUES (?, ?, ?, ?, ?)`,
      [name, familyName, filePath, fileType, agencyId || null]
    );

    return this.findById(result.insertId);
  }

  static async update(id, fontData) {
    const {
      name,
      familyName,
      isActive,
      filePath,
      agencyId
    } = fontData;

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (familyName !== undefined) {
      updates.push('family_name = ?');
      params.push(familyName);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive);
    }
    if (filePath !== undefined) {
      updates.push('file_path = ?');
      params.push(filePath);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      params.push(agencyId);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    await pool.execute(
      `UPDATE fonts SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  static async delete(id) {
    // Get font to delete file
    const font = await this.findById(id);
    if (!font) {
      return false;
    }

    // Delete file from filesystem
    if (font.file_path) {
      try {
        const fullPath = path.join(__dirname, '../../uploads', font.file_path.replace(/^\//, ''));
        await fs.unlink(fullPath);
      } catch (error) {
        console.error(`Error deleting font file ${font.file_path}:`, error);
        // Continue with database deletion even if file deletion fails
      }
    }

    // Delete from database
    const [result] = await pool.execute('DELETE FROM fonts WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async getUniqueFamilyNames(agencyId = null) {
    let query = 'SELECT DISTINCT family_name FROM fonts WHERE is_active = TRUE';
    const params = [];
    
    if (agencyId === null) {
      query += ' AND agency_id IS NULL';
    } else {
      query += ' AND (agency_id = ? OR agency_id IS NULL)';
      params.push(agencyId);
    }
    
    query += ' ORDER BY family_name ASC';
    
    const [rows] = await pool.execute(query, params);
    return rows.map(row => row.family_name);
  }
}

export default Font;
