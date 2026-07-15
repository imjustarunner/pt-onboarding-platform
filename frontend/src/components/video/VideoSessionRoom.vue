<template>
  <div class="vsr" :class="{ 'vsr--compact': compact, 'vsr--strip': layout === 'strip' }">
    <div v-if="errorMessage" class="vsr__error" role="alert">
      <p class="vsr__error-title">{{ errorMessage }}</p>
      <ul v-if="diagnosticHints.length" class="vsr__hints">
        <li v-for="(hint, i) in diagnosticHints" :key="i">{{ hint }}</li>
      </ul>
      <div class="vsr__error-actions">
        <button type="button" class="vsr__btn vsr__btn--primary" @click="retryConnect">Retry</button>
        <button
          v-if="canRecreateRoom"
          type="button"
          class="vsr__btn"
          @click="retryWithNewRoom"
        >
          Reset video room
        </button>
      </div>
    </div>

    <div v-else-if="connecting" class="vsr__connecting">
      <div class="vsr__pulse" aria-hidden="true" />
      <p>Connecting to your session…</p>
      <button type="button" class="vsr__btn vsr__btn--ghost" @click="disconnect">Cancel</button>
    </div>

    <template v-else>
      <div class="vsr__stage" :class="{ 'vsr__stage--strip': layout === 'strip' }">
        <div
          ref="remoteEl"
          class="vsr__tile vsr__tile--remote"
          :class="{ 'vsr__tile--empty': !hasRemote }"
        >
          <span v-if="!hasRemote" class="vsr__waiting">Waiting for the other person…</span>
          <span v-if="remoteName" class="vsr__label">{{ remoteName }}</span>
        </div>
        <div
          v-show="!hideSelfView"
          ref="localEl"
          class="vsr__tile vsr__tile--local"
          :class="{ 'vsr__tile--muted': !publishAudio, 'vsr__tile--cam-off': !publishVideo }"
        >
          <span class="vsr__label">{{ localName || 'You' }}</span>
        </div>
      </div>

      <div class="vsr__controls" role="toolbar" aria-label="Session media controls">
        <button
          type="button"
          class="vsr__ctrl"
          :aria-pressed="!publishAudio"
          :title="publishAudio ? 'Mute microphone' : 'Unmute microphone'"
          @click="toggleMic"
        >
          {{ publishAudio ? 'Mic' : 'Muted' }}
        </button>
        <button
          type="button"
          class="vsr__ctrl"
          :aria-pressed="!publishVideo"
          :title="publishVideo ? 'Turn camera off' : 'Turn camera on'"
          @click="toggleCamera"
        >
          {{ publishVideo ? 'Camera' : 'Cam off' }}
        </button>
        <button
          type="button"
          class="vsr__ctrl"
          :aria-pressed="hideSelfView"
          title="Hide self-view without turning off camera"
          @click="hideSelfView = !hideSelfView"
        >
          {{ hideSelfView ? 'Show me' : 'Hide me' }}
        </button>
        <slot name="extra-controls" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  /** Vonage Application ID (preferred) or legacy OpenTok project API key */
  apiKey: { type: String, default: '' },
  applicationId: { type: String, default: '' },
  sessionId: { type: String, default: '' },
  token: { type: String, default: '' },
  localName: { type: String, default: 'You' },
  compact: { type: Boolean, default: false },
  layout: { type: String, default: 'standard' }, // standard | strip
  autoConnect: { type: Boolean, default: true },
  /** Optional server diagnostics (no secrets). */
  diagnostics: { type: Object, default: null },
  /** Show “Reset video room” when auth fails (parent handles recreate). */
  canRecreateRoom: { type: Boolean, default: false }
});

const emit = defineEmits([
  'connected',
  'disconnected',
  'error',
  'stream-created',
  'stream-destroyed',
  'request-recreate-room'
]);

const localEl = ref(null);
const remoteEl = ref(null);
const connecting = ref(false);
const errorMessage = ref('');
const errorMeta = ref(null);
const publishAudio = ref(true);
const publishVideo = ref(true);
const hideSelfView = ref(false);
const hasRemote = ref(false);
const remoteName = ref('');

let session = null;
let publisher = null;
const subscribers = new Map();

function clearRemote() {
  hasRemote.value = false;
  remoteName.value = '';
  if (remoteEl.value) remoteEl.value.innerHTML = '';
  subscribers.clear();
}

function looksLikeJwt(value) {
  return /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i.test(String(value || ''));
}

function stripSecrets(raw) {
  return String(raw || '')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/gi, '[token]')
    .replace(/T1==[A-Za-z0-9+/=]+/gi, '[token]')
    .replace(/\bToken:\s*\S+/gi, 'Token: [redacted]');
}

function resolveProjectId() {
  const appId = String(props.applicationId || '').trim();
  const key = String(props.apiKey || '').trim();
  // Prefer Application ID (UUID). Reject account-style keys that are neither UUID nor numeric project keys.
  if (appId) return appId;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return key;
  if (/^[0-9]{6,12}$/.test(key)) return key;
  return '';
}

function sanitizeVideoError(err) {
  const name = String(err?.name || '');
  const code = err?.code != null ? Number(err.code) : null;
  const raw = stripSecrets(err?.message || err || 'Could not connect to the video session.');

  if (name === 'OT_AUTHENTICATION_ERROR' || code === 1004) {
    return {
      message:
        'Video authentication failed. The Application ID, session, and token must come from the same Vonage Application.',
      kind: 'auth'
    };
  }
  if (name === 'OT_INVALID_SESSION_ID' || code === 1005) {
    return {
      message: 'Video session ID is invalid. Try resetting the video room.',
      kind: 'session'
    };
  }
  if (looksLikeJwt(err?.message) || /Token:/i.test(String(err?.message || ''))) {
    return {
      message:
        'Video connection failed (credential mismatch). Confirm VONAGE_APPLICATION_ID matches the private key used to mint tokens.',
      kind: 'auth'
    };
  }
  const cleaned = raw.length > 180 ? `${raw.slice(0, 180)}…` : raw;
  return { message: cleaned || 'Could not connect to the video session.', kind: 'other' };
}

const diagnosticHints = computed(() => {
  const hints = [];
  const d = props.diagnostics || {};
  const projectId = resolveProjectId();
  const token = String(props.token || '');

  if (!projectId) {
    hints.push('Missing Application ID from the server (check VONAGE_APPLICATION_ID).');
  } else if (!/^[0-9a-f-]{36}$/i.test(projectId) && !/^[0-9]+$/.test(projectId)) {
    hints.push(
      'Project ID does not look like an Application ID (UUID) or OpenTok project key — account API keys will not work.'
    );
  }
  if (d.applicationIdFormat === 'missing' || d.applicationIdPresent === false) {
    hints.push('Server reports VONAGE_APPLICATION_ID is not set.');
  }
  if (token && !token.startsWith('eyJ') && !token.startsWith('T1==')) {
    hints.push('Token format is unexpected (expected JWT for Vonage unified apps).');
  }
  if (d.tokenFormat === 'jwt' && projectId && !/^[0-9a-f-]{36}$/i.test(projectId)) {
    hints.push('JWT tokens require the Application ID (UUID), not the account API key.');
  }
  if (errorMeta.value?.kind === 'auth') {
    hints.push(
      'If you recently rotated Vonage keys or use a shared DB across environments, click “Reset video room”.'
    );
    hints.push(
      'In Vonage Dashboard → Applications: enable Video, and use that app’s ID + matching private key.'
    );
  }
  return hints.slice(0, 4);
});

async function connect() {
  errorMessage.value = '';
  errorMeta.value = null;
  const projectId = resolveProjectId();
  if (!projectId || !props.sessionId || !props.token) {
    errorMessage.value = 'Video credentials are missing. Check that video is configured.';
    errorMeta.value = { kind: 'config' };
    emit('error', new Error(errorMessage.value));
    return;
  }

  connecting.value = true;
  try {
    const mod = await import('@vonage/client-sdk-video');
    const OT = mod?.default || mod;
    if (!OT?.initSession) {
      throw new Error('Vonage Video client SDK failed to load.');
    }
    disconnect(false);
    // Vonage Video JWT tokens: first arg must be Application ID (not account API key).
    session = OT.initSession(projectId, props.sessionId);

    session.on('streamCreated', (event) => {
      if (!remoteEl.value) return;
      const sub = session.subscribe(
        event.stream,
        remoteEl.value,
        {
          insertMode: 'append',
          width: '100%',
          height: '100%'
        },
        (err) => {
          if (err) console.error('[VideoSessionRoom] subscribe error', err);
        }
      );
      subscribers.set(event.stream.streamId, sub);
      hasRemote.value = true;
      try {
        const data = event.stream.connection?.data;
        if (data) {
          const parsed = JSON.parse(data);
          remoteName.value = parsed.displayName || parsed.identity || 'Participant';
        }
      } catch {
        remoteName.value = 'Participant';
      }
      emit('stream-created', event);
    });

    session.on('streamDestroyed', (event) => {
      subscribers.delete(event.stream.streamId);
      if (subscribers.size === 0) clearRemote();
      emit('stream-destroyed', event);
    });

    session.on('sessionDisconnected', () => {
      connecting.value = false;
      emit('disconnected');
    });

    await new Promise((resolve, reject) => {
      session.connect(props.token, (err) => (err ? reject(err) : resolve()));
    });

    publisher = OT.initPublisher(
      localEl.value,
      {
        insertMode: 'append',
        width: '100%',
        height: '100%',
        publishAudio: publishAudio.value,
        publishVideo: publishVideo.value,
        name: props.localName
      },
      (err) => {
        if (err) console.error('[VideoSessionRoom] publisher error', err);
      }
    );

    await new Promise((resolve, reject) => {
      session.publish(publisher, (err) => (err ? reject(err) : resolve()));
    });

    connecting.value = false;
    emit('connected');
  } catch (err) {
    console.error('[VideoSessionRoom] connect failed', {
      name: err?.name,
      code: err?.code,
      message: stripSecrets(err?.message)
    });
    connecting.value = false;
    const sanitized = sanitizeVideoError(err);
    errorMessage.value = sanitized.message;
    errorMeta.value = sanitized;
    emit('error', err);
  }
}

function disconnect(emitEvent = true) {
  try {
    if (publisher) {
      try {
        session?.unpublish(publisher);
      } catch {
        /* ignore */
      }
      try {
        publisher.destroy();
      } catch {
        /* ignore */
      }
      publisher = null;
    }
    subscribers.forEach((sub) => {
      try {
        session?.unsubscribe(sub);
      } catch {
        /* ignore */
      }
    });
    subscribers.clear();
    if (session) {
      try {
        session.disconnect();
      } catch {
        /* ignore */
      }
      session = null;
    }
    if (localEl.value) localEl.value.innerHTML = '';
    clearRemote();
  } finally {
    connecting.value = false;
    if (emitEvent) emit('disconnected');
  }
}

function toggleMic() {
  publishAudio.value = !publishAudio.value;
  if (publisher) publisher.publishAudio(publishAudio.value);
}

function toggleCamera() {
  publishVideo.value = !publishVideo.value;
  if (publisher) publisher.publishVideo(publishVideo.value);
}

function retryConnect() {
  connect();
}

function retryWithNewRoom() {
  emit('request-recreate-room');
}

watch(
  () => [props.applicationId, props.apiKey, props.sessionId, props.token],
  () => {
    if (props.autoConnect && props.token) connect();
  }
);

onMounted(() => {
  if (props.autoConnect && props.token) connect();
});

onBeforeUnmount(() => {
  disconnect(false);
});

defineExpose({
  connect,
  disconnect,
  toggleMic,
  toggleCamera,
  publishAudio,
  publishVideo
});
</script>

<style scoped>
.vsr {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 180px;
  background: #12151c;
  border-radius: 10px;
  color: #f2f4f8;
  overflow: hidden;
}
.vsr--compact {
  min-height: 120px;
}
.vsr__stage {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.35rem;
  flex: 1;
  min-height: 160px;
  padding: 0.35rem;
}
.vsr__stage--strip {
  grid-template-columns: 1fr 1fr;
  min-height: 100px;
}
.vsr__tile {
  position: relative;
  background: #1c2230;
  border-radius: 8px;
  overflow: hidden;
  min-height: 100px;
}
.vsr__tile--local {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  width: 28%;
  max-width: 160px;
  min-height: 90px;
  z-index: 2;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}
.vsr__stage--strip .vsr__tile--local {
  position: relative;
  right: auto;
  bottom: auto;
  width: auto;
  max-width: none;
  min-height: 90px;
  box-shadow: none;
}
.vsr__tile--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
.vsr__waiting {
  color: #c5cddc;
  font-size: 0.9rem;
  padding: 1rem;
  text-align: center;
}
.vsr__label {
  position: absolute;
  left: 0.4rem;
  bottom: 0.35rem;
  font-size: 0.7rem;
  background: rgba(0, 0, 0, 0.55);
  color: #f8fafc;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  z-index: 3;
}
.vsr__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.5rem 0.65rem 0.65rem;
  background: #0e1118;
}
.vsr__ctrl,
.vsr__btn {
  border: 1px solid #3d4b63;
  background: #243044;
  color: #f8fafc;
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  min-height: 44px;
  font-size: 0.85rem;
  cursor: pointer;
}
.vsr__ctrl[aria-pressed='true'] {
  background: #3a2a2a;
  border-color: #6a3a3a;
}
.vsr__btn--ghost {
  background: transparent;
}
.vsr__btn--primary {
  background: #3b82f6;
  border-color: #60a5fa;
  color: #fff;
  font-weight: 600;
}
.vsr__connecting,
.vsr__error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.5rem;
  text-align: center;
  min-height: 180px;
}
.vsr__error {
  background: #1a2333;
  color: #f8fafc;
  border: 1px solid #3d4b63;
  margin: 0.35rem;
  border-radius: 8px;
}
.vsr__error-title {
  margin: 0;
  color: #fff;
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.45;
  max-width: 36rem;
}
.vsr__hints {
  margin: 0;
  padding: 0.65rem 0.85rem 0.65rem 1.4rem;
  text-align: left;
  color: #e2e8f0;
  background: #0f172a;
  border-radius: 8px;
  border: 1px solid #334155;
  font-size: 0.82rem;
  line-height: 1.45;
  max-width: 36rem;
}
.vsr__hints li + li {
  margin-top: 0.35rem;
}
.vsr__error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.vsr__pulse {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid #4a7cff;
  border-top-color: transparent;
  animation: vsr-spin 0.9s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .vsr__pulse {
    animation: none;
    border-top-color: #4a7cff;
    opacity: 0.7;
  }
}
@keyframes vsr-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
