/**
 * School Portal Controller
 * Handles restricted school portal views and client list access
 */

import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';

/**
 * Get clients for school portal (restricted view)
 * GET /api/school-portal/:organizationId/clients
 * 
 * Returns only non-sensitive client data:
 * - Student Status
 * - Assigned Provider Name
 * - Admin Notes (non-clinical, shared notes only)
 * - Submission Date
 * 
 * Hidden fields (FERPA/HIPAA compliance):
 * - Billing information
 * - SSNs
 * - Clinical notes
 * - Internal notes
 */
export const getSchoolClients = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // Verify organization exists and is a school
    const organization = await Agency.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ 
        error: { message: 'Organization not found' } 
      });
    }

    const orgType = organization.organization_type || 'agency';
    if (orgType !== 'school') {
      return res.status(400).json({ 
        error: { message: 'This endpoint is only available for school organizations' } 
      });
    }

    // Verify user is associated with this school organization
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      const userHasAccess = userAgencies.some(org => org.id === parseInt(organizationId));
      
      if (!userHasAccess) {
        return res.status(403).json({ 
          error: { message: 'You do not have access to this school organization' } 
        });
      }
    }

    // Get clients for this school (restricted view - no sensitive data)
    const clients = await Client.findByOrganizationId(parseInt(organizationId));

    // Format response: Only include non-sensitive fields
    const restrictedClients = clients.map(client => {
      // Get shared notes only (non-clinical admin notes)
      // We'll fetch notes separately if needed, but for list view we can skip
      return {
        id: client.id,
        initials: client.initials,
        status: client.status,
        provider_name: client.provider_name || null,
        submission_date: client.submission_date,
        document_status: client.document_status,
        // Note: We don't include admin_notes in the list view
        // It can be fetched separately via /api/clients/:id/notes if needed
      };
    });

    res.json(restrictedClients);
  } catch (error) {
    console.error('School portal clients error:', error);
    next(error);
  }
};
