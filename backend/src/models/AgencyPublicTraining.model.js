import pool from '../config/database.js';

class AgencyPublicTraining {
  static async assignTrainingFocus(agencyId, trainingFocusId, createdByUserId) {
    try {
      const [result] = await pool.execute(
        `INSERT INTO agency_public_training_focuses 
         (agency_id, training_focus_id, created_by_user_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE created_by_user_id = ?`,
        [agencyId, trainingFocusId, createdByUserId, createdByUserId]
      );
      return this.getTrainingFocusAssignment(agencyId, trainingFocusId);
    } catch (error) {
      console.error('Error in assignTrainingFocus model:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState,
        errno: error.errno,
        agencyId,
        trainingFocusId,
        createdByUserId
      });
      // If foreign key constraint fails, return null
      if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        return null;
      }
      throw error;
    }
  }

  static async assignModule(agencyId, moduleId, createdByUserId) {
    try {
      const [result] = await pool.execute(
        `INSERT INTO agency_public_modules 
         (agency_id, module_id, created_by_user_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE created_by_user_id = ?`,
        [agencyId, moduleId, createdByUserId, createdByUserId]
      );
      return this.getModuleAssignment(agencyId, moduleId);
    } catch (error) {
      // If foreign key constraint fails, return null
      if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        return null;
      }
      throw error;
    }
  }

  static async getTrainingFocusAssignment(agencyId, trainingFocusId) {
    try {
      const [rows] = await pool.execute(
        `SELECT aptf.*, tt.name as training_focus_name, tt.description as training_focus_description
         FROM agency_public_training_focuses aptf
         INNER JOIN training_tracks tt ON aptf.training_focus_id = tt.id
         WHERE aptf.agency_id = ? AND aptf.training_focus_id = ?`,
        [agencyId, trainingFocusId]
      );
      return rows[0] || null;
    } catch (error) {
      console.error('Error in getTrainingFocusAssignment:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        agencyId,
        trainingFocusId
      });
      throw error;
    }
  }

  static async getModuleAssignment(agencyId, moduleId) {
    const [rows] = await pool.execute(
      `SELECT apm.*, m.title as module_title, m.description as module_description
       FROM agency_public_modules apm
       JOIN modules m ON apm.module_id = m.id
       WHERE apm.agency_id = ? AND apm.module_id = ?`,
      [agencyId, moduleId]
    );
    return rows[0] || null;
  }

  static async getPublicTrainingFocuses(agencyId) {
    const [rows] = await pool.execute(
      `SELECT aptf.*, tt.name as training_focus_name, tt.description as training_focus_description,
              tt.is_active, tt.order_index
       FROM agency_public_training_focuses aptf
       JOIN training_tracks tt ON aptf.training_focus_id = tt.id
       WHERE aptf.agency_id = ? AND (tt.is_active = 1 OR tt.is_active = TRUE)
       ORDER BY tt.order_index ASC, tt.name ASC`,
      [agencyId]
    );
    return rows;
  }

  static async getPublicModules(agencyId) {
    // Check if estimated_time_minutes column exists
    let modulesQuery = `SELECT apm.*, m.title as module_title, m.description as module_description,
              m.is_active, m.order_index`;
    
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND COLUMN_NAME = 'estimated_time_minutes'"
      );
      if (columns.length > 0) {
        modulesQuery += ', m.estimated_time_minutes';
      }
    } catch (e) {
      // Column doesn't exist, continue without it
    }
    
    modulesQuery += ` FROM agency_public_modules apm
       JOIN modules m ON apm.module_id = m.id
       WHERE apm.agency_id = ? AND (m.is_active = 1 OR m.is_active = TRUE)
       ORDER BY m.order_index ASC, m.title ASC`;
    
    const [rows] = await pool.execute(modulesQuery, [agencyId]);
    return rows;
  }

  static async getAllPublicTrainings(agencyId) {
    try {
      // Check if tables exist first
      const [tables] = await pool.execute(
        `SELECT TABLE_NAME FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME IN ('agency_public_training_focuses', 'agency_public_modules')`
      );
      
      const tableNames = tables.map(t => t.TABLE_NAME);
      const hasTrainingFocusesTable = tableNames.includes('agency_public_training_focuses');
      const hasModulesTable = tableNames.includes('agency_public_modules');
      
      let trainingFocuses = [];
      if (hasTrainingFocusesTable) {
        try {
          const [rows] = await pool.execute(
            `SELECT aptf.*, tt.name as training_focus_name, tt.description as training_focus_description,
                    tt.is_active, tt.order_index
             FROM agency_public_training_focuses aptf
             INNER JOIN training_tracks tt ON aptf.training_focus_id = tt.id
             WHERE aptf.agency_id = ?
             ORDER BY tt.order_index ASC, tt.name ASC`,
            [agencyId]
          );
          trainingFocuses = rows;
        } catch (err) {
          console.error('Error fetching training focuses:', err);
          trainingFocuses = [];
        }
      }

      // Try to get modules - handle case where estimated_time_minutes might not exist
      let modules = [];
      if (hasModulesTable) {
        try {
          // First try with estimated_time_minutes
          const [moduleRows] = await pool.execute(
            `SELECT apm.*, m.title as module_title, m.description as module_description,
                    m.is_active, m.order_index, m.estimated_time_minutes
             FROM agency_public_modules apm
             INNER JOIN modules m ON apm.module_id = m.id
             WHERE apm.agency_id = ?
             ORDER BY m.order_index ASC, m.title ASC`,
            [agencyId]
          );
          modules = moduleRows;
        } catch (err) {
          // If estimated_time_minutes column doesn't exist, try without it
          if (err.code === 'ER_BAD_FIELD_ERROR' || err.message?.includes('estimated_time_minutes')) {
            try {
              const [moduleRows] = await pool.execute(
                `SELECT apm.*, m.title as module_title, m.description as module_description,
                        m.is_active, m.order_index
                 FROM agency_public_modules apm
                 INNER JOIN modules m ON apm.module_id = m.id
                 WHERE apm.agency_id = ?
                 ORDER BY m.order_index ASC, m.title ASC`,
                [agencyId]
              );
              modules = moduleRows;
            } catch (retryErr) {
              console.error('Error fetching modules (retry):', retryErr);
              modules = [];
            }
          } else {
            // Log error but don't throw - return empty array instead
            console.error('Error fetching modules:', err);
            modules = [];
          }
        }
      }

      return {
        trainingFocuses,
        modules
      };
    } catch (error) {
      console.error('Error in getAllPublicTrainings:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState,
        errno: error.errno,
        agencyId: agencyId,
        stack: error.stack
      });
      throw error;
    }
  }

  static async removeTrainingFocus(agencyId, trainingFocusId) {
    const [result] = await pool.execute(
      'DELETE FROM agency_public_training_focuses WHERE agency_id = ? AND training_focus_id = ?',
      [agencyId, trainingFocusId]
    );
    return result.affectedRows > 0;
  }

  static async removeModule(agencyId, moduleId) {
    const [result] = await pool.execute(
      'DELETE FROM agency_public_modules WHERE agency_id = ? AND module_id = ?',
      [agencyId, moduleId]
    );
    return result.affectedRows > 0;
  }

  static async removeTrainingFocusById(id) {
    const [result] = await pool.execute(
      'DELETE FROM agency_public_training_focuses WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async removeModuleById(id) {
    const [result] = await pool.execute(
      'DELETE FROM agency_public_modules WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async isTrainingFocusPublic(agencyId, trainingFocusId) {
    const [rows] = await pool.execute(
      'SELECT 1 FROM agency_public_training_focuses WHERE agency_id = ? AND training_focus_id = ?',
      [agencyId, trainingFocusId]
    );
    return rows.length > 0;
  }

  static async isModulePublic(agencyId, moduleId) {
    const [rows] = await pool.execute(
      'SELECT 1 FROM agency_public_modules WHERE agency_id = ? AND module_id = ?',
      [agencyId, moduleId]
    );
    return rows.length > 0;
  }
}

export default AgencyPublicTraining;

