/**
 * Organization Access Middleware
 * 
 * Handles organization-scoped access control based on organization_type
 * - School staff → only school organization
 * - Agency staff → agency-owned organizations
 * - Super admin → all organizations
 */

import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';

/**
 * Verify user has access to the specified organization
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next
 */
export const verifyOrganizationAccess = async (req, res, next) => {
  try {
    const organizationId = req.params.organizationId || req.params.id || req.body.organization_id;
    const organizationSlug = req.params.organizationSlug || req.params.slug;

    // Super admin has access to all organizations
    if (req.user.role === 'super_admin') {
      return next();
    }

    let organization = null;

    // Resolve organization by ID or slug
    if (organizationId) {
      organization = await Agency.findById(organizationId);
    } else if (organizationSlug) {
      organization = await Agency.findBySlug(organizationSlug);
    }

    if (!organization) {
      return res.status(404).json({ 
        error: { message: 'Organization not found' } 
      });
    }

    const orgType = organization.organization_type || 'agency';

    // Get user's organizations
    const userAgencies = await User.getAgencies(req.user.id);
    const userHasAccess = userAgencies.some(org => 
      org.id === organization.id || 
      org.slug === organization.slug
    );

    // School staff can only access their school organization
    if (orgType === 'school') {
      // TODO: Check if user is school staff (Step 2 - user_category)
      // For now, check if user is associated with this organization
      if (!userHasAccess && req.user.role !== 'super_admin') {
        return res.status(403).json({ 
          error: { message: 'You do not have access to this school organization' } 
        });
      }
    }

    // Agency staff can access agency-owned organizations
    if (orgType === 'agency') {
      if (!userHasAccess && req.user.role !== 'super_admin') {
        return res.status(403).json({ 
          error: { message: 'You do not have access to this agency' } 
        });
      }
    }

    // Store organization in request for use in controllers
    req.organization = organization;

    next();
  } catch (error) {
    console.error('Organization access verification error:', error);
    next(error);
  }
};

/**
 * Verify user is school staff for school-specific operations
 */
export const requireSchoolStaff = async (req, res, next) => {
  try {
    // TODO: Implement when user_category is added (Step 2)
    // For now, check if user is associated with a school organization
    const organizationId = req.params.organizationId || req.body.organization_id;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: { message: 'Organization ID required' } 
      });
    }

    const organization = await Agency.findById(organizationId);
    
    if (!organization || (organization.organization_type || 'agency') !== 'school') {
      return res.status(403).json({ 
        error: { message: 'This operation is only available for school organizations' } 
      });
    }

    // Verify user is associated with this school
    const userAgencies = await User.getAgencies(req.user.id);
    const userHasAccess = userAgencies.some(org => org.id === organization.id);

    if (!userHasAccess && req.user.role !== 'super_admin') {
      return res.status(403).json({ 
        error: { message: 'You do not have access to this school' } 
      });
    }

    req.organization = organization;
    next();
  } catch (error) {
    console.error('School staff verification error:', error);
    next(error);
  }
};
