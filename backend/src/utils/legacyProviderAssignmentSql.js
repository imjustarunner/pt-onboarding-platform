/**
 * Legacy provider/day fields are a fallback only until this client has scoped
 * assignment records at this organization. Even inactive records are authoritative:
 * falling back after a move or removal would resurrect the old assignment.
 * The enclosing query must alias clients as `c`.
 */
export const LEGACY_PROVIDER_ASSIGNMENT_FILTER = `NOT EXISTS (
  SELECT 1 FROM client_provider_assignments scoped_assignment
  WHERE scoped_assignment.client_id = c.id
    AND scoped_assignment.organization_id = c.organization_id
)`;
