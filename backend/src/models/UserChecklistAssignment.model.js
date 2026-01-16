import pool from '../config/database.js';

class UserChecklistAssignment {
  static async findByUserId(userId, agencyId = null) {
    // Get user's agencies
    const User = (await import('./User.model.js')).default;
    const userAgencies = await User.getAgencies(userId);
    
    if (userAgencies.length === 0) {
      return [];
    }

    // Get all enabled items for user's agencies
    const CustomChecklistItem = (await import('./CustomChecklistItem.model.js')).default;
    const AgencyChecklistEnabledItem = (await import('./AgencyChecklistEnabledItem.model.js')).default;
    
    const allEnabledItems = [];
    
    // For each agency, get enabled items
    for (const agency of userAgencies) {
      if (agencyId !== null && agency.id !== agencyId) {
        continue; // Skip if filtering by specific agency
      }
      
      const enabledItems = await CustomChecklistItem.getEnabledItemsForAgency(agency.id);
      
      // Ensure assignment records exist for completion tracking
      for (const item of enabledItems.allItems) {
        // Check if assignment exists
        const existing = await this.findByUserAndItem(userId, item.id);
        if (!existing) {
          // Create assignment record for completion tracking
          await this.assignToUser(userId, item.id, null);
        }
      }
      
      allEnabledItems.push(...enabledItems.allItems);
    }
    
    // Remove duplicates (in case user belongs to multiple agencies with same items)
    const uniqueItems = new Map();
    for (const item of allEnabledItems) {
      if (!uniqueItems.has(item.id)) {
        uniqueItems.set(item.id, item);
      }
    }
    
    // Get assignment records with completion status
    const itemIds = Array.from(uniqueItems.keys());
    if (itemIds.length === 0) {
      return [];
    }
    
    const placeholders = itemIds.map(() => '?').join(',');
    const query = `
      SELECT 
        uca.*,
        cci.item_key,
        cci.item_label,
        cci.description,
        cci.is_platform_template,
        cci.agency_id,
        cci.order_index
      FROM user_custom_checklist_assignments uca
      JOIN custom_checklist_items cci ON uca.checklist_item_id = cci.id
      WHERE uca.user_id = ? AND cci.id IN (${placeholders})
      ORDER BY cci.is_platform_template DESC, cci.agency_id IS NULL DESC, cci.order_index ASC
    `;
    
    const [rows] = await pool.execute(query, [userId, ...itemIds]);
    return rows;
  }

  static async findByUserAndItem(userId, checklistItemId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_custom_checklist_assignments WHERE user_id = ? AND checklist_item_id = ?',
      [userId, checklistItemId]
    );
    return rows[0] || null;
  }

  // Repurposed: Now only creates completion tracking records, not assignments
  // Items are automatically available based on agency settings
  static async assignToUser(userId, itemId, assignedByUserId = null) {
    // Check if already exists
    const existing = await this.findByUserAndItem(userId, itemId);
    if (existing) {
      return existing;
    }

    // Create record for completion tracking only
    const [result] = await pool.execute(
      'INSERT INTO user_custom_checklist_assignments (user_id, checklist_item_id, assigned_by_user_id, is_completed) VALUES (?, ?, ?, FALSE)',
      [userId, itemId, assignedByUserId]
    );
    
    const [rows] = await pool.execute(
      'SELECT * FROM user_custom_checklist_assignments WHERE id = ?',
      [result.insertId]
    );
    return rows[0];
  }

  static async markComplete(userId, itemId) {
    await pool.execute(
      'UPDATE user_custom_checklist_assignments SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND checklist_item_id = ?',
      [userId, itemId]
    );
    
    return this.findByUserAndItem(userId, itemId);
  }

  static async markIncomplete(userId, itemId) {
    await pool.execute(
      'UPDATE user_custom_checklist_assignments SET is_completed = FALSE, completed_at = NULL WHERE user_id = ? AND checklist_item_id = ?',
      [userId, itemId]
    );
    
    return this.findByUserAndItem(userId, itemId);
  }

  static async getUnifiedChecklist(userId) {
    // Get user status to determine filtering
    const User = (await import('./User.model.js')).default;
    const user = await User.findById(userId);
    const isPending = user && user.status === 'pending';
    
    // Get custom checklist items
    const customItems = await this.findByUserId(userId);
    
    // For pending users, filter to only items from assigned onboarding package
    let filteredCustomItems = customItems;
    let userPackages = [];
    if (isPending) {
      // Get user's onboarding packages by checking which packages have checklist items assigned to this user
      // Packages are assigned through checklist items, so we find packages that have items assigned to the user
      const [packageRows] = await pool.execute(
        `SELECT DISTINCT op.id, op.name, op.description, op.agency_id, op.is_active
         FROM onboarding_packages op
         INNER JOIN onboarding_package_checklist_items opci ON op.id = opci.package_id
         INNER JOIN user_custom_checklist_assignments ucca ON opci.checklist_item_id = ucca.checklist_item_id
         WHERE ucca.user_id = ?
         AND op.is_active = TRUE`,
        [userId]
      );
      userPackages = packageRows;
      
      if (userPackages.length > 0) {
        // Get checklist items from assigned packages
        const packageIds = userPackages.map(p => p.id);
        const [packageItems] = await pool.execute(
          `SELECT DISTINCT cci.id 
           FROM custom_checklist_items cci
           INNER JOIN onboarding_package_checklist_items opci ON cci.id = opci.checklist_item_id
           WHERE opci.package_id IN (${packageIds.map(() => '?').join(',')})`,
          packageIds
        );
        const packageItemIds = packageItems.map(item => item.id);
        
        // Filter custom items to only those in packages
        filteredCustomItems = customItems.filter(item => packageItemIds.includes(item.checklist_item_id));
      } else {
        // No packages assigned, show no items
        filteredCustomItems = [];
      }
    }
    
    // Get training tasks (incomplete)
    // Pending users should not see training tasks
    const Task = (await import('./Task.model.js')).default;
    const UserProgress = (await import('./UserProgress.model.js')).default;
    const TrainingTrack = (await import('./TrainingTrack.model.js')).default;
    const Module = (await import('./Module.model.js')).default;
    const CustomChecklistItem = (await import('./CustomChecklistItem.model.js')).default;
    const allTrainingTasks = isPending ? [] : await Task.findByUser(userId, { taskType: 'training' });
    
    // Filter out completed tasks, and also check if the module itself is completed
    const trainingTasks = [];
    for (const task of allTrainingTasks) {
      // Skip if task is already marked as completed or overridden
      if (task.status === 'completed' || task.status === 'overridden') {
        continue;
      }
      
      // If task has a reference_id (module ID), check if the module is completed
      if (task.reference_id) {
        try {
          const moduleProgress = await UserProgress.findByUserAndModule(userId, task.reference_id);
          // Skip if module is completed
          if (moduleProgress && moduleProgress.status === 'completed') {
            // Also mark the task as complete to keep them in sync
            try {
              await Task.markComplete(task.id, userId);
            } catch (e) {
              console.error(`Failed to mark task ${task.id} as complete:`, e);
            }
            continue;
          }
        } catch (e) {
          // If we can't check progress, include the task (better to show than hide)
          console.error(`Failed to check module progress for task ${task.id}:`, e);
        }
      }
      
      // Include task if it's pending or in_progress
      if (task.status === 'pending' || task.status === 'in_progress') {
        trainingTasks.push(task);
      }
    }
    
    // Get document tasks (unsigned/overdue)
    // For pending users, only show offer-related documents (filtered by package assignment)
    const allDocumentTasks = await Task.findByUser(userId, { taskType: 'document' });
    let documentTasks = allDocumentTasks.filter(task => 
      task.status === 'pending' || task.status === 'in_progress'
    );
    
    // For pending users, filter documents to only those from assigned packages
    if (isPending && userPackages && userPackages.length > 0) {
      const packageIds = userPackages.map(p => p.id);
      // Get document templates from packages
      const [packageDocs] = await pool.execute(
        `SELECT DISTINCT dt.id 
         FROM document_templates dt
         INNER JOIN onboarding_package_documents opd ON dt.id = opd.document_template_id
         WHERE opd.package_id IN (${packageIds.map(() => '?').join(',')})`,
        packageIds
      );
      const packageDocIds = packageDocs.map(doc => doc.id);
      
      // Filter document tasks to only those from package documents
      documentTasks = documentTasks.filter(task => {
        // Check if task references a document template in the packages
        return task.reference_id && packageDocIds.includes(task.reference_id);
      });
    }
    
    // Group checklist items by training focus/module
    const standaloneItems = [];
    const trainingFocusGroups = new Map(); // { trainingFocusId: { focusInfo, modules: { moduleId: { moduleInfo, checklistItems: [] } } } }

    for (const item of filteredCustomItems) {
      // Get the full checklist item details including nesting info
      const checklistItem = await CustomChecklistItem.findById(item.checklist_item_id);
      
      if (!checklistItem) continue;
      
      const itemData = {
        type: 'custom',
        id: item.id,
        checklist_item_id: item.checklist_item_id,
        title: item.item_label,
        description: item.description,
        is_completed: item.is_completed,
        completed_at: item.completed_at,
        agency_id: item.agency_id
      };
      
      if (checklistItem.module_id) {
        // Nested under module
        const module = await Module.findById(checklistItem.module_id);
        if (!module) {
          standaloneItems.push(itemData);
          continue;
        }
        
        const trackId = module.track_id;
        if (!trackId) {
          standaloneItems.push(itemData);
          continue;
        }
        
        if (!trainingFocusGroups.has(trackId)) {
          const track = await TrainingTrack.findById(trackId);
          trainingFocusGroups.set(trackId, {
            trainingFocusId: trackId,
            trainingFocusName: track?.name || `Training Focus ${trackId}`,
            modules: new Map()
          });
        }
        
        const focusGroup = trainingFocusGroups.get(trackId);
        if (!focusGroup.modules.has(module.id)) {
          focusGroup.modules.set(module.id, {
            moduleId: module.id,
            moduleTitle: module.title,
            checklistItems: []
          });
        }
        
        focusGroup.modules.get(module.id).checklistItems.push(itemData);
      } else if (checklistItem.training_focus_id) {
        // Nested under training focus only
        const trackId = checklistItem.training_focus_id;
        
        if (!trainingFocusGroups.has(trackId)) {
          const track = await TrainingTrack.findById(trackId);
          trainingFocusGroups.set(trackId, {
            trainingFocusId: trackId,
            trainingFocusName: track?.name || `Training Focus ${trackId}`,
            modules: new Map()
          });
        }
        
        const focusGroup = trainingFocusGroups.get(trackId);
        // Add to a special "focus-level" module group
        if (!focusGroup.modules.has(0)) {
          focusGroup.modules.set(0, {
            moduleId: 0,
            moduleTitle: null,
            checklistItems: []
          });
        }
        
        focusGroup.modules.get(0).checklistItems.push(itemData);
      } else {
        // Standalone item
        standaloneItems.push(itemData);
      }
    }
    
    // Convert Map structures to arrays
    const trainingFocusesWithItems = Array.from(trainingFocusGroups.values()).map(focusGroup => ({
      trainingFocusId: focusGroup.trainingFocusId,
      trainingFocusName: focusGroup.trainingFocusName,
      modules: Array.from(focusGroup.modules.values()).map(moduleGroup => ({
        moduleId: moduleGroup.moduleId,
        moduleTitle: moduleGroup.moduleTitle,
        checklistItems: moduleGroup.checklistItems
      }))
    }));
    
    // Count incomplete items
    const incompleteCustom = filteredCustomItems.filter((item) => !item.is_completed).length;
    const incompleteTraining = trainingTasks.length;
    const incompleteDocuments = documentTasks.length;
    
    return {
      customItems: standaloneItems,
      trainingFocusesWithItems: trainingFocusesWithItems,
      trainingItems: trainingTasks.map(task => ({
        type: 'training',
        id: task.id,
        title: task.title || `Training Module`,
        description: task.description,
        is_completed: false,
        task_id: task.id,
        agency_id: task.assigned_to_agency_id
      })),
      documentItems: documentTasks.map(task => ({
        type: 'document',
        id: task.id,
        title: task.title || `Document`,
        description: task.description,
        is_completed: false,
        task_id: task.id,
        due_date: task.due_date,
        document_action_type: task.document_action_type,
        agency_id: task.assigned_to_agency_id
      })),
      counts: {
        custom: incompleteCustom,
        training: incompleteTraining,
        documents: incompleteDocuments,
        total: incompleteCustom + incompleteTraining + incompleteDocuments
      }
    };
  }
}

export default UserChecklistAssignment;

