import pool from '../config/database.js';

class ModuleAssignment {
  static async findByModule(moduleId) {
    const [rows] = await pool.execute(
      'SELECT * FROM module_assignments WHERE module_id = ?',
      [moduleId]
    );
    return rows;
  }

  static async findByAssignment(assignmentType, assignmentId) {
    const [rows] = await pool.execute(
      'SELECT ma.*, m.* FROM module_assignments ma JOIN modules m ON ma.module_id = m.id WHERE ma.assignment_type = ? AND ma.assignment_id = ? AND ma.is_assigned = TRUE',
      [assignmentType, assignmentId]
    );
    return rows;
  }

  static async create(assignmentData) {
    const { moduleId, assignmentType, assignmentId, isRequired, isOptional, isAssigned } = assignmentData;
    const [result] = await pool.execute(
      'INSERT INTO module_assignments (module_id, assignment_type, assignment_id, is_required, is_optional, is_assigned) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE is_required = ?, is_optional = ?, is_assigned = ?',
      [moduleId, assignmentType, assignmentId, isRequired || false, isOptional || false, isAssigned !== undefined ? isAssigned : true, isRequired || false, isOptional || false, isAssigned !== undefined ? isAssigned : true]
    );
    return this.findById(result.insertId || assignmentData.id);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM module_assignments WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async update(id, assignmentData) {
    const { isRequired, isOptional, isAssigned } = assignmentData;
    const updates = [];
    const values = [];

    if (isRequired !== undefined) {
      updates.push('is_required = ?');
      values.push(isRequired);
    }
    if (isOptional !== undefined) {
      updates.push('is_optional = ?');
      values.push(isOptional);
    }
    if (isAssigned !== undefined) {
      updates.push('is_assigned = ?');
      values.push(isAssigned);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(
      `UPDATE module_assignments SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM module_assignments WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async deleteByModule(moduleId) {
    await pool.execute(
      'DELETE FROM module_assignments WHERE module_id = ?',
      [moduleId]
    );
  }
}

export default ModuleAssignment;

