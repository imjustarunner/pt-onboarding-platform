<template>
  <section class="cc-mode au-wrap">
    <div class="cc-mode-intro split">
      <div>
        <h2>Admin Update</h2>
        <p>Compose the monthly Admin Update here. Staff get a short branded email with a “Click here for this Admin Update” button. That link asks them to sign in if needed, then lands on this published page in the app — the same page the splash opens. Clicks, scroll, and time spent are tracked there.</p>
      </div>
      <div class="cc-intro-actions">
        <button type="button" class="cc-btn outline" @click="$emit('go-home')">← Center Home</button>
        <button type="button" class="cc-btn outline" :disabled="saving" @click="createDraft">New update</button>
      </div>
    </div>

    <div v-if="error" class="cc-banner-err">{{ error }}</div>
    <p v-if="saveNote" class="au-save-note">{{ saveNote }}</p>

    <div class="au-layout">
      <aside class="au-side">
        <h3>Drafts</h3>
        <ul class="au-drafts">
          <li
            v-for="row in draftRows"
            :key="row.id"
            :class="{ on: Number(row.id) === Number(draft?.id) }"
            @click="openDraft(row.id)"
          >
            <strong>{{ row.title || 'Admin Updates' }}</strong>
            <small>{{ row.status }} · {{ formatWhen(row.updated_at) }}</small>
          </li>
        </ul>
        <p v-if="!draftRows.length && !loading" class="muted">No drafts yet.</p>

        <h3>Sent history</h3>
        <ul class="au-drafts">
          <li
            v-for="row in sentRows"
            :key="'sent-' + row.id"
            :class="{ on: Number(row.id) === Number(draft?.id) }"
            @click="openDraft(row.id)"
          >
            <strong>{{ row.title || 'Admin Updates' }}</strong>
            <small>Sent {{ formatWhen(row.sent_at || row.updated_at) }}</small>
          </li>
        </ul>
        <p v-if="!sentRows.length" class="muted">Nothing sent yet.</p>

        <template v-if="draft">
          <h3>Sections</h3>
          <label v-for="topic in draft.topics" :key="topic.id" class="au-toggle">
            <input type="checkbox" :checked="!!topic.enabled" :disabled="isSent" @change="toggleTopic(topic, $event.target.checked)" />
            <span class="au-swatch" :style="{ background: topic.color }" />
            {{ topic.title }}
          </label>
          <button type="button" class="cc-btn outline sm block" :disabled="isSent" @click="showTopicForm = true">+ Add topic</button>

          <h3>People dates</h3>
          <label class="au-field">
            Staffing since
            <input type="date" :value="dateOnly(draft.staffing_since)" :disabled="isSent" @change="patchDraft({ staffingSince: $event.target.value })" />
          </label>
          <label class="au-field">
            Departures since
            <input type="date" :value="dateOnly(draft.departures_since)" :disabled="isSent" @change="patchDraft({ departuresSince: $event.target.value })" />
          </label>
          <button type="button" class="cc-btn outline sm block" :disabled="saving || isSent" @click="refreshPeople">Refresh hires &amp; departures</button>

          <h3>Send</h3>
          <label class="au-field">
            Email format
            <select :value="draft.delivery_mode || 'link'" :disabled="isSent" @change="patchDraft({ deliveryMode: $event.target.value })">
              <option value="link">Short email — click through to the app</option>
              <option value="html">Full HTML newsletter in the inbox</option>
            </select>
          </label>
          <label class="au-toggle">
            <input type="checkbox" :checked="Number(draft.push_splash) !== 0" :disabled="isSent" @change="patchDraft({ pushSplash: $event.target.checked })" />
            Also show a splash on login that opens this same page
          </label>
          <div class="au-preview-btns">
            <button type="button" class="cc-btn outline sm block" :disabled="previewing" @click="openPreview('email')">
              Preview branded email
            </button>
            <button type="button" class="cc-btn outline sm block" :disabled="previewing" @click="openPreview('splash')">
              Preview splash
            </button>
            <button type="button" class="cc-btn outline sm block" :disabled="previewing" @click="openPreview('page')">
              Preview published page
            </button>
          </div>
          <p v-if="publicViewUrl" class="muted au-link-copy">
            In-app link:
            <a :href="publicViewUrl" target="_blank" rel="noopener">{{ publicViewUrl }}</a>
            <button type="button" class="cc-btn outline sm" @click="copyPublicLink">Copy</button>
          </p>
          <label class="au-field">
            From
            <select :value="draft.sender_identity_id || ''" :disabled="isSent" @change="patchDraft({ senderIdentityId: $event.target.value || null })">
              <option value="">Not assigned</option>
              <option v-for="s in senders" :key="s.id" :value="s.id">{{ s.display_name || s.from_email }} · {{ s.from_email }}</option>
            </select>
          </label>
          <label class="au-field">
            Schedule
            <input type="datetime-local" v-model="scheduleLocal" />
          </label>
          <button type="button" class="cc-btn solid sm block" :disabled="saving || !scheduleLocal || isSent" @click="scheduleSend">
            {{ draft.status === 'scheduled' ? 'Update schedule' : 'Schedule send' }}
          </button>
          <button v-if="draft.status === 'scheduled'" type="button" class="cc-btn outline sm block" @click="cancelSend">Cancel schedule</button>
          <label class="au-field">
            Test email
            <input v-model.trim="testTo" type="email" placeholder="you@itsco.health" />
          </label>
          <button type="button" class="cc-btn outline sm block" :disabled="testing || !testTo" @click="sendTest">
            {{ testing ? 'Sending…' : 'Send test' }}
          </button>
          <button v-if="!isSent" type="button" class="cc-btn outline sm block" @click="removeDraft">Delete draft</button>

          <template v-if="isSent && activity">
            <h3>Activity</h3>
            <ul class="au-stats">
              <li><span>Recipients</span><strong>{{ activity.recipients }}</strong></li>
              <li><span>Email opens</span><strong>{{ activity.emailOpened }}</strong></li>
              <li><span>Opened in app</span><strong>{{ activity.viewed }}</strong></li>
              <li><span>Splash opens</span><strong>{{ activity.splashOpened }}</strong></li>
              <li><span>Avg time</span><strong>{{ formatDwell(activity.avgDwellMs) }}</strong></li>
              <li><span>Avg scroll</span><strong>{{ Math.round(activity.avgScrollPct || 0) }}%</strong></li>
            </ul>
            <p v-if="activity.clicks?.length" class="muted">Top clicks</p>
            <ul class="au-clicks">
              <li v-for="c in activity.clicks.slice(0, 6)" :key="c.url">
                <span>{{ c.clicks }}</span>
                <a :href="c.url" target="_blank" rel="noopener">{{ shortUrl(c.url) }}</a>
              </li>
            </ul>
            <ul class="au-people">
              <li v-for="p in activity.people" :key="p.email">
                <strong>{{ p.name }}</strong>
                <small>
                  {{ p.viewedAt ? 'Opened in app' : (p.openedAt ? 'Opened email' : 'Not opened') }}
                  <template v-if="p.dwellMs"> · {{ formatDwell(p.dwellMs) }}</template>
                  <template v-if="p.scrollPct"> · {{ p.scrollPct }}% scroll</template>
                  <template v-if="p.clicks"> · {{ p.clicks }} clicks</template>
                </small>
              </li>
            </ul>
          </template>
        </template>
      </aside>

      <div v-if="loading && !draft" class="au-empty">Loading Admin Update…</div>
      <div v-else-if="!draft" class="au-empty">
        <p>Create a new Admin Update to start composing this month’s email.</p>
        <button type="button" class="cc-btn solid" @click="createDraft">New update</button>
      </div>

      <div v-else class="au-stage">
        <article :key="draft.id" class="au-mail" :class="{ 'is-sent': isSent }" :style="mailVars">
          <a v-if="publicViewUrl" class="au-inapp-link" :href="publicViewUrl" target="_blank" rel="noopener">View this Admin Update in the app →</a>
          <header class="au-mail-header">
            <img v-if="logoUrl" :src="logoUrl" alt="" class="au-logo" />
            <h1
              contenteditable="true"
              spellcheck="true"
              @blur="saveText('title', $event)"
            >{{ draft.title }}</h1>
            <p
              class="au-sub"
              contenteditable="true"
              @blur="saveText('subtitle', $event)"
            >{{ draft.subtitle }}</p>
          </header>

          <div class="au-mail-body">
            <p class="au-greet" contenteditable="true" @blur="saveText('greeting', $event)">{{ draft.greeting }}</p>
            <p class="au-intro" contenteditable="true" @blur="saveText('intro_html', $event)">{{ draft.intro_html }}</p>

            <label class="au-inline-toggle">
              <input type="checkbox" :checked="!!Number(draft.featured_enabled)" @change="patchDraft({ featuredEnabled: $event.target.checked })" />
              Featured highlight
            </label>
            <div v-if="Number(draft.featured_enabled)" class="au-featured">
              <div class="au-star">⭐</div>
              <div>
                <div class="au-kicker">Featured this month</div>
                <h3 contenteditable="true" @blur="saveText('featured_title', $event)">{{ draft.featured_title || 'Featured title' }}</h3>
                <p contenteditable="true" @blur="saveText('featured_body', $event)">{{ draft.featured_body || 'Add a short highlight.' }}</p>
              </div>
            </div>

            <div class="au-kicker">This month’s topics</div>
            <div class="au-grid">
              <button
                v-for="topic in enabledTopics"
                :key="'card-' + topic.id"
                type="button"
                class="au-card"
                :style="{ borderColor: topic.color + '33' }"
                @click="jumpTo(topic)"
              >
                <span class="au-icon" :style="{ background: topic.color }">{{ iconEmoji(topic.icon_key) }}</span>
                <strong>{{ topic.title }}</strong>
                <small>{{ topic.description }}</small>
              </button>
            </div>

            <section
              v-for="topic in enabledTopics"
              :id="anchor(topic)"
              :key="'sec-' + topic.id"
              class="au-section"
            >
              <header class="au-sec-h" :style="{ background: topic.color }">
                <span class="au-icon lg">{{ iconEmoji(topic.icon_key) }}</span>
                <div>
                  <h2 contenteditable="true" @blur="saveTopic(topic, 'title', $event)">{{ topic.title }}</h2>
                  <p contenteditable="true" @blur="saveTopic(topic, 'description', $event)">{{ topic.description }}</p>
                </div>
                <div class="au-sec-tools">
                  <select :value="topic.icon_key" @change="saveTopicValue(topic, { iconKey: $event.target.value })">
                    <option v-for="ic in icons" :key="ic.key" :value="ic.key">{{ ic.emoji }} {{ ic.label }}</option>
                  </select>
                  <input type="color" :value="topic.color" @change="saveTopicValue(topic, { color: $event.target.value })" />
                </div>
              </header>
              <div class="au-sec-body">
                <p
                  class="au-topic-body"
                  contenteditable="true"
                  data-placeholder="Optional section intro…"
                  @blur="saveTopic(topic, 'body_html', $event)"
                >{{ topic.body_html }}</p>

                <article v-for="item in includedItems(topic)" :key="item.id" class="au-person">
                  <img v-if="item.photo_url" :src="item.photo_url" alt="" />
                  <div v-else class="au-avatar" :style="{ color: topic.color, background: topic.color + '22' }">
                    {{ (item.display_name || '?').slice(0, 1) }}
                  </div>
                  <div class="au-person-copy">
                    <strong contenteditable="true" @blur="saveItem(item, 'display_name', $event)">{{ item.display_name }}</strong>
                    <small>{{ item.role_title || item.status_label }} <template v-if="item.tenure_text">· With us {{ item.tenure_text }}</template></small>
                    <p
                      v-if="topic.topic_key === 'departures'"
                      class="au-dest"
                    >
                      Where they’re going (optional):
                      <span contenteditable="true" @blur="saveItem(item, 'destination', $event)">{{ item.destination || '' }}</span>
                    </p>
                    <p contenteditable="true" @blur="saveItem(item, 'body_text', $event)">{{ item.body_text }}</p>
                    <label class="au-include">
                      <input type="checkbox" :checked="Number(item.included) === 1" @change="saveItemValue(item, { included: $event.target.checked })" />
                      Include
                    </label>
                  </div>
                </article>

                <button
                  v-if="topic.topic_key !== 'staffing' && topic.topic_key !== 'departures'"
                  type="button"
                  class="cc-btn outline sm"
                  @click="addCustomItem(topic)"
                >+ Add item</button>
                <button
                  v-if="!topic.is_builtin"
                  type="button"
                  class="cc-btn outline sm"
                  @click="removeTopic(topic)"
                >Delete topic</button>
              </div>
            </section>

            <label class="au-inline-toggle">
              <input type="checkbox" :checked="!!Number(draft.support_enabled)" @change="patchDraft({ supportEnabled: $event.target.checked })" />
              Support box
            </label>
            <div v-if="Number(draft.support_enabled)" class="au-support">
              <h3 contenteditable="true" @blur="saveText('support_title', $event)">{{ draft.support_title }}</h3>
              <p contenteditable="true" @blur="saveText('support_body', $event)">{{ draft.support_body }}</p>
              <p contenteditable="true" @blur="saveText('support_email', $event)">{{ draft.support_email || 'support@example.com' }}</p>
            </div>
          </div>

          <footer class="au-mail-footer">
            <p contenteditable="true" @blur="saveText('footer_tagline', $event)">{{ draft.footer_tagline }}</p>
            <small>© {{ new Date().getFullYear() }} {{ agencyName }}. All rights reserved.</small>
          </footer>
        </article>
        <button type="button" class="au-top" @click="scrollTop">↑</button>
      </div>
    </div>

    <div v-if="previewOpen" class="au-modal au-preview-modal" @click.self="closePreview">
      <div class="au-preview-shell" role="dialog" aria-modal="true" aria-label="Admin Update preview">
        <div class="au-preview-top">
          <div>
            <h3>Preview</h3>
            <p class="muted">{{ previewHint }}</p>
          </div>
          <button type="button" class="cc-btn outline sm" @click="closePreview">Close</button>
        </div>
        <div class="au-preview-tabs" role="tablist">
          <button type="button" role="tab" :aria-selected="previewTab === 'email'" :class="{ on: previewTab === 'email' }" @click="previewTab = 'email'">Branded email</button>
          <button type="button" role="tab" :aria-selected="previewTab === 'splash'" :class="{ on: previewTab === 'splash' }" @click="previewTab = 'splash'">Splash</button>
          <button type="button" role="tab" :aria-selected="previewTab === 'page'" :class="{ on: previewTab === 'page' }" @click="previewTab = 'page'">Published page</button>
        </div>
        <div v-if="previewing" class="au-preview-loading">Loading preview…</div>
        <div v-else-if="previewError" class="au-preview-loading">{{ previewError }}</div>
        <div v-else class="au-preview-body">
          <iframe
            v-if="previewTab === 'email'"
            class="au-preview-frame"
            title="Branded email preview"
            :srcdoc="previewEmailHtml"
          />
          <div v-else-if="previewTab === 'splash'" class="au-splash-stage">
            <div class="au-splash-backdrop">
              <div class="au-splash-card">
                <div class="au-splash-head">
                  <BrandingLogo size="medium" :logoUrl="previewSplash.logoUrl" />
                  <div class="au-splash-brand">{{ previewSplash.agencyName }}</div>
                </div>
                <h3 class="au-splash-title">{{ previewSplash.title }}</h3>
                <p class="au-splash-message">{{ previewSplash.subtitle }}</p>
                <div class="au-splash-actions">
                  <button type="button" class="cc-btn outline" @click="closePreview">Later</button>
                  <button type="button" class="cc-btn solid" @click="previewTab = 'page'">Open Admin Update</button>
                </div>
              </div>
            </div>
          </div>
          <iframe
            v-else
            class="au-preview-frame"
            title="Published Admin Update preview"
            :srcdoc="previewPageHtml"
          />
        </div>
      </div>
    </div>

    <div v-if="showTopicForm" class="au-modal" @click.self="showTopicForm = false">
      <div class="au-modal-card">
        <h3>Add a topic</h3>
        <label class="au-field">Title <input v-model.trim="newTopic.title" /></label>
        <label class="au-field">Description <input v-model.trim="newTopic.description" /></label>
        <label class="au-field">
          Icon
          <select v-model="newTopic.iconKey">
            <option v-for="ic in icons" :key="ic.key" :value="ic.key">{{ ic.emoji }} {{ ic.label }}</option>
          </select>
        </label>
        <label class="au-field">
          Color
          <div class="au-colors">
            <button
              v-for="c in colors"
              :key="c"
              type="button"
              class="au-color"
              :class="{ on: newTopic.color === c }"
              :style="{ background: c }"
              @click="newTopic.color = c"
            />
          </div>
        </label>
        <div class="au-modal-actions">
          <button type="button" class="cc-btn outline" @click="showTopicForm = false">Cancel</button>
          <button type="button" class="cc-btn solid" :disabled="!newTopic.title" @click="createTopic">Add topic</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import BrandingLogo from '../BrandingLogo.vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { ADMIN_UPDATE_COLORS, ADMIN_UPDATE_ICONS, iconByKey } from '../../constants/adminUpdateCatalog.js';

defineProps({
  prefix: { type: String, default: '' }
});
defineEmits(['go-home']);

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const error = ref('');
const saveNote = ref('');
const drafts = ref([]);
const draft = ref(null);
const senders = ref([]);
const testTo = ref(authStore.user?.email || '');
const scheduleLocal = ref('');
const activity = ref(null);
const publicViewUrl = ref('');
const previewOpen = ref(false);
const previewing = ref(false);
const previewTab = ref('email');
const previewError = ref('');
const previewEmailHtml = ref('');
const previewPageHtml = ref('');
const previewSplash = ref({ title: '', subtitle: '', agencyName: '', logoUrl: '' });
const showTopicForm = ref(false);
const newTopic = reactive({
  title: '',
  description: '',
  iconKey: 'spark',
  color: ADMIN_UPDATE_COLORS[0]
});

const icons = ADMIN_UPDATE_ICONS;
const colors = ADMIN_UPDATE_COLORS;

const agencyId = computed(() => agencyStore.currentAgency?.id);
const agencyName = computed(() => agencyStore.currentAgency?.name || 'Our team');
const logoUrl = computed(() => agencyStore.currentAgency?.logo_url || '');
const enabledTopics = computed(() => (draft.value?.topics || []).filter((t) => Number(t.enabled) === 1));
const isSent = computed(() => String(draft.value?.status || '') === 'sent');
const draftRows = computed(() => (drafts.value || []).filter((r) => r.status !== 'sent'));
const sentRows = computed(() => (drafts.value || []).filter((r) => r.status === 'sent'));

const mailVars = computed(() => {
  const palette = agencyStore.currentAgency?.color_palette;
  let parsed = palette;
  if (typeof palette === 'string') {
    try { parsed = JSON.parse(palette); } catch { parsed = {}; }
  }
  const primary = parsed?.primary || parsed?.primaryColor || '#0f172a';
  return { '--au-primary': primary };
});

function iconEmoji(key) {
  return iconByKey(key)?.emoji || '✨';
}
function anchor(topic) {
  return `au-${String(topic.topic_key || topic.id).replace(/[^a-z0-9_-]/gi, '')}`;
}
function includedItems(topic) {
  return topic.items || [];
}
function dateOnly(v) {
  return v ? String(v).slice(0, 10) : '';
}
function formatWhen(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
function jumpTo(topic) {
  document.getElementById(anchor(topic))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function scrollTop() {
  document.querySelector('.au-stage')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function formatDwell(ms) {
  const n = Number(ms || 0);
  if (n < 1000) return '—';
  const sec = Math.round(n / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.slice(0, 48);
  } catch {
    return String(url || '').slice(0, 48);
  }
}

const previewHint = computed(() => {
  if (previewTab.value === 'email') return 'This is the short branded email staff receive. The button takes them to login, then the published page.';
  if (previewTab.value === 'splash') return 'This is the login splash. Open goes to the same published page as the email button.';
  return 'This is the full Admin Update staff see in the app after they click through.';
});

async function loadPreviewPayload() {
  if (!draft.value?.id) return;
  previewing.value = true;
  previewError.value = '';
  try {
    const res = await api.get(`${base()}/${draft.value.id}/preview`, { skipGlobalLoading: true });
    previewEmailHtml.value = res.data?.emailHtml || res.data?.inboxHtml || '';
    previewPageHtml.value = res.data?.pageHtml || res.data?.html || '';
    previewSplash.value = {
      title: res.data?.splash?.title || draft.value.title || 'Admin Update',
      subtitle: res.data?.splash?.subtitle || draft.value.subtitle || 'This month’s Admin Update is ready in the app. Open it to read the full newsletter.',
      agencyName: res.data?.splash?.agencyName || agencyName.value,
      logoUrl: res.data?.splash?.logoUrl || logoUrl.value
    };
    if (res.data?.viewUrl) publicViewUrl.value = res.data.viewUrl;
  } catch (e) {
    previewError.value = e?.response?.data?.error?.message || 'Failed to load preview';
  } finally {
    previewing.value = false;
  }
}

async function openPreview(tab) {
  previewTab.value = tab || 'email';
  previewOpen.value = true;
  await loadPreviewPayload();
}

function closePreview() {
  previewOpen.value = false;
}

async function copyPublicLink() {
  if (!publicViewUrl.value) return;
  try {
    await navigator.clipboard.writeText(publicViewUrl.value);
    saveNote.value = 'In-app link copied.';
  } catch {
    saveNote.value = publicViewUrl.value;
  }
}

function base() {
  return `/agencies/${agencyId.value}/admin-updates`;
}

async function loadList() {
  if (!agencyId.value) return;
  const [listRes, senderRes] = await Promise.all([
    api.get(base(), { skipGlobalLoading: true }),
    api.get('/email-senders', { params: { agencyId: agencyId.value }, skipGlobalLoading: true })
  ]);
  drafts.value = listRes.data?.updates || [];
  senders.value = Array.isArray(senderRes.data) ? senderRes.data : [];
}

async function openDraft(id) {
  if (!agencyId.value || !id) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`${base()}/${id}`, { skipGlobalLoading: true });
    draft.value = res.data;
    scheduleLocal.value = toLocalInput(res.data.scheduled_at);
    publicViewUrl.value = '';
    activity.value = null;
    try {
      const linkRes = await api.get(`${base()}/${id}/public-link`, { skipGlobalLoading: true });
      publicViewUrl.value = linkRes.data?.viewUrl || '';
    } catch { /* ignore */ }
    if (res.data?.status === 'sent') {
      try {
        const act = await api.get(`${base()}/${id}/activity`, { skipGlobalLoading: true });
        activity.value = act.data;
      } catch { /* ignore */ }
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load Admin Update';
  } finally {
    loading.value = false;
  }
}

async function createDraft() {
  if (!agencyId.value) return;
  saving.value = true;
  error.value = '';
  try {
    const res = await api.post(base(), { title: 'Admin Updates' }, { skipGlobalLoading: true });
    draft.value = res.data;
    await loadList();
    saveNote.value = 'Draft created. Staffing and departures were pulled from the app.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to create Admin Update';
  } finally {
    saving.value = false;
  }
}

async function patchDraft(payload) {
  if (!draft.value?.id) return;
  saving.value = true;
  try {
    const res = await api.put(`${base()}/${draft.value.id}`, payload, { skipGlobalLoading: true });
    draft.value = res.data;
    saveNote.value = 'Saved';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

function saveText(field, event) {
  const value = String(event.target.innerText || '').trim();
  const map = {
    title: 'title',
    subtitle: 'subtitle',
    greeting: 'greeting',
    intro_html: 'introHtml',
    featured_title: 'featuredTitle',
    featured_body: 'featuredBody',
    support_title: 'supportTitle',
    support_body: 'supportBody',
    support_email: 'supportEmail',
    footer_tagline: 'footerTagline'
  };
  patchDraft({ [map[field] || field]: value });
}

async function saveTopic(topic, field, event) {
  const value = String(event.target.innerText || '').trim();
  const map = { title: 'title', description: 'description', body_html: 'bodyHtml' };
  await saveTopicValue(topic, { [map[field] || field]: value });
}

async function saveTopicValue(topic, payload) {
  if (!draft.value?.id) return;
  try {
    const res = await api.put(`${base()}/${draft.value.id}/topics/${topic.id}`, payload, { skipGlobalLoading: true });
    Object.assign(topic, res.data);
    saveNote.value = 'Saved';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save topic';
  }
}

async function toggleTopic(topic, enabled) {
  topic.enabled = enabled;
  await saveTopicValue(topic, { enabled });
}

async function saveItem(item, field, event) {
  const value = String(event.target.innerText || '').trim();
  await saveItemValue(item, { [field]: value });
}

async function saveItemValue(item, payload) {
  if (!draft.value?.id) return;
  try {
    const res = await api.put(`${base()}/${draft.value.id}/items/${item.id}`, payload, { skipGlobalLoading: true });
    Object.assign(item, res.data);
    saveNote.value = 'Saved';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save item';
  }
}

async function addCustomItem(topic) {
  try {
    const res = await api.post(`${base()}/${draft.value.id}/topics/${topic.id}/items`, {
      displayName: 'New item',
      bodyText: '',
      kind: 'custom'
    }, { skipGlobalLoading: true });
    topic.items = [...(topic.items || []), res.data];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to add item';
  }
}

async function createTopic() {
  try {
    const res = await api.post(`${base()}/${draft.value.id}/topics`, { ...newTopic }, { skipGlobalLoading: true });
    draft.value.topics = [...(draft.value.topics || []), { ...res.data, items: [] }];
    showTopicForm.value = false;
    newTopic.title = '';
    newTopic.description = '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to add topic';
  }
}

async function removeTopic(topic) {
  if (!window.confirm('Delete this custom topic?')) return;
  try {
    await api.delete(`${base()}/${draft.value.id}/topics/${topic.id}`, { skipGlobalLoading: true });
    draft.value.topics = draft.value.topics.filter((t) => t.id !== topic.id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to delete topic';
  }
}

async function refreshPeople() {
  saving.value = true;
  try {
    const res = await api.post(`${base()}/${draft.value.id}/refresh-people`, {}, { skipGlobalLoading: true });
    draft.value = res.data;
    saveNote.value = 'Hires and departures refreshed from the app.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to refresh people';
  } finally {
    saving.value = false;
  }
}

function toLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function scheduleSend() {
  if (!scheduleLocal.value) return;
  saving.value = true;
  try {
    const res = await api.post(`${base()}/${draft.value.id}/schedule`, {
      scheduledAt: new Date(scheduleLocal.value).toISOString()
    }, { skipGlobalLoading: true });
    draft.value = res.data;
    await loadList();
    saveNote.value = 'Scheduled. Internal staff will receive this email at that time.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to schedule';
  } finally {
    saving.value = false;
  }
}

async function cancelSend() {
  try {
    const res = await api.post(`${base()}/${draft.value.id}/cancel`, {}, { skipGlobalLoading: true });
    draft.value = res.data;
    await loadList();
    saveNote.value = 'Schedule cancelled.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to cancel';
  }
}

async function sendTest() {
  testing.value = true;
  error.value = '';
  try {
    await api.post(`${base()}/${draft.value.id}/test`, { to: testTo.value }, { skipGlobalLoading: true });
    saveNote.value = `Test sent to ${testTo.value}`;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to send test';
  } finally {
    testing.value = false;
  }
}

async function removeDraft() {
  if (!window.confirm('Delete this Admin Update draft?')) return;
  try {
    await api.delete(`${base()}/${draft.value.id}`, { skipGlobalLoading: true });
    draft.value = null;
    await loadList();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to delete';
  }
}

onMounted(async () => {
  try {
    loading.value = true;
    await loadList();
    if (drafts.value[0]) await openDraft(drafts.value[0].id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load Admin Updates';
  } finally {
    loading.value = false;
  }
});

watch(agencyId, async () => {
  draft.value = null;
  await loadList();
  if (drafts.value[0]) await openDraft(drafts.value[0].id);
});
</script>

<style scoped>
.au-wrap { min-height: 70vh; }
.au-save-note { color: #0f766e; font-size: 13px; font-weight: 700; margin: 0 0 10px; }
.au-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 16px; align-items: start; }
.au-side {
  background: var(--cc-surface, #fff);
  border: 1px solid var(--cc-line, #e2e8f0);
  border-radius: 16px;
  padding: 14px;
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 120px);
  overflow: auto;
}
.au-side h3 { margin: 16px 0 8px; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #64748b; }
.au-side h3:first-child { margin-top: 0; }
.au-drafts { list-style: none; margin: 0; padding: 0; }
.au-drafts li {
  padding: 8px 10px; border-radius: 10px; cursor: pointer; margin-bottom: 4px;
}
.au-drafts li.on, .au-drafts li:hover { background: #f1f5f9; }
.au-drafts strong { display: block; font-size: 13px; }
.au-drafts small { color: #64748b; font-size: 11px; }
.au-toggle, .au-inline-toggle, .au-include {
  display: flex; align-items: center; gap: 8px; font-size: 13px; margin: 6px 0;
}
.au-swatch { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.au-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; margin: 8px 0; }
.au-field input, .au-field select { font-weight: 500; padding: 6px 8px; border-radius: 8px; border: 1px solid #cbd5e1; }
.au-empty { padding: 48px 20px; text-align: center; color: #64748b; }
.au-stage { position: relative; max-height: calc(100vh - 140px); overflow: auto; scroll-behavior: smooth; }
.au-mail.is-sent [contenteditable] { pointer-events: none; caret-color: transparent; }
.au-mail.is-sent .au-sec-tools,
.au-mail.is-sent .au-include,
.au-mail.is-sent .au-inline-toggle { display: none; }
.au-mail {
  max-width: 720px;
  margin: 0 auto;
  background: #fff;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 18px 50px rgba(15, 23, 42, .12);
}
.au-inapp-link {
  display: block;
  padding: 10px 28px;
  background: #f8fafc;
  color: #0f766e;
  font-weight: 800;
  font-size: 13px;
  text-decoration: none;
  border-bottom: 1px solid #e2e8f0;
}
.au-link-copy { font-size: 12px; word-break: break-all; }
.au-link-copy a { display: block; margin: 4px 0; }
.au-preview-btns { margin: 8px 0 4px; }
.au-stats, .au-clicks, .au-people { list-style: none; margin: 0; padding: 0; }
.au-stats li, .au-clicks li { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 4px 0; }
.au-people li { padding: 6px 0; border-bottom: 1px solid #e2e8f0; }
.au-people strong { display: block; font-size: 12px; }
.au-people small { color: #64748b; font-size: 11px; }
.au-mail-header {
  background: var(--au-primary, #0f172a);
  color: #fff;
  padding: 28px;
}
.au-logo { height: 40px; display: block; margin-bottom: 12px; }
.au-mail-header h1 { margin: 0; font-size: 28px; }
.au-sub { margin: 6px 0 0; opacity: .88; }
.au-mail-body { padding: 24px 28px; }
.au-greet { font-size: 18px; font-weight: 800; margin: 0 0 8px; }
.au-intro { color: #334155; line-height: 1.6; }
.au-kicker { font-size: 11px; letter-spacing: .08em; font-weight: 800; text-transform: uppercase; color: #0f766e; margin: 18px 0 8px; }
.au-featured {
  display: flex; gap: 12px; background: #ecfeff; border-radius: 16px; padding: 16px; margin: 8px 0 16px;
}
.au-star { width: 40px; height: 40px; border-radius: 50%; background: #14b8a6; display: grid; place-items: center; }
.au-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.au-card {
  text-align: left; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; cursor: pointer;
}
.au-card strong { display: block; margin-top: 8px; font-size: 14px; }
.au-card small { display: block; color: #64748b; margin-top: 4px; }
.au-icon {
  width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 16px;
}
.au-icon.lg { width: 44px; height: 44px; font-size: 22px; background: rgba(255,255,255,.18); }
.au-section { margin: 22px 0; scroll-margin-top: 12px; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
.au-sec-h { color: #fff; padding: 16px 18px; display: flex; gap: 12px; align-items: center; }
.au-sec-h h2 { margin: 0; font-size: 20px; }
.au-sec-h p { margin: 4px 0 0; opacity: .9; font-size: 13px; }
.au-sec-tools { margin-left: auto; display: flex; gap: 6px; }
.au-sec-tools select, .au-sec-tools input { border: 0; border-radius: 8px; padding: 4px; }
.au-sec-body { padding: 14px 18px 18px; background: #fff; }
.au-topic-body { min-height: 24px; color: #334155; }
.au-person { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
.au-person img, .au-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; }
.au-avatar { display: grid; place-items: center; font-weight: 800; }
.au-person-copy strong { display: block; }
.au-person-copy small { color: #64748b; }
.au-dest { font-size: 13px; color: #475569; }
.au-support { background: #f0fdfa; border-radius: 16px; padding: 16px 18px; margin-top: 8px; }
.au-mail-footer { background: var(--au-primary, #0f172a); color: #fff; padding: 22px 28px; }
.au-mail-footer p { margin: 0 0 8px; font-weight: 700; }
.au-top {
  position: sticky; bottom: 16px; float: right; margin: -48px 12px 12px 0;
  width: 40px; height: 40px; border-radius: 50%; border: 0; background: #0f172a; color: #fff; cursor: pointer;
}
.au-modal {
  position: fixed; inset: 0; background: rgba(15,23,42,.45); display: grid; place-items: center; z-index: 40;
}
.au-modal-card { background: #fff; border-radius: 16px; padding: 20px; width: min(420px, 92vw); }
.au-colors { display: flex; flex-wrap: wrap; gap: 6px; }
.au-color { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.au-color.on { border-color: #0f172a; }
.au-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.au-preview-modal { z-index: 50; padding: 16px; }
.au-preview-shell {
  width: min(920px, 96vw);
  height: min(88vh, 900px);
  background: #fff;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 70px rgba(15, 23, 42, .28);
}
.au-preview-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 18px 8px;
}
.au-preview-top h3 { margin: 0 0 4px; }
.au-preview-tabs {
  display: flex;
  gap: 6px;
  padding: 0 18px 12px;
  border-bottom: 1px solid #e2e8f0;
}
.au-preview-tabs button {
  border: 0;
  background: #f1f5f9;
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  color: #334155;
}
.au-preview-tabs button.on { background: #0f172a; color: #fff; }
.au-preview-loading { padding: 48px 20px; text-align: center; color: #64748b; }
.au-preview-body { flex: 1; min-height: 0; background: #e2e8f0; }
.au-preview-frame { display: block; width: 100%; height: 100%; border: 0; background: #e2e8f0; }
.au-splash-stage { height: 100%; }
.au-splash-backdrop {
  height: 100%;
  background: rgba(15, 23, 42, 0.7);
  display: grid;
  place-items: center;
  padding: 20px;
}
.au-splash-card {
  width: min(700px, 96%);
  border-radius: 16px;
  background: #fff;
  padding: 20px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, .2);
}
.au-splash-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.au-splash-brand { font-weight: 800; color: #64748b; }
.au-splash-title { margin: 0 0 8px; font-size: 28px; font-weight: 800; line-height: 1.2; color: #0f172a; }
.au-splash-message { margin: 0; color: #334155; font-size: 18px; line-height: 1.45; }
.au-splash-actions { margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px; }
.muted { color: #64748b; font-size: 13px; }
@media (max-width: 980px) {
  .au-layout { grid-template-columns: 1fr; }
  .au-side { position: static; max-height: none; }
  .au-grid { grid-template-columns: 1fr; }
}
</style>
