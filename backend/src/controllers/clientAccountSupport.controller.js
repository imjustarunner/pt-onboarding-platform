import pool from '../config/database.js';
import { requireClientAccountSupport } from '../services/clientAccountSupportAccess.service.js';
import { clientCareBillingSummary } from '../services/clientCareBillingSummary.service.js';
import { decodePaymentCard } from '../models/GuardianPaymentCard.model.js';
import { requireResponsiblePayer, auditBilling } from '../services/familyBillingPolicy.service.js';
import { resolveClientPortalContext, clientPortalAppUrl } from '../services/clientPortalContext.service.js';

export async function getClientAccountSupport(req, res, next) {
  try {
    const client = await requireClientAccountSupport(req.user, req.params.id);
    const agencyId = Number(client.agency_id), clientId = Number(client.id);
    const summary = await clientCareBillingSummary(agencyId, clientId, pool, { includeAmounts: true });
    // Only cards explicitly assigned to this client's currently authorized payer.
    // Never return processor tokens, full card data, receipts, or claim references.
    const [rows] = await pool.execute(`SELECT p.guardian_user_id,u.first_name,u.last_name,
      c.id AS card_id,c.private_payload,c.agency_id,c.payment_provider
      FROM client_billing_payers p JOIN users u ON u.id=p.guardian_user_id
      LEFT JOIN guardian_payment_cards c ON c.id=p.payment_card_id
        AND c.guardian_user_id=p.guardian_user_id AND c.agency_id=p.agency_id AND c.is_active=1
      WHERE p.agency_id=? AND p.client_id=? AND p.status='active'`, [agencyId,clientId]);
    const payers = [];
    for (const row of rows) {
      try { await requireResponsiblePayer(row.guardian_user_id, clientId, agencyId); }
      catch (error) { if (error.status === 403) continue; throw error; }
      const card = row.card_id ? decodePaymentCard(row) : null;
      payers.push({ name: [row.first_name,row.last_name].filter(Boolean).join(' ') || 'Responsible payer',
        cardOnFile: !!card,
        card: card ? { brand: card.card_brand || null, last4: card.card_last4 || null,
          verificationRequired: card.legacyRequiresReview === true || card.payment_provider !== 'STRIPE' } : null });
    }
    let portalUrl = null;
    try {
      const { portal } = await resolveClientPortalContext(client);
      portalUrl = clientPortalAppUrl(portal, 'guardian?panel=billing');
    } catch (error) { if (error.status !== 503) throw error; }
    await auditBilling({ agencyId, clientId, userId: req.user.id, action: 'staff_view_account_support' });
    res.set('Cache-Control','no-store').json({ balance: summary.balance, payers, portalUrl });
  } catch (error) { next(error); }
}
