<template>
  <div class="user-communications-tab conversa-surface">
    <GuardianCommunicationsWorkspace v-if="recipientOnly" :guardian-id="userId" :view-only="viewOnly" />
    <section class="announcement-workspace" aria-label="Announcement and splash editor">
      <header class="announcement-heading"><div><p class="announcement-eyebrow">Portal updates</p><h3>Announcement / Splash</h3><p>{{ recipientOnly ? 'Schedule a private announcement or splash for this guardian.' : 'Schedule an announcement from this profile.' }}</p></div><span v-if="recipientOnly" class="private-audience">This guardian only</span></header>
      <div class="announcement-layout">
        <div class="announcement-editor">
          <div class="announcement-fields">
            <label>Organization<select v-model="postDraft.agencyId" :disabled="viewOnly || posting"><option value="" disabled>Select organization</option><option v-for="agency in userAgencies" :key="agency.id" :value="String(agency.id)">{{agency.name}}</option></select></label>
            <label>Display as<select v-model="postDraft.displayType" :disabled="viewOnly || posting"><option value="announcement">Announcement banner</option><option value="splash">Splash card</option></select></label>
            <label v-if="!recipientOnly">Audience<select v-model="postDraft.scope" :disabled="viewOnly || posting"><option value="user">This user only</option><option value="everyone">Everyone in agency</option></select></label>
          </div>
          <label class="announcement-title">Title <small>Optional · {{postDraft.title.length}} / 255</small><input v-model="postDraft.title" type="text" maxlength="255" placeholder="A clear title for your update" :disabled="viewOnly || posting"/></label>
          <label class="announcement-message">Message <small>{{postDraft.message.length}} / 1,200</small><textarea v-model="postDraft.message" rows="8" maxlength="1200" placeholder="Write the message you want them to see in their portal…" :disabled="viewOnly || posting"/></label>
          <div v-if="postDraft.displayType==='splash'" class="splash-image-fields"><label>Image URL <small>Optional</small><input v-model="postDraft.splashImageUrl" type="url" maxlength="512" placeholder="https://…" :disabled="viewOnly || posting"/></label><label class="image-upload">Or upload an image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" :disabled="viewOnly || posting || profileSplashUploading || !postDraft.agencyId" @change="onProfileAnnouncementSplashFile"/></label><p v-if="profileSplashUploading" role="status">Uploading image…</p></div>
          <div class="announcement-dates"><label>Starts<input v-model="postDraft.startsAt" type="datetime-local" :disabled="viewOnly || posting"/></label><label>Ends<input v-model="postDraft.endsAt" type="datetime-local" :disabled="viewOnly || posting"/></label></div>
          <p class="announcement-help">Times use {{localTimeZone}}.</p><p v-if="postDraft.startsAt && postDraft.endsAt && new Date(postDraft.endsAt)<=new Date(postDraft.startsAt)" role="alert">Choose an end time after the start time.</p>
          <p v-if="postError" role="alert">{{postError}}</p><p v-if="postSuccess" class="announcement-success" role="status">{{postSuccess}}</p>
          <button class="btn btn-primary" type="button" @click="postAnnouncementFromProfile" :disabled="viewOnly || posting || profileSplashUploading || !canPostFromProfile">{{posting?'Posting…':'Post now'}}</button>
        </div>
        <aside class="announcement-preview" aria-label="Live announcement preview">
          <div class="preview-label"><strong>Live preview</strong><span>{{postDraft.displayType==='splash'?'Splash card':'Announcement banner'}}</span></div>
          <div class="portal-preview"><div class="preview-portal-bar"><span class="portal-dot"></span>{{previewAgencyName}} portal</div><article class="preview-card" :class="{'preview-splash':postDraft.displayType==='splash'}"><img v-if="postDraft.displayType==='splash' && previewImageUrl && !previewImageFailed" :src="previewImageUrl" alt="Splash image preview" @error="previewImageFailed=true"/><p v-if="previewImageFailed" class="announcement-help">This image could not be loaded.</p><div class="preview-copy"><span class="preview-update">{{postDraft.displayType==='splash'?'A message for you':'Portal announcement'}}</span><h4 v-if="postDraft.title.trim()">{{postDraft.title}}</h4><p class="preview-message" :class="{'preview-placeholder':!postDraft.message.trim()}">{{postDraft.message || 'Your message will appear here as you write.'}}</p><span v-if="postDraft.displayType==='splash'" class="preview-dismiss">Continue to portal</span></div></article></div>
          <p class="announcement-help">{{recipientOnly?'Visible only to this guardian during the selected dates.':postDraft.scope==='everyone'?'Visible to everyone in the selected organization.':'Visible only to this user during the selected dates.'}}</p><p class="announcement-help">This preview shows portal placement. Email, SMS, and secure messages use the conversation tools above.</p>
        </aside>
      </div>
    </section>
    <details class="system-history" :open="!recipientOnly"><summary>Generated notices & system texts</summary>
    <div class="tab-header">
      <h3>Generated Communications</h3>
      <div class="filter-controls">
        <select v-model="selectedAgency" @change="loadCommunications" class="form-select">
          <option value="">All Agencies</option>
          <option v-for="agency in userAgencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
        <select v-model="selectedType" @change="loadCommunications" class="form-select">
          <option value="">All Types</option>
          <option value="user_welcome">User Welcome</option>
          <option value="password_reset">Password Reset</option>
          <option value="account_login_help">Login Help</option>
          <option value="invitation">Invitation</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading communications...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="communications.length === 0" class="empty-state">
      <p>No communications found for this user.</p>
    </div>
    <div v-else class="communications-list">
      <div v-for="comm in communications" :key="comm.id" class="communication-card">
        <div class="communication-header">
          <div class="communication-info">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
              <h4 style="margin: 0;">{{ comm.subject }}</h4>
              <button
                v-if="comm.client_id"
                type="button"
                class="re-client-chip"
                :title="comm.client_initials ? `Open client ${comm.client_initials}` : 'Open client profile'"
                @click="openClientProfile(comm.client_id)"
              >
                Re: client {{ comm.client_initials || `#${comm.client_id}` }}
              </button>
              <span v-if="comm.opened_at" class="open-chip" title="Tracking pixel detected an open">
                Opened
              </span>
            </div>
            <div class="communication-meta">
              <span class="meta-item">
                <strong>Agency:</strong> {{ comm.agency_name }}
              </span>
              <span class="meta-item">
                <strong>Type:</strong> {{ formatType(comm.template_type) }}
              </span>
              <span class="meta-item">
                <strong>Generated:</strong> {{ formatDate(comm.generated_at) }}
              </span>
              <span v-if="comm.generated_by_first_name" class="meta-item">
                <strong>By:</strong> {{ comm.generated_by_first_name }} {{ comm.generated_by_last_name }}
              </span>
            </div>
          </div>
          <div class="communication-actions">
            <button @click="viewCommunication(comm)" class="btn btn-sm btn-primary">View</button>
            <button @click="copyCommunication(comm)" class="btn btn-sm btn-secondary">Copy</button>
            <button 
              v-if="comm.template_id && !viewOnly" 
              @click="regenerateCommunication(comm)" 
              class="btn btn-sm btn-info"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="section-divider"></div>

    <div class="tab-header">
      <h3>System Texts (Notifications)</h3>
      <div class="filter-controls">
        <select v-model="smsAgency" @change="loadSmsLogs" class="form-select">
          <option value="">All Agencies</option>
          <option v-for="agency in userAgencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="smsLoading" class="loading">Loading system texts...</div>
    <div v-else-if="smsError" class="error">{{ smsError }}</div>
    <div v-else-if="smsLogs.length === 0" class="empty-state">
      <p>No system texts found for this user.</p>
    </div>
    <div v-else class="communications-list">
      <div v-for="log in smsLogs" :key="log.id" class="communication-card">
        <div class="communication-header">
          <div class="communication-info">
            <h4>{{ log.notification_title || 'Notification SMS' }}</h4>
            <div class="communication-meta">
              <span class="meta-item">
                <strong>Status:</strong> {{ log.status }}
              </span>
              <span class="meta-item">
                <strong>To:</strong> {{ log.to_number }}
              </span>
              <span class="meta-item">
                <strong>Sent:</strong> {{ formatDate(log.created_at) }}
              </span>
              <span v-if="log.twilio_sid" class="meta-item">
                <strong>SID:</strong> {{ log.twilio_sid }}
              </span>
            </div>
          </div>
          <div class="communication-actions">
            <button @click="viewSms(log)" class="btn btn-sm btn-primary">View</button>
            <button @click="copySms(log)" class="btn btn-sm btn-secondary">Copy</button>
          </div>
        </div>
      </div>
    </div>

    <!-- View SMS Modal -->
    <div v-if="viewingSms" class="modal-overlay" @click="closeSmsModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ viewingSms.notification_title || 'Notification SMS' }}</h3>
          <button @click="closeSmsModal" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="view-communication-meta">
            <p><strong>Status:</strong> {{ viewingSms.status }}</p>
            <p><strong>To:</strong> {{ viewingSms.to_number }}</p>
            <p><strong>From:</strong> {{ viewingSms.from_number }}</p>
            <p><strong>Sent:</strong> {{ formatDate(viewingSms.created_at) }}</p>
            <p v-if="viewingSms.twilio_sid"><strong>SID:</strong> {{ viewingSms.twilio_sid }}</p>
            <p v-if="viewingSms.error_message"><strong>Error:</strong> {{ viewingSms.error_message }}</p>
          </div>
          <div class="view-communication-content">
            <h4>Body:</h4>
            <pre class="email-body">{{ viewingSms.body }}</pre>
          </div>
          <div class="modal-actions">
            <button @click="copySms(viewingSms)" class="btn btn-primary">Copy Text</button>
            <button @click="closeSmsModal" class="btn btn-secondary">Close</button>
          </div>
        </div>
      </div>
    </div>

    <!-- View Communication Modal -->
    <div v-if="viewingCommunication" class="modal-overlay" @click="closeViewModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ viewingCommunication.subject }}</h3>
          <button @click="closeViewModal" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="view-communication-meta">
            <p><strong>Agency:</strong> {{ viewingCommunication.agency_name }}</p>
            <p><strong>Type:</strong> {{ formatType(viewingCommunication.template_type) }}</p>
            <p><strong>Generated:</strong> {{ formatDate(viewingCommunication.generated_at) }}</p>
            <p v-if="viewingCommunication.generated_by_first_name">
              <strong>By:</strong> {{ viewingCommunication.generated_by_first_name }} {{ viewingCommunication.generated_by_last_name }}
            </p>
          </div>
          <div class="view-communication-content">
            <h4>Subject:</h4>
            <p class="email-subject">{{ viewingCommunication.subject }}</p>
            <h4>Email body</h4>
            <iframe v-if="emailPreview.html" class="email-frame" sandbox="" referrerpolicy="no-referrer" title="Email preview" :srcdoc="emailPreview.html" />
            <pre v-else class="email-body">{{ emailPreview.text }}</pre>
          </div>
          <div class="modal-actions">
            <button @click="copyCommunication(viewingCommunication)" class="btn btn-primary">Copy Email</button>
            <button @click="closeViewModal" class="btn btn-secondary">Close</button>
          </div>
        </div>
      </div>
    </div>
    </details>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import GuardianCommunicationsWorkspace from './GuardianCommunicationsWorkspace.vue';
import { prepareEmailPreview } from '../../utils/emailPreview';

const router = useRouter();

/**
 * Jump to a client's profile when the user clicks the "Re: client X" chip.
 * Uses the org-scoped slug when this view is itself rendered under an org slug,
 * otherwise falls back to the global admin route.
 */
const openClientProfile = (clientId) => {
  if (!clientId) return;
  const slug = router.currentRoute?.value?.params?.organizationSlug;
  const path = slug
    ? `/${slug}/admin/clients/${clientId}`
    : `/admin/clients/${clientId}`;
  router.push({ path, query: { tab: 'communications' } });
};

const props = defineProps({
  recipientOnly: { type: Boolean, default: false },
  userId: {
    type: Number,
    required: true
  },
  userAgencies: {
    type: Array,
    default: () => []
  },
  /** When set (e.g. SSC member profile), pre-select this club for posting announcements. */
  preferredClubAgencyId: {
    type: Number,
    default: null
  },
  viewOnly: {
    type: Boolean,
    default: false
  }
});

const communications = ref([]);
const loading = ref(false);
const error = ref('');
const selectedAgency = ref('');
const selectedType = ref('');
const viewingCommunication = ref(null);
const emailPreview = computed(() => prepareEmailPreview(viewingCommunication.value?.body));
const posting = ref(false);
const postError = ref('');
const postSuccess = ref('');

const toLocalInput = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const pickDefaultAgencyId = () => {
  const pref = Number(props.preferredClubAgencyId || 0);
  if (pref > 0 && (props.userAgencies || []).some((a) => Number(a?.id) === pref)) {
    return String(pref);
  }
  return String(props.userAgencies?.[0]?.id || '');
};
const defaultAgencyId = pickDefaultAgencyId();
const now = new Date();
const in24h = new Date(now.getTime() + (24 * 60 * 60 * 1000));
const postDraft = ref({
  agencyId: defaultAgencyId,
  displayType: 'announcement',
  scope: 'user',
  title: '',
  message: '',
  splashImageUrl: '',
  startsAt: toLocalInput(now),
  endsAt: toLocalInput(in24h)
});

const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const previewAgencyName = computed(() => props.userAgencies.find(agency => String(agency.id) === String(postDraft.value.agencyId))?.name || 'Your organization');
const previewImageFailed = ref(false);
const previewImageUrl = computed(() => {
  try { const url = new URL(postDraft.value.splashImageUrl, window.location.origin); return postDraft.value.splashImageUrl && ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
});
watch(previewImageUrl, () => { previewImageFailed.value = false; });
const profileSplashUploading = ref(false);

const onProfileAnnouncementSplashFile = async (e) => {
  const file = e.target.files?.[0];
  const aid = parseInt(String(postDraft.value.agencyId || ''), 10);
  if (!file || !aid) return;
  profileSplashUploading.value = true;
  postError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await api.post(`/summit-stats/clubs/${aid}/feed/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      skipGlobalLoading: true
    });
    if (r.data?.url) postDraft.value.splashImageUrl = r.data.url;
  } catch (err) {
    postError.value = err.response?.data?.error?.message || 'Image upload failed';
  } finally {
    profileSplashUploading.value = false;
    e.target.value = '';
  }
};

watch(
  () => [props.preferredClubAgencyId, props.userAgencies],
  () => {
    const id = pickDefaultAgencyId();
    if (id) postDraft.value.agencyId = id;
  },
  { deep: true }
);

const canPostFromProfile = computed(() => {
  if (!postDraft.value.agencyId) return false;
  if (!String(postDraft.value.message || '').trim()) return false;
  if (!postDraft.value.startsAt || !postDraft.value.endsAt) return false;
  const starts = new Date(postDraft.value.startsAt);
  const ends = new Date(postDraft.value.endsAt);
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime())) return false;
  return ends.getTime() > starts.getTime();
});

const postAnnouncementFromProfile = async () => {
  if (!canPostFromProfile.value || props.viewOnly) return;
  postError.value = '';
  postSuccess.value = '';
  posting.value = true;
  try {
    const agencyId = parseInt(String(postDraft.value.agencyId || ''), 10);
    const payload = {
      title: String(postDraft.value.title || '').trim() || null,
      message: String(postDraft.value.message || '').trim(),
      display_type: String(postDraft.value.displayType || 'announcement').toLowerCase() === 'splash' ? 'splash' : 'announcement',
      recipient_user_ids: !props.recipientOnly && String(postDraft.value.scope || 'user') === 'everyone' ? [] : [props.userId],
      starts_at: new Date(postDraft.value.startsAt),
      ends_at: new Date(postDraft.value.endsAt)
    };
    const splash = String(postDraft.value.splashImageUrl || '').trim();
    if (splash) payload.splash_image_url = splash;
    await api.post(props.recipientOnly ? `/users/${props.userId}/guardian-announcements` : `/agencies/${agencyId}/announcements`, {...payload,...(props.recipientOnly?{agencyId}: {})}, {skipGlobalLoading:true});
    postSuccess.value = props.recipientOnly ? 'Scheduled for this guardian only.' : 'Posted. It will appear in the agency announcement feed.';
    postDraft.value.message = '';
    postDraft.value.title = '';
    postDraft.value.splashImageUrl = '';
  } catch (err) {
    postError.value = err.response?.data?.error?.message || 'Failed to post announcement';
  } finally {
    posting.value = false;
  }
};

const loadCommunications = async () => {
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    if (selectedAgency.value) {
      params.agencyId = selectedAgency.value;
    }
    if (selectedType.value) {
      params.templateType = selectedType.value;
    }
    
    const response = await api.get(`/users/${props.userId}/communications`, { params });
    communications.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load communications';
  } finally {
    loading.value = false;
  }
};

const smsLogs = ref([]);
const smsLoading = ref(false);
const smsError = ref('');
const smsAgency = ref('');
const viewingSms = ref(null);

const loadSmsLogs = async () => {
  smsLoading.value = true;
  smsError.value = '';
  try {
    const params = { userId: props.userId };
    if (smsAgency.value) params.agencyId = smsAgency.value;
    const response = await api.get('/notifications/sms-logs', { params });
    smsLogs.value = response.data || [];
  } catch (err) {
    smsError.value = err.response?.data?.error?.message || 'Failed to load system texts';
  } finally {
    smsLoading.value = false;
  }
};

const viewSms = (log) => {
  viewingSms.value = log;
};

const closeSmsModal = () => {
  viewingSms.value = null;
};

const copySms = async (log) => {
  try {
    await navigator.clipboard.writeText(log.body || '');
    alert('Text copied to clipboard');
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy text');
  }
};

const viewCommunication = (comm) => {
  viewingCommunication.value = comm;
};

const closeViewModal = () => {
  viewingCommunication.value = null;
};

const copyCommunication = async (comm) => {
  const emailText = `Subject: ${comm.subject}\n\n${prepareEmailPreview(comm.body).text}`;
  try {
    await navigator.clipboard.writeText(emailText);
    alert('Email copied to clipboard');
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy email');
  }
};

const regenerateCommunication = async (comm) => {
  if (!confirm('Regenerate this email? Note: Some parameters (like temporary password) may be missing as they are not stored for security reasons.')) {
    return;
  }
  
  try {
    const response = await api.post(`/users/${props.userId}/communications/${comm.id}/regenerate`);
    alert('Email regenerated. Note: Some parameters may be missing.');
    // Could show the regenerated email in a modal
  } catch (err) {
    alert('Failed to regenerate email: ' + (err.response?.data?.error?.message || err.message));
  }
};

const formatType = (type) => {
  const types = {
    user_welcome: 'User Welcome',
    password_reset: 'Password Reset',
    account_login_help: 'Login Help',
    invitation: 'Invitation'
  };
  return types[type] || type;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

onMounted(() => {
  loadCommunications();
  loadSmsLogs();
});
</script>

<style scoped>
.announcement-workspace{margin:28px 0;padding:28px;border:1px solid #dbe5ee;border-radius:18px;color:var(--text-primary,#20354f);background:var(--bg-card,#fff)}.announcement-heading{display:flex;align-items:start;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:24px}.announcement-heading h3{font-size:23px;margin:5px 0 10px}.announcement-heading p{margin:0;font-size:14px;line-height:1.65}.announcement-eyebrow{text-transform:uppercase;letter-spacing:.1em;font-size:11px!important;font-weight:700;color:#65778b}.private-audience{padding:8px 12px;border-radius:20px;background:#eaf3ef;color:#306552;font-size:12px;font-weight:600}.announcement-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,1fr);gap:30px}.announcement-editor{min-width:0}.announcement-fields,.announcement-dates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.announcement-workspace label{display:flex;flex-wrap:wrap;gap:7px;align-items:baseline;font-size:13px;font-weight:600;margin:0 0 18px}.announcement-workspace label small{font-size:11px;color:#6b7e91;font-weight:400;margin-left:auto}.announcement-workspace input,.announcement-workspace select,.announcement-workspace textarea{display:block;width:100%!important;max-width:none;min-width:0;box-sizing:border-box;padding:12px 14px;border:1px solid #cbd8e5;border-radius:10px;background:var(--bg-card,#fff);color:inherit;font:inherit;font-weight:400}.announcement-workspace textarea{min-height:220px;resize:vertical;line-height:1.7}.announcement-workspace input:focus-visible,.announcement-workspace textarea:focus-visible,.announcement-workspace select:focus-visible{outline:3px solid #8bb7db;outline-offset:2px}.announcement-help{font-size:12px;color:#6b7e91;line-height:1.65}.announcement-preview{padding:20px;border-radius:14px;background:#f3f7fb;min-width:0;align-self:start;position:sticky;top:20px}.preview-label{display:flex;justify-content:space-between;gap:10px;font-size:12px;margin-bottom:16px;color:#435d78}.preview-label span{color:#6b7e91}.portal-preview{border:1px solid #dbe4ed;border-radius:12px;padding:14px;background:#fff;overflow:hidden}.preview-portal-bar{display:flex;gap:8px;align-items:center;font-size:11px;color:#7a8c9e;padding:4px 0 20px;overflow-wrap:anywhere}.portal-dot{width:8px;height:8px;border-radius:3px;background:#94b7aa}.preview-card{border:1px solid #c7dce9;border-radius:10px;background:#eef6fc;overflow:hidden}.preview-splash{background:#fff;border-color:#dae4ed;box-shadow:0 8px 22px #17324d0b}.preview-card img{display:block;width:100%;max-height:240px;object-fit:contain;background:#edf2f6}.preview-copy{padding:22px}.preview-update{text-transform:uppercase;font-size:9px;font-weight:700;letter-spacing:.1em;color:#5f7f9a}.preview-copy h4{font-size:20px;line-height:1.4;margin:12px 0;overflow-wrap:anywhere}.preview-message{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.8}.preview-placeholder{color:#8b9aab}.preview-dismiss{display:inline-block;border-radius:8px;padding:9px 13px;background:#315f86;color:white;font-size:11px;margin-top:12px}.announcement-success{padding:12px 14px;background:#edf7f0;border-radius:10px;color:#2b6a47}.announcement-workspace [role=alert]{color:#a12b30;padding:12px 14px;border-radius:10px;background:#fff2f1}.announcement-workspace .btn{padding:12px 20px;border-radius:10px}.system-history{padding:22px;border:1px solid #dce5ee;border-radius:16px;margin-top:24px}.system-history>summary{cursor:pointer;font-weight:600;font-size:15px;margin-bottom:12px}.image-upload input{font-size:12px}@media(max-width:950px){.announcement-layout{grid-template-columns:1fr}.announcement-preview{position:static}.announcement-workspace{padding:20px}}@media(max-width:580px){.announcement-fields,.announcement-dates{grid-template-columns:1fr;gap:0}.announcement-workspace{padding:16px}.preview-copy{padding:16px}}

.user-communications-tab {
  padding: 24px;
}

.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.tab-header h3 {
  margin: 0;
}

.filter-controls {
  display: flex;
  gap: 12px;
}

.filter-controls .form-select {
  min-width: 200px;
}

.communications-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.communication-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  background: white;
}

.communication-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
}

.communication-info h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.communication-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.meta-item {
  display: flex;
  gap: 4px;
}

.communication-actions {
  display: flex;
  gap: 8px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 20px;
}

.view-communication-meta {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
}

.view-communication-meta p {
  margin: 8px 0;
  font-size: 14px;
}

.view-communication-content {
  margin-bottom: 20px;
}

.view-communication-content h4 {
  margin: 16px 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.email-subject {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 16px;
}

.email-frame { width: 100%; min-height: 340px; height: 48dvh; border: 1px solid var(--border, #dbe3ec); border-radius: 8px; background: #fff; }

.email-body {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 13px;
  white-space: pre-wrap;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  max-height: 400px;
  overflow-y: auto;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.loading {
  text-align: center;
  padding: 40px;
}

.error {
  color: var(--error);
  padding: 20px;
  background: #fee2e2;
  border-radius: 6px;
  margin-bottom: 20px;
}

.re-client-chip {
  display: inline-flex;
  align-items: center;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 2px 8px;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 120ms;
}
.re-client-chip:hover {
  background: #dbeafe;
}

.open-chip {
  display: inline-flex;
  align-items: center;
  background: #dcfce7;
  color: #166534;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}
</style>
