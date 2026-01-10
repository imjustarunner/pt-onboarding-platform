import pool from '../config/database.js';

class OnboardingChecklist {
  static async getUserChecklist(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM onboarding_checklist_items WHERE user_id = ? ORDER BY order_index ASC, created_at ASC',
      [userId]
    );
    return rows;
  }

  static async getCompletionPercentage(userId) {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as total, SUM(CASE WHEN is_completed = TRUE THEN 1 ELSE 0 END) as completed FROM onboarding_checklist_items WHERE user_id = ?',
      [userId]
    );
    
    if (rows.length === 0 || rows[0].total === 0) {
      return 0;
    }
    
    const total = rows[0].total;
    const completed = rows[0].completed || 0;
    return Math.round((completed / total) * 100);
  }

  static async createChecklistItem(itemData) {
    const { userId, itemType, itemId, title, description, orderIndex } = itemData;
    const [result] = await pool.execute(
      'INSERT INTO onboarding_checklist_items (user_id, item_type, item_id, title, description, order_index) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, itemType, itemId || null, title, description || null, orderIndex || 0]
    );
    
    const [rows] = await pool.execute(
      'SELECT * FROM onboarding_checklist_items WHERE id = ?',
      [result.insertId]
    );
    return rows[0];
  }

  static async markItemComplete(userId, itemId) {
    await pool.execute(
      'UPDATE onboarding_checklist_items SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [itemId, userId]
    );
    
    const [rows] = await pool.execute(
      'SELECT * FROM onboarding_checklist_items WHERE id = ?',
      [itemId]
    );
    return rows[0] || null;
  }

  static async markItemIncomplete(userId, itemId) {
    await pool.execute(
      'UPDATE onboarding_checklist_items SET is_completed = FALSE, completed_at = NULL WHERE id = ? AND user_id = ?',
      [itemId, userId]
    );
    
    const [rows] = await pool.execute(
      'SELECT * FROM onboarding_checklist_items WHERE id = ?',
      [itemId]
    );
    return rows[0] || null;
  }

  static async deleteItem(itemId) {
    const [result] = await pool.execute(
      'DELETE FROM onboarding_checklist_items WHERE id = ?',
      [itemId]
    );
    return result.affectedRows > 0;
  }

  static async initializeUserChecklist(userId) {
    // Create default checklist items for a new user
    const defaultItems = [
      { itemType: 'profile', title: 'Complete Profile', description: 'Update your personal information', orderIndex: 1 },
      { itemType: 'account_setup', title: 'Set Up Account Information', description: 'Review and set up your account credentials', orderIndex: 2 }
    ];

    const createdItems = [];
    for (const item of defaultItems) {
      const created = await this.createChecklistItem({
        userId,
        ...item
      });
      createdItems.push(created);
    }

    return createdItems;
  }
}

export default OnboardingChecklist;

