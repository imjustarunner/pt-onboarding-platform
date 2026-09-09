<template>
  <div class="join-my-room">
    <div v-if="loading" class="jmr-card jmr-muted">Loading room…</div>
    <div v-else-if="error && !room" class="jmr-card jmr-error">{{ error }}</div>
    <template v-else>
      <div class="jmr-card">
        <h1 class="jmr-title">{{ roomDisplayName }}</h1>
        <p class="jmr-instruction">
          A photo is required to confirm your identity before the provider can let you in.
        </p>

        <div v-if="phase === 'waiting'" class="jmr-waiting">
          <div class="jmr-waiting-pulse" aria-hidden="true" />
          <p><strong>Waiting for the provider to let you in…</strong></p>
          <p class="jmr-muted">
            You joined as {{ guestDisplayName || 'guest' }}. Keep this page open.
          </p>
          <p v-if="lobbyStatus === 'admitted'" class="jmr-ok">
            You’ve been admitted. The provider will start the session shortly.
          </p>
          <p v-else-if="lobbyStatus === 'dismissed'" class="jmr-error">
            The provider dismissed this request. You can refresh and try again if needed.
          </p>
        </div>

        <form v-else class="jmr-form" @submit.prevent="submitJoin">
          <label class="jmr-label">
            Your display name
            <input
              v-model="guestDisplayName"
              class="jmr-input"
              type="text"
              maxlength="120"
              required
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
            <p v-if="cameraError" class="jmr-error">{{ cameraError }}</p>
          </div>

          <label class="jmr-check">
            <input v-model="photoRequiredAck" type="checkbox" required />
            I understand a photo is required so the provider can confirm my identity.
          </label>

          <p v-if="error" class="jmr-error">{{ error }}</p>

          <button
            type="submit"
            class="jmr-btn jmr-btn--block"
            :disabled="submitting || !canSubmit"
          >
            {{ submitting ? 'Joining…' : 'Join waiting room' }}
          </button>
        </form>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const slug = computed(() => String(route.params.slug || '').trim().toLowerCase());

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
const lobbyStatus = ref('waiting');
const videoRef = ref(null);
const canvasRef = ref(null);

let mediaStream = null;
let statusPollTimer = null;

const roomDisplayName = computed(() => {
  const name = String(room.value?.displayName || '').trim();
  return name || 'Provider room';
});

const canSubmit = computed(() => (
  !!String(guestDisplayName.value || '').trim()
  && !!photoDataUrl.value
  && !!photoRequiredAck.value
));

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
        publicOpts
      );
      const status = String(res?.data?.lobby?.status || '').toLowerCase();
      if (status) lobbyStatus.value = status;
      if (status === 'admitted' || status === 'dismissed') stopStatusPoll();
    } catch {
      /* keep waiting */
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
        guestDisplayName: String(guestDisplayName.value || '').trim(),
        photoDataUrl: photoDataUrl.value,
        guestPhotoUrl: photoDataUrl.value,
        photoRequiredAck: true
      },
      publicOpts
    );
    lobbyId.value = Number(res?.data?.lobby?.id || 0) || null;
    lobbyStatus.value = String(res?.data?.lobby?.status || 'waiting').toLowerCase();
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
});
</script>

<style scoped>
.join-my-room {
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem 1rem 3rem;
  background: linear-gradient(165deg, #f4f7fb 0%, #e8eef6 55%, #f8fafc 100%);
}
.jmr-card {
  width: 100%;
  max-width: 440px;
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
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
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
  text-align: center;
  padding: 0.75rem 0 0.25rem;
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
</style>
