import pool from '../config/database.js';

export async function requireClientPacketPortalSchema(db = pool) {
  // LIMIT 0 verifies storage contracts without reading client or payment data.
  await db.execute('SELECT agency_id,client_id,party_kind,responsible_user_id,contact_encrypted,revision,updated_by_user_id,updated_at FROM client_billing_responsibility_profiles LIMIT 0');
  await db.execute('SELECT agency_id,client_id,service_code,amount_cents,price_basis,revision,updated_by_user_id,updated_at FROM client_patient_service_rates LIMIT 0');
  await db.execute('SELECT id,agency_id,client_id,actor_user_id,action,evidence_encrypted,created_at FROM client_billing_account_events LIMIT 0');
  await db.execute('SELECT id,agency_id,allocation_id,issued_by_user_id,payer_user_id,issuer_kind,responsible_party_revision,token_hash,amount_cents,currency,locale,expires_at,revoked_at,payment_id,recipient_encrypted,delivery_status,communication_id,created_at,sent_at FROM family_guest_invoices LIMIT 0');
}
