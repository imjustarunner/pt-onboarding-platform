<template>
  <section>
    <div class="page-heading">
      <div>
        <span class="eyebrow">Your practice</span>
        <h1>Schedule</h1>
        <p>Appointment times use {{ timezone }}.</p>
      </div>
      <button v-if="canManage || patientPortal" @click="open()">
        {{ canManage ? "＋ New appointment" : "Request appointment" }}
      </button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <article v-if="editor" class="card editor">
      <h2>
        {{
          patientPortal
            ? "Request an appointment"
            : editing
              ? "Manage appointment"
              : "New appointment"
        }}
      </h2>
      <form @submit.prevent="save" @input="invalidate" @change="invalidate">
        <div class="schedule-fields">
          <label
            >Client<select
              v-model="form.patientId"
              required
              :disabled="!!editing"
            >
              <option value="">Choose a client</option>
              <option v-for="p in patients" :key="p.id" :value="p.id">
                {{ p.data.name }}
              </option>
            </select></label
          >
          <template v-if="canManage">
            <label v-if="form.status==='cancelled' || scope==='cancel'">Cancellation reason (visible to authorized guardians)<textarea v-model="form.reason" required maxlength="2000" /></label>
            <label v-if="editing?.data.seriesId"
              >Change scope<select v-model="scope">
                <option value="single">This appointment</option>
                <option value="reschedule">
                  Reschedule this and future visits
                </option>
                <option value="cancel">Cancel this and future visits</option>
              </select></label
            >
            <template v-if="scope !== 'cancel'">
              <label
                >Service<select v-model="form.serviceCode" required>
                  <option value="">Choose a service</option>
                  <option
                    v-for="s in options.services"
                    :key="s.code"
                    :value="s.code"
                  >
                    {{ s.code }} {{ s.name }}
                  </option>
                </select></label
              >
              <label
                >Location<select v-model="form.location" required>
                  <option value="">Choose a location</option>
                  <option v-for="l in options.locations" :key="l" :value="l">
                    {{ l }}
                  </option>
                </select></label
              >
              <label
                >Date and time · {{ timezone
                }}<input
                  v-model="form.localStart"
                  type="datetime-local"
                  required
              /></label>
              <label
                >Duration (minutes)<input
                  v-model.number="form.durationMinutes"
                  type="number"
                  min="5"
                  max="480"
                  required
              /></label>
              <label
                >Provider<select v-model="form.providerId" required>
                  <option value="">Choose a provider</option>
                  <option
                    v-for="p in eligibleProviders"
                    :key="p.id"
                    :value="p.id"
                  >
                    {{ p.data.name
                    }}{{
                      p.id === editing?.data.providerId &&
                      p.data.status !== "active"
                        ? " (historical)"
                        : ""
                    }}
                  </option>
                </select></label
              >
              <label
                >Visit type<select v-model="form.modality">
                  <option value="office">In person</option>
                  <option value="video">Video</option>
                </select></label
              >
              <label
                v-if="scope === 'single' && (editing || !form.intervalWeeks)"
                >Status<select v-model="form.status">
                  <option
                    v-for="s in [
                      'scheduled',
                      'confirmed',
                      'completed',
                      'cancelled',
                      'no_show',
                    ]"
                    :key="s"
                    :value="s"
                  >
                    {{ s.replace("_", " ") }}
                  </option>
                </select></label
              >
              <label v-if="!editing"
                >Repeat<select v-model.number="form.intervalWeeks">
                  <option :value="0">Does not repeat</option>
                  <option :value="1">Every week</option>
                  <option :value="2">Every 2 weeks</option>
                  <option :value="4">Every 4 weeks</option>
                </select></label
              >
              <label v-if="scope === 'reschedule'"
                >Repeat<select v-model.number="form.intervalWeeks">
                  <option :value="1">Every week</option>
                  <option :value="2">Every 2 weeks</option>
                  <option :value="4">Every 4 weeks</option>
                </select></label
              >
              <label v-if="!editing && form.intervalWeeks"
                >Number of visits<input
                  v-model.number="form.count"
                  type="number"
                  min="2"
                  max="52"
                  required
              /></label>
            </template>
          </template>
          <label v-else
            >Preferred times and details<textarea
              v-model="form.message"
              required
              maxlength="2000"
            ></textarea>
          </label>
        </div>
        <p v-if="isSeries" class="muted">
          Review all visits before saving. Completed visits, past visits,
          documented care, and individually changed appointments are preserved.
        </p>
        <div v-if="preview" class="series-preview" aria-live="polite">
          <h3>
            Review {{ preview.visits.length }}
            {{ preview.action === "cancel" ? "cancellations" : "visits" }}
          </h3>
          <ul>
            <li v-for="v in preview.visits" :key="v.sequence">
              {{ formatDate(v.data.start) }} · {{ formatTime(v.data.start) }}–{{
                formatTime(v.data.end)
              }}
            </li>
          </ul>
          <p v-for="s in preview.skipped" :key="s.id">
            Preserved {{ formatDate(s.start) }}: {{ s.reason }}
          </p>
          <p v-for="(issue, i) in preview.issues" :key="i" class="error">
            {{
              issue.sequence === undefined
                ? ""
                : `Visit ${issue.sequence + 1}: `
            }}{{ issue.message }}
          </p>
          <label v-if="!preview.issues.length" class="check"
            ><input v-model="reviewed" type="checkbox" /> I reviewed these
            {{
              preview.action === "cancel" ? "cancellations" : "visits"
            }}.</label
          >
        </div>
        <div class="actions">
          <button
            v-if="!isSeries || !preview"
            :disabled="busy || (canManage && !optionsReady)"
          >
            {{
              isSeries
                ? "Preview series"
                : patientPortal
                  ? "Send request"
                  : "Save appointment"
            }}</button
          ><button
            v-else
            :disabled="busy || !reviewed || !!preview.issues.length"
          >
            {{
              scope === "cancel"
                ? "Confirm cancellations"
                : "Save reviewed series"
            }}</button
          ><button
            type="button"
            class="outline"
            :disabled="busy"
            @click="close"
          >
            Close
          </button>
        </div>
      </form>
    </article>
    <article v-if="appointmentRequests.length" class="card">
      <h2>Appointment requests</h2>
      <div v-for="r in appointmentRequests" :key="r.id" class="list-row">
        <div>
          <strong>{{ patientName(r.patientId) }} · {{ r.data.status }}</strong>
          <p>{{ r.data.requestedByName || "Portal member" }} requested {{ r.data.requestType || "an appointment" }}: {{ r.data.message }}</p>
          <p v-if="r.data.resolution">{{ r.data.resolvedByName }}: {{ r.data.resolution }}</p>
        </div>
        <button
          v-if="canManage && r.data.status === 'pending' && (!r.data.appointmentId || appointments.find(a=>a.id===r.data.appointmentId)?.data.providerAccountId===currentAccountId)"
          class="outline"
          @click="$emit('resolve-request', r)"
        >
          {{ r.data.appointmentId ? "Approve request" : "Record resolution" }}
        </button>
        <button v-if="canManage && r.data.appointmentId && r.data.status==='pending' && appointments.find(a=>a.id===r.data.appointmentId)?.data.providerAccountId===currentAccountId" @click="$emit('resolve-request',r,'declined')">Decline request</button>
      </div>
    </article>
    <div class="toolbar calendar-toolbar">
      <button
        class="outline"
        aria-label="Previous period"
        @click="selectedDate = nextDate(selectedDate, view, -1)"
      >
        ←</button
      ><button
        class="outline"
        @click="selectedDate = dateInZone(new Date(), timezone)"
      >
        Today</button
      ><button
        class="outline"
        aria-label="Next period"
        @click="selectedDate = nextDate(selectedDate, view, 1)"
      >
        →
      </button>
      <label
        >Calendar date<input
          v-model="selectedDate"
          type="date"
          required /></label
      ><label
        >View<select v-model="view">
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select></label
      >
      <label v-if="!patientPortal"
        >Provider filter<select v-model="providerFilter">
          <option value="">All providers</option>
          <option v-for="p in providers" :key="p.id" :value="p.id">
            {{ p.data.name
            }}{{ p.data.status === "inactive" ? " (inactive)" : "" }}
          </option>
        </select></label
      >
    </div>
    <div
      class="calendar-grid"
      :class="{ 'calendar-day': view === 'day' }"
      aria-label="Practice calendar"
    >
      <section
        v-for="day in days"
        :key="day"
        class="calendar-cell"
        :class="{
          'calendar-today': day === dateInZone(new Date(), timezone),
          'calendar-outside':
            view === 'month' && day.slice(0, 7) !== selectedDate.slice(0, 7),
        }"
        :aria-label="dayLabel(day)"
      >
        <h2>{{ dayLabel(day) }}</h2>
        <p v-if="!visitsOn(day).length" class="muted">No appointments</p>
        <article
          v-for="a in visitsOn(day)"
          :key="a.id"
          class="calendar-visit"
          :class="{ 'calendar-cancelled': a.data.status === 'cancelled' }"
        >
          <strong
            >{{ formatTime(a.data.start) }}–{{ formatTime(a.data.end) }}</strong
          ><span>{{ patientName(a.patientId) }}</span
          ><span>{{ providerName(a.data.providerId) }}</span
          ><small>{{ a.data.serviceCode }} · {{ a.data.location }}</small
          ><span class="badge">{{ a.data.status.replace("_", " ") }}</span
          ><small v-if="a.data.seriesId">{{
            a.data.seriesException
              ? "Series · individual change"
              : "Recurring visit"
          }}</small>
          <p v-if="a.data.changeReason">{{ a.data.changedBy }}: {{ a.data.changeReason }}</p>
          <template v-if="patientPortal && ['scheduled','confirmed'].includes(a.data.status)">
            <button class="outline" @click="requestChange(a,'cancel')">Request cancellation</button>
            <button class="outline" @click="requestChange(a,'reschedule')">Request reschedule</button>
          </template>
<button class="outline" @click="$emit('reminder-preferences',a.patientId)">Reminder preferences</button>
          <button v-if="!patientPortal && (canManage || a.data.providerAccountId === currentAccountId)" class="outline" @click="$emit('delivery-status',a.id)">Reminder status</button>
          <button v-if="canManage" class="outline" @click="open(a)">
            Manage</button
          ><button
            v-if="
              a.data.modality === 'video' &&
              ['scheduled','confirmed'].includes(a.data.status) && practice?.sessionFeatures?.videoProvider !== 'disabled' && (patientPortal || a.data.providerAccountId === currentAccountId)
            "
            class="outline"
            @click="$emit('join-video', a)"
          >
            Join session
          </button>
        </article>
      </section>
    </div>
  </section>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { api } from "./api.js";
import { localTime, dateInZone, calendarDays, nextDate } from "./calendar.js";
const props = defineProps({
  base: String,
  currentAccountId: String,
  practice: Object,
  patients: { type: Array, default: () => [] },
  providers: { type: Array, default: () => [] },
  appointments: { type: Array, default: () => [] },
  appointmentRequests: { type: Array, default: () => [] },
  canManage: Boolean,
  patientPortal: Boolean,
});
const emit = defineEmits(["changed", "join-video", "resolve-request", "reminder-preferences", "delivery-status"]);
const timezone = computed(() => props.practice?.timezone || "America/Denver");
const selectedDate = ref(dateInZone(new Date(), timezone.value)),
  view = ref("week"),
  providerFilter = ref(""),
  editor = ref(false),
  editing = ref(null),
  form = ref({}),
  scope = ref("single"),
  preview = ref(null),
  reviewed = ref(false),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  optionsReady = ref(false),
  key = ref("");
const options = ref({ services: [], locations: [], providers: [] });
const abort = new AbortController();
const days = computed(() =>
  selectedDate.value ? calendarDays(selectedDate.value, view.value) : [],
);
const visitsOn = (day) =>
  props.appointments
    .filter(
      (a) =>
        dateInZone(a.data.start, timezone.value) === day &&
        (!providerFilter.value || a.data.providerId === providerFilter.value),
    )
    .sort((a, b) => a.data.start.localeCompare(b.data.start));
const patientName = (id) =>
  props.patients.find((p) => p.id === id)?.data.name || "Client";
const providerName = (id) =>
  props.providers.find((p) => p.id === id)?.data.name || "Provider";
const formatTime = (value) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: timezone.value,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const formatDate = (value) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: timezone.value,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
const dayLabel = (day) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
const eligibleProviders = computed(() => {
  const rows = options.value.providers.filter(
    (p) =>
      p.data.status === "active" &&
      p.data.credentialsReviewed &&
      p.data.jurisdiction === "CO" &&
      (!p.data.licenseExpires ||
        p.data.licenseExpires >= (form.value.localStart || "").slice(0, 10)) &&
      (!form.value.serviceCode ||
        p.data.services?.includes(form.value.serviceCode)) &&
      (!form.value.location || p.data.locations?.includes(form.value.location)),
  );
  const existing = props.providers.find(
    (p) => p.id === editing.value?.data.providerId,
  );
  if (existing && !rows.some((p) => p.id === existing.id)) rows.push(existing);
  return rows;
});
const isSeries = computed(
  () =>
    props.canManage &&
    (scope.value !== "single" ||
      (!editing.value && form.value.intervalWeeks > 0)),
);
function invalidate(event) {
  if (event.target.type === "checkbox") return;
  preview.value = null;
  reviewed.value = false;
  key.value = crypto.randomUUID();
}
async function open(record) {
  editing.value = record || null;
  scope.value = "single";
  preview.value = null;
  reviewed.value = false;
  error.value = "";
  notice.value = "";
  key.value = crypto.randomUUID();
  form.value = record
    ? {
        ...record.data,
        revision: record.revision,
        sharedFingerprint: record.sharedFingerprint,
        localStart: localTime(record.data.start, timezone.value),
        durationMinutes: Math.round(
          (Date.parse(record.data.end) - Date.parse(record.data.start)) / 60000,
        ),
        intervalWeeks: record.data.intervalWeeks || 1,
      }
    : {
        patientId: "",
        providerId: "",
        serviceCode: "",
        location: "",
        localStart: `${selectedDate.value}T09:00`,
        durationMinutes: 60,
        modality: "office",
        status: "scheduled",
        intervalWeeks: 0,
        count: 8,
        message: "",
      };
  editor.value = true;
  await nextTick();
  document.querySelector(".editor select")?.focus();
}
function close() {
  editor.value = false;
  editing.value = null;
  form.value = {};
  preview.value = null;
  reviewed.value = false;
}
function singleBody() {
  const body = { ...form.value };
  // Keep the exact instant for status-only edits, including imported visits in a clock fold.
  if (
    editing.value &&
    body.localStart === localTime(editing.value.data.start, timezone.value) &&
    body.durationMinutes ===
      Math.round(
        (Date.parse(editing.value.data.end) -
          Date.parse(editing.value.data.start)) /
          60000,
      )
  )
    delete body.localStart;
  return body;
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    if (props.patientPortal)
      await api(`${props.base}/appointment-requests`, {
        method: "POST",
        body: { patientId: form.value.patientId, message: form.value.message },
        signal: abort.signal,
      });
    else if (isSeries.value) {
      const body = {
        ...form.value,
        action: editing.value ? scope.value : "create",
        fromAppointmentId: editing.value?.id,
      };
      if (!preview.value) {
        preview.value = await api(`${props.base}/appointment-series/preview`, {
          method: "POST",
          body,
          signal: abort.signal,
        });
        return;
      }
      const result = await api(`${props.base}/appointment-series`, {
        method: "POST",
        body: {
          ...body,
          reviewed: reviewed.value,
          previewHash: preview.value.previewHash,
          idempotencyKey: key.value,
        },
        signal: abort.signal,
      });
      notice.value = `${result.appointmentIds.length} visits ${scope.value === "cancel" ? "cancelled" : "saved"}. ${result.skipped.length} preserved.`;
    } else
      await api(
        `${props.base}/appointments${editing.value ? `/${editing.value.id}` : ""}`,
        {
          method: editing.value ? "PUT" : "POST",
          body: singleBody(),
          signal: abort.signal,
        },
      );
    notice.value ||= props.patientPortal
      ? "Appointment request sent."
      : "Appointment saved.";
    if (form.value.localStart)
      selectedDate.value = form.value.localStart.slice(0, 10);
    close();
    emit("changed");
  } catch (e) {
    if (e.name !== "AbortError") error.value = e.message;
    if (e.status === 409) {
      preview.value = null;
      reviewed.value = false;
      key.value = crypto.randomUUID();
    }
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  if (!props.canManage) return;
  try {
    options.value = await api(`${props.base}/scheduling-options`, {
      signal: abort.signal,
    });
    optionsReady.value = true;
  } catch (e) {
    if (e.name !== "AbortError") error.value = e.message;
  }
});
onUnmounted(() => {
  abort.abort();
  close();
});
async function requestChange(appointment,requestType){
  const message=window.prompt('Give a reason. Both authorized guardians and the care team will see it. The appointment stays scheduled until the assigned provider approves.');
  if(!message?.trim())return;
  try{await api(`${props.base}/appointment-requests`,{method:'POST',body:{appointmentId:appointment.id,requestType,message}});notice.value='Request sent for provider approval. The appointment remains scheduled.';emit('changed');}
  catch(e){error.value=e.message||'The request could not be saved.';}
}
</script>
<style scoped>
.schedule-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.calendar-toolbar {
  flex-wrap: wrap;
  align-items: end;
}
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-top: 1px solid #dbe4ee;
  border-left: 1px solid #dbe4ee;
  background: white;
  border-radius: 12px;
  overflow: hidden;
}
.calendar-grid.calendar-day {
  grid-template-columns: 1fr;
}
.calendar-cell {
  min-width: 0;
  min-height: 150px;
  padding: 10px;
  border-right: 1px solid #dbe4ee;
  border-bottom: 1px solid #dbe4ee;
}
.calendar-cell h2 {
  font-size: 0.88rem;
  margin: 0 0 12px;
}
.calendar-cell > p {
  font-size: 0.78rem;
}
.calendar-today {
  background: #f0f7ff;
}
.calendar-outside {
  background: #f6f7f8;
}
.calendar-visit {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  font-size: 0.83rem;
  padding: 10px 8px;
  border-left: 3px solid #2372b4;
  background: #edf4fb;
  border-radius: 6px;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
}
.calendar-visit button {
  padding: 6px;
  font-size: 0.8rem;
}
.calendar-visit .badge {
  align-self: start;
}
.calendar-cancelled {
  background: #f1f1f1;
  border-color: #87919c;
}
.series-preview {
  border: 1px solid #cbdbea;
  padding: 16px;
  margin: 16px 0;
  max-height: 420px;
  overflow: auto;
}
.check {
  display: flex;
  gap: 8px;
  align-items: center;
}
.check input {
  width: auto;
}
@media (max-width: 1100px) {
  .calendar-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 650px) {
  .calendar-grid,
  .schedule-fields {
    grid-template-columns: 1fr;
  }
  .calendar-cell {
    min-height: 90px;
  }
  .calendar-toolbar label {
    width: 100%;
  }
}
</style>
