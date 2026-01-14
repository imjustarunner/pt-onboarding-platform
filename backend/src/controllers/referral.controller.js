/**
 * Referral Controller
 * 
 * NOTE: This is a placeholder controller that will be fully implemented in Step 2
 * when the referrals table and Client Management module are created.
 */

import Referral from '../models/Referral.model.js';
import Agency from '../models/Agency.model.js';

/**
 * Create a new referral
 * POST /api/referrals
 */
export const createReferral = async (req, res, next) => {
  try {
    const { organization_id, student_name, student_initials, referral_reason, additional_notes } = req.body;
    const userId = req.user?.id;

    // Verify organization exists
    const organization = await Agency.findById(organization_id);
    if (!organization) {
      return res.status(404).json({ 
        error: { message: 'Organization not found' } 
      });
    }

    // TODO: Create client record and referral when clients table exists (Step 2)
    // For now, return a placeholder response
    res.status(501).json({
      error: { 
        message: 'Referral system will be fully implemented in Step 2 (Client Management Module)' 
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
