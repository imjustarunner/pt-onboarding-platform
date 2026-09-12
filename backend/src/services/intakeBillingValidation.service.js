import pool from '../config/database.js';
import { assertFamilyBillingEncryption } from './familyBillingEncryption.service.js';
import { billingError } from './familyBillingPolicy.service.js';
import { insuranceForIntakeClient } from './clientInsurance.service.js';
import { hasMedicaidCoverage, shouldSuppressInsurancePayment } from '../utils/insurancePaymentPolicy.js';
export async function validateIntakeBilling({ link, submission, intakeData, agencyId }) {
  const steps = Array.isArray(link?.intake_steps) ? link.intake_steps : [];
  const data = typeof intakeData === 'string' ? JSON.parse(intakeData) : (intakeData || {});
  const bag = data.responses?.submission || data.submission || data;
  const info = bag.insuranceInfo;
  const clientCount = Math.max(1,data.responses?.clients?.length || data.clients?.length || 1);
  if (info && (!info.isSelfPay || hasMedicaidCoverage(info)) && info.primary?.insurerName) {
    assertFamilyBillingEncryption();
    const medicaidMembers = new Map();
    for(let index=0;index<clientCount;index++) {
      const policy=insuranceForIntakeClient(info,index,clientCount);
      if (!policy && clientCount>1) throw billingError(400,'Confirm separate insurance coverage for every client, including each child’s Medicaid member ID when applicable.');
      for (const tier of [policy?.primary, policy?.secondary]) {
        if (!tier?.isMedicaid || !tier.memberId) continue;
        const member = tier.memberId.trim().toUpperCase();
        if (medicaidMembers.has(member) && medicaidMembers.get(member) !== index) throw billingError(400, 'Each client must have their own Medicaid member ID.');
        medicaidMembers.set(member, index);
      }
    }
  }
  const paymentStep = steps.find(s => s.type === 'payment_collection' || (s.type === 'insurance_info' && (s.paymentOnly || Number(link.inherits_office_master) === 1)));
  if (!paymentStep || paymentStep.paymentRequired === false || shouldSuppressInsurancePayment(info, link.master_channel)) return;
  const [merchant] = await pool.execute("SELECT stripe_connect_account_id FROM agency_billing_accounts WHERE agency_id = ? AND stripe_connect_status = 'active'",[agencyId]);
  if (!merchant[0]?.stripe_connect_account_id) return; // Collection not activated yet.
  const [cards] = await pool.execute(`SELECT c.id FROM guardian_payment_cards c JOIN guardian_card_setups setup ON setup.payment_card_id = c.id WHERE c.intake_submission_id = ? AND c.agency_id = ? AND c.is_active = 1 AND c.private_payload IS NOT NULL AND setup.stripe_account_id = ?`, [submission.id,agencyId,merchant[0].stripe_connect_account_id]);
  if (!cards.length) throw billingError(409,'Save a payment method through the secure card form before completing this enrollment, or contact the office for an approved payment arrangement.');
}
