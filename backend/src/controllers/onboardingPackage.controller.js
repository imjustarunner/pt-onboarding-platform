import OnboardingPackage from '../models/OnboardingPackage.model.js';
import { validationResult } from 'express-validator';
import UserTrack from '../models/UserTrack.model.js';
import TaskAssignmentService from '../services/taskAssignment.service.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import Module from '../models/Module.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import pool from '../config/database.js';

export const getAllPackages = async (req, res, next) => {
  try {
    const { agencyId, includeInactive } = req.query;
    const filters = {
      agencyId: agencyId ? parseInt(agencyId) : undefined,
      includeInactive: includeInactive === 'true'
    };

    // If user is admin (not super_admin), filter to their agencies
    if (req.user.role === 'admin' && !agencyId) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        // Get packages for user's agencies and platform-wide packages
        const agencyIds = userAgencies.map(a => a.id);
        const [rows] = await pool.execute(
          `SELECT * FROM onboarding_packages 
           WHERE (agency_id IN (${agencyIds.map(() => '?').join(',')}) OR agency_id IS NULL)
           ${!includeInactive ? 'AND is_active = TRUE' : ''}
           ORDER BY name ASC`,
          agencyIds
        );
        return res.json(rows);
      }
    }

    const packages = await OnboardingPackage.findAll(filters);
    res.json(packages);
  } catch (error) {
    next(error);
  }
};

export const getPackageById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pkg = await OnboardingPackage.findById(id);

    if (!pkg) {
      return res.status(404).json({ error: { message: 'Onboarding package not found' } });
    }

    // Get all associated items
    const trainingFocuses = await OnboardingPackage.getTrainingFocuses(id);
    const modules = await OnboardingPackage.getModules(id);
    const documents = await OnboardingPackage.getDocuments(id);
    const checklistItems = await OnboardingPackage.getChecklistItems(id);

    res.json({
      ...pkg,
      trainingFocuses,
      modules,
      documents,
      checklistItems
    });
  } catch (error) {
    next(error);
  }
};

export const createPackage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { name, description, agencyId, isActive } = req.body;

    const pkg = await OnboardingPackage.create({
      name,
      description,
      agencyId: agencyId || null,
      createdByUserId: req.user.id,
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json(pkg);
  } catch (error) {
    next(error);
  }
};

export const updatePackage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { name, description, isActive } = req.body;

    const pkg = await OnboardingPackage.update(id, {
      name,
      description,
      isActive
    });

    if (!pkg) {
      return res.status(404).json({ error: { message: 'Onboarding package not found' } });
    }

    res.json(pkg);
  } catch (error) {
    next(error);
  }
};

export const deletePackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await OnboardingPackage.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: { message: 'Onboarding package not found' } });
    }

    res.json({ message: 'Onboarding package deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Training Focus management
export const addTrainingFocusToPackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { trackId, orderIndex } = req.body;

    await OnboardingPackage.addTrainingFocus(id, trackId, orderIndex || 0);
    const trainingFocuses = await OnboardingPackage.getTrainingFocuses(id);

    res.json(trainingFocuses);
  } catch (error) {
    next(error);
  }
};

export const removeTrainingFocusFromPackage = async (req, res, next) => {
  try {
    const { id, trackId } = req.params;
    await OnboardingPackage.removeTrainingFocus(id, trackId);
    res.json({ message: 'Training focus removed from package' });
  } catch (error) {
    next(error);
  }
};

// Module management
export const addModuleToPackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { moduleId, orderIndex } = req.body;

    await OnboardingPackage.addModule(id, moduleId, orderIndex || 0);
    const modules = await OnboardingPackage.getModules(id);

    res.json(modules);
  } catch (error) {
    next(error);
  }
};

export const removeModuleFromPackage = async (req, res, next) => {
  try {
    const { id, moduleId } = req.params;
    await OnboardingPackage.removeModule(id, moduleId);
    res.json({ message: 'Module removed from package' });
  } catch (error) {
    next(error);
  }
};

// Document management
export const addDocumentToPackage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { documentTemplateId, orderIndex, actionType, dueDateDays } = req.body;

    await OnboardingPackage.addDocument(
      id,
      documentTemplateId,
      orderIndex || 0,
      actionType || 'signature',
      dueDateDays || null
    );
    const documents = await OnboardingPackage.getDocuments(id);

    res.json(documents);
  } catch (error) {
    next(error);
  }
};

export const removeDocumentFromPackage = async (req, res, next) => {
  try {
    const { id, documentTemplateId } = req.params;
    await OnboardingPackage.removeDocument(id, documentTemplateId);
    res.json({ message: 'Document removed from package' });
  } catch (error) {
    next(error);
  }
};

export const addChecklistItemToPackage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { checklistItemId, orderIndex } = req.body;

    const checklistItems = await OnboardingPackage.addChecklistItem(id, parseInt(checklistItemId), orderIndex || 0);
    res.json(checklistItems);
  } catch (error) {
    next(error);
  }
};

export const removeChecklistItemFromPackage = async (req, res, next) => {
  try {
    const { id, checklistItemId } = req.params;
    await OnboardingPackage.removeChecklistItem(id, parseInt(checklistItemId));
    res.json({ message: 'Checklist item removed from package' });
  } catch (error) {
    next(error);
  }
};

// Assign package to user(s)
export const assignPackage = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Package assignment validation errors:', errors.array());
      console.error('Request body:', req.body);
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { userIds, agencyId, dueDate } = req.body;
    const assignedByUserId = req.user.id;
    
    console.log('Assigning package:', { packageId: id, userIds, agencyId, dueDate, assignedByUserId });

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: { message: 'User IDs array is required' } });
    }

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    // Calculate default due date: 2 weeks (14 days) from now if not provided
    let finalDueDate = dueDate || null;
    if (!finalDueDate) {
      const defaultDueDate = new Date();
      defaultDueDate.setDate(defaultDueDate.getDate() + 14); // 2 weeks from now
      finalDueDate = defaultDueDate.toISOString();
      console.log('No due date provided, defaulting to 2 weeks from now:', finalDueDate);
    }

    // Get package with all items
    const pkg = await OnboardingPackage.findById(id);
    if (!pkg) {
      return res.status(404).json({ error: { message: 'Onboarding package not found' } });
    }

    const trainingFocuses = await OnboardingPackage.getTrainingFocuses(id);
    const modules = await OnboardingPackage.getModules(id);
    const documents = await OnboardingPackage.getDocuments(id);
    const checklistItems = await OnboardingPackage.getChecklistItems(id);

    const assignments = {
      trainingFocuses: [],
      modules: [],
      documents: [],
      checklistItems: []
    };
    
    const UserChecklistAssignment = (await import('../models/UserChecklistAssignment.model.js')).default;
    const CustomChecklistItem = (await import('../models/CustomChecklistItem.model.js')).default;

    // Assign to each user
    for (const userId of userIds) {
      // Assign training focuses and create tasks for all modules within them
      for (const tf of trainingFocuses) {
        // Assign the training focus (creates user_tracks entry)
        await UserTrack.assignUserToTrack(
          parseInt(userId),
          tf.track_id,
          parseInt(agencyId),
          assignedByUserId
        );
        
        // Get all modules in this training focus and create tasks for them with due date
        const trackModules = await TrainingTrack.getModules(tf.track_id);
        for (const trackModule of trackModules) {
          try {
            const moduleData = await Module.findById(trackModule.id);
            if (moduleData) {
              await TaskAssignmentService.assignTrainingTask({
                title: `Complete ${moduleData.title}`,
                description: moduleData.description || 'Please complete this training module.',
                referenceId: trackModule.id,
                assignedByUserId,
                assignedToUserId: parseInt(userId),
                assignedToAgencyId: parseInt(agencyId),
                dueDate: finalDueDate,
                metadata: {
                  trackId: tf.track_id,
                  trackName: tf.track_name,
                  moduleOrder: trackModule.track_order || trackModule.order_index
                }
              });
              
              // Assign checklist items nested under this module
              const moduleChecklistItems = await CustomChecklistItem.findByModule(trackModule.id);
              for (const checklistItem of moduleChecklistItems) {
                try {
                  await UserChecklistAssignment.assignToUser(parseInt(userId), checklistItem.id, assignedByUserId);
                  assignments.checklistItems.push({
                    userId: parseInt(userId),
                    checklistItemId: checklistItem.id,
                    checklistItemLabel: checklistItem.item_label,
                    nestedUnder: 'module',
                    moduleId: trackModule.id
                  });
                } catch (checklistError) {
                  console.error(`Failed to assign checklist item ${checklistItem.id} for module ${trackModule.id}:`, checklistError);
                }
              }
            }
          } catch (moduleError) {
            console.error(`Failed to create task for module ${trackModule.id} in training focus ${tf.track_id}:`, moduleError);
            // Continue with other modules even if one fails
          }
        }
        
        // Assign checklist items nested under this training focus (not under specific modules)
        const focusChecklistItems = await CustomChecklistItem.findByTrainingFocus(tf.track_id);
        for (const checklistItem of focusChecklistItems) {
          try {
            await UserChecklistAssignment.assignToUser(parseInt(userId), checklistItem.id, assignedByUserId);
            assignments.checklistItems.push({
              userId: parseInt(userId),
              checklistItemId: checklistItem.id,
              checklistItemLabel: checklistItem.item_label,
              nestedUnder: 'trainingFocus',
              trainingFocusId: tf.track_id
            });
          } catch (checklistError) {
            console.error(`Failed to assign checklist item ${checklistItem.id} for training focus ${tf.track_id}:`, checklistError);
          }
        }
        
        assignments.trainingFocuses.push({
          userId: parseInt(userId),
          trackId: tf.track_id,
          trackName: tf.track_name,
          modulesAssigned: trackModules.length
        });
      }

      // Assign modules (as tasks) - these are standalone modules not in training focuses
      for (const mod of modules) {
        const module = await Module.findById(mod.module_id);
        if (module) {
          await TaskAssignmentService.assignTrainingTask({
            title: `Complete ${module.title}`,
            description: module.description || 'Please complete this training module.',
            referenceId: mod.module_id,
            assignedByUserId,
            assignedToUserId: parseInt(userId),
            dueDate: finalDueDate
          });
          
          // Assign checklist items nested under this module
          const moduleChecklistItems = await CustomChecklistItem.findByModule(mod.module_id);
          for (const checklistItem of moduleChecklistItems) {
            try {
              await UserChecklistAssignment.assignToUser(parseInt(userId), checklistItem.id, assignedByUserId);
              assignments.checklistItems.push({
                userId: parseInt(userId),
                checklistItemId: checklistItem.id,
                checklistItemLabel: checklistItem.item_label,
                nestedUnder: 'module',
                moduleId: mod.module_id
              });
            } catch (checklistError) {
              console.error(`Failed to assign checklist item ${checklistItem.id} for module ${mod.module_id}:`, checklistError);
            }
          }
          
          assignments.modules.push({
            userId: parseInt(userId),
            moduleId: mod.module_id,
            moduleTitle: mod.module_title
          });
        }
      }

      // Assign documents (as tasks)
      for (const doc of documents) {
        const template = await DocumentTemplate.findById(doc.document_template_id);
        if (template) {
          console.log(`Assigning document task: ${template.name} (ID: ${doc.document_template_id}, Agency ID: ${template.agency_id || 'NULL (Platform)'}) to user ${userId}`);
          
          // Calculate due date: use package due date, or document-specific due_date_days, or default to 2 weeks
          let documentDueDate = finalDueDate;
          if (doc.due_date_days && !dueDate) {
            // Only use document-specific due_date_days if no package due date was provided
            const dueDateObj = new Date();
            dueDateObj.setDate(dueDateObj.getDate() + doc.due_date_days);
            documentDueDate = dueDateObj.toISOString();
            console.log(`Using document-specific due_date_days (${doc.due_date_days} days):`, documentDueDate);
          }

          // Platform documents (agency_id IS NULL) should be assigned to all users
          // Agency documents should also be assigned if the user belongs to that agency
          // Since we're assigning directly to the user (assignedToUserId), the task will show up
          // regardless of the document's agency_id - this is correct behavior
          const task = await TaskAssignmentService.assignDocumentTask({
            title: `Sign ${template.name}`,
            description: template.description || 'Please review and sign this document.',
            documentTemplateId: doc.document_template_id,
            documentActionType: doc.action_type,
            assignedByUserId,
            assignedToUserId: parseInt(userId),
            dueDate: documentDueDate
          });
          
          console.log(`Document task created successfully: Task ID ${task.id} for user ${userId} with due date: ${documentDueDate}`);
          
          assignments.documents.push({
            userId: parseInt(userId),
            documentTemplateId: doc.document_template_id,
            documentName: doc.document_name,
            actionType: doc.action_type
          });
        } else {
          console.warn(`Document template not found for ID: ${doc.document_template_id}`);
        }
      }
      
      // Assign checklist items directly from package
      for (const checklistItemRef of checklistItems) {
        const checklistItem = await CustomChecklistItem.findById(checklistItemRef.checklist_item_id);
        if (checklistItem) {
          try {
            await UserChecklistAssignment.assignToUser(parseInt(userId), checklistItem.id, assignedByUserId);
            assignments.checklistItems.push({
              userId: parseInt(userId),
              checklistItemId: checklistItem.id,
              checklistItemLabel: checklistItem.item_label,
              nestedUnder: 'package'
            });
          } catch (checklistError) {
            console.error(`Failed to assign checklist item ${checklistItem.id} from package:`, checklistError);
          }
        }
      }
    }

    res.status(201).json({
      message: 'Onboarding package assigned successfully',
      packageId: id,
      packageName: pkg.name,
      assignments,
      summary: {
        usersAssigned: userIds.length,
        trainingFocusesAssigned: trainingFocuses.length,
        modulesAssigned: modules.length,
        documentsAssigned: documents.length,
        checklistItemsAssigned: assignments.checklistItems.length
      }
    });
  } catch (error) {
    next(error);
  }
};

