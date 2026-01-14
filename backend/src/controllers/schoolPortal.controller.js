/**
 * School Portal Controller
 * Handles restricted school portal views and client list access
 * 
 * NOTE: This is a placeholder that will be fully implemented in Step 2 (Client Management)
 * when the clients table is created.
 */

/**
 * Get clients for school portal (restricted view)
 * GET /api/school-portal/:organizationId/clients
 * 
 * Returns only non-sensitive client data:
 * - Student Status
 * - Assigned Provider Name
 * - Admin Notes (non-clinical)
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

    // Verify user is associated with this organization
    // TODO: Implement proper organization association check
    
    // TODO: Implement when clients table exists (Step 2)
    // const clients = await Client.findByOrganizationId(organizationId, {
    //   includeSensitive: false, // School view never includes sensitive data
    //   userRole: req.user.role
    // });

    // For now, return empty array until clients table is created
    res.json([]);
  } catch (error) {
    console.error('School portal clients error:', error);
    next(error);
  }
};
