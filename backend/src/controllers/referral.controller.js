/**
 * Referral Controller
 * 
 * Handles referral creation and management, creating client records automatically
 */

import Referral from '../models/Referral.model.js';
import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';

/**
 * Create a new referral (creates client record automatically)
 * POST /api/referrals
 */
export const createReferral = async (req, res, next) => {
  try {
    const { organization_id, student_name, student_initials, referral_reason, additional_notes } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // Verify organization exists and is a school
    const organization = await Agency.findById(organization_id);
    if (!organization) {
      return res.status(404).json({ 
        error: { message: 'Organization not found' } 
      });
    }

    const orgType = organization.organization_type || 'agency';
    if (orgType !== 'school') {
      return res.status(400).json({ 
        error: { message: 'Referrals can only be created for school organizations' } 
      });
    }

    // Validate required fields
    if (!student_initials || !referral_reason) {
      return res.status(400).json({ 
        error: { message: 'Student initials and referral reason are required' } 
      });
    }

    // Determine agency_id (schools are associated with agencies)
    // For now, use organization.id as agency_id (simplified - adjust based on your schema)
    let agencyId = organization.id;
    
    // If user is authenticated, get their agency
    if (userId && userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(userId);
      if (userAgencies.length > 0) {
        // Use the first agency the user belongs to
        agencyId = userAgencies[0].id;
      }
    }

    // Create client record
    const client = await Client.create({
      organization_id: organization_id,
      agency_id: agencyId,
      provider_id: null, // No provider assigned yet
      initials: student_initials.toUpperCase().trim(),
      status: 'PENDING_REVIEW',
      submission_date: new Date().toISOString().split('T')[0],
      document_status: 'NONE',
      source: 'DIGITAL_FORM',
      created_by_user_id: userId || null
    });

    // Log to status history
    await ClientStatusHistory.create({
      client_id: client.id,
      changed_by_user_id: userId || null,
      field_changed: 'created',
      from_value: null,
      to_value: JSON.stringify({ source: 'DIGITAL_FORM', referral_reason }),
      note: 'Client created via digital referral form'
    });

    // Create a note with the referral details (shared note - visible to school)
    if (referral_reason || additional_notes) {
      const noteMessage = `Referral Reason: ${referral_reason}${additional_notes ? `\n\nAdditional Notes: ${additional_notes}` : ''}`;
      await ClientNotes.create({
        client_id: client.id,
        author_id: userId || null, // null for anonymous submissions
        message: noteMessage,
        is_internal_only: false // Shared note - visible to school
      }, userRole || 'school_staff');
    }

    res.status(201).json({
      success: true,
      message: 'Referral submitted successfully. Client record created.',
      client: {
        id: client.id,
        initials: client.initials,
        status: client.status
      }
    });
  } catch (error) {
    console.error('Create referral error:', error);
    next(error);
  }
};

/**
 * Get referrals for organization
 * GET /api/referrals
 */
export const getReferrals = async (req, res, next) => {
  try {
    // TODO: Implement when referrals table exists
    res.json([]);
  } catch (error) {
    console.error('Get referrals error:', error);
    next(error);
  }
};

/**
 * Update referral status (accept/decline)
 * PUT /api/referrals/:id/status
 */
export const updateReferralStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, assigned_provider_id } = req.body;

    // TODO: Implement when referrals table exists
    res.status(501).json({
      error: { 
        message: 'Referral status updates will be available in Step 2' 
      }
    });
  } catch (error) {
    console.error('Update referral status error:', error);
    next(error);
  }
};
