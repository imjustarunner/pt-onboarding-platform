import pool from '../config/database.js';

class AgencyChecklistEnabledItem {
  static async findByAgencyId(agencyId) {
    const [rows] = await pool.execute(
      `SELECT 
        acei.*,
        cci.item_key,
        cci.item_label,
        cci.description,
        cci.is_platform_template,
        cci.order_index
      FROM agency_checklist_enabled_items acei
      JOIN custom_checklist_items cci ON acei.checklist_item_id = cci.id
      WHERE acei.agency_id = ?
      ORDER BY cci.order_index ASC, cci.created_at ASC`,
      [agencyId]
    );
    return rows;
  }

  static async isEnabled(agencyId, checklistItemId) {
    const [rows] = await pool.execute(
      'SELECT enabled FROM agency_checklist_enabled_items WHERE agency_id = ? AND checklist_item_id = ?',
      [agencyId, checklistItemId]
    );
    return rows.length > 0 ? rows[0].enabled : false;
  }

  static async toggleItem(agencyId, checklistItemId, enabled) {
    // Check if record exists
    const [existing] = await pool.execute(
      'SELECT id FROM agency_checklist_enabled_items WHERE agency_id = ? AND checklist_item_id = ?',
      [agencyId, checklistItemId]
    );

    if (existing.length > 0) {
      // Update existing record
      await pool.execute(
        'UPDATE agency_checklist_enabled_items SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ? AND checklist_item_id = ?',
        [enabled, agencyId, checklistItemId]
      );
    } else {
      // Create new record
      await pool.execute(
        'INSERT INTO agency_checklist_enabled_items (agency_id, checklist_item_id, enabled) VALUES (?, ?, ?)',
        [agencyId, checklistItemId, enabled]
      );
    }

    return this.isEnabled(agencyId, checklistItemId);
  }

  static async enableAllPlatformItems(agencyId) {
    // Get all platform template items
    const [platformItems] = await pool.execute(
      'SELECT id FROM custom_checklist_items WHERE is_platform_template = TRUE'
    );

    // Enable each one (using INSERT IGNORE to avoid duplicates)
    for (const item of platformItems) {
      await pool.execute(
        `INSERT IGNORE INTO agency_checklist_enabled_items (agency_id, checklist_item_id, enabled) 
         VALUES (?, ?, TRUE)`,
        [agencyId, item.id]
      );
    }

    return platformItems.length;
  }

  static async getEnabledItemIdsForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT checklist_item_id 
       FROM agency_checklist_enabled_items 
       WHERE agency_id = ? AND enabled = TRUE`,
      [agencyId]
    );
    return rows.map(row => row.checklist_item_id);
  }
}

export default AgencyChecklistEnabledItem;

