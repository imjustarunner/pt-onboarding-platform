import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import User from '../models/User.model.js';
import { validationResult } from 'express-validator';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

/**
 * Create a new supervisor assignment
 */
export const createAssignment = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    // Only admins, super_admins, and support can create assignments
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Only admins, super admins, and support can create supervisor assignments' } });
    }

    const { supervisorId, superviseeId, agencyId, isPrimary } = req.body;

    if (!supervisorId || !superviseeId || !agencyId) {
      return res.status(400).json({ error: { message: 'supervisorId, superviseeId, and agencyId are required' } });
    }

    // Verify supervisor exists and can be assigned as supervisor
    const supervisor = await User.findById(supervisorId);
    if (!supervisor) {
      return res.status(404).json({ error: { message: 'Supervisor not found' } });
    }

    // Check if user can be assigned as supervisor (has supervisor role OR has supervisor privileges)
    if (!User.canBeAssignedAsSupervisor(supervisor)) {
      return res.status(400).json({ 
        error: { 
          message: 'User must be a supervisor or have supervisor privileges (admin, super admin, or clinical practice assistant with supervisor privileges enabled)' 
        } 
      });
    }

    // Verify supervisee exists
    const supervisee = await User.findById(superviseeId);
    if (!supervisee) {
      return res.status(404).json({ error: { message: 'Supervisee not found' } });
    }

    // Verify both users belong to the agency
    const supervisorAgencies = await User.getAgencies(supervisorId);
    const superviseeAgencies = await User.getAgencies(superviseeId);

    if (!supervisorAgencies.some(a => a.id === parseInt(agencyId))) {
      return res.status(400).json({ error: { message: 'Supervisor does not belong to this agency' } });
    }

    if (!superviseeAgencies.some(a => a.id === parseInt(agencyId))) {
      return res.status(400).json({ error: { message: 'Supervisee does not belong to this agency' } });
    }

    // Check if assignment already exists
    const exists = await SupervisorAssignment.isAssigned(supervisorId, superviseeId, agencyId);
    if (exists) {
      return res.status(400).json({ error: { message: 'Assignment already exists' } });
    }

    // If marking as primary, clear previous primary first (best-effort; column may not exist yet)
    if (isPrimary === true) {
      try {
        await SupervisorAssignment.clearPrimary(superviseeId, agencyId);
      } catch {
        // ignore (migration may not be applied yet)
      }
    }

    // Create assignment
    const assignment = await SupervisorAssignment.create(supervisorId, superviseeId, agencyId, req.user.id, {
      isPrimary: isPrimary === true
    });

    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
};

/**
 * Set a primary supervisor for a supervisee within an agency.
 * POST /api/supervisor-assignments/primary
 */
export const setPrimarySupervisor = async (req, res, next) => {
  try {
    // Only admins, super_admins, and support can set primary
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Only admins, super admins, and support can set primary supervisors' } });
    }

    const supervisorId = parseInt(String(req.body?.supervisorId || ''), 10);
    const superviseeId = parseInt(String(req.body?.superviseeId || ''), 10);
    const agencyId = parseInt(String(req.body?.agencyId || ''), 10);
    if (!supervisorId || !superviseeId || !agencyId) {
      return res.status(400).json({ error: { message: 'supervisorId, superviseeId, and agencyId are required' } });
    }

    // Ensure the assignment exists
    const exists = await SupervisorAssignment.isAssigned(supervisorId, superviseeId, agencyId);
    if (!exists) {
      return res.status(404).json({ error: { message: 'Assignment not found for this supervisor/supervisee/agency' } });
    }

    await SupervisorAssignment.setPrimary(supervisorId, superviseeId, agencyId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a supervisor assignment
 */
export const deleteAssignment = async (req, res, next) => {
  try {
    // Only admins, super_admins, and support can delete assignments
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Only admins, super admins, and support can delete supervisor assignments' } });
    }

    const { id } = req.params;
    const deleted = await SupervisorAssignment.deleteById(id);

    if (!deleted) {
      return res.status(404).json({ error: { message: 'Assignment not found' } });
    }

    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all supervisees for a supervisor
 */
export const getSupervisees = async (req, res, next) => {
  try {
    const { supervisorId } = req.params;
    const { agencyId } = req.query;

    // Verify supervisor exists
    const supervisor = await User.findById(supervisorId);
    if (!supervisor) {
      return res.status(404).json({ error: { message: 'Supervisor not found' } });
    }

    // Check permissions: supervisors can see their own supervisees, admins/support can see any
    // Check if requesting user is a supervisor using boolean as source of truth
    const requestingUser = await User.findById(req.user.id);
    const isRequestingSupervisor = requestingUser && User.isSupervisor(requestingUser);
    
    if (parseInt(supervisorId) !== req.user.id) {
      if (!isRequestingSupervisor && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const assignments = await SupervisorAssignment.findBySupervisor(
      supervisorId,
      agencyId ? parseInt(agencyId) : null
    );

    const withPhotoUrl = (assignments || []).map((a) => ({
      ...a,
      supervisee_profile_photo_url: a.supervisee_profile_photo_path
        ? publicUploadsUrlFromStoredPath(a.supervisee_profile_photo_path)
        : null
    }));

    res.json(withPhotoUrl);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all supervisors for a supervisee
 */
export const getSupervisors = async (req, res, next) => {
  try {
    const { superviseeId } = req.params;
    const { agencyId } = req.query;

    // Verify supervisee exists
    const supervisee = await User.findById(superviseeId);
    if (!supervisee) {
      return res.status(404).json({ error: { message: 'Supervisee not found' } });
    }

    // Check permissions: users can see their own supervisors, admins/support can see any
    if (parseInt(superviseeId) !== req.user.id) {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const assignments = await SupervisorAssignment.findBySupervisee(
      superviseeId,
      agencyId ? parseInt(agencyId) : null
    );

    res.json(assignments);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all assignments in an agency
 */
export const getAgencyAssignments = async (req, res, next) => {
  try {
    const { agencyId } = req.params;

    // Only admins, super_admins, and support can view all assignments
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Verify agency access
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    const assignments = await SupervisorAssignment.findByAgency(agencyId);

    res.json(assignments);
  } catch (error) {
    next(error);
  }
};
