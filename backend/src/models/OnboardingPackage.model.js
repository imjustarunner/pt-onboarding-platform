import pool from '../config/database.js';

class OnboardingPackage {
  static async findAll(filters = {}) {
    const { agencyId, includeInactive } = filters;
    let query = 'SELECT * FROM onboarding_packages WHERE 1=1';
    const params = [];

    if (agencyId !== undefined) {
      query += ' AND agency_id = ?';
      params.push(agencyId);
    } else {
      // If no agency filter, show both platform-wide (NULL) and agency-specific
      // This allows admins to see their agency packages and platform packages
    }

    if (!includeInactive) {
      query += ' AND is_active = TRUE';
    }

    query += ' ORDER BY name ASC';

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM onboarding_packages WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async create(packageData) {
    const {
      name,
      description,
      agencyId,
      createdByUserId,
      isActive = true,
      packageType = 'onboarding'
    } = packageData;

    const [result] = await pool.execute(
      `INSERT INTO onboarding_packages (name, description, agency_id, created_by_user_id, is_active, package_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, description || null, agencyId || null, createdByUserId, isActive, packageType]
    );

    return this.findById(result.insertId);
  }

  static async update(id, packageData) {
    const updates = [];
    const values = [];

    if (packageData.name !== undefined) {
      updates.push('name = ?');
      values.push(packageData.name);
    }
    if (packageData.description !== undefined) {
      updates.push('description = ?');
      values.push(packageData.description || null);
    }
    if (packageData.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(packageData.isActive);
    }
    if (packageData.packageType !== undefined) {
      updates.push('package_type = ?');
      values.push(packageData.packageType);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    await pool.execute(
      `UPDATE onboarding_packages SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.findById(id);
  }

  static async delete(id) {
    // Cascade delete will handle junction tables
    const [result] = await pool.execute(
      'DELETE FROM onboarding_packages WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  // Training Focus management
  static async getTrainingFocuses(packageId) {
    const [rows] = await pool.execute(
      `SELECT otf.*, tt.name as track_name, tt.description as track_description
       FROM onboarding_package_training_focuses otf
       JOIN training_tracks tt ON otf.track_id = tt.id
       WHERE otf.package_id = ?
       ORDER BY otf.order_index ASC`,
      [packageId]
    );
    return rows;
  }

  static async addTrainingFocus(packageId, trackId, orderIndex = 0) {
    await pool.execute(
      `INSERT INTO onboarding_package_training_focuses (package_id, track_id, order_index)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE order_index = ?`,
      [packageId, trackId, orderIndex, orderIndex]
    );
    return this.getTrainingFocuses(packageId);
  }

  static async removeTrainingFocus(packageId, trackId) {
    await pool.execute(
      'DELETE FROM onboarding_package_training_focuses WHERE package_id = ? AND track_id = ?',
      [packageId, trackId]
    );
  }

  // Module management
  static async getModules(packageId) {
    const [rows] = await pool.execute(
      `SELECT opm.*, m.title as module_title, m.description as module_description
       FROM onboarding_package_modules opm
       JOIN modules m ON opm.module_id = m.id
       WHERE opm.package_id = ?
       ORDER BY opm.order_index ASC`,
      [packageId]
    );
    return rows;
  }

  static async addModule(packageId, moduleId, orderIndex = 0) {
    await pool.execute(
      `INSERT INTO onboarding_package_modules (package_id, module_id, order_index)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE order_index = ?`,
      [packageId, moduleId, orderIndex, orderIndex]
    );
    return this.getModules(packageId);
  }

  static async removeModule(packageId, moduleId) {
    await pool.execute(
      'DELETE FROM onboarding_package_modules WHERE package_id = ? AND module_id = ?',
      [packageId, moduleId]
    );
  }

  // Document management
  static async getDocuments(packageId) {
    const [rows] = await pool.execute(
      `SELECT opd.*, dt.name as document_name, dt.description as document_description
       FROM onboarding_package_documents opd
       JOIN document_templates dt ON opd.document_template_id = dt.id
       WHERE opd.package_id = ?
       ORDER BY opd.order_index ASC`,
      [packageId]
    );
    return rows;
  }

  static async addDocument(packageId, documentTemplateId, orderIndex = 0, actionType = 'signature', dueDateDays = null) {
    await pool.execute(
      `INSERT INTO onboarding_package_documents (package_id, document_template_id, order_index, action_type, due_date_days)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE order_index = ?, action_type = ?, due_date_days = ?`,
      [packageId, documentTemplateId, orderIndex, actionType, dueDateDays, orderIndex, actionType, dueDateDays]
    );
    return this.getDocuments(packageId);
  }

  static async removeDocument(packageId, documentTemplateId) {
    await pool.execute(
      'DELETE FROM onboarding_package_documents WHERE package_id = ? AND document_template_id = ?',
      [packageId, documentTemplateId]
    );
  }

  // Checklist Item management
  static async getChecklistItems(packageId) {
    const [rows] = await pool.execute(
      `SELECT opci.*, cci.item_label, cci.description, cci.training_focus_id, cci.module_id
       FROM onboarding_package_checklist_items opci
       JOIN custom_checklist_items cci ON opci.checklist_item_id = cci.id
       WHERE opci.package_id = ?
       ORDER BY opci.order_index ASC`,
      [packageId]
    );
    return rows;
  }

  static async addChecklistItem(packageId, checklistItemId, orderIndex = 0) {
    await pool.execute(
      `INSERT INTO onboarding_package_checklist_items (package_id, checklist_item_id, order_index)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE order_index = ?`,
      [packageId, checklistItemId, orderIndex, orderIndex]
    );
    return this.getChecklistItems(packageId);
  }

  static async removeChecklistItem(packageId, checklistItemId) {
    await pool.execute(
      'DELETE FROM onboarding_package_checklist_items WHERE package_id = ? AND checklist_item_id = ?',
      [packageId, checklistItemId]
    );
  }
}

export default OnboardingPackage;

