import pool from '../config/database.js';

class LifecycleChecklistDefinition {
  /**
   * Return all platform definitions (no agency_id) plus any agency-specific overrides/additions.
   * Provider-specific items are included; caller filters by applies_to as needed.
   */
  static async findAll() {
    const [rows] = await pool.execute(
      `SELECT * FROM lifecycle_checklist_definitions
       WHERE is_platform_template = 1 AND agency_id IS NULL
       ORDER BY phase ASC, category ASC, order_index ASC`
    );
    return rows;
  }

  static async findByPhase(phase) {
    const [rows] = await pool.execute(
      `SELECT * FROM lifecycle_checklist_definitions
       WHERE phase = ? AND is_platform_template = 1 AND agency_id IS NULL
       ORDER BY category ASC, order_index ASC`,
      [phase]
    );
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM lifecycle_checklist_definitions WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByKey(itemKey) {
    const [rows] = await pool.execute(
      'SELECT * FROM lifecycle_checklist_definitions WHERE item_key = ? AND agency_id IS NULL',
      [itemKey]
    );
    return rows[0] || null;
  }

  /**
   * Category display labels for frontend grouping.
   */
  static categoryLabel(category) {
    const labels = {
      accounts_access: 'Accounts & Access',
      compliance_documents: 'Compliance Documents',
      background_credentialing: 'Background & Credentialing',
      orientation: 'Orientation Checklist',
      equipment: 'Equipment',
      access_removal: 'Access Removal',
      property_return: 'Property Return',
      final_employment: 'Final Employment Items',
    };
    return labels[category] || category;
  }

  static categoryOrder(phase) {
    const onboarding = ['accounts_access', 'compliance_documents', 'background_credentialing', 'orientation', 'equipment'];
    const offboarding = ['access_removal', 'property_return', 'final_employment'];
    return phase === 'offboarding' ? offboarding : onboarding;
  }
}

export default LifecycleChecklistDefinition;
