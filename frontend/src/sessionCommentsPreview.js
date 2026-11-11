// Local screenshot fixture only. Production components use a closed, in-memory
// adapter; no user, patient, appointment, message or email service is contacted.
import { createApp, h, onMounted } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import SecureSessionCommentsHost from './components/session-comments/SecureSessionCommentsHost.vue';
import SecureSessionCommentButton from './components/session-comments/SecureSessionCommentButton.vue';
import SecureFamilyAudience from './components/session-comments/SecureFamilyAudience.vue';
import { openSecureSessionComment } from './components/session-comments/sessionComments';
import { FAMILY_COMMUNICATION_NOTICE, FAMILY_COMMUNICATION_POLICY_VERSION } from './navigation/familyCommunicationPolicy';
const screen = new URLSearchParams(window.location.search).get('screen') || 'thread';
const family = screen === 'ack', actorId = family ? 99002 : 99001;
const now = Date.now(), iso = minutes => new Date(now + minutes * 60000).toISOString();
const appointment = { id: 99101, clientId: 99201, agencyId: 99450, clientName: 'Mika Example · fictional', providerName: 'Avery Example', timeZone: 'America/Denver', startAt: iso(90), endAt: iso(150), status: 'scheduled' };
const next = { ...appointment, id: 99102, clientId: 99202, clientName: 'Robin Example · fictional', startAt: iso(210), endAt: iso(270) };
const provider = { id: 99001, name: 'Avery Example', role: 'provider', relationshipType: 'Provider' };
const parent = { id: 99002, name: 'Kai Example', role: 'client_guardian', relationshipType: 'Parent' };
const otherParent = { id: 99003, name: 'Remy Example', role: 'client_guardian', relationshipType: 'Parent' };
const audience = [provider, parent, otherParent];
let acknowledged = !family;
let comments = [
  { id: 99301, body: 'Please remind Mika to bring their practice chart to our next session.', author: parent, createdAt: iso(-80), version: 1, editedAt: null, readAt: null, isOwn: family, recipients: audience, recipientUserIds: audience.map(p => p.id), appointment },
  ...(!family ? [{ id: 99302, body: 'Thank you for the update. Please bring the practice chart so we can review it during our scheduled session.', author: provider, createdAt: iso(-45), version: 2, editedAt: iso(-20), readAt: null, isOwn: true, recipients: audience, recipientUserIds: audience.map(p => p.id), appointment }] : [])
];
// The first-send notice fixture has no already-saved own comment.
if (family) comments = [{ ...comments[0], id: 99304, isOwn: false, author: provider, body: 'Please bring the practice chart to our scheduled session.' }];
const copy = value => structuredClone(value);
const notice = () => ({ version: FAMILY_COMMUNICATION_POLICY_VERSION, agencyId: 99450, acknowledged, notice: FAMILY_COMMUNICATION_NOTICE });
const fixtureApi = {
  async get(url) {
    if (url === '/secure-family-sharing-notice') return { data: copy(notice()) };
    if (url.endsWith('/today')) return { data: copy({ dayKey: new Date().toISOString().slice(0,10), timeZone: 'America/Denver', showSplash: screen === 'splash', dismissed: false, lastSessionEndAt: next.endAt, dayFinished: false, unreadCount: 2, appointments: [{ ...appointment, unreadCount: 1, comments: [comments[0]] }, { ...next, unreadCount: 1, comments: [{ ...comments[0], body: 'I would like to discuss how my week went.', appointment: next }] }] }) };
    if (url.includes('/badges')) return { data: { appointments: [{ appointmentId: 99101, clientId: 99201, count: comments.length, unreadCount: 1 }] } };
    if (/\/appointments\/\d+$/.test(url)) return { data: copy({ appointment, comments, ownComment: comments.find(c => c.author.id === actorId) || null, recipients: audience.filter(p => p.id !== actorId).map(p => ({ ...p, required: true })), canWrite: true, sharingPolicy: 'all_eligible_family' }) };
    if (url.includes('/meta')) return { data: copy({ sharedFamilyConversation: true, thread_id: 99501, agencyId: 99450, sharingPolicy: 'all_eligible_family', participants: audience, readOnly: false }) };
    throw new Error(`Fixture adapter does not permit GET ${url}`);
  },
  async post(url, body) {
    if (url.endsWith('/read')) { comments = comments.map(c => body.commentIds.includes(c.id) ? { ...c, readAt: iso(0) } : c); return { data: { acknowledged: true } }; }
    if (url.endsWith('/attention')) return { data: { action: body.action } };
    if (url === '/secure-family-sharing-notice/ack') { acknowledged = true; return { data: copy(notice()) }; }
    if (url === '/messages/hub/ensure-thread') return { data: copy({ threadId: 99501, agencyId: 99450, clientId: 99201, shared: true, sharingPolicy: 'all_eligible_family', participants: audience }) };
    if (/\/appointments\/\d+$/.test(url)) { const comment = { id: 99305, body: body.body, version: 1, editedAt: null, author: family ? parent : provider, isOwn: true, createdAt: iso(0), recipients: audience, appointment }; comments.push(comment); return { data: copy({ comment }) }; }
    throw new Error(`Fixture adapter does not permit POST ${url}`);
  },
  async patch(url, body) { const id = Number(url.split('/').at(-1)); const old = comments.find(c => c.id === id); if (!old) throw new Error('Unknown fictional comment'); const comment = { ...old, body: body.body, version: old.version + 1, editedAt: iso(0) }; comments = comments.map(c => c.id === id ? comment : c); return { data: copy({ comment }) }; }
};
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:organizationSlug/my-schedule', component: { template: '<div />' } }] });
await router.push({ path: '/fictional/my-schedule', query: screen === 'today' ? { secureSessionComments: 'today' } : {} });
const app = createApp({
  setup() {
    onMounted(() => { if (['thread','edit','ack','phone'].includes(screen)) openSecureSessionComment(99101, 99201); });
    return () => h('main', { class: 'preview-context' }, [
      h('p', { class: 'fixture-label' }, 'FICTIONAL TRAINING PREVIEW · production Vue components · local in-memory data · no messages sent'),
      h('header', [h('h1', 'AuricWell · My Schedule'), h('p', 'Fictional appointments used only to illustrate secure session comments.')]),
      h('section', { class: 'preview-agenda' }, [h('h2', 'Today’s appointment context'), h('article', [h('strong', 'Mika Example · fictional'), h('p','Avery Example · Secure Session Comments'), h(SecureSessionCommentButton,{appointmentId:99101,clientId:99201})]), h('article',[h('strong','Robin Example · fictional'),h('p','Upcoming fictional session')])]),
      ...(screen === 'audience' ? [h(SecureFamilyAudience,{required:true,agencyId:99450,clientId:99201,personKey:'guardian:99002',meId:99001,scopeKey:'fixture'})] : []),
      h(SecureSessionCommentsHost,{userId:actorId,family,scopeKey:'fixture-only'})
    ]);
  }
});
app.provide('secureSessionCommentsApi', fixtureApi).use(createPinia()).use(router).mount('#app');
const style = document.createElement('style');
style.textContent = `*{box-sizing:border-box}body{margin:0;background:#eff4fb;font:16px/1.6 system-ui,sans-serif;color:#143259}.preview-context{max-width:1240px;margin:auto;padding:28px}.fixture-label{background:#fff3cd;color:#6a4c12;border:1px solid #e6cc83;border-radius:8px;padding:9px 14px;font-size:12px;letter-spacing:.03em}.preview-context h1{font-size:32px;margin:20px 0 2px}.preview-context header{border-bottom:1px solid #c8d8ec;padding-bottom:16px}.preview-agenda{margin-top:24px;padding:24px;background:white;border:1px solid #d2deed;border-radius:18px}.preview-agenda article{padding:18px;border-top:1px solid #dbe5f1}.preview-agenda h2{margin:0 0 10px;font-size:20px}@media(max-width:500px){.preview-context{padding:12px}.preview-context h1{font-size:25px}.fixture-label{font-size:10px}}`;
document.head.append(style);
