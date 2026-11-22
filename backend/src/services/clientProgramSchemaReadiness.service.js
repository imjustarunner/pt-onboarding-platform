import pool from '../config/database.js';

export async function requireClientProgramSchema(db = pool) {
  // Resolve the tables and columns used by chart types and program registration without reading client records.
  await db.execute(`SELECT t.selected_types, t.revision, h.changed_by_user_id, h.previous_selection, h.new_selection,
    c.registration_price_cents, c.registration_audience, e.registration_audience,
    o.organization_name, o.retired_at, r.offering_id, r.retired_at, p.client_id, p.name, p.audience
    FROM client_chart_type_selections t CROSS JOIN client_chart_type_history h
    CROSS JOIN learning_program_classes c CROSS JOIN company_events e
    CROSS JOIN client_program_retirement_history o CROSS JOIN client_program_retired_offerings r
    CROSS JOIN client_program_past_participants p LIMIT 0`);
}
