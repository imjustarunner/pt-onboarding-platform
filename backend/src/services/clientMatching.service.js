import Client from '../models/Client.model.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';

/**
 * Client Matching Service
 * 
 * Handles smart deduplication and bulk import processing for clients
 */
class ClientMatchingService {
  /**
   * Find existing client by match key
   * @param {Object} clientData - Client data
   * @param {number} agencyId - Agency ID
   * @param {number} organizationId - Organization (school) ID
   * @param {string} initials - Client initials
   * @returns {Promise<Object|null>} Matching client or null
   */
  static async findMatch(agencyId, organizationId, initials) {
    return Client.findByMatchKey(agencyId, organizationId, initials);
  }

  /**
   * Find school organization by name
   * @param {string} schoolName - School name
   * @param {number} agencyId - Agency ID (to scope search)
   * @returns {Promise<Object|null>} School organization or null
   */
  static async findSchoolByName(schoolName, agencyId) {
    // Search for school organizations (organization_type = 'school')
    // Optionally scope to agency's partner schools
    const schools = await Agency.findAll(false, false, 'school');
    
    // Try exact match first
    let school = schools.find(s => 
      s.name.toLowerCase().trim() === schoolName.toLowerCase().trim()
    );

    // If not found, try partial match
    if (!school) {
      school = schools.find(s => 
        s.name.toLowerCase().includes(schoolName.toLowerCase().trim()) ||
        schoolName.toLowerCase().trim().includes(s.name.toLowerCase())
      );
    }

    return school || null;
  }

  /**
   * Find provider user by name
   * @param {string} providerName - Provider full name (e.g., "John Doe")
   * @param {number} agencyId - Agency ID (to scope search)
   * @returns {Promise<Object|null>} Provider user or null
   */
  static async findProviderByName(providerName, agencyId) {
    if (!providerName) return null;

    // Get all users for the agency
    // Note: This assumes users are associated with agencies via user_agencies table
    // For now, we'll search all users and filter by role (provider, clinician, etc.)
    const allUsers = await User.findAll();
    
    // Filter to users that might be providers
    const providerRoles = ['provider', 'clinician', 'supervisor', 'admin'];
    const potentialProviders = allUsers.filter(u => 
      providerRoles.includes(u.role?.toLowerCase())
    );

    // Try to match by full name
    const nameParts = providerName.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      const firstName = nameParts[0].toLowerCase();
      const lastName = nameParts.slice(1).join(' ').toLowerCase();

      const match = potentialProviders.find(u => {
        const uFirstName = (u.first_name || '').toLowerCase();
        const uLastName = (u.last_name || '').toLowerCase();
        return uFirstName === firstName && uLastName === lastName;
      });

      if (match) return match;
    }

    // Try partial match on first name + last name
    if (nameParts.length >= 2) {
      const firstName = nameParts[0].toLowerCase();
      const lastName = nameParts[nameParts.length - 1].toLowerCase();

      const match = potentialProviders.find(u => {
        const uFirstName = (u.first_name || '').toLowerCase();
        const uLastName = (u.last_name || '').toLowerCase();
        return uFirstName.startsWith(firstName) && uLastName.startsWith(lastName);
      });

      if (match) return match;
    }

    return null;
  }

  /**
   * Process bulk import rows
   * @param {Array} rows - Parsed CSV rows from CSVParserService
   * @param {number} agencyId - Agency ID
   * @param {boolean} updateExisting - Whether to update existing clients
   * @param {number} createdByUserId - User ID creating the import
   * @returns {Promise<Object>} Import results: { created, updated, errors }
   */
  static async processBulkImport(rows, agencyId, updateExisting, createdByUserId) {
    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    // Get all schools for this agency (for faster lookup)
    const allSchools = await Agency.findAll(false, false, 'school');

    for (const row of rows) {
      try {
        // Find school organization by name
        let school = allSchools.find(s => 
          s.name.toLowerCase().trim() === row.schoolName.toLowerCase().trim()
        );

        if (!school) {
          // Try partial match
          school = allSchools.find(s => 
            s.name.toLowerCase().includes(row.schoolName.toLowerCase().trim()) ||
            row.schoolName.toLowerCase().trim().includes(s.name.toLowerCase())
          );
        }

        if (!school) {
          results.errors.push({
            row: row.rowNumber,
            initials: row.initials,
            error: `School not found: ${row.schoolName}`
          });
          continue;
        }

        const organizationId = school.id;

        // Find provider if specified
        let providerId = null;
        if (row.providerName) {
          const provider = await this.findProviderByName(row.providerName, agencyId);
          if (provider) {
            providerId = provider.id;
          } else {
            // Log warning but continue (provider is optional)
            console.warn(`Provider not found: ${row.providerName} for client ${row.initials}`);
          }
        }

        // Check for existing match
        const existingClient = await this.findMatch(agencyId, organizationId, row.initials);

        if (existingClient && updateExisting) {
          // Update existing client
          const updateData = {
            provider_id: providerId !== null ? providerId : existingClient.provider_id,
            status: row.status,
            submission_date: row.submissionDate,
            document_status: row.documentStatus
          };

          await Client.update(existingClient.id, updateData, createdByUserId);

          // Log to history
          await ClientStatusHistory.create({
            client_id: existingClient.id,
            changed_by_user_id: createdByUserId,
            field_changed: 'bulk_import_update',
            from_value: JSON.stringify(existingClient),
            to_value: JSON.stringify(updateData),
            note: 'Updated via bulk import'
          });

          results.updated++;
        } else if (!existingClient) {
          // Create new client
          await Client.create({
            organization_id: organizationId,
            agency_id: agencyId,
            provider_id: providerId,
            initials: row.initials,
            status: row.status,
            submission_date: row.submissionDate,
            document_status: row.documentStatus,
            source: 'BULK_IMPORT',
            created_by_user_id: createdByUserId
          });

          results.created++;
        } else {
          // Existing client but updateExisting is false
          results.errors.push({
            row: row.rowNumber,
            initials: row.initials,
            error: `Client already exists (${row.initials} at ${row.schoolName}). Enable "Update existing" to update.`
          });
        }
      } catch (error) {
        results.errors.push({
          row: row.rowNumber,
          initials: row.initials,
          error: error.message || 'Unknown error'
        });
      }
    }

    return results;
  }
}

export default ClientMatchingService;
