import { buildSmsConsentDisclosure } from './smsConsentDisclosure.js';

export const SMS_PACKET_VERSION = '2026-10-06.1';
export const SMS_PROGRAMS = Object.freeze({
  operations: { name: 'Service Communications', purposes: ['care', 'reminders', 'billing', 'workforce'], subUsecases: ['CUSTOMER_CARE', 'ACCOUNT_NOTIFICATION'], audience: 'clients, authorized guardians and separately opted-in staff' },
  workforce: { name: 'Staff Notifications', purposes: ['workforce'], subUsecases: ['ACCOUNT_NOTIFICATION'], audience: 'opted-in employees and contractors' },
  polling: { name: 'Staff Notifications and Voting', purposes: ['polling', 'workforce'], subUsecases: ['POLLING_VOTING', 'ACCOUNT_NOTIFICATION'], audience: 'opted-in employees and contractors participating in this organization’s internal events' },
  marketing: { name: 'Program Announcements', purposes: ['marketing'], subUsecases: ['MARKETING'], audience: 'recipients who separately opted in to promotional messages' },
  account: { name: 'Account Notifications', purposes: ['account_security'], subUsecases: ['ACCOUNT_NOTIFICATION'], audience: 'registered users who opted in to account-access notifications' }
});
const fail = message => Object.assign(new Error(message), { status: 400 });
const text = (value, max = 180) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function normalizeCampaignProfile(input = {}) {
  const result = {};
  for (const field of ['legalName', 'brandName', 'supportContact', 'brandId', 'resellerId', 'organizationType', 'vertical', 'businessAddress', 'country']) result[field] = text(input[field]);
  for (const field of ['website', 'portalUrl', 'organizationPrivacyUrl', 'organizationTermsUrl', 'logoUrl']) {
    const value = text(input[field], 800);
    if (value) {
      let url; try { url = new URL(value); } catch { throw fail(`${field} must be an HTTPS URL`); }
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || ['localhost','127.0.0.1','::1'].includes(url.hostname)) throw fail(`${field} must be a public HTTPS URL`);
    }
    result[field] = value;
  }
  result.ownership = ['own', 'reseller'].includes(input.ownership) ? input.ownership : '';
  result.volume = input.volume === 'standard' ? 'standard' : 'low';
  return result;
}
export function campaignProfileErrors(profile) {
  const errors = [];
  for (const field of ['legalName','brandName','supportContact','website','portalUrl','organizationPrivacyUrl','organizationTermsUrl','ownership']) if (!profile[field]) errors.push(`${field} is required`);
  if (profile.brandName.length > 60) errors.push('Use a brand name of 60 characters or fewer for SMS response limits');
  if (profile.supportContact.length > 100) errors.push('Use a support contact of 100 characters or fewer');
  if (profile.supportContact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.supportContact) && !/^\+?[\d ().-]{7,30}$/.test(profile.supportContact)) errors.push('Enter a support email address or phone number');
  if (profile.ownership === 'reseller' && !/^R[A-Z0-9]{6}$/i.test(profile.resellerId)) errors.push('A valid Vonage reseller ID is required for customer-business traffic');
  if (profile.ownership === 'reseller' && profile.resellerId.toUpperCase() === 'R000000') errors.push('R000000 is for your own business, not reseller traffic');
  return errors;
}
export function packetLinks(origin, agencyId, program) {
  if (!Object.hasOwn(SMS_PROGRAMS, program)) throw fail('Unknown messaging program');
  const base = `${new URL(origin).origin}/sms-programs/${Number(agencyId)}/${program}`;
  return { exampleUrl: `${base}/consent`, staffExampleUrl: `${base}/consent?audience=staff`, privacyUrl: `${base}/privacy`, termsUrl: `${base}/terms` };
}
export function buildCampaignPacket(profile, { agencyId, program, origin, published = false, publishedAt = null }) {
  if (!Object.hasOwn(SMS_PROGRAMS, program)) throw fail('Unknown messaging program');
  const def = SMS_PROGRAMS[program], links = packetLinks(origin, agencyId, program);
  const brand = profile.brandName || '[BRAND NAME]', legal = profile.legalName || '[LEGAL BUSINESS NAME]', support = profile.supportContact || '[SUPPORT CONTACT]';
  const portal = profile.portalUrl || '[PUBLIC PORTAL URL]';
  const descriptions = {
    operations: 'appointment reminders, confirmations, rescheduling and cancellation notices, portal and session-access links, billing-account update and statement-availability notices, and two-way administrative support. Staff who separately opt in receive work schedule, supervision, team meeting and assigned-training notifications',
    workforce: 'work schedule changes, supervision and team meeting reminders, personal session-access links, and assigned-training notifications',
    polling: 'staff announcements, supervisor-to-team administrative messages, schedule and meeting notifications, portal and session-access links, and optional nonpolitical internal polls, event attendance requests and date or activity selections. Authorized organizers choose the question and answer options and send to selected staff groups. Staff reply with Y/N or numbered choices; an event code identifies the poll when multiple polls are open. Responses are recorded for the organizer. Staff can view final aggregate results in the app after voting closes and separately request a results text for each poll',
    marketing: 'occasional promotional announcements about its own programs, enrollment openings and services',
    account: 'requested account-access and administrative account notifications for its own platform users'
  };
  const description = `${legal}, known as ${brand}, sends ${descriptions[program]}. Recipients are ${def.audience}. Messages are limited to this organization’s program and each recipient’s consent. Message frequency varies. Reply STOP to opt out or HELP for help.${program === 'marketing' ? ' No purchased lists, affiliate offers or third-party marketing.' : ' No promotional marketing.'}${program === 'polling' ? ' No political elections, fundraising, patient information or messaging on behalf of independent customer businesses.' : ''}`;
  const audience = ['polling','workforce'].includes(program) ? 'staff' : 'client';
  const primaryExample = audience === 'staff' ? links.staffExampleUrl : links.exampleUrl;
  const flow = `${brand} provides a private online SMS consent form during onboarding or through a link delivered by email or in person. The recipient chooses Yes or No for each offered message type; no answer is preselected and all answers may be No without affecting services or employment. The recipient provides their mobile number and electronically signs. An authorized administrator reviews the signature and authority before activating only accepted subscriptions. The disclosure, choices, signature and timestamp are retained. For internal polls, recipients can separately request a results text in the app for each poll; this preference does not replace signed polling SMS consent or override STOP. Separate affirmative consent is required for marketing. Public review copy (does not enroll visitors): ${primaryExample}.${program === 'operations' ? ` Separate staff review copy: ${links.staffExampleUrl}.` : ''} Message frequency varies. Message and data rates may apply. Text HELP for help. Text STOP to opt out. Support: ${support}. Carriers are not liable for delayed or undelivered messages. Privacy: ${links.privacyUrl} Terms: ${links.termsUrl}.`;
  const samples = {
    polling: [`${brand}: Will you attend our staff workshop? Reply WORKSHOP Y for Yes or WORKSHOP N for No. Reply STOP to opt out.`, `${brand}: Choose a staff event date. Reply DATES 1 for Tuesday, DATES 2 for Thursday, or DATES 3 for Saturday. Reply STOP to opt out.`, `${brand}: Your supervisor has updated the team meeting time. Sign in at ${portal} for details. Reply STOP to opt out.`, `${brand}: Staff notice: Please review the new training assignment in your account: ${portal}. Reply STOP to opt out.`, `${brand}: The staff date poll is closed. Final totals: Tuesday 8, Thursday 5. You requested this results text. Reply STOP to opt out.`],
    workforce: [`${brand}: Your staff meeting starts soon. Open your personal invitation: ${portal}. Reply STOP to opt out.`, `${brand}: Your schedule has changed. Sign in at ${portal} to review it. Reply STOP to opt out.`],
    operations: [`${brand}: Your appointment is Tuesday at 3 PM. Reply Y to confirm, N to cancel, or R to request rescheduling. Reply STOP to opt out.`, `${brand}: Your session link is available in your account: ${portal}. Reply STOP to opt out.`, `${brand}: Your appointment was canceled. Reply to arrange another time. Reply STOP to opt out.`, `${brand}: Thanks for contacting our team. We can help with your scheduling question. Reply STOP to opt out.`, `${brand}: Your staff meeting starts soon. Open your personal invitation: ${portal}. Reply STOP to opt out.`, `${brand}: Your billing account has an update. Sign in to review your balance or statement: ${portal}. Reply STOP to opt out.`],
    marketing: [`${brand}: Registration is open for our upcoming program. Details: ${profile.website || '[WEBSITE]'}. Reply STOP to opt out.`, `${brand}: We have new program openings. Visit ${profile.website || '[WEBSITE]'} for availability. Reply STOP to opt out.`],
    account: [`${brand}: Your requested account-access instructions are available at ${portal}. Reply STOP to opt out.`, `${brand}: An account update needs your attention. Sign in at ${portal}. Reply STOP to opt out.`]
  }[program];
  const usecase = profile.volume === 'low' ? 'LOW_VOLUME' : def.subUsecases.length > 1 ? 'MIXED' : def.subUsecases[0];
  const registration = { ...profile, ...links, evidenceUrl: primaryExample, purposes: [...def.purposes], keywordOwner: 'application', allowRestart: false, approved: false, numberLinked: false, campaignId: '', resellerId: profile.ownership === 'own' ? 'R000000' : profile.resellerId, messagingPlatform: 'the messaging platform' };
  const packet = {
    version: SMS_PACKET_VERSION, program, profile, published, publishedAt, links, registration,
    missing: campaignProfileErrors(profile),
    steps: [
      { title: '1. Brand and use case', fields: { Brand: `${legal} / ${brand}${profile.brandId ? ` (${profile.brandId})` : ' — enter verified brand ID'}`, 'Use case': usecase === 'LOW_VOLUME' ? 'Low Volume Mixed' : usecase, 'Sub-use cases': usecase === 'LOW_VOLUME' || usecase === 'MIXED' ? def.subUsecases.join(', ') : 'None', 'Scope': def.audience, 'New brand only — legal company name': legal, 'New brand only — DBA / brand name': brand, 'New brand only — organization type': profile.organizationType || '[Select the actual legal organization type]', 'New brand only — vertical': profile.vertical || '[Select the actual industry; coaching does not automatically mean healthcare]', 'New brand only — official address': profile.businessAddress || '[Copy the business address from its official tax records]', 'New brand only — country': profile.country || '[Country of legal registration]', 'New brand only — website and contact': `${profile.website || '[WEBSITE]'} / ${support}`, 'New brand only — EIN / tax ID': 'Enter directly into Vonage from official records. Do not put it on public review pages. Existing verified brands do not need to be registered again.' } },
      { title: '2. Campaign details', fields: { Ownership: profile.ownership === 'own' ? 'My own campaign' : profile.ownership === 'reseller' ? 'Reseller campaign' : '[CONFIRM OWNERSHIP]', 'Reseller ID': registration.resellerId || '[RESELLER ID]', 'Campaign name': `${brand} ${def.name}`.slice(0,50), Description: description } },
      { title: '3. Message flow', fields: { Frequency: 'Recurring', Brand: brand, 'Consent mechanism': 'Online (website, mobile app). Leave other methods unchecked unless actually used and documented.', 'Online URL': primaryExample, 'How consent is obtained': flow, 'Privacy policy': links.privacyUrl, 'Terms and conditions': links.termsUrl, 'Carrier disclaimer': 'Yes — included in the disclosure and terms' } },
      { title: '4. Content attributes', fields: { 'Opt-in keyword': 'Leave blank; no text-to-join enrollment', 'Opt-in message': `${brand}: You subscribed to ${program === 'polling' ? 'the staff notifications and voting program for your selected message types' : program === 'workforce' ? 'workforce notifications' : program === 'marketing' ? 'optional program offers' : program === 'account' ? 'account security messages' : 'appointment reminders'}. Message frequency varies. Message and data rates may apply. Reply HELP for help, STOP to opt out.`, 'Opt-out keywords': 'STOP, END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE, OPT OUT', 'Opt-out message': `${brand}: You are unsubscribed and will receive no further messages from this program.`, 'Help keyword': 'HELP', 'Help message': `${brand}: For help, contact ${support}. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.` } },
      { title: '5. Sample messages', fields: { ...Object.fromEntries(samples.map((sample,index)=>[`Sample ${index+1}`,sample])), 'Embedded links': 'Yes', 'URL samples': `${portal}${program === 'marketing' ? `, ${profile.website}` : ''}`, 'Embedded phone numbers': 'No — these samples contain none; HELP contact alone does not count', 'Age gated': 'No', 'Direct lending': 'No' } },
      { title: '6. Review and submit in Vonage', fields: { 'Before submitting': 'Publish and open the review pages without signing in. Confirm actual identity, program, support contact and consent process. Check the live dashboard fees. Accept terms only if accurate. Generating this packet does not submit it or guarantee approval.', 'Pricing checked 2026-10-06': `${profile.volume === 'low' ? '$1.50/month Low Volume Mixed' : '$10/month standard campaign'}; $15 per campaign vetting event; three-month minimum. Number rental, messages, carrier fees, taxes and any new brand/vetting fees are additional. Low Volume Mixed has carrier limits; verify expected traffic before selecting it.` } },
      { title: '7. Activate after approval', fields: { 'Sender': 'Link a dedicated number to this campaign in Vonage. Confirm its active linkage, then record the real brand/campaign IDs and approved purposes in Texting Numbers. Never mark approval based on this generated packet.', 'Consent': 'Create private consent signing links, review signed choices, and activate only accepted purposes. Configure STOP/HELP ownership and test opted-in delivery and suppression.', 'Program test': program === 'polling' ? 'Configure Company Events SMS with this staff notifications and polling number. Test group targeting, Y/N and 1/2/3, overlapping event codes, vote recording, optional final-results texts, workforce announcements and STOP before rollout. Keep this staff number separate from appointment reminders. Staff select polling and workforce consent independently; a poll result preference never overrides SMS consent or STOP.' : 'Test the actual message producers, recipient permissions and incoming replies before rollout.' } }
    ]
  };
  return packet;
}
export function campaignPacketMarkdown(packet) {
  return `# ${packet.profile.brandName || 'Agency'} — ${SMS_PROGRAMS[packet.program].name}\n\nGenerated ${packet.version}. ${packet.published ? 'Public SMS review pages published.' : 'Draft — publish SMS review pages before submission.'}\n\n${packet.missing.length ? `Missing: ${packet.missing.join('; ')}\n\n` : ''}${packet.steps.map(step=>`## ${step.title}\n\n${Object.entries(step.fields).map(([label,value])=>`**${label}**\n\n${value}`).join('\n\n')}`).join('\n\n')}\n`;
}
export function campaignPublicContent(packet, audience) {
  const defaultAudience = ['polling','workforce'].includes(packet.program) ? 'staff' : 'client';
  const signerRole = audience || defaultAudience;
  if (!['client','guardian','staff'].includes(signerRole)) throw fail('Invalid audience');
  if (['polling','workforce'].includes(packet.program) && signerRole !== 'staff') throw fail('This is a staff program');
  const p = packet.profile;
  return { brandName: p.brandName, legalName: p.legalName, website: p.website, logoUrl: p.logoUrl, organizationTermsUrl: p.organizationTermsUrl, organizationPrivacyUrl: p.organizationPrivacyUrl, programName: SMS_PROGRAMS[packet.program].name, publishedAt: packet.publishedAt, links: packet.links,
    consent: { example: true, signerRole, disclosure: buildSmsConsentDisclosure(packet.registration, { signerRole }) },
    terms: [
      { title: 'Program and sender', body: `${p.legalName} operates ${p.brandName} ${SMS_PROGRAMS[packet.program].name}. ${packet.steps[1].fields.Description}` },
      { title: 'Your choice', body: 'SMS is optional. Choose Yes or No for every offered message type and electronically sign your choices. No choice is preselected. Declining does not affect services, purchases or employment. Marketing requires separate affirmative consent. Consent to another business or another program does not enroll you here.' },
      { title: 'Frequency and charges', body: 'Message frequency varies. Message and data rates may apply. Carriers are not liable for delayed or undelivered messages.' },
      { title: 'Stop or get help', body: `Reply STOP to stop this program across its sending numbers. END, QUIT, CANCEL, UNSUBSCRIBE, REVOKE and OPT OUT are also accepted. Reply HELP for help or contact ${p.supportContact}. You may also contact us to withdraw consent. We honor opt-out requests; changing numbers does not override them.` },
      { title: 'Using your number and links', body: 'Provide a number you control and tell us if it changes. Keep personal invitation links private. Standard SMS is not end-to-end encrypted. Use your secure account for sensitive information. This program is not an emergency service.' },
      { title: 'Scope of these terms', body: `This SMS addendum is part of the organization’s main Terms of Use at ${p.organizationTermsUrl || p.website}. It adds the details for this messaging program; the main terms continue to govern the website and account. The public example demonstrates the consent process and cannot enroll anyone.` }
    ],
    privacy: [
      { title: 'Who operates this program', body: `${p.legalName} operates the ${p.brandName} SMS program. Contact ${p.supportContact} with privacy questions.` },
      { title: 'Information used', body: 'We collect the mobile number, signer name and authority, selected message types, signature, disclosure version, consent timestamp and technical evidence such as IP address and browser information. We also process messages, replies, opt-out requests and delivery records. Internal poll responses are available to authorized organizers and are not anonymous. After voting closes, eligible participants can view aggregate totals without individual voter identities. A participant can separately request a final-results text for each poll.' },
      { title: 'Purpose and access', body: 'We use these records to deliver the messages you accepted, record your responses, provide support, respect your choices and maintain evidence of consent. Access is limited to authorized staff and service providers performing these functions.' },
      { title: 'Service providers and disclosure', body: 'Our software platform, messaging provider and telecommunications carriers process information as needed to deliver this program. We may disclose information when required by law or to protect rights and security. Mobile information will not be shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with third parties except service providers needed to operate the messaging program.' },
      { title: 'Retention and requests', body: `We retain records as needed to operate the program, honor opt-outs and meet applicable recordkeeping obligations. Contact ${p.supportContact} to request access, correction or deletion; some consent or suppression evidence may need to be retained. No fixed deletion period is promised by this notice.` },
      { title: 'Organization privacy policy', body: `This SMS-specific notice supplements the organization’s privacy policy: ${p.organizationPrivacyUrl}. It does not replace a healthcare privacy notice or describe unrelated website and service data practices.` }
    ]
  };
}
