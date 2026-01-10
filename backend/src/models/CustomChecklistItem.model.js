import pool from '../config/database.js';

class CustomChecklistItem {
  static async findAll(filters = {}) {
    const { isPlatformTemplate, agencyId } = filters;
    let query = 'SELECT * FROM custom_checklist_items WHERE 1=1';
    const params = [];

    if (isPlatformTemplate !== undefined) {
      query += ' AND is_platform_template = ?';
      params.push(isPlatformTemplate);
    }
    if (agencyId !== undefined) {
      query += ' AND agency_id = ?';
      params.push(agencyId);
    }

    query += ' ORDER BY is_platform_template DESC, order_index ASC, created_at ASC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM custom_checklist_items WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByAgency(agencyId) {
    // Get platform templates
    const platformTemplates = await this.findAll({ isPlatformTemplate: true });
    
    // Get agency-specific items (overrides and custom)
    const agencyItems = await this.findAll({ agencyId });
    
    return {
      platformTemplates,
      agencyItems,
      allItems: [...platformTemplates, ...agencyItems]
    };
  }

  static async findPlatformTemplates() {
    return this.findAll({ isPlatformTemplate: true });
  }

  static async create(itemData) {
    const {
      itemKey,
      itemLabel,
      description,
      isPlatformTemplate,
      agencyId,
      parentItemId,
      trainingFocusId,
      moduleId,
      orderIndex,
      autoAssign,
      createdByUserId
    } = itemData;

    // Validation: Cannot have both training_focus_id and module_id set independently
    // If module_id is set, it implies the training focus
    if (trainingFocusId && moduleId) {
      // Verify module belongs to the training focus
      const [moduleRows] = await pool.execute(
        'SELECT track_id FROM modules WHERE id = ?',
        [moduleId]
      );
      if (moduleRows.length === 0) {
        throw new Error('Module not found');
      }
      if (moduleRows[0].track_id !== trainingFocusId) {
        throw new Error('Module does not belong to the specified training focus');
      }
    }

    const [result] = await pool.execute(
      'INSERT INTO custom_checklist_items (item_key, item_label, description, is_platform_template, agency_id, parent_item_id, training_focus_id, module_id, order_index, auto_assign, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        itemKey,
        itemLabel,
        description || null,
        isPlatformTemplate !== undefined ? isPlatformTemplate : false,
        agencyId || null,
        parentItemId || null,
        trainingFocusId || null,
        moduleId || null,
        orderIndex || 0,
        autoAssign !== undefined ? autoAssign : false,
        createdByUserId || null
      ]
    );
    
    return this.findById(result.insertId);
  }

  static async update(id, itemData) {
    const {
      itemKey,
      itemLabel,
      description,
      isPlatformTemplate,
      agencyId,
      parentItemId,
      trainingFocusId,
      moduleId,
      orderIndex,
      autoAssign
    } = itemData;
    
    // Validation: If both training_focus_id and module_id are being set, verify module belongs to focus
    if (trainingFocusId !== undefined && moduleId !== undefined && moduleId !== null) {
      const [moduleRows] = await pool.execute(
        'SELECT track_id FROM modules WHERE id = ?',
        [moduleId]
      );
      if (moduleRows.length === 0) {
        throw new Error('Module not found');
      }
      if (moduleRows[0].track_id !== trainingFocusId) {
        throw new Error('Module does not belong to the specified training focus');
      }
    }
    
    const updates = [];
    const values = [];

    if (itemKey !== undefined) {
      updates.push('item_key = ?');
      values.push(itemKey);
    }
    if (itemLabel !== undefined) {
      updates.push('item_label = ?');
      values.push(itemLabel);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (isPlatformTemplate !== undefined) {
      updates.push('is_platform_template = ?');
      values.push(isPlatformTemplate);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(agencyId);
    }
    if (parentItemId !== undefined) {
      updates.push('parent_item_id = ?');
      values.push(parentItemId);
    }
    if (trainingFocusId !== undefined) {
      updates.push('training_focus_id = ?');
      values.push(trainingFocusId);
    }
    if (moduleId !== undefined) {
      updates.push('module_id = ?');
      values.push(moduleId);
    }
    if (orderIndex !== undefined) {
      updates.push('order_index = ?');
      values.push(orderIndex);
    }
    if (autoAssign !== undefined) {
      updates.push('auto_assign = ?');
      values.push(autoAssign);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(
      `UPDATE custom_checklist_items SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM custom_checklist_items WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async pushToAgency(itemId, targetAgencyId) {
    const sourceItem = await this.findById(itemId);
    if (!sourceItem) {
      throw new Error('Checklist item not found');
    }

    if (!sourceItem.is_platform_template) {
      throw new Error('Only platform templates can be pushed to agencies');
    }

    // Create agency-specific version (override)
    const newItem = await this.create({
      itemKey: sourceItem.item_key,
      itemLabel: sourceItem.item_label,
      description: sourceItem.description,
      isPlatformTemplate: false,
      agencyId: targetAgencyId,
      parentItemId: sourceItem.id,
      orderIndex: sourceItem.order_index,
      autoAssign: sourceItem.auto_assign,
      createdByUserId: sourceItem.created_by_user_id
    });

    return newItem;
  }

  static async generateItemKey(label) {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // Deprecated: getAutoAssignItems is no longer used
  // Items are now automatically available based on agency settings
  static async getAutoAssignItems(agencyId = null) {
    // This method is kept for backward compatibility but should not be used
    // Use getEnabledItemsForAgency instead
    return this.getEnabledItemsForAgency(agencyId);
  }

  static async getEnabledItemsForAgency(agencyId) {
    const AgencyChecklistEnabledItem = (await import('./AgencyChecklistEnabledItem.model.js')).default;
    
    // Get enabled platform items for this agency
    const enabledPlatformItemIds = await AgencyChecklistEnabledItem.getEnabledItemIdsForAgency(agencyId);
    
    // Get all agency-specific items for this agency (these are automatically enabled)
    const agencyItems = await this.findAll({ agencyId });
    
    // Get platform items that are enabled
    let enabledPlatformItems = [];
    if (enabledPlatformItemIds.length > 0) {
      const placeholders = enabledPlatformItemIds.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT * FROM custom_checklist_items 
         WHERE id IN (${placeholders}) 
         ORDER BY order_index ASC, created_at ASC`,
        enabledPlatformItemIds
      );
      enabledPlatformItems = rows;
    }
    
    return {
      platformItems: enabledPlatformItems,
      agencyItems: agencyItems,
      allItems: [...enabledPlatformItems, ...agencyItems]
    };
  }

  static async findByTrainingFocus(trainingFocusId) {
    const [rows] = await pool.execute(
      'SELECT * FROM custom_checklist_items WHERE training_focus_id = ? AND module_id IS NULL ORDER BY order_index ASC, created_at ASC',
      [trainingFocusId]
    );
    return rows;
  }

  static async findByModule(moduleId) {
    const [rows] = await pool.execute(
      'SELECT * FROM custom_checklist_items WHERE module_id = ? ORDER BY order_index ASC, created_at ASC',
      [moduleId]
    );
    return rows;
  }

  static async findByTrainingFocusAndModule(trainingFocusId, moduleId = null) {
    if (moduleId) {
      return this.findByModule(moduleId);
    }
    return this.findByTrainingFocus(trainingFocusId);
  }
}

export default CustomChecklistItem;

