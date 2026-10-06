import { createHash } from 'node:crypto';
import { fail, text } from './policy.js';

export const recognitionVersion = 'public-name-amount-city-region-v1';
export const donationPage = 'https://mh4kidz.org/donate';
export const hash = value => createHash('sha256').update(value).digest('hex');
export function donationInput(input) {
  const amountCents = Number(input.amountCents);
  if (!Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > 1000000) throw fail(400, 'Choose a donation between $1 and $10,000');
  const name = text(input.name, 200), email = text(input.email, 254).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw fail(400, 'Enter a valid receipt email');
  if (/[\r\n\x00-\x1f]/.test(name + email)) throw fail(400, 'Enter a valid name and email');
  if (typeof input.publicRecognition !== 'boolean' || input.recognitionVersion !== recognitionVersion) throw fail(400, 'Review your public recognition choice');
  const city = text(input.city, 100, false), region = text(input.region, 100, false);
  if (input.publicRecognition && (!city || !region)) throw fail(400, 'Enter your city and state/region, or choose anonymous');
  if (!/^[a-f0-9-]{36}$/i.test(String(input.requestKey || '')) || !/^[a-f0-9]{64}$/i.test(String(input.receiptToken || ''))) throw fail(400, 'Refresh the donation form before continuing');
  return { amountCents, name, email, city, region, publicRecognition: input.publicRecognition, recognitionVersion, requestKey: input.requestKey, receiptToken: input.receiptToken };
}
export function assertDonationPayment(row, pi, account) {
  if (!account || account !== row.stripe_account_id || Number(pi.metadata?.agency_id) !== Number(row.agency_id) || Number(pi.metadata?.donation_id) !== Number(row.id) || pi.metadata?.source !== 'mh4kidz_donation' || pi.status !== 'succeeded' || pi.currency !== 'usd' || Number(pi.amount) !== Number(row.amount_cents) || Number(pi.amount_received) !== Number(row.amount_cents) || Boolean(pi.livemode) !== Boolean(row.livemode) || (row.stripe_payment_intent_id && row.stripe_payment_intent_id !== pi.id)) throw fail(409, 'Donation payment does not match its recorded merchant, amount, or currency');
}
export function publicDonor(row) {
  if (!row.public_recognition || !row.livemode || !['paid','partially_refunded'].includes(row.status) || Number(row.amount_cents) <= Number(row.refunded_cents)) return null;
  return { name: row.donor_name, city: row.city, region: row.region, amountCents: Number(row.amount_cents) - Number(row.refunded_cents) };
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const money = n => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(n) / 100);
export function donationReceipt(row) {
  const issuer = typeof row.issuer_json === 'string' ? JSON.parse(row.issuer_json) : row.issuer_json;
  const refunded = Number(row.refunded_cents), amount = Number(row.amount_cents);
  const date = new Date(row.paid_at).toLocaleDateString('en-US', { timeZone:'America/Denver', year:'numeric', month:'long', day:'numeric' });
  const number = `MH4K-${row.id}${refunded ? `-R${refunded}` : ''}`;
  const lines = [issuer.legalName, `EIN: ${issuer.ein}`, `Donation acknowledgment ${number}`, `Donor: ${row.donor_name}`, `Date received: ${date}`, `Cash contribution: ${money(amount)}`, ...(refunded ? [`Refunded: ${money(refunded)}`, `Contribution remaining: ${money(amount - refunded)}`, 'This updated acknowledgment replaces the earlier receipt.'] : []), 'No goods or services were provided in exchange for this contribution.', 'Please retain this acknowledgment for your tax records.', 'Thank you for supporting kids, families, and their communities.'];
  return { number, text: lines.join('\n'), html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#173c42;line-height:1.5"><img src="https://mh4kidz.org/assets/mh4kidz/logo.webp" width="180" alt="MH4Kidz"><h1 style="font-size:24px">${refunded ? 'Updated donation acknowledgment' : 'Thank you for your donation'}</h1>${lines.map(line => `<p>${escape(line)}</p>`).join('')}<p><a href="https://mh4kidz.org/about">Learn about MH4Kidz</a> · <a href="https://mh4kidz.org/schoolcarebridge">Learn about SchoolCareBridge</a></p></div>` };
}
