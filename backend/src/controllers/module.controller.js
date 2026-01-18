import Module from '../models/Module.model.js';
import ModuleCopyService from '../services/moduleCopy.service.js';
import User from '../models/User.model.js';
import TaskAssignmentService from '../services/taskAssignment.service.js';
import { validationResult } from 'express-validator';

export const getAllModules = async (req, res, next) => {
  try {
    // Check if user is pending - pending end-users cannot access modules
    // IMPORTANT: Admin/support/super_admin must be able to manage modules even if their
    // status is legacy 'pending' (older data) or during setup workflows.
    const user = await User.findById(req.user.id);
    const isPrivileged = req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support';
    if (user && user.status === 'pending' && !isPrivileged) {
      return res.status(403).json({ 
        error: { message: 'Training modules are not available during the pre-hire process.' } 
      });
    }
    
    const includeInactive = req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support';
    const filters = {};
    
    // Super Admin sees all modules
    if (req.user.role === 'super_admin') {
      const modules = await Module.findAll(includeInactive, filters);
      return res.json(modules);
    }
    
    // Agency Admin and Support see shared modules + their agency's modules
    if (req.user.role === 'admin' || req.user.role === 'support') {
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      // Get shared modules (platform-level)
      const sharedModules = await Module.findShared();
      
      // Get modules for user's agencies
      const agencyModules = [];
      for (const agencyId of agencyIds) {
        const modules = await Module.findByAgency(agencyId, includeInactive);
        agencyModules.push(...modules);
      }
      
      // Combine and deduplicate
      const allModules = [...sharedModules, ...agencyModules];
      const uniqueModules = Array.from(new Map(allModules.map(m => [m.id, m])).values());
      
      return res.json(uniqueModules);
    }
    
    // Regular users see only assigned modules (handled by module assignments)
    const modules = await Module.findAll(includeInactive, filters);
    res.json(modules);
  } catch (error) {
    next(error);
  }
};

export const getModuleById = async (req, res, next) => {
  try {
    // Check if user is pending - pending end-users cannot access modules
    const user = await User.findById(req.user.id);
    const isPrivileged = req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support';
    if (user && user.status === 'pending' && !isPrivileged) {
      return res.status(403).json({ 
        error: { message: 'Training modules are not available during the pre-hire process.' } 
      });
    }
    
    const { id } = req.params;
    const module = await Module.findById(id);
    
    if (!module) {
      return res.status(404).json({ error: { message: 'Module not found' } });
    }

    // Non-admins/super_admins can only see active modules
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support' && !module.is_active) {
      return res.status(403).json({ error: { message: 'Module not available' } });
    }

    res.json(module);
  } catch (error) {
    next(error);
  }
};

export const createModule = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { 
      title, 
      description, 
      orderIndex, 
      isActive, 
      agencyId, 
      trackId,
      isAlwaysAccessible,
      isPublic,
      isStandalone,
      standaloneCategory,
      estimatedTimeMinutes,
      iconId
    } = req.body;
    
    // Agency Admin/Support can only create modules for their agencies
    if ((req.user.role === 'admin' || req.user.role === 'support') && agencyId) {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only create modules for your agencies' } });
      }
    }
    
    const module = await Module.create({ 
      title, 
      description, 
      orderIndex, 
      isActive,
      agencyId: agencyId || null,
      trackId: trackId || null,
      isShared: false,
      createdByUserId: req.user.id,
      isAlwaysAccessible: isAlwaysAccessible || false,
      isPublic: isPublic || false,
      isStandalone: isStandalone || false,
      standaloneCategory: standaloneCategory || null,
      estimatedTimeMinutes: estimatedTimeMinutes === '' ? null : estimatedTimeMinutes,
      iconId: iconId || null
    });
    res.status(201).json(module);
  } catch (error) {
    next(error);
  }
};

export const createSharedModule = async (req, res, next) => {
  try {
    // Only Super Admin can create shared modules
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { title, description, orderIndex, isActive } = req.body;
    
    // Shared modules are platform-level (agency_id=NULL, is_shared=true)
    const module = await Module.create({ 
      title, 
      description, 
      orderIndex, 
      isActive,
      agencyId: null,
      programId: null,
      isShared: true,
      createdByUserId: req.user.id
    });
    
    res.status(201).json(module);
  } catch (error) {
    next(error);
  }
};

export const getSharedModules = async (req, res, next) => {
  try {
    const includeInactive = req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support';
    const modules = await Module.findShared();
    res.json(modules);
  } catch (error) {
    next(error);
  }
};

export const copyModule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetAgencyId, targetTrackId } = req.body;
    
    // Super Admin can copy to any agency
    // Agency Admin can copy to their agencies only
    if (req.user.role === 'admin' && targetAgencyId) {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(targetAgencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only copy modules to your agencies' } });
      }
    }
    
    const newModule = await ModuleCopyService.copyModule(
      parseInt(id),
      targetAgencyId ? parseInt(targetAgencyId) : null,
      targetTrackId ? parseInt(targetTrackId) : null,
      req.user.id
    );
    
    res.status(201).json(newModule);
  } catch (error) {
    next(error);
  }
};

export const getCopyPreview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetAgencyId, targetTrackId } = req.query;
    
    const preview = await ModuleCopyService.getSubstitutionPreview(
      parseInt(id),
      targetAgencyId ? parseInt(targetAgencyId) : null,
      targetTrackId ? parseInt(targetTrackId) : null
    );
    
    res.json(preview);
  } catch (error) {
    next(error);
  }
};

export const updateModule = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const existingModule = await Module.findById(id);
    
    if (!existingModule) {
      return res.status(404).json({ error: { message: 'Module not found' } });
    }
    
    if (req.user.role === 'admin' || req.user.role === 'support') {
      // Agency Admin/Support can only edit their agency's modules or shared modules
      if (existingModule.agency_id) {
        const userAgencies = await User.getAgencies(req.user.id);
        const hasAccess = userAgencies.some(a => a.id === existingModule.agency_id);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'You can only edit modules for your agencies' } });
        }
      } else if (existingModule.is_shared) {
        // Agency Admins cannot edit shared modules
        return res.status(403).json({ error: { message: 'Only super admins can edit shared modules' } });
      }
    }

    const { 
      title, 
      description, 
      orderIndex, 
      isActive, 
      agencyId, 
      trackId,
      isAlwaysAccessible,
      isPublic,
      isStandalone,
      standaloneCategory,
      estimatedTimeMinutes,
      iconId
    } = req.body;
    
    const module = await Module.update(id, { 
      title, 
      description, 
      orderIndex, 
      isActive,
      agencyId,
      trackId,
      isAlwaysAccessible,
      isPublic,
      isStandalone,
      standaloneCategory,
      estimatedTimeMinutes: estimatedTimeMinutes === '' ? null : estimatedTimeMinutes,
      iconId
    });
    
    if (!module) {
      return res.status(404).json({ error: { message: 'Module not found' } });
    }

    res.json(module);
  } catch (error) {
    next(error);
  }
};

export const archiveModule = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get user's agency ID (use first agency for admins, null for super_admin)
    let archivedByAgencyId = null;
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        archivedByAgencyId = userAgencies[0].id;
      }
    }
    
    const archived = await Module.archive(id, req.user.id, archivedByAgencyId);
    
    if (!archived) {
      return res.status(404).json({ error: { message: 'Module not found' } });
    }

    res.json({ message: 'Module archived successfully' });
  } catch (error) {
    next(error);
  }
};

export const restoreModule = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
    }
    
    const restored = await Module.restore(id, userAgencyIds);
    
    if (!restored) {
      return res.status(404).json({ error: { message: 'Module not found, not archived, or you do not have permission to restore it' } });
    }

    res.json({ message: 'Module restored successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteModule = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
    }
    
    const deleted = await Module.delete(id, userAgencyIds);
    
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Module not found, not archived, or you do not have permission to delete it' } });
    }

    res.json({ message: 'Module permanently deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getArchivedModules = async (req, res, next) => {
  try {
    // Get selected agency ID from query params (if user selected a specific agency)
    const selectedAgencyId = req.query.archivedByAgencyId ? parseInt(req.query.archivedByAgencyId) : null;
    
    // Get user's agency IDs for filtering
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
      
      // If a specific agency is selected, verify user has access to it
      if (selectedAgencyId && !userAgencyIds.includes(selectedAgencyId)) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }
    
    // If a specific agency is selected, filter by that agency only
    // Otherwise, filter by all user's agencies (or all for super_admin)
    const filterAgencyIds = selectedAgencyId ? [selectedAgencyId] : (req.user.role === 'super_admin' ? null : userAgencyIds);
    
    const modules = await Module.findAllArchived({ 
      agencyIds: filterAgencyIds,
      userRole: req.user.role
    });
    
    // Fetch archived_by_user_name for each module
    const pool = (await import('../config/database.js')).default;
    const modulesWithNames = await Promise.all(modules.map(async (module) => {
      if (module.archived_by_user_id) {
        try {
          const [users] = await pool.execute(
            'SELECT first_name, last_name FROM users WHERE id = ?',
            [module.archived_by_user_id]
          );
          if (users.length > 0) {
            module.archived_by_user_name = `${users[0].first_name} ${users[0].last_name}`;
          }
        } catch (err) {
          console.error('Error fetching archived_by_user_name:', err);
        }
      }
      return module;
    }));
    
    res.json(modulesWithNames);
  } catch (error) {
    next(error);
  }
};

export const assignModuleToUsers = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { userIds, agencyId, role, dueDate, title, description } = req.body;
    const assignedByUserId = req.user.id;

    // Verify module exists
    const module = await Module.findById(id);
    if (!module) {
      return res.status(404).json({ error: { message: 'Module not found' } });
    }

    const tasks = [];
    const taskData = {
      title: title || `Complete ${module.title}`,
      description: description || module.description || 'Please complete this training module.',
      referenceId: parseInt(id),
      assignedByUserId,
      dueDate: dueDate || null
    };

    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      // Assign to individual users
      for (const userId of userIds) {
        const task = await TaskAssignmentService.assignTrainingTask({
          ...taskData,
          assignedToUserId: parseInt(userId)
        });
        tasks.push(task);
      }
    } else if (role && agencyId) {
      // Bulk assign to role in agency
      const bulkTasks = await TaskAssignmentService.bulkAssignToRole(
        {
          taskType: 'training',
          ...taskData
        },
        role,
        parseInt(agencyId)
      );
      tasks.push(...bulkTasks);
    } else if (agencyId) {
      // Bulk assign to agency
      const bulkTasks = await TaskAssignmentService.bulkAssignToAgency(
        {
          taskType: 'training',
          ...taskData
        },
        parseInt(agencyId)
      );
      tasks.push(...bulkTasks);
    } else {
      return res.status(400).json({ error: { message: 'Either userIds, role+agencyId, or agencyId must be provided' } });
    }

    res.status(201).json({
      message: 'Module assigned successfully',
      tasksCreated: tasks.length,
      tasks
    });
  } catch (error) {
    next(error);
  }
};

