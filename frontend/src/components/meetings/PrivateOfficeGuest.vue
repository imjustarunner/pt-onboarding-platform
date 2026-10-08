<template>
  <div class="join-my-room" :style="brandStyle">
    <div v-if="loading" class="jmr-card jmr-muted">Loading room…</div>
    <div v-else-if="error && !room" class="jmr-card jmr-error">{{ error }}</div>
    <template v-else>
      <div class="jmr-card">
        <p v-if="error" role="alert" class="jmr-error">{{ error }}</p>
        <header class="visit-header"><div class="visit-brand"><img v-if="productName" :src="AURICWELL_MARK_URL" :alt="productName" /><img v-else-if="room?.branding?.logoUrl" :src="room.branding.logoUrl" alt="" /><div><strong>{{ productName || room?.branding?.agencyName || 'Virtual office' }}</strong><small v-if="productName">{{ room?.branding?.agencyName }}</small></div></div><ol class="visit-steps" aria-label="Visit progress"><li :class="{active:phase==='form'}">1 · Check-in</li><li :class="{active:phase==='waiting'}">2 · Waiting room</li><li :class="{active:phase==='video'}">3 · Visit</li></ol></header>
        <div v-if="phase === 'waiting'" class="jmr-waiting">
          <SupervisionWaitingRoomStage :meeting-title="`${productName || room?.branding?.agencyName || 'Virtual office'} · ${roomDisplayName}`" :host-present="hostPresent" host-role-label="Provider" :show-preview-hint="false" />
          <div class="waiting-identity"><img v-if="photoDataUrl" :src="photoDataUrl" alt="Your check-in photo" /><span>Joining as {{ guestDisplayName || 'Guest' }}</span><button class="jmr-btn" @click="leaveVisit">Leave waiting room</button></div>
        </div>
        <TherapySessionWorkspace v-else-if="phase === 'video'" :video="video" :branding="room?.branding" :product-name="productName" :request="workspaceRequest" @leave-request="leaveVisit" @disconnected="leaveVisit" @meeting-ended="leaveVisit" />
        <div v-else-if="phase === 'ended'"><h1>Visit ended</h1><p>This office visit has ended. You can request admission again.</p><button class="jmr-btn" @click="startOver">Request a new visit</button></div>
        <form v-else class="jmr-form" @submit.prevent="submitJoin">
          <div class="checkin-heading"><p class="eyebrow">VIRTUAL OFFICE VISIT</p><h1>Visit check-in</h1><p>Add a name and photo to help {{ roomDisplayName }} recognize you. Both are optional.</p></div>
          <aside class="checkin-guide"><div class="provider-avatar">{{ roomDisplayName.slice(0,1) }}</div><h2>{{ roomDisplayName }}</h2><p>{{ room?.branding?.agencyName }}</p><hr /><h3>You’re almost ready</h3><p>You are not in the waiting room yet.</p><ol><li>Add your name and a photo if you wish.</li><li>Enter the waiting room and enjoy the music.</li><li>Your provider will review your request and let you in.</li></ol><p class="jmr-muted">Your photo is shown only to your provider and removed when your visit ends. A photo helps recognition; it does not verify identity.</p></aside>
          <label class="jmr-label">
            Your name (suggested)
            <input
              v-model="guestDisplayName"
              class="jmr-input"
              type="text"
              maxlength="120"
              autocomplete="name"
              placeholder="First and last name"
            />
          </label>

          <div class="jmr-photo">
            <div class="jmr-photo-preview">
              <video
                v-show="cameraActive && !photoDataUrl"
                ref="videoRef"
                class="jmr-video"
                autoplay
                playsinline
                muted
              />
              <img v-if="photoDataUrl" :src="photoDataUrl" alt="Your photo preview" class="jmr-snap" />
              <div v-else-if="!cameraActive" class="jmr-photo-placeholder">Camera off</div>
            </div>
            <canvas ref="canvasRef" class="jmr-canvas" width="640" height="480" />
            <div class="jmr-photo-actions">
              <button
                v-if="!cameraActive && !photoDataUrl"
                type="button"
                class="jmr-btn jmr-btn--secondary"
                @click="startCamera"
              >
                Open camera
              </button>
              <button
                v-if="cameraActive && !photoDataUrl"
                type="button"
                class="jmr-btn"
                @click="takePhoto"
              >
                Take photo
              </button>
              <button
                v-if="photoDataUrl"
                type="button"
                class="jmr-btn jmr-btn--secondary"
                @click="retakePhoto"
              >
                Retake
              </button>
            </div>
            <button v-if="photoDataUrl" type="button" class="jmr-btn jmr-btn--secondary" @click="photoDataUrl='';photoRequiredAck=false">Remove photo</button>
            <p v-if="cameraError" class="jmr-error">{{ cameraError }}</p>
          </div>

          <label v-if="photoDataUrl" class="jmr-check">
            <input v-model="photoRequiredAck" type="checkbox" required />
            I agree to show this photo to my provider for this visit.
          </label>

          <p v-if="error" class="jmr-error">{{ error }}</p>

          <button
            type="submit"
            class="jmr-btn jmr-btn--block"
            :disabled="submitting || !canSubmit"
          >
            {{ submitting ? 'Joining…' : 'Continue to waiting room' }}
          </button>
        </form>
      </div>
    </template>
  </div>
</template>

<script setup>
import { AURICWELL_MARK_URL } from '../../constants/auricwellBrand';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import TherapySessionWorkspace from './TherapySessionWorkspace.vue';
import SupervisionWaitingRoomStage from '../supervision/SupervisionWaitingRoomStage.vue';

const props=defineProps({slug:{type:String,required:true},request:{type:Function,required:true},productName:{type:String,default:'AuricWell'}});
const slug=computed(()=>props.slug);
const brandStyle=computed(()=>{const color=room.value?.branding?.colorPalette?.primary;return {'--office-accent':props.productName?'#315c66':/^#[a-f0-9]{3,8}$/i.test(color||'')?color:'#087f5b'};});
const api={get:(url,opts)=>props.request(url,{...opts,method:'GET'}).then(data=>({data})),post:(url,body,opts)=>props.request(url,{...opts,method:'POST',body}).then(data=>({data}))};

const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const room = ref(null);
const phase = ref('form');
const guestDisplayName = ref('');
const photoDataUrl = ref('');
const photoRequiredAck = ref(false);
const cameraActive = ref(false);
const cameraError = ref('');
const lobbyId = ref(null);
const credential = ref(''), video = ref(null);
const guestOptions = () => ({...publicOpts,headers:{'X-Office-Visit':credential.value}});
async function leaveVisit(){if(phase.value==='ended')return;video.value=null;stopStatusPoll();phase.value='ended';if(lobbyId.value)try{await api.post(`/my-room/${encodeURIComponent(slug.value)}/lobby/${lobbyId.value}/leave`,{},guestOptions());}catch(e){error.value=e.response?.data?.error?.message||'Could not confirm departure.';}photoDataUrl.value='';}
const workspaceRequest=(_path,options)=>props.request(`/my-room/${encodeURIComponent(slug.value)}/lobby/${lobbyId.value}/workspace${_path}`,{...guestOptions(),...options});
const hostPresent=ref(false);
function startOver(){lobbyId.value=null;credential.value='';photoDataUrl.value='';photoRequiredAck.value=false;phase.value='form';error.value='';}
const lobbyStatus = ref('waiting');
const videoRef = ref(null);
const canvasRef = ref(null);

let mediaStream = null;
let statusPollTimer = null;

const roomDisplayName = computed(() => {
  const name = String(room.value?.displayName || '').trim();
  return name || 'Provider room';
});

const canSubmit = computed(() => !photoDataUrl.value || photoRequiredAck.value);

const publicOpts = { skipAuthRedirect: true, skipGlobalLoading: true };

async function loadRoom() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/my-room/${encodeURIComponent(slug.value)}/public`, publicOpts);
    room.value = res?.data?.room || null;
    if (!room.value) error.value = 'Room not found';
  } catch (e) {
    room.value = null;
    error.value = e.response?.data?.error?.message || 'Room not found';
  } finally {
    loading.value = false;
  }
}

async function startCamera() {
  cameraError.value = '';
  try {
    stopCamera();
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    cameraActive.value = true;
    await new Promise((r) => setTimeout(r, 50));
    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream;
      await videoRef.value.play?.();
    }
  } catch (e) {
    cameraActive.value = false;
    cameraError.value = e?.message || 'Could not access camera';
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  cameraActive.value = false;
  if (videoRef.value) videoRef.value.srcObject = null;
}

function takePhoto() {
  const video = videoRef.value;
  const canvas = canvasRef.value;
  if (!video || !canvas) return;
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, w, h);
  photoDataUrl.value = canvas.toDataURL('image/jpeg', 0.85);
  stopCamera();
}

function retakePhoto() {
  photoDataUrl.value = '';
  startCamera();
}

function stopStatusPoll() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

function startStatusPoll() {
  stopStatusPoll();
  statusPollTimer = setInterval(async () => {
    if (!lobbyId.value || !slug.value) return;
    try {
      const res = await api.get(
        `/my-room/${encodeURIComponent(slug.value)}/lobby/${lobbyId.value}`,
        guestOptions()
      );
      const status = String(res?.data?.lobby?.status || '').toLowerCase();
      if (status) lobbyStatus.value = status;
      hostPresent.value=!!res.data.lobby.hostPresent;
      if (status === 'admitted' && !video.value) {
        video.value=(await api.post(`/my-room/${encodeURIComponent(slug.value)}/lobby/${lobbyId.value}/video-token`,{},guestOptions())).data;
        phase.value='video';
      }
      if (status === 'dismissed' || status === 'ended') leaveVisit();
    } catch (e) {
      error.value=e.response?.data?.error?.message||'Unable to check admission. Please retry.';
      if ([401,403,404].includes(Number(e.response?.status))) leaveVisit();
    }
  }, 4000);
}

async function submitJoin() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  error.value = '';
  try {
    const res = await api.post(
      `/my-room/${encodeURIComponent(slug.value)}/lobby`,
      {
        displayName: String(guestDisplayName.value || '').trim(),
        photoDataUrl: photoDataUrl.value,
        photoRequiredAck: photoRequiredAck.value
      },
      publicOpts
    );
    lobbyId.value = Number(res?.data?.lobby?.id || 0) || null;
    lobbyStatus.value = String(res?.data?.lobby?.status || 'waiting').toLowerCase();
    credential.value=res.data.lobby.credential;
    phase.value = 'waiting';
    stopCamera();
    if (lobbyId.value) startStatusPoll();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not join lobby';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadRoom();
});

onUnmounted(() => {
  stopCamera();
  stopStatusPoll();
  if(lobbyId.value && phase.value!=='ended')void leaveVisit();
});
</script>

<style scoped>
.visit-header{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:32px}.visit-brand{display:flex;align-items:center;gap:14px;font-size:22px}.visit-brand img{max-width:150px;max-height:60px}.visit-brand small{display:block;font-size:13px;color:#64748b}.visit-steps{display:flex;gap:20px;list-style:none;color:#8b99a9;font-size:13px;padding:0}.visit-steps li.active{color:#078765;font-weight:700}.checkin-heading{grid-column:1/-1}.checkin-heading h1{font-size:38px;letter-spacing:-.04em;margin:10px 0}.checkin-heading p{color:#66768c}.eyebrow{letter-spacing:.15em;font-size:11px}.checkin-guide{grid-column:2;grid-row:2/6;padding:30px;background:#f4f9f8;border:1px solid #dfebe7;border-radius:18px;line-height:1.7}.checkin-guide h2{font-size:22px}.checkin-guide h3{font-size:21px}.checkin-guide ol{padding-left:20px}.checkin-guide li{margin:16px 0}.provider-avatar{border-radius:50%;background:#e0f3ec;color:#167c60;width:72px;height:72px;display:grid;place-items:center;font-size:28px}.waiting-identity{position:absolute;right:22px;top:22px;z-index:3;background:white;border-radius:12px;padding:12px;display:flex;gap:12px;align-items:center}.waiting-identity img{width:45px;height:45px;border-radius:50%;object-fit:cover}

.join-my-room {
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem 1rem 3rem;
  background: #fff;
}
.jmr-card {
  width: 100%;
  max-width: 1400px;
  background: #fff;
  border: 1px solid #dbe3ec;
  border-radius: 14px;
  padding: 1.35rem 1.4rem 1.5rem;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
}
.jmr-title {
  margin: 0 0 0.5rem;
  font-size: 1.35rem;
  color: #0f172a;
}
.jmr-instruction {
  margin: 0 0 1.1rem;
  color: #475569;
  font-size: 0.95rem;
  line-height: 1.45;
}
.jmr-form {
  display: grid;
  grid-template-columns:minmax(0,1.7fr) minmax(260px,1fr);
  gap: 20px;
}
.jmr-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: #334155;
}
.jmr-input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  font-size: 1rem;
}
.jmr-photo-preview {
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #0f172a;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.jmr-video,
.jmr-snap {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.jmr-photo-placeholder {
  color: #94a3b8;
  font-size: 0.9rem;
}
.jmr-canvas { display: none; }
.jmr-photo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.55rem;
}
.jmr-check {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  font-size: 0.88rem;
  color: #334155;
  line-height: 1.35;
}
.jmr-btn {
  border: 1px solid #1e3a5f;
  background: #1e3a5f;
  color: #fff;
  border-radius: 8px;
  padding: 0.55rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.jmr-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.jmr-btn--secondary {
  background: #fff;
  color: #1e3a5f;
}
.jmr-btn--block { width: 100%; }
.jmr-waiting {
  position:relative;
  min-height:760px;
  border-radius:18px;
  overflow:hidden;
}
.jmr-waiting-pulse {
  width: 14px;
  height: 14px;
  margin: 0 auto 0.75rem;
  border-radius: 50%;
  background: #f59e0b;
  animation: jmr-pulse 1.4s ease-in-out infinite;
}
@keyframes jmr-pulse {
  0%, 100% { opacity: 0.45; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.15); }
}
.jmr-muted { color: #64748b; font-size: 0.9rem; }
.jmr-error { color: #b91c1c; font-size: 0.9rem; margin: 0.35rem 0 0; }
.jmr-ok { color: #047857; font-size: 0.92rem; font-weight: 600; }
.jmr-label,.jmr-photo,.jmr-check,.jmr-btn--block{grid-column:1}.jmr-photo-preview{aspect-ratio:16/10}.jmr-btn{background:var(--office-accent);border-color:var(--office-accent);padding:14px}.jmr-btn--secondary{color:#087f5b;background:white}.jmr-photo-placeholder{font-size:18px}.jmr-waiting :deep(.swr__overlay){max-width:640px;padding-right:24px}.jmr-waiting :deep(.swr__sub){white-space:normal}@media(max-width:800px){.jmr-form{grid-template-columns:1fr}.checkin-guide{grid-column:1;grid-row:auto;order:10}.visit-header{flex-direction:column;align-items:flex-start}.visit-steps{gap:12px}.waiting-identity{position:relative;top:auto;right:auto}.jmr-waiting{min-height:850px}.jmr-card{padding:18px}.checkin-heading h1{font-size:30px}.jmr-waiting :deep(.swr__overlay){padding:16px}.jmr-waiting :deep(.swr__sub){max-width:none}}
</style>
