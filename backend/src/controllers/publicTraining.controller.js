import User from '../models/User.model.js';
import Module from '../models/Module.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import AgencyPublicTraining from '../models/AgencyPublicTraining.model.js';

export async function publicTrainingAgency(req, fallback = null) {
  const supplied = req.query?.agencyId ?? req.headers?.['x-agency-id'];
  if (supplied == null || supplied === '') return fallback;
  const id = Number(supplied);
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('Select a valid training organization.'), { status: 400 });
  const platformAdmin = ['super_admin', 'superadmin'].includes(req.user?.role);
  let memberships = platformAdmin ? [] : await User.getAgencies(req.user.id);
  if (req.user.type === 'approved_employee') {
    const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
    const employee = await ApprovedEmployee.findByEmail(req.user.email);
    memberships = employee?.agency_id ? [{ id: employee.agency_id }] : [];
  }
  if (!platformAdmin && !memberships.some(a => Number(a.id) === id)) throw Object.assign(new Error('Training organization access denied.'), { status: 403 });
  return id;
}

export const getPublicModules = async (req, res, next) => {
  try {
    // Check if user is archived (for approved employees)
    let agencyId = null;
    if (req.user.type === 'approved_employee') {
      const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
      const employee = await ApprovedEmployee.findByEmail(req.user.email);
      
      if (employee && employee.user_id) {
        const User = (await import('../models/User.model.js')).default;
        const user = await User.findById(employee.user_id);
        if (user && (user.is_archived === true || user.is_archived === 1)) {
          return res.status(403).json({ error: { message: 'Account has been archived. Access denied.' } });
        }
      }
      agencyId = employee?.agency_id || null;
    } else if (req.user.role && req.user.role !== 'super_admin') {
      // For regular users, get their agency
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        agencyId = userAgencies[0].id;
      }
    }

    agencyId = await publicTrainingAgency(req, agencyId);

    // Get all modules that are always accessible or public
    const modules = await Module.findPublicModules();
    
    // Get agency-specific public modules if agencyId is available
    let agencyPublicModules = [];
    if (agencyId) {
      agencyPublicModules = await AgencyPublicTraining.getPublicModules(agencyId);
    }
    
    // Combine and deduplicate modules
    const moduleMap = new Map();
    
    // Add global public modules
    modules.forEach(module => {
      moduleMap.set(module.id, {
        ...module,
        isAgencyPublic: false,
        isGlobalPublic: true
      });
    });
    
    // Add/update with agency-specific public modules
    agencyPublicModules.forEach(apm => {
      const existing = moduleMap.get(apm.module_id);
      if (existing) {
        existing.isAgencyPublic = true;
      } else {
        // Agency-specific module that's not in global public list
        moduleMap.set(apm.module_id, {
          id: apm.module_id,
          title: apm.module_title,
          description: apm.module_description,
          order_index: apm.order_index,
          estimated_time_minutes: apm.estimated_time_minutes,
          isAgencyPublic: true,
          isGlobalPublic: false
        });
      }
    });
    
    // For each module, get basic content info (without full content)
    const modulesWithInfo = await Promise.all(
      Array.from(moduleMap.values()).map(async (module) => {
        const content = await ModuleContent.findByModuleId(module.id);
        return {
          ...module,
          contentCount: content.length,
          hasVideo: content.some(c => c.content_type === 'video'),
          hasQuiz: content.some(c => c.content_type === 'quiz'),
          isPublicTraining: true, // Flag to indicate this doesn't count towards time
          doesNotCountTowardsTime: true
        };
      })
    );
    
    res.json(modulesWithInfo);
  } catch (error) {
    next(error);
  }
};

export const getPublicTrainingFocuses = async (req, res, next) => {
  try {
    // Check if user is archived (for approved employees)
    let agencyId = null;
    if (req.user.type === 'approved_employee') {
      const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
      const employee = await ApprovedEmployee.findByEmail(req.user.email);
      
      if (employee && employee.user_id) {
        const User = (await import('../models/User.model.js')).default;
        const user = await User.findById(employee.user_id);
        if (user && (user.is_archived === true || user.is_archived === 1)) {
          return res.status(403).json({ error: { message: 'Account has been archived. Access denied.' } });
        }
      }
      agencyId = employee?.agency_id || null;
    } else if (req.user.role && req.user.role !== 'super_admin') {
      // For regular users, get their agency
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        agencyId = userAgencies[0].id;
      }
    }

    agencyId = await publicTrainingAgency(req, agencyId);
    if (!agencyId) {
      return res.json([]);
    }

    const trainingFocuses = await AgencyPublicTraining.getPublicTrainingFocuses(agencyId);
    
    // Get modules for each training focus
    const TrainingTrack = (await import('../models/TrainingTrack.model.js')).default;
    const focusesWithModules = await Promise.all(
      trainingFocuses.map(async (focus) => {
        const modules = await TrainingTrack.getModules(focus.training_focus_id);
        return {
          ...focus,
          modules,
          isPublicTraining: true,
          doesNotCountTowardsTime: true
        };
      })
    );
    
    res.json(focusesWithModules);
  } catch (error) {
    next(error);
  }
};

export const getPublicModule = async (req, res, next) => {
  try {
    // Check if user is archived (for approved employees)
    if (req.user.type === 'approved_employee') {
      const ApprovedEmployee = (await import('../models/ApprovedEmployee.model.js')).default;
      const employee = await ApprovedEmployee.findByEmail(req.user.email);
      
      if (employee && employee.user_id) {
        const User = (await import('../models/User.model.js')).default;
        const user = await User.findById(employee.user_id);
        if (user && (user.is_archived === true || user.is_archived === 1)) {
          return res.status(403).json({ error: { message: 'Account has been archived. Access denied.' } });
        }
      }
    }

    const { id } = req.params;
    const module = await Module.findById(id);
    
    if (!module) {
      return res.status(404).json({ error: { message: 'Module not found' } });
    }
    
    // Check if module is accessible
    if (!module.is_always_accessible && !module.is_public) {
      const agencyId = await publicTrainingAgency(req);
      let allowed = false;
      if (agencyId) {
        const modules = await AgencyPublicTraining.getPublicModules(agencyId);
        allowed = modules.some(item => Number(item.module_id) === Number(id));
        if (!allowed) {
          const focuses = await AgencyPublicTraining.getPublicTrainingFocuses(agencyId);
          const TrainingTrack = (await import('../models/TrainingTrack.model.js')).default;
          for (const focus of focuses) {
            const lessons = await TrainingTrack.getModules(focus.training_focus_id);
            if (lessons.some(item => Number(item.module_id || item.id) === Number(id))) { allowed = true; break; }
          }
        }
      }
      if (!allowed) return res.status(403).json({ error: { message: 'Module is not available in this organization’s on-demand catalog.' } });
    }
    
    // Get module content
    const content = await ModuleContent.findByModuleId(id);
    
    res.json({
      ...module,
      content
    });
  } catch (error) {
    next(error);
  }
};

export const getStandaloneModules = async (req, res, next) => {
  try {
    const { category } = req.query;
    const modules = await Module.findStandaloneModules(category || null);
    res.json(modules);
  } catch (error) {
    next(error);
  }
};

