/**
 * School Portal Controller
 * Handles restricted school portal views and client list access
 */

import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import pool from '../config/database.js';

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

    // Unread note counts (per user) - best effort if table exists.
    const unreadCountsByClientId = new Map();
    try {
      const clientIds = (clients || []).map((c) => parseInt(c.id, 10)).filter(Boolean);
      if (clientIds.length > 0 && userId) {
        const placeholders = clientIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT n.client_id, COUNT(*) AS unread_count
           FROM client_notes n
           LEFT JOIN client_note_reads r
             ON r.client_id = n.client_id AND r.user_id = ?
           WHERE n.client_id IN (${placeholders})
             AND n.is_internal_only = FALSE
             AND n.created_at > COALESCE(r.last_read_at, '1970-01-01')
           GROUP BY n.client_id`,
          [userId, ...clientIds]
        );
        for (const r of rows || []) {
          unreadCountsByClientId.set(Number(r.client_id), Number(r.unread_count || 0));
        }
      }
    } catch {
      // table may not exist yet; ignore
    }

    // Format response: Only include non-sensitive fields
    const restrictedClients = clients.map(client => {
      return {
        id: client.id,
        initials: client.initials,
        status: client.status,
        provider_id: client.provider_id || null,
        provider_name: client.provider_name || null,
        service_day: client.service_day || null,
        submission_date: client.submission_date,
        document_status: client.document_status,
        unread_notes_count: unreadCountsByClientId.get(Number(client.id)) || 0
      };
    });

    res.json(restrictedClients);
  } catch (error) {
    console.error('School portal clients error:', error);
    next(error);
  }
};
