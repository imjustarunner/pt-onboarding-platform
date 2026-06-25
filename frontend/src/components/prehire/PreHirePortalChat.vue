<template>
  <aside class="ph-chat" :class="{ 'ph-chat--collapsed': collapsed }">
    <div class="ph-chat-header">
      <div class="ph-chat-header-main">
        <div class="ph-chat-title">{{ supportTeam?.label || 'People Operations' }}</div>
        <div class="ph-chat-status">
          <span class="ph-chat-dot"></span>
          We're online
        </div>
      </div>
      <button type="button" class="ph-chat-toggle" @click="collapsed = !collapsed" :title="collapsed ? 'Open chat' : 'Minimize chat'">
        {{ collapsed ? '◀' : '▶' }}
      </button>
    </div>

    <template v-if="!collapsed">
      <div class="ph-chat-team">
        <div class="ph-chat-avatars">
          <div
            v-for="(m, i) in displayMembers"
            :key="m.id || i"
            class="ph-chat-avatar"
            :style="{ zIndex: 10 - i }"
          >
            <img v-if="m.photoUrl" :src="m.photoUrl" :alt="m.initials" />
            <span v-else>{{ m.initials }}</span>
          </div>
        </div>
        <div class="ph-chat-team-copy">
          <strong>{{ supportTeam?.label || 'People Operations' }} Team</strong>
          <span>Typically replies in a few minutes</span>
        </div>
      </div>

      <div ref="messagesEl" class="ph-chat-messages">
        <div v-if="loading" class="ph-chat-empty">Loading messages…</div>
        <div v-else-if="messages.length === 0" class="ph-chat-empty">
          <p>Have a question about your pre-hire items?</p>
          <p>Send us a message — we're here to help.</p>
        </div>
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="ph-chat-bubble-row"
          :class="msg.isCandidate ? 'ph-chat-bubble-row--mine' : 'ph-chat-bubble-row--theirs'"
        >
          <div class="ph-chat-bubble">
            <div v-if="!msg.isCandidate && msg.authorName" class="ph-chat-author">{{ msg.authorName }}</div>
            <div class="ph-chat-text">{{ msg.message }}</div>
            <div class="ph-chat-time">{{ fmtTime(msg.createdAt) }}</div>
          </div>
        </div>
      </div>

      <form class="ph-chat-compose" @submit.prevent="send">
        <input
          v-model="draft"
          type="text"
          class="ph-chat-input"
          placeholder="Type your message…"
          :disabled="sending"
        />
        <button type="submit" class="ph-chat-send" :disabled="sending || !draft.trim()" aria-label="Send message">
          ➤
        </button>
      </form>
    </template>
  </aside>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';

const props = defineProps({
  token: { type: String, required: true },
  portalApi: { type: Object, required: true },
  supportTeam: { type: Object, default: () => ({ label: 'People Operations', members: [] }) },
  agencyName: { type: String, default: '' }
});

const collapsed = ref(false);
const loading = ref(true);
const sending = ref(false);
const draft = ref('');
const messages = ref([]);
const messagesEl = ref(null);
let pollTimer = null;

const displayMembers = computed(() => {
  const members = props.supportTeam?.members || [];
  if (members.length) return members.slice(0, 3);
  return [{ id: 'po', initials: 'PO' }];
});

const fmtTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

const scrollToBottom = async () => {
  await nextTick();
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
};

const loadMessages = async () => {
  try {
    const { data } = await props.portalApi.get(`/prehire-portal/${props.token}/messages`);
    messages.value = Array.isArray(data?.messages) ? data.messages : [];
    await scrollToBottom();
  } catch {
    /* ignore transient errors */
  } finally {
    loading.value = false;
  }
};

const send = async () => {
  const body = draft.value.trim();
  if (!body || sending.value) return;
  sending.value = true;
  try {
    const { data } = await props.portalApi.post(`/prehire-portal/${props.token}/messages`, { message: body });
    messages.value.push(data);
    draft.value = '';
    await scrollToBottom();
  } catch {
    /* keep draft so user can retry */
  } finally {
    sending.value = false;
  }
};

watch(() => props.token, () => {
  loading.value = true;
  loadMessages();
});

onMounted(() => {
  loadMessages();
  pollTimer = setInterval(loadMessages, 20000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

defineExpose({
  expand() {
    collapsed.value = false;
  }
});
</script>

<style scoped>
.ph-chat {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #e5e7eb;
  box-shadow: -4px 0 24px rgba(15, 23, 42, 0.06);
  min-height: 0;
  height: 100%;
}

.ph-chat--collapsed {
  width: 48px;
}

.ph-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 18px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.ph-chat-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.ph-chat-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.ph-chat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
}

.ph-chat-toggle {
  border: none;
  background: #f1f5f9;
  color: #64748b;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 11px;
}

.ph-chat-team {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid #f1f5f9;
}

.ph-chat-avatars {
  display: flex;
  align-items: center;
}

.ph-chat-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--primary, #2563eb);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  margin-left: -8px;
  overflow: hidden;
}

.ph-chat-avatar:first-child { margin-left: 0; }

.ph-chat-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ph-chat-team-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #64748b;
}

.ph-chat-team-copy strong {
  color: #0f172a;
  font-size: 13px;
}

.ph-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #f8fafc;
  min-height: 240px;
}

.ph-chat-empty {
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.5;
  margin: auto 0;
}

.ph-chat-bubble-row {
  display: flex;
}

.ph-chat-bubble-row--mine { justify-content: flex-end; }
.ph-chat-bubble-row--theirs { justify-content: flex-start; }

.ph-chat-bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.45;
}

.ph-chat-bubble-row--mine .ph-chat-bubble {
  background: var(--primary, #2563eb);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ph-chat-bubble-row--theirs .ph-chat-bubble {
  background: #fff;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 4px;
}

.ph-chat-author {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 4px;
}

.ph-chat-time {
  font-size: 10px;
  opacity: 0.75;
  margin-top: 4px;
  text-align: right;
}

.ph-chat-compose {
  display: flex;
  gap: 8px;
  padding: 14px 16px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
}

.ph-chat-input {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  outline: none;
}

.ph-chat-input:focus {
  border-color: var(--primary, #2563eb);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary, #2563eb) 15%, transparent);
}

.ph-chat-send {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: var(--primary, #2563eb);
  color: #fff;
  cursor: pointer;
  font-size: 16px;
}

.ph-chat-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 1100px) {
  .ph-chat {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 40;
  }

  .ph-chat--collapsed {
    width: 48px;
  }
}
</style>
