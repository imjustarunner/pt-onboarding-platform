import { CONVERSA_LOGO_URL, CONVERSA_PREVIEW_URL, CONVERSA_PRODUCT_URL } from '../../constants/conversa.js';
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const conversaCapabilities = [
  ['secure-message', 'Secure messages'], ['email', 'Email'], ['internal-message', 'Internal messages'],
  ['group-message', 'Team texts & polls'], ['chat', 'Chat'], ['thread', 'Threads'], ['channel', 'Channels'],
  ['ticket', 'Tickets'], ['call', 'Calls'], ['voicemail', 'Voicemail'], ['sms', 'SMS'], ['announcement', 'Announcements']
];
const features = [
  ['secure-message', 'Care conversations stay secure', 'Client and guardian conversations have a distinct secure space, authorized shared access, activity logging, and medical-record tracking. Email and text alerts never include the secure message.'],
  ['email', 'Email belongs in the same workspace', 'Read, reply, organize threads, and work with attachments alongside your other communications. The sending organization and address remain clear.'],
  ['group-message', 'Team texts and polls, together', 'Send team updates, collect votes or written answers, review replies, and share results. Superadmins, admins, and support manage these tools; intended recipients can respond.'],
  ['channel', 'Keep team discussions connected', 'Use internal messages, groups, channels, and reply threads to coordinate work. Client and guardian conversations use the secure-message channel.'],
  ['call', 'Follow through across channels', 'Move between calls, voicemail, tickets, SMS, and announcements within the communications workspace, with the appropriate channel and sender identified.'],
  ['read-unread', 'Know who sent it and what needs attention', 'Recognize organization identities, message types, unread states, and delivery history across AuricWell and Plot Twist HQ.']
];
const contexts = {
  ptco: { eyebrow: 'A Plot Twist Co. product', intro: 'Conversa brings the platform’s communications together. Messages by Conversa is the shared interface for email, secure messages, team conversations, texts, polls, and more.', cta: 'Explore Conversa' },
  auricwell: { eyebrow: 'Connected communications in AuricWell', intro: 'Keep care conversations and the work around them connected. Messages by Conversa brings secure client messaging, email, care-team coordination, team texts, and polls into AuricWell.', cta: 'Explore Conversa' },
  hq: { eyebrow: 'A feature of Plot Twist HQ', intro: 'Bring everyday communication into your management workspace. Messages by Conversa connects email, internal discussions, team texts, polls, calls, and service conversations across Plot Twist HQ.', cta: 'Explore Conversa' }
};
const icon = name => `<img src="/assets/conversa/icons/message-types/${name}.svg" width="24" height="24" alt="" loading="lazy">`;
export function conversaFeature({ product = 'ptco', ctaHref = CONVERSA_PRODUCT_URL, ctaLabel = '', heading = 'h2', id = 'conversa-features' } = {}) {
  const context = contexts[product] || contexts.ptco;
  const headingTag = heading === 'h1' ? 'h1' : 'h2';
  return `<section class="conversa-feature" id="${esc(id)}" aria-labelledby="${esc(id)}-title">
    <div class="conversa-feature__intro"><div>
      <img class="conversa-feature__logo" src="${CONVERSA_LOGO_URL}" width="680" height="176" alt="Conversa by Plot Twist Co." loading="lazy">
      <p class="conversa-feature__eyebrow">${context.eyebrow}</p>
      <${headingTag} id="${esc(id)}-title">Every conversation,<br>clearly connected.</${headingTag}><p class="conversa-feature__lead">${context.intro}</p>
      <a class="conversa-feature__cta" href="${esc(ctaHref)}">${esc(ctaLabel || context.cta)} <span aria-hidden="true">→</span></a>
    </div><figure><img src="${CONVERSA_PREVIEW_URL}" width="1440" height="900" alt="Illustration of conversations organized by sender and channel, with a distinct secure-message reading area." loading="lazy"><figcaption>Conversa interface illustration · Example conversations</figcaption></figure></div>
    <div class="conversa-feature__cards">${features.map(([type, title, body]) => `<article>${icon(type)}<h3>${title}</h3><p>${body}</p></article>`).join('')}</div>
    <ul class="conversa-feature__channels" aria-label="Conversa communication features">${conversaCapabilities.map(([type, name]) => `<li>${icon(type)}<span>${name}</span></li>`).join('')}</ul>
    <p class="conversa-feature__relationship">Conversa and AuricWell are wholly owned Plot Twist Co. products. Conversa is integrated with both AuricWell and Plot Twist HQ.</p>
    <p class="conversa-feature__availability">Available channels depend on your organization’s enabled features and integrations. Team texts and poll texts follow recipient consent and delivery preferences.</p>
  </section>`;
}
