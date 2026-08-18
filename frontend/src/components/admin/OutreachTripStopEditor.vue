<template>
  <aside class="otse">
    <div class="otse-head">
      <div class="otse-head-title">
        <span
          v-if="stopColor"
          class="otse-stop-dot"
          :style="{ background: stopColor }"
          aria-hidden="true"
        />
        <div>
          <h2>
            <template v-if="stopOrder != null">{{ stopOrder }} · </template>
            {{ school?.name || 'School' }}
          </h2>
          <span v-if="school" class="ohub-stage" :class="school.outreach_stage">
            {{ stageLabel(school.outreach_stage) }}
          </span>
        </div>
      </div>
      <div class="otse-head-actions">
        <button type="button" class="btn-link" @click="$emit('open-full')">Open full school record</button>
        <button type="button" class="btn-link" @click="$emit('close')">Close</button>
      </div>
    </div>

    <p v-if="school" class="otse-meta ohub-muted">
      {{ school.address || school.city || '—' }}
      · {{ shortDistrict(school.district_name) }}
      <span v-if="school.is_charter" class="ohub-charter">Charter</span>
      <template v-if="stopOrder != null && stopTotal != null"> · Stop {{ stopOrder }} of {{ stopTotal }}</template>
    </p>

    <div v-if="showAttendance && attendanceOptions?.length" class="otse-card">
      <h3>Status</h3>
      <div class="otse-attend">
        <button
          v-for="opt in attendanceOptions"
          :key="opt.id"
          type="button"
          class="ohub-attend-btn"
          :class="{ on: attendanceStatus === opt.id }"
          :disabled="disabled || saving"
          @click="$emit('set-attendance', opt.id)"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div class="otse-card">
      <div class="otse-card-head">
        <h3>Contacts</h3>
      </div>
      <div class="otse-table-wrap">
        <table class="otse-table" v-if="(school?.contacts || []).length">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Phone</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in school.contacts" :key="c.id">
              <td>
                <strong>{{ c.full_name }}</strong>
                <span v-if="c.is_primary" class="ohub-stage partnered sm">Primary</span>
              </td>
              <td>{{ c.title || '—' }}</td>
              <td>{{ c.phone || '—' }}</td>
              <td class="otse-email">{{ c.email || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="ohub-muted">No contacts yet — type a name in Conversation to add one.</p>
      </div>
      <form class="otse-inline-form" @submit.prevent="submitContact">
        <input v-model="contactForm.full_name" type="text" required placeholder="Add contact name" />
        <input v-model="contactForm.title" type="text" placeholder="Role" />
        <input v-model="contactForm.phone" type="tel" placeholder="Phone" />
        <input v-model="contactForm.email" type="email" placeholder="Email" />
        <button type="submit" class="btn btn-secondary btn-sm" :disabled="saving">+ Add contact</button>
      </form>
    </div>

    <div class="otse-card">
      <h3>Conversation</h3>
      <p class="ohub-muted">Contact note — typing a new name adds them as a contact.</p>
      <form class="otse-form" @submit.prevent="submitConversation">
        <label class="ohub-field">
          <span>Spoken with</span>
          <input
            v-model="convForm.spoken_with_name"
            list="otse-contacts"
            type="text"
            required
            placeholder="Name — existing or new"
          />
          <datalist id="otse-contacts">
            <option v-for="c in school?.contacts || []" :key="`dl-${c.id}`" :value="c.full_name" />
          </datalist>
        </label>
        <label class="ohub-field">
          <span>Summary</span>
          <input v-model="convForm.summary" type="text" placeholder="What you talked about…" />
        </label>
        <label class="ohub-field">
          <span>Details (optional)</span>
          <textarea v-model="convForm.details" rows="2" placeholder="Optional details" />
        </label>
        <button type="submit" class="btn btn-primary" :disabled="saving">Save conversation</button>
      </form>
    </div>

    <div class="otse-card">
      <h3>Next steps / Follow-up</h3>
      <form class="otse-form" @submit.prevent="submitFollowUp">
        <label class="ohub-check">
          <input v-model="followForm.needed" type="checkbox" />
          Follow-up needed?
        </label>
        <label v-if="followForm.needed" class="ohub-field">
          <span>Follow-up date</span>
          <input v-model="followForm.follow_up_at" type="date" required />
        </label>
        <label class="ohub-field">
          <span>What's next?</span>
          <textarea v-model="followForm.body" rows="2" required placeholder="Call Dolores next week…" />
        </label>
        <button type="submit" class="btn btn-secondary" :disabled="saving">Save next steps</button>
      </form>
    </div>

    <div class="otse-card">
      <h3>Create task</h3>
      <form class="otse-form" @submit.prevent="submitTask">
        <label class="ohub-field">
          <span>Task title</span>
          <input v-model="taskForm.title" type="text" required placeholder="Follow up after visit…" />
        </label>
        <label class="ohub-field">
          <span>Assignee</span>
          <select v-model="taskForm.assignedToUserId">
            <option value="">Me</option>
            <option v-for="u in assignableUsers" :key="u.id" :value="String(u.id)">
              {{ u.first_name }} {{ u.last_name }}
            </option>
          </select>
        </label>
        <label class="ohub-field">
          <span>Due date</span>
          <input v-model="taskForm.dueDate" type="date" />
        </label>
        <button type="submit" class="btn btn-primary" :disabled="saving">Create &amp; assign task</button>
      </form>
    </div>

    <div class="otse-card">
      <h3>General note</h3>
      <form class="otse-form" @submit.prevent="submitGeneralNote">
        <textarea v-model="noteForm.body" rows="2" required placeholder="Anything else about this stop…" />
        <button type="submit" class="btn btn-secondary" :disabled="saving">Save note</button>
      </form>
    </div>

    <div class="otse-card">
      <h3>Activity on this trip</h3>
      <ol class="otse-feed">
        <li v-for="item in tripFeed" :key="item.id" class="otse-feed-item">
          <span
            class="otse-type-pill"
            :class="item.entry_type"
            :style="item.stop_color ? { borderColor: item.stop_color } : undefined"
          >{{ feedLabel(item) }}</span>
          <div>
            <strong>{{ item.title }}</strong>
            <p v-if="item.body">{{ item.body }}</p>
            <div class="ohub-muted">
              {{ formatDateTime(item.occurred_at) }}
              <template v-if="item.created_by_name"> · {{ item.created_by_name }}</template>
              <span
                v-if="tripTagLabel"
                class="otse-trip-tag"
                :style="stopColor ? { background: stopColor + '22', color: stopColor, borderColor: stopColor } : undefined"
              >{{ tripTagLabel }}</span>
            </div>
          </div>
        </li>
        <li v-if="!tripFeed.length" class="ohub-muted">Nothing logged for this trip yet.</li>
      </ol>
    </div>
  </aside>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';

const props = defineProps({
  school: { type: Object, default: null },
  tripId: { type: [Number, String], default: null },
  tripStopId: { type: [Number, String], default: null },
  tripTitle: { type: String, default: '' },
  stopOrder: { type: Number, default: null },
  stopTotal: { type: Number, default: null },
  stopColor: { type: String, default: null },
  attendanceStatus: { type: String, default: 'pending' },
  attendanceOptions: { type: Array, default: () => [] },
  showAttendance: { type: Boolean, default: true },
  assignableUsers: { type: Array, default: () => [] },
  stageLabel: { type: Function, required: true },
  shortDistrict: { type: Function, required: true },
  formatDateTime: { type: Function, required: true },
  saving: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits([
  'close',
  'open-full',
  'set-attendance',
  'add-contact',
  'save-note',
  'create-task'
]);

const contactForm = reactive({ full_name: '', title: '', phone: '', email: '' });
const convForm = reactive({ spoken_with_name: '', summary: '', details: '' });
const followForm = reactive({ needed: true, follow_up_at: '', body: '' });
const taskForm = reactive({ title: '', dueDate: '', assignedToUserId: '' });
const noteForm = reactive({ body: '' });

watch(
  () => props.school?.id,
  () => {
    contactForm.full_name = '';
    contactForm.title = '';
    contactForm.phone = '';
    contactForm.email = '';
    convForm.spoken_with_name = '';
    convForm.summary = '';
    convForm.details = '';
    followForm.needed = true;
    followForm.follow_up_at = '';
    followForm.body = '';
    taskForm.title = '';
    taskForm.dueDate = '';
    taskForm.assignedToUserId = '';
    noteForm.body = '';
  }
);

const tripTagLabel = computed(() => props.tripTitle || (props.tripId ? `Trip #${props.tripId}` : ''));

const tripFeed = computed(() => {
  const tid = Number(props.tripId || 0);
  const feed = props.school?.feed || [];
  if (!tid) return feed.slice(0, 12);
  return feed.filter((f) => Number(f.trip_id) === tid).slice(0, 20);
});

const feedLabel = (item) => {
  const t = String(item?.entry_type || '');
  if (t === 'conversation') return 'Conversation';
  if (t === 'follow_up') return 'Follow-up';
  if (t === 'note') return 'Note';
  if (t === 'task') return 'Task';
  if (t === 'contact') return item.contact_type || 'Contact';
  return t || 'Entry';
};

const tripScope = () => ({
  trip_id: props.tripId ? Number(props.tripId) : null,
  trip_stop_id: props.tripStopId ? Number(props.tripStopId) : null
});

const submitContact = () => {
  const name = String(contactForm.full_name || '').trim();
  if (!name) return;
  emit('add-contact', {
    full_name: name,
    title: contactForm.title || null,
    phone: contactForm.phone || null,
    email: contactForm.email || null,
    is_primary: false
  });
  contactForm.full_name = '';
  contactForm.title = '';
  contactForm.phone = '';
  contactForm.email = '';
};

const submitConversation = () => {
  const name = String(convForm.spoken_with_name || '').trim();
  if (!name) return;
  const body = [convForm.summary, convForm.details].filter(Boolean).join('\n\n') || `Spoke with ${name}`;
  emit('save-note', {
    ...tripScope(),
    note_kind: 'conversation',
    spoken_with_name: name,
    body
  });
  convForm.spoken_with_name = '';
  convForm.summary = '';
  convForm.details = '';
};

const submitFollowUp = () => {
  const body = String(followForm.body || '').trim();
  if (!body) return;
  emit('save-note', {
    ...tripScope(),
    note_kind: 'follow_up',
    body,
    follow_up_at: followForm.needed ? (followForm.follow_up_at || null) : null
  });
  followForm.body = '';
  followForm.follow_up_at = '';
};

const submitTask = () => {
  const title = String(taskForm.title || '').trim();
  if (!title) return;
  emit('create-task', {
    title,
    dueDate: taskForm.dueDate || null,
    assignedToUserId: taskForm.assignedToUserId || '',
    tripId: props.tripId ? Number(props.tripId) : null
  });
  taskForm.title = '';
  taskForm.dueDate = '';
  taskForm.assignedToUserId = '';
};

const submitGeneralNote = () => {
  const body = String(noteForm.body || '').trim();
  if (!body) return;
  emit('save-note', {
    ...tripScope(),
    note_kind: 'general',
    body
  });
  noteForm.body = '';
};
</script>

<style scoped>
.otse {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.otse-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.otse-head-title {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  min-width: 0;
}
.otse-head-title h2 {
  margin: 0 0 4px;
  font-size: 18px;
  color: #14532d;
  word-break: break-word;
}
.otse-stop-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}
.otse-head-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.otse-meta { margin: 0; font-size: 12px; }
.otse-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #fafefa;
  min-width: 0;
}
.otse-card h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #14532d;
}
.otse-attend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.otse-attend :deep(.ohub-attend-btn) {
  min-height: 40px;
  padding: 8px 12px;
  font-size: 13px;
}
.otse-table-wrap { overflow-x: auto; margin-bottom: 8px; }
.otse-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.otse-table th {
  text-align: left;
  color: #64748b;
  font-size: 10px;
  text-transform: uppercase;
  padding: 4px 6px;
  border-bottom: 1px solid #e2e8f0;
}
.otse-table td {
  padding: 6px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
  word-break: break-word;
}
.otse-email { word-break: break-all; }
.otse-inline-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
  align-items: center;
}
.otse-inline-form input {
  border: 1px solid #dbe4dc;
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 13px;
  min-width: 0;
}
.otse-form { display: grid; gap: 8px; }
.otse-feed { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.otse-feed-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}
.otse-type-pill {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid transparent;
  white-space: nowrap;
}
.otse-type-pill.conversation { background: #ede9fe; color: #6d28d9; }
.otse-type-pill.follow_up { background: #ffedd5; color: #c2410c; }
.otse-type-pill.note { background: #dcfce7; color: #166534; }
.otse-type-pill.task { background: #e0f2fe; color: #0369a1; }
.otse-type-pill.contact { background: #fce7f3; color: #9d174d; }
.otse-trip-tag {
  display: inline-flex;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid #bbf7d0;
  background: #ecfdf5;
  color: #166534;
}
.ohub-muted { color: #64748b; font-size: 12px; }
.ohub-field { display: grid; gap: 4px; font-size: 12px; font-weight: 600; color: #334155; }
.ohub-field input,
.ohub-field select,
.ohub-field textarea,
.otse-form > textarea {
  border: 1px solid #dbe4dc;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fff;
  font-weight: 400;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.ohub-check {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
}
.ohub-stage {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
}
.ohub-stage.sm { font-size: 10px; padding: 1px 6px; margin-left: 4px; }
.ohub-stage.partnered { background: #dcfce7; color: #166534; }
.ohub-stage.follow_up_needed { background: #ffedd5; color: #c2410c; }
.ohub-charter {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6d28d9;
  background: #f3e8ff;
  padding: 1px 6px;
  border-radius: 999px;
}
.btn-link {
  border: 0;
  background: transparent;
  color: #14532d;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  font-size: 13px;
}
@media (max-width: 980px) {
  .otse-attend :deep(.ohub-attend-btn) {
    flex: 1 1 calc(50% - 8px);
    min-height: 48px;
  }
  .otse-inline-form {
    grid-template-columns: 1fr;
  }
}
</style>
