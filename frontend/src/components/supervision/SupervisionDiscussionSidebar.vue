<template>
  <aside class="sds" :class="{ 'sds--roomy': roomy }">
    <div class="sds__tabs">
      <button type="button" :class="{ active: sideTab === 'discussion' }" @click="$emit('update:sideTab', 'discussion')">Discussion</button>
      <button type="button" :class="{ active: sideTab === 'notes' }" @click="$emit('update:sideTab', 'notes')">Notes</button>
    </div>

    <div v-if="sideTab === 'discussion'" class="sds__discussion">
      <div class="sds__subtabs">
        <button type="button" :class="{ active: discussionSubTab === 'topics' }" @click="$emit('update:discussionSubTab', 'topics')">Topics</button>
        <button type="button" :class="{ active: discussionSubTab === 'chat' }" @click="$emit('update:discussionSubTab', 'chat')">Chat</button>
        <button type="button" :class="{ active: discussionSubTab === 'transcript' }" @click="$emit('update:discussionSubTab', 'transcript')">Transcript</button>
      </div>

      <template v-if="discussionSubTab === 'topics'">
        <p class="sds__lead">Share discussion points for the session.</p>
        <p v-if="error" class="sds__error">{{ error }}</p>
        <form class="sds__ask" @submit.prevent="$emit('post-topic')">
          <input :value="topicDraft" type="text" class="input" placeholder="Add a topic or discussion point…" @input="$emit('update:topicDraft', $event.target.value)" />
          <button type="submit" class="btn btn-primary btn-sm" :disabled="!String(topicDraft || '').trim() || topicBusy">Add</button>
        </form>
        <ul class="sds__feed">
          <li v-for="item in topics" :key="item.id">
            <button type="button" class="sds__vote" title="Upvote" @click="$emit('upvote', item)">{{ item.upvotes || 0 }}</button>
            <div>
              <p>{{ item.text }}</p>
              <small>{{ item.author }} · {{ item.timeLabel }}</small>
              <span v-if="item.pinned" class="sds__pinned">Pinned by facilitator</span>
            </div>
          </li>
          <li v-if="!topics.length" class="sds__empty">No discussion points yet. Add the first topic.</li>
        </ul>
      </template>

      <template v-else-if="discussionSubTab === 'chat'">
        <p class="sds__lead">Session chat</p>
        <p v-if="error" class="sds__error">{{ error }}</p>
        <ul class="sds__chat">
          <li v-for="msg in chatMessages" :key="msg.id" class="sds__bubble">
            <div class="sds__meta">
              <strong>{{ msg.author }}</strong>
              <span>{{ msg.timeLabel }}</span>
            </div>
            <p>{{ msg.text }}</p>
          </li>
          <li v-if="!chatMessages.length" class="sds__empty">No messages yet. Say hello.</li>
        </ul>
        <form class="sds__ask sds__ask--chat" @submit.prevent="$emit('post-chat')">
          <input :value="chatDraft" type="text" class="input" placeholder="Write a message…" @input="$emit('update:chatDraft', $event.target.value)" />
          <button type="submit" class="btn btn-primary btn-sm" :disabled="!String(chatDraft || '').trim() || chatBusy">Send</button>
        </form>
      </template>

      <template v-else>
        <p v-if="transcriptHint" class="sds__hint">{{ transcriptHint }}</p>
        <div v-if="transcriptPreview" class="sds__transcript">
          <h4>Live transcript</h4>
          <pre>{{ transcriptPreview }}</pre>
        </div>
        <p v-else class="sds__empty">Transcript will appear here once speech is detected.</p>
      </template>
    </div>

    <div v-else class="sds__notes">
      <textarea
        :value="personalNotes"
        class="input"
        rows="12"
        placeholder="Your private session notes…"
        @input="$emit('update:personalNotes', $event.target.value)"
      />
    </div>
  </aside>
</template>

<script setup>
defineProps({
  roomy: { type: Boolean, default: false },
  sideTab: { type: String, default: 'discussion' },
  discussionSubTab: { type: String, default: 'topics' },
  topicDraft: { type: String, default: '' },
  chatDraft: { type: String, default: '' },
  personalNotes: { type: String, default: '' },
  topics: { type: Array, default: () => [] },
  chatMessages: { type: Array, default: () => [] },
  error: { type: String, default: '' },
  topicBusy: { type: Boolean, default: false },
  chatBusy: { type: Boolean, default: false },
  transcriptHint: { type: String, default: '' },
  transcriptPreview: { type: String, default: '' }
});

defineEmits([
  'update:sideTab',
  'update:discussionSubTab',
  'update:topicDraft',
  'update:chatDraft',
  'update:personalNotes',
  'post-topic',
  'post-chat',
  'upvote'
]);
</script>

<style scoped>
.sds {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sds--roomy { min-height: min(62vh, 560px); }
.sds__tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}
.sds__tabs button {
  background: none;
  border: 0;
  color: #a8b3c7;
  padding: 8px 10px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.sds__tabs button.active {
  color: #fff;
  border-bottom-color: var(--agency-primary-color, var(--primary));
}
.sds__discussion {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.sds__subtabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
  background: rgba(0, 0, 0, 0.18);
  border-radius: 10px;
  padding: 3px;
}
.sds__subtabs button {
  flex: 1;
  border: 0;
  background: transparent;
  color: #a8b3c7;
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 0.8rem;
  font-weight: 650;
  cursor: pointer;
}
.sds__subtabs button.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.sds__lead, .sds__hint {
  margin: 0 0 10px;
  font-size: 0.82rem;
  color: rgba(226, 232, 240, 0.85);
  line-height: 1.4;
}
.sds__error {
  margin: 0 0 8px;
  font-size: 0.82rem;
  color: #fca5a5;
}
.sds__ask {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.sds__ask--chat {
  margin-top: auto;
  margin-bottom: 0;
}
.sds__feed, .sds__chat {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 180px;
}
.sds__feed li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.15);
}
.sds__feed li.sds__empty,
.sds__chat li.sds__empty {
  display: block;
  background: transparent;
  padding: 10px 4px;
}
.sds__feed p {
  margin: 0;
  white-space: normal;
  word-break: break-word;
  line-height: 1.4;
}
.sds__vote {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: inherit;
  border-radius: 8px;
  cursor: pointer;
}
.sds__pinned {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--agency-primary-color, var(--primary));
}
.sds__empty {
  white-space: normal !important;
  line-height: 1.45;
  opacity: 0.75;
}
.sds__bubble {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px 10px;
}
.sds__bubble p {
  margin: 4px 0 0;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}
.sds__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.75rem;
  color: #94a3b8;
}
.sds__meta strong { color: #e2e8f0; }
.sds__transcript {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
  padding: 8px 10px;
  max-height: 280px;
  overflow: auto;
}
.sds__transcript h4 {
  margin: 0 0 6px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
}
.sds__transcript pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: 0.8rem;
  line-height: 1.35;
  color: #e2e8f0;
  font-family: inherit;
}
.input {
  width: 100%;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: inherit;
  border-radius: 8px;
  padding: 8px 10px;
}
</style>
