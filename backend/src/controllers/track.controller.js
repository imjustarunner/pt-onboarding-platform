import TrainingTrack from '../models/TrainingTrack.model.js';
import TrackCopyService from '../services/trackCopy.service.js';
import User from '../models/User.model.js';
import UserTrack from '../models/UserTrack.model.js';
import ProgressCalculationService from '../services/progressCalculation.service.js';
import { validationResult } from 'express-validator';

export const getAllTracks = async (req, res, next) => {
  try {
    // For non-super_admin users, filter by their agencies
    let tracks;
    if (req.user.role === 'super_admin') {
      // Super admins see all training focuses
      const filters = {
        agencyId: req.query.agencyId ? parseInt(req.query.agencyId) : undefined,
        assignmentLevel: req.query.assignmentLevel,
        role: req.query.role,
        isTemplate: req.query.isTemplate !== undefined ? req.query.isTemplate === 'true' : undefined,
        includeInactive: true
      };
      tracks = await TrainingTrack.findAll(filters);
    } else {
      // Admin and support users only see training focuses from their agencies + platform templates
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      // Check if a specific agencyId was requested in query
      const requestedAgencyId = req.query.agencyId ? parseInt(req.query.agencyId) : undefined;
      
      // If a specific agency is requested, verify the user has access to it
      if (requestedAgencyId !== undefined && requestedAgencyId !== null) {
        if (agencyIds.length === 0 || !agencyIds.includes(requestedAgencyId)) {
          // User doesn't have access to the requested agency
          return res.json([]);
        }
        // User has access, filter to that specific agency
        const filters = {
          agencyId: requestedAgencyId,
          assignmentLevel: req.query.assignmentLevel,
          role: req.query.role,
          isTemplate: req.query.isTemplate !== undefined ? req.query.isTemplate === 'true' : undefined,
          includeInactive: true,
          includeArchived: false
        };
        tracks = await TrainingTrack.findAll(filters);
      } else if (requestedAgencyId === null) {
        // Platform templates requested (agencyId=null)
        const filters = {
          agencyId: null,
          assignmentLevel: req.query.assignmentLevel,
          role: req.query.role,
          isTemplate: req.query.isTemplate !== undefined ? req.query.isTemplate === 'true' : undefined,
          includeInactive: true,
          includeArchived: false
        };
        tracks = await TrainingTrack.findAll(filters);
      } else {
        // No specific agency requested - show user's agencies + platform templates
        if (agencyIds.length === 0) {
          // User has no agencies, only show platform templates
          const filters = {
            agencyId: null, // Platform templates only
            assignmentLevel: req.query.assignmentLevel,
            role: req.query.role,
            isTemplate: req.query.isTemplate !== undefined ? req.query.isTemplate === 'true' : undefined,
            includeInactive: true,
            includeArchived: false
          };
          tracks = await TrainingTrack.findAll(filters);
        } else {
          // Get training focuses for user's agencies + platform templates
          // We need to get both agency-specific and platform templates
          const pool = (await import('../config/database.js')).default;
          
          // Check if icon_id column exists
          let hasIconColumn = false;
          try {
            const [columns] = await pool.execute(
              "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training_tracks' AND COLUMN_NAME = 'icon_id'"
            );
            hasIconColumn = columns.length > 0;
          } catch (err) {
            console.error('Error checking for icon_id column:', err);
          }
          
          // Build query to get training focuses from user's agencies OR platform templates (agency_id IS NULL)
          let query;
          if (hasIconColumn) {
            query = `
              SELECT DISTINCT tt.*, i.file_path as icon_file_path, i.name as icon_name
              FROM training_tracks tt
              LEFT JOIN icons i ON tt.icon_id = i.id
              WHERE (tt.agency_id IN (${agencyIds.map(() => '?').join(',')}) OR tt.agency_id IS NULL)
            `;
          } else {
            query = `
              SELECT DISTINCT tt.*
              FROM training_tracks tt
              WHERE (tt.agency_id IN (${agencyIds.map(() => '?').join(',')}) OR tt.agency_id IS NULL)
            `;
          }
          const params = [...agencyIds];
          
          // Exclude archived
          query += ' AND (tt.is_archived = FALSE OR tt.is_archived IS NULL)';
          
          // Apply additional filters
          if (req.query.assignmentLevel) {
            query += ' AND tt.assignment_level = ?';
            params.push(req.query.assignmentLevel);
          }
          if (req.query.role) {
            query += ' AND tt.role = ?';
            params.push(req.query.role);
          }
          if (req.query.isTemplate !== undefined) {
            query += ' AND tt.is_template = ?';
            params.push(req.query.isTemplate === 'true' ? 1 : 0);
          }
          
          // Include inactive for admins (no filter needed, we'll include all)
          
          query += ' ORDER BY tt.order_index ASC, tt.name ASC';
          
          const [rows] = await pool.execute(query, params);
          
          // Set icon fields if column doesn't exist
          if (!hasIconColumn) {
            rows.forEach(row => {
              row.icon_id = null;
              row.icon_file_path = null;
              row.icon_name = null;
            });
          }
          
          tracks = rows;
        }
      }
    }
    
    res.json(tracks);
  } catch (error) {
    next(error);
  }
};

export const getTrackById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const track = await TrainingTrack.findById(id);
    
    if (!track) {
      return res.status(404).json({ error: { message: 'Training Focus not found' } });
    }

    // Get modules in this training focus
    const modules = await TrainingTrack.getModules(id);
    track.modules = modules;

    res.json(track);
  } catch (error) {
    next(error);
  }
};

export const createTrack = async (req, res, next) => {
  try {
    // Support users cannot create training focuses
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot create training focuses' } });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { name, description, orderIndex, assignmentLevel, agencyId, role, isActive, isTemplate, iconId } = req.body;
    const track = await TrainingTrack.create({ 
      name, 
      description, 
      orderIndex, 
      assignmentLevel, 
      agencyId, 
      role, 
      isActive,
      isTemplate: isTemplate || false, // Default to false if not provided
      iconId: iconId || null
    });
    res.status(201).json(track);
  } catch (error) {
    next(error);
  }
};

export const updateTrack = async (req, res, next) => {
  try {
    // Support users cannot edit training focuses
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot edit training focuses' } });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { name, description, orderIndex, assignmentLevel, agencyId, role, isActive, iconId, cascadeDeactivateModules } = req.body;
    
    // Get current track state to check if we're deactivating
    const currentTrack = await TrainingTrack.findById(id);
    if (!currentTrack) {
      return res.status(404).json({ error: { message: 'Training Focus not found' } });
    }
    
    // If deactivating and cascade is requested, deactivate all associated modules
    // Check if currently active (MySQL returns 1/0, so check for both true and 1)
    const isCurrentlyActive = currentTrack.is_active === true || currentTrack.is_active === 1;
    if (isActive === false && cascadeDeactivateModules && isCurrentlyActive) {
      const Module = (await import('../models/Module.model.js')).default;
      const modules = await TrainingTrack.getModules(id);
      
      // Deactivate all modules in this training focus
      for (const module of modules) {
        await Module.update(module.id, { isActive: false });
      }
    }
    
    const track = await TrainingTrack.update(id, { name, description, orderIndex, assignmentLevel, agencyId, role, isActive, iconId });
    if (!track) {
      return res.status(404).json({ error: { message: 'Training Focus not found' } });
    }

    res.json(track);
  } catch (error) {
    next(error);
  }
};

export const addModuleToTrack = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { moduleId, orderIndex } = req.body;
    
    await TrainingTrack.addModule(id, moduleId, orderIndex);
    const track = await TrainingTrack.findById(id);
    const modules = await TrainingTrack.getModules(id);
    track.modules = modules;
    
    res.json(track);
  } catch (error) {
    next(error);
  }
};

export const removeModuleFromTrack = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { moduleId } = req.body;
    
    await TrainingTrack.removeModule(id, moduleId);
    res.json({ message: 'Module removed from training focus' });
  } catch (error) {
    next(error);
  }
};

export const archiveTrack = async (req, res, next) => {
  try {
    // Support users cannot archive training focuses
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot archive training focuses' } });
    }
    
    const { id } = req.params;
    
    // Get user's agency ID (use first agency for admins, null for super_admin)
    let archivedByAgencyId = null;
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        archivedByAgencyId = userAgencies[0].id;
      }
    }
    
    const archived = await TrainingTrack.archive(id, req.user.id, archivedByAgencyId);
    
    if (!archived) {
      return res.status(404).json({ error: { message: 'Training Focus not found' } });
    }

    res.json({ message: 'Training Focus archived successfully' });
  } catch (error) {
    next(error);
  }
};

export const restoreTrack = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
    }
    
    const restored = await TrainingTrack.restore(id, userAgencyIds);
    
    if (!restored) {
      return res.status(404).json({ error: { message: 'Training Focus not found, not archived, or you do not have permission to restore it' } });
    }

    res.json({ message: 'Training Focus restored successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteTrack = async (req, res, next) => {
  try {
    // Support users cannot delete training focuses
    if (req.user.role === 'support') {
      return res.status(403).json({ error: { message: 'Support users cannot delete training focuses' } });
    }
    
    const { id } = req.params;
    
    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
    }
    
    const deleted = await TrainingTrack.delete(id, userAgencyIds);
    
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Training Focus not found, not archived, or you do not have permission to delete it' } });
    }

    res.json({ message: 'Training Focus permanently deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getArchivedTracks = async (req, res, next) => {
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
    
    const tracks = await TrainingTrack.findAllArchived({ 
      agencyIds: filterAgencyIds,
      userRole: req.user.role
    });
    
    // Fetch archived_by_user_name for each track
    const pool = (await import('../config/database.js')).default;
    const tracksWithNames = await Promise.all(tracks.map(async (track) => {
      if (track.archived_by_user_id) {
        try {
          const [users] = await pool.execute(
            'SELECT first_name, last_name FROM users WHERE id = ?',
            [track.archived_by_user_id]
          );
          if (users.length > 0) {
            track.archived_by_user_name = `${users[0].first_name} ${users[0].last_name}`;
          }
        } catch (err) {
          console.error('Error fetching archived_by_user_name:', err);
        }
      }
      return track;
    }));
    
    res.json(tracksWithNames);
  } catch (error) {
    next(error);
  }
};

export const duplicateTrack = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newTrackName, targetAgencyId } = req.body;
    
    const sourceTrack = await TrainingTrack.findById(id);
    if (!sourceTrack) {
      return res.status(404).json({ error: { message: 'Source training focus not found' } });
    }
    
    // Determine target agency
    const finalAgencyId = targetAgencyId || sourceTrack.agency_id;
    
    // Agency Admin can only duplicate within their agencies
    if (req.user.role === 'admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(finalAgencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only duplicate training focuses within your agencies' } });
      }
      
      // Agency Admin can only duplicate within same agency
      if (sourceTrack.agency_id !== parseInt(finalAgencyId)) {
        return res.status(403).json({ error: { message: 'Agency Admins can only duplicate training focuses within the same agency' } });
      }
    }
    
    const newTrack = await TrackCopyService.duplicateTrack(
      parseInt(id),
      parseInt(finalAgencyId),
      newTrackName,
      req.user.id
    );
    
    res.status(201).json(newTrack);
  } catch (error) {
    next(error);
  }
};

export const copyTrackToAgency = async (req, res, next) => {
  try {
    // Only Super Admin can copy tracks between agencies
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    
    const { id } = req.params;
    const { targetAgencyId, newTrackName } = req.body;
    
    if (!targetAgencyId) {
      return res.status(400).json({ error: { message: 'Target agency ID is required' } });
    }
    
    const newTrack = await TrackCopyService.copyTrackToAgency(
      parseInt(id),
      parseInt(targetAgencyId),
      newTrackName,
      req.user.id
    );
    
    res.status(201).json(newTrack);
  } catch (error) {
    next(error);
  }
};

export const getTrackTemplates = async (req, res, next) => {
  try {
    // Only Super Admin can see templates
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    
    // Return ALL training focuses (both platform templates and agency-specific)
    // This includes:
    // - Platform templates (agency_id IS NULL)
    // - Agency-specific training focuses (agency_id IS NOT NULL)
    // Include archived ones in the count
    const tracks = await TrainingTrack.findAll({ 
      includeInactive: true,
      agencyId: undefined, // Don't filter by agency - get all
      includeArchived: true // Include archived training focuses in the count
    });
    
    res.json(tracks);
  } catch (error) {
    next(error);
  }
};

export const createTrackTemplate = async (req, res, next) => {
  try {
    // Only Super Admin can create templates
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { name, description, orderIndex, role } = req.body;
    
    // Templates are platform-level (agency_id=NULL, is_template=true)
    const track = await TrainingTrack.create({ 
      name, 
      description, 
      orderIndex, 
      assignmentLevel: 'platform',
      agencyId: null,
      role,
      isActive: true,
      isTemplate: true
    });
    
    res.status(201).json(track);
  } catch (error) {
    next(error);
  }
};

export const getTrackCopyPreview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetAgencyId } = req.query;
    
    const preview = await TrackCopyService.getTrackCopyPreview(
      parseInt(id),
      targetAgencyId ? parseInt(targetAgencyId) : null
    );
    
    res.json(preview);
  } catch (error) {
    next(error);
  }
};

// Get all modules in a Training Focus
export const getTrainingFocusModules = async (req, res, next) => {
  try {
    const { id } = req.params;
    const modules = await TrainingTrack.getModules(id);
    res.json(modules);
  } catch (error) {
    next(error);
  }
};

// Assign Training Focus to user(s) at agency
export const assignTrainingFocus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { userIds, agencyId, dueDate } = req.body;
    const assignedByUserId = req.user.id;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: { message: 'User IDs array is required' } });
    }

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    // Verify training focus exists
    const trainingFocus = await TrainingTrack.findById(id);
    if (!trainingFocus) {
      return res.status(404).json({ error: { message: 'Training Focus not found' } });
    }

    // Get all modules in the training focus
    const modules = await TrainingTrack.getModules(id);

    // Import required services
    const TaskAssignmentService = (await import('../services/taskAssignment.service.js')).default;
    const Module = (await import('../models/Module.model.js')).default;
    const UserChecklistAssignment = (await import('../models/UserChecklistAssignment.model.js')).default;
    const CustomChecklistItem = (await import('../models/CustomChecklistItem.model.js')).default;

    // Assign training focus to each user
    const assignments = [];
    let totalTasksCreated = 0;
    
    for (const userId of userIds) {
      // Assign the training focus (creates user_tracks entry)
      await UserTrack.assignUserToTrack(userId, parseInt(id), parseInt(agencyId), assignedByUserId);
      
      // Create tasks for all modules in the training focus
      const moduleTasks = [];
      for (const module of modules) {
        try {
          const moduleData = await Module.findById(module.id);
          if (moduleData) {
            const task = await TaskAssignmentService.assignTrainingTask({
              title: `Complete ${moduleData.title}`,
              description: moduleData.description || 'Please complete this training module.',
              referenceId: module.id,
              assignedByUserId,
              assignedToUserId: parseInt(userId),
              assignedToAgencyId: parseInt(agencyId),
              dueDate: dueDate || null,
              metadata: {
                trackId: parseInt(id),
                trackName: trainingFocus.name,
                moduleOrder: module.track_order || module.order_index
              }
            });
            moduleTasks.push(task);
            totalTasksCreated++;
            
            // Assign checklist items nested under this module
            const moduleChecklistItems = await CustomChecklistItem.findByModule(module.id);
            for (const checklistItem of moduleChecklistItems) {
              try {
                await UserChecklistAssignment.assignToUser(parseInt(userId), checklistItem.id, assignedByUserId);
              } catch (checklistError) {
                console.error(`Failed to assign checklist item ${checklistItem.id} for module ${module.id}:`, checklistError);
              }
            }
          }
        } catch (moduleError) {
          console.error(`Failed to create task for module ${module.id}:`, moduleError);
          // Continue with other modules even if one fails
        }
      }
      
      // Assign checklist items nested under this training focus (not under specific modules)
      const focusChecklistItems = await CustomChecklistItem.findByTrainingFocus(parseInt(id));
      for (const checklistItem of focusChecklistItems) {
        try {
          await UserChecklistAssignment.assignToUser(parseInt(userId), checklistItem.id, assignedByUserId);
        } catch (checklistError) {
          console.error(`Failed to assign checklist item ${checklistItem.id} for training focus ${id}:`, checklistError);
        }
      }
      
      assignments.push({
        userId,
        trainingFocusId: parseInt(id),
        agencyId: parseInt(agencyId),
        modulesCount: modules.length,
        tasksCreated: moduleTasks.length
      });
    }

    res.status(201).json({
      message: 'Training Focus assigned successfully',
      assignments,
      modulesAssigned: modules.length,
      totalTasksCreated
    });
  } catch (error) {
    next(error);
  }
};

// Get all training focuses assigned to a user with modules and completion status
export const getUserTrainingFocuses = async (req, res, next) => {
  try {
    // Route parameter is 'id', not 'userId'
    const userId = req.params.id;
    
    // Users can view their own focuses, admins can view any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Get all user's agencies
    const userAgencies = await User.getAgencies(parseInt(userId));
    
    const allFocuses = [];
    let incompleteModuleCount = 0;
    
    for (const agency of userAgencies) {
      // Get training focuses for this agency
      const userTracks = await UserTrack.getUserTracks(parseInt(userId), agency.id);
      
      for (const userTrack of userTracks) {
        // Get track details
        const track = await TrainingTrack.findById(userTrack.track_id);
        if (!track) continue;
        
        // Get modules in this track
        const modules = await TrainingTrack.getModules(userTrack.track_id);
        
        // Get progress for each module
        const moduleDetails = [];
        for (const module of modules) {
          const moduleProgress = await ProgressCalculationService.calculateModuleProgress(parseInt(userId), module.id);
          const quizStats = await ProgressCalculationService.getQuizStats(parseInt(userId), module.id);
          const isIncomplete = moduleProgress.status !== 'completed';
          if (isIncomplete) incompleteModuleCount++;
          
          // Get task due date for this module
          const Task = (await import('../models/Task.model.js')).default;
          const tasks = await Task.findByUser(parseInt(userId), { taskType: 'training' });
          const moduleTask = tasks.find(t => t.reference_id === module.id && t.assigned_to_agency_id === agency.id);
          
          moduleDetails.push({
            id: module.id,
            title: module.title,
            description: module.description,
            status: moduleProgress.status,
            timeSpentMinutes: moduleProgress.timeSpentMinutes,
            timeSpentSeconds: moduleProgress.timeSpentSeconds,
            completedAt: moduleProgress.completedAt,
            dueDate: moduleTask?.due_date || null,
            orderIndex: module.track_order || module.order_index,
            quizScore: quizStats.latestScore,
            quizCorrectCount: quizStats.correctCount,
            quizTotalQuestions: quizStats.totalQuestions,
            quizPassed: quizStats.passed,
            quizMinimumScore: quizStats.minimumScore
          });
        }
        
        // Calculate track completion
        const trackProgress = await ProgressCalculationService.calculateTrackProgress(
          parseInt(userId),
          userTrack.track_id,
          agency.id
        );
        
        allFocuses.push({
          id: track.id,
          name: track.name,
          description: track.description,
          agencyId: agency.id,
          agencyName: agency.name,
          completionPercent: trackProgress.completionPercent,
          status: trackProgress.status,
          modulesCompleted: trackProgress.modulesCompleted,
          modulesTotal: trackProgress.modulesTotal,
          modules: moduleDetails
        });
      }
    }
    
    res.json({
      focuses: allFocuses,
      incompleteModuleCount
    });
  } catch (error) {
    next(error);
  }
};

// Get completion percentage for a user's Training Focus
export const getTrainingFocusCompletion = async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const { agencyId } = req.query;

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    const progress = await ProgressCalculationService.calculateTrackProgress(
      parseInt(userId),
      parseInt(id),
      parseInt(agencyId)
    );

    res.json(progress);
  } catch (error) {
    next(error);
  }
};

