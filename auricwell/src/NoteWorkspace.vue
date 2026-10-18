<template>
  <div
    class="note-workspace"
    :class="{
      'drafts-collapsed': draftsCollapsed,
      'todo-collapsed': todoCollapsed,
    }"
  >
    <aside class="card note-sidebar" aria-label="Drafts and records">
      <div class="note-panel-heading">
        <h2 v-if="!draftsCollapsed">Drafts</h2>
        <button
          class="outline"
          :aria-expanded="!draftsCollapsed"
          aria-controls="note-library"
          :aria-label="draftsCollapsed ? 'Show drafts' : 'Hide drafts'"
          @click="draftsCollapsed = !draftsCollapsed"
        >
          {{ draftsCollapsed ? "›" : "‹" }}
        </button>
      </div>
      <div v-show="!draftsCollapsed" id="note-library">
        <label
          >Show<select v-model="libraryStatus">
            <option value="draft">Drafts</option>
            <option value="all">All records</option>
          </select></label
        >
        <button
          v-for="note in library"
          :key="note.id"
          class="outline note-list-item"
          @click="openNote(note)"
        >
          <strong>{{ patientName(note.patientId) }}</strong
          ><span>{{ note.data.title }}</span
          ><small>{{ note.data.serviceDate }} · {{ note.data.status }}</small>
        </button>
        <p v-if="!library.length" class="muted">
          No {{ libraryStatus === "draft" ? "drafts" : "records" }} in this
          practice.
        </p>
      </div>
    </aside>
    <div class="note-center">
      <slot v-if="editor" name="editor" />
      <article v-else-if="selected" class="card note-card">
        <div class="section-heading">
          <div>
            <span class="eyebrow"
              >{{ patientName(selected.patientId) }} ·
              {{ selected.data.serviceDate }}</span
            >
            <h2>{{ selected.data.title }}</h2>
          </div>
          <button class="outline" @click="closeNote">Close note</button>
        </div>
        <p class="badge">{{ selected.data.status }}</p>
        <p v-if="selected.data.structured" class="muted">
          {{ selected.data.structured.snapshot.name }} · template version
          {{ selected.data.structured.templateRevision }}
        </p>
        <p class="document-preview">{{ selected.data.content }}</p>
        <p v-if="selected.data.source === 'therapynotes'" class="muted">
          Historical author: {{ selected.data.historicalAuthor }} · Original
          pages {{ selected.data.pageStart }}–{{ selected.data.pageEnd }}
        </p>
        <div class="actions">
          <button
            v-if="ownDraft(selected)"
            class="outline"
            @click="edit(selected)"
          >
            Edit draft
          </button>
          <button v-if="ownDraft(selected)" @click="$emit('sign', selected)">
            Review & sign
          </button>
          <button v-if="canCosign(selected)" @click="$emit('cosign', selected)">
            Review & cosign
          </button>
          <template v-if="selected.data.sourceFileId">
            <a
              class="button outline"
              :href="`/api/auricwell${base}/notes/${selected.id}/source`"
              >Original note pages</a
            >
            <button
              v-if="canClinical"
              class="outline"
              @click="$emit('share', selected, true)"
            >
              Share with patient
            </button>
            <button
              v-if="canClinical"
              class="outline"
              @click="$emit('share', selected, false)"
            >
              Revoke patient sharing
            </button>
          </template>
        </div>
      </article>
      <template v-else>
        <NoteAid
          v-if="canClinical"
          :base="base"
          :patients="patients"
          @use-draft="$emit('use-draft', $event)"
        />
        <article class="card">
          <h2>Your documentation workspace</h2>
          <p class="muted">
            Open a draft on the left or a task on the right. Review the complete
            note before signing.
          </p>
        </article>
      </template>
    </div>
    <aside class="card note-sidebar" aria-label="Documentation to do">
      <div class="note-panel-heading">
        <h2 v-if="!todoCollapsed">To do</h2>
        <button
          class="outline"
          :aria-expanded="!todoCollapsed"
          aria-controls="note-todo"
          :aria-label="todoCollapsed ? 'Show to do' : 'Hide to do'"
          @click="todoCollapsed = !todoCollapsed"
        >
          {{ todoCollapsed ? "‹" : "›" }}
        </button>
      </div>
      <div v-show="!todoCollapsed" id="note-todo">
        <label v-if="canSupervise" class="checkbox-label"
          ><input v-model="supervision" type="checkbox" />Supervision</label
        >
        <p class="muted">
          {{
            supervision
              ? "Notes awaiting your cosignature."
              : "Your notes awaiting completion."
          }}
        </p>
        <button
          v-for="note in tasks"
          :key="note.id"
          class="outline note-list-item"
          @click="openNote(note)"
        >
          <strong>{{ patientName(note.patientId) }}</strong
          ><span>{{ note.data.title }}</span
          ><small
            >{{ supervision ? "Review for cosignature" : "Continue draft" }} ·
            {{ note.data.serviceDate }}</small
          >
        </button>
        <button
          v-for="visit in undocumentedVisits"
          :key="visit.id"
          class="outline note-list-item"
          @click="startVisit(visit)"
        >
          <strong>{{ patientName(visit.patientId) }}</strong
          ><span>Write session note</span
          ><small
            >{{ dateInZone(visit.data.start, timezone) }} ·
            {{ visit.data.serviceCode }}</small
          >
        </button>
        <p v-if="!tasks.length && !undocumentedVisits.length" class="muted">
          {{
            supervision
              ? "No notes awaiting your cosignature."
              : "No unfinished notes."
          }}
        </p>
      </div>
    </aside>
  </div>
</template>
<script setup>
import { computed, ref, watch } from "vue";
import NoteAid from "./NoteAid.vue";
import { dateInZone } from "./calendar.js";
const props = defineProps({
  base: String,
  accountId: String,
  patients: Array,
  providers: Array,
  notes: Array,
  appointments: Array,
  timezone: String,
  editor: Boolean,
  editingId: String,
  canClinical: Boolean,
  canSupervise: Boolean,
});
const emit = defineEmits([
  "edit",
  "sign",
  "cosign",
  "share",
  "use-draft",
  "close-editor",
]);
const draftsCollapsed = ref(false),
  todoCollapsed = ref(false),
  supervision = ref(false),
  libraryStatus = ref("draft"),
  selectedId = ref(null);
const selected = computed(() =>
  props.notes.find((n) => n.id === selectedId.value),
);
const library = computed(() =>
  props.notes.filter(
    (n) => libraryStatus.value === "all" || n.data.status === "draft",
  ),
);
const ownDraft = (n) =>
  props.canClinical &&
  n.data.status === "draft" &&
  n.data.authorAccountId === props.accountId;
const canCosign = (n) =>
  props.canSupervise &&
  n.data.status === "signed" &&
  n.data.requiresCosign &&
  n.data.authorAccountId !== props.accountId &&
  props.providers.some(
    (p) =>
      p.data.accountId === n.data.authorAccountId &&
      p.data.supervisorAccountId === props.accountId,
  );
const tasks = computed(() =>
  props.notes.filter(supervision.value ? canCosign : ownDraft),
);
const undocumentedVisits = computed(() =>
  !props.canClinical || supervision.value
    ? []
    : (props.appointments || []).filter(
        (visit) =>
          visit.data.providerAccountId === props.accountId &&
          ["scheduled", "confirmed", "completed"].includes(visit.data.status) &&
          new Date(visit.data.end).getTime() <= Date.now() &&
          !props.notes.some((note) => note.data.appointmentId === visit.id),
      ),
);
function startVisit(visit) {
  collapse();
  emit("use-draft", {
    patientId: visit.patientId,
    appointmentId: visit.id,
    serviceDate: dateInZone(visit.data.start, props.timezone),
    serviceCode: visit.data.serviceCode,
    title: "Progress note",
    type: "Progress note",
    content: "",
  });
}
const patientName = (id) =>
  props.patients.find((p) => p.id === id)?.data.name || "Client";
function collapse() {
  draftsCollapsed.value = true;
  todoCollapsed.value = true;
}
function edit(note) {
  collapse();
  selectedId.value = null;
  emit("edit", note);
}
function openNote(note) {
  if (ownDraft(note)) return edit(note);
  emit("close-editor");
  selectedId.value = note.id;
  collapse();
}
function closeNote() {
  selectedId.value = null;
  draftsCollapsed.value = false;
  todoCollapsed.value = false;
}
watch(
  () => [props.editor, props.editingId],
  ([editing]) => {
    if (editing) {
      selectedId.value = null;
      collapse();
    }
  },
  { immediate: true },
);
watch(
  () => props.editor,
  (editing, prior) => {
    if (prior && !editing && !selectedId.value) closeNote();
  },
);
watch(
  () => props.canSupervise,
  (allowed) => {
    if (!allowed) supervision.value = false;
  },
);
</script>
<style scoped>
.note-workspace {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr) 225px;
  gap: 16px;
  align-items: start;
}
.note-workspace.drafts-collapsed {
  grid-template-columns: 48px minmax(0, 1fr) 225px;
}
.note-workspace.todo-collapsed {
  grid-template-columns: 210px minmax(0, 1fr) 48px;
}
.note-workspace.drafts-collapsed.todo-collapsed {
  grid-template-columns: 48px minmax(0, 1fr) 48px;
}
.note-center {
  min-width: 0;
  display: grid;
  gap: 16px;
}
.note-sidebar {
  padding: 12px;
  min-width: 0;
  background: white;
}
.note-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.note-panel-heading h2 {
  font-size: 17px;
  margin: 0;
}
.note-panel-heading button {
  padding: 5px 9px;
  min-width: 30px;
}
.drafts-collapsed > .note-sidebar:first-child,
.todo-collapsed > .note-sidebar:last-child {
  padding: 8px;
}
.note-list-item {
  width: 100%;
  display: grid;
  gap: 5px;
  text-align: left;
  margin-top: 10px;
  padding: 12px;
  overflow-wrap: anywhere;
}
.note-list-item small {
  color: var(--muted);
  font-weight: 400;
}
.note-sidebar label {
  font-size: 13px;
}
@media (max-width: 1150px) {
  .note-workspace {
    grid-template-columns: 175px minmax(0, 1fr) 175px;
    gap: 10px;
  }
  .note-workspace.drafts-collapsed {
    grid-template-columns: 48px minmax(0, 1fr) 175px;
  }
  .note-workspace.todo-collapsed {
    grid-template-columns: 175px minmax(0, 1fr) 48px;
  }
}
@media (max-width: 850px) {
  .note-workspace,
  .note-workspace.drafts-collapsed,
  .note-workspace.todo-collapsed,
  .note-workspace.drafts-collapsed.todo-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .note-panel-heading {
    margin-bottom: 0;
  }
}
</style>
