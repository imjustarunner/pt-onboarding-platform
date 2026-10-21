<template>
  <div class="office-approvals">
    <header>
      <div>
        <h1>
          Office Approvals <span class="count">{{ requests.length }}</span>
        </h1>
        <p>
          Every office request, together. Review the room and recurring dates
          before deciding.
        </p>
      </div>
      <nav>
        <router-link :to="buildingLink()">Building Master</router-link
        ><button
          class="btn btn-secondary"
          :disabled="loading || saving"
          @click="load"
        >
          Refresh
        </button>
      </nav>
    </header>
    <nav class="tabs">
      <button
        :class="{ active: !showConflicts }"
        @click="showConflicts = false"
      >
        All requests</button
      ><button :class="{ active: showConflicts }" @click="showConflicts = true">
        Reported conflicts
      </button>
    </nav>
    <OfficeCoverageFlagsView v-if="showConflicts" embedded />
    <template v-else>
      <p v-if="notice" role="status" class="success">{{ notice }}</p>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-if="loading && !requests.length">Loading office requests…</p>
      <p v-else-if="!requests.length">
        No pending office requests in the agencies you can manage.
      </p>
      <div v-else class="workspace" :class="{ 'detail-open': !!selectedKey }">
        <aside class="queue">
          <label
            >Find a request<input
              v-model="search"
              type="search"
              placeholder="Name, building, or request number"
          /></label>
          <p class="muted">
            {{ filtered.length }} pending · all request sources
          </p>
          <button
            v-for="r in filtered"
            :key="r.key"
            class="request"
            :class="{ selected: selectedKey === r.key }"
            @click="select(r.key)"
          >
            <strong>{{ r.providerName || 'Provider' }}</strong
            ><span>{{ r.officeName || 'Office preferences included' }}</span>
            <span>{{ date(r.startDate) }} · {{ hours(r) }}</span
            ><span class="frequency">{{ r.frequencyLabel }}</span>
            <small>{{ r.sourceLabel }} · #{{ r.id }}</small>
          </button>
        </aside>
        <main
          class="detail"
          v-if="selectedKey"
          ref="detailElement"
          tabindex="-1"
        >
          <button class="back btn btn-secondary" @click="clearSelection">
            ← All requests ({{ requests.length }})
          </button>
          <p v-if="contextLoading" role="status">
            Checking rooms and recurring dates…
          </p>
          <p v-else-if="detailError" role="alert" class="error">
            {{ detailError }}
            <button @click="select(selectedKey)">Retry</button>
          </p>
          <template v-else-if="review">
            <h2>{{ review.request.providerName }}</h2>
            <p>
              {{ actionLabel(review.request) }} ·
              {{ review.request.sourceLabel }}
            </p>
            <section class="summary">
              <strong>{{ review.request.frequencyLabel }}</strong>
              <span
                >{{ date(review.request.startDate) }} ·
                {{ hours(review.request) }}</span
              >
              <span>{{
                selectedRoom?.timezone || review.request.timezone
              }}</span>
              <p
                v-if="
                  review.window &&
                  review.window.startDate !== review.request.startDate
                "
              >
                First remaining date:
                <strong>{{ date(review.window.startDate) }}</strong
                >. Earlier dates will not be booked.
              </p>
            </section>
            <p v-if="review.request.notes && !review.special" class="notes">
              <strong>Request notes:</strong> {{ review.request.notes }}
            </p>
            <template v-if="!review.special">
              <section v-if="review.request.slots.length > 1" class="warning">
                <h3>Several time windows were requested</h3>
                <p>
                  Separate these windows so each can receive its own room and
                  decision.
                </p>
                <button
                  class="btn btn-secondary"
                  :disabled="saving"
                  @click="separateWindows"
                >
                  Separate time windows for review
                </button>
              </section>
              <section>
                <h3>Choose a room</h3>
                <p class="muted">
                  Availability includes recurring dates, booked rooms and
                  standing reservations.
                </p>
                <p v-if="!review.rooms.length" class="error">
                  No eligible rooms were found. This request cannot be approved
                  here.
                </p>
                <label
                  v-for="room in review.rooms"
                  :key="room.roomId"
                  class="room"
                  :class="{
                    blocked: !room.available,
                    chosen: Number(roomId) === Number(room.roomId)
                  }"
                >
                  <input
                    type="radio"
                    v-model="roomId"
                    :value="room.roomId"
                    :disabled="!room.available || saving"
                    name="office-room"
                    @change="confirmAction = ''"
                  />
                  <span
                    ><strong
                      >{{ room.officeName }} · {{ room.roomLabel }}</strong
                    ><small v-if="room.requested"
                      >Requested / preferred room</small
                    >
                    <span
                      :class="room.available ? 'available' : 'unavailable'"
                      >{{
                        room.available
                          ? 'Available for the checked dates'
                          : room.reason
                      }}</span
                    >
                  </span>
                </label>
              </section>
              <section v-if="selectedRoom?.window">
                <h3>Dates checked</h3>
                <p>{{ review.horizon }}</p>
                <div class="dates">
                  <span
                    v-for="d in selectedRoom.window.checkedDates"
                    :key="d"
                    >{{ date(d) }}</span
                  >
                </div>
              </section>
              <section v-if="review.warnings.length" class="warning">
                <h3>Existing schedule to review</h3>
                <p>
                  A room request may accompany an existing session. Confirm that
                  the room fits these commitments.
                </p>
                <ul>
                  <li
                    v-for="(warning, i) in review.warnings.slice(0, 3)"
                    :key="i"
                  >
                    {{ warning.message }} ·
                    {{
                      instant(
                        warning.startAt,
                        selectedRoom?.timezone || review.request.timezone
                      )
                    }}
                  </li>
                </ul>
                <details v-if="review.warnings.length > 3">
                  <summary>
                    Show {{ review.warnings.length - 3 }} more commitments
                  </summary>
                  <ul>
                    <li
                      v-for="(warning, i) in review.warnings.slice(3)"
                      :key="i"
                    >
                      {{ warning.message }} ·
                      {{
                        instant(
                          warning.startAt,
                          selectedRoom?.timezone || review.request.timezone
                        )
                      }}
                    </li>
                  </ul>
                </details>
                <label class="ack"
                  ><input type="checkbox" v-model="acknowledged" /> I reviewed
                  the existing schedule.</label
                >
              </section>
              <p>
                <router-link
                  :to="
                    buildingLink(
                      selectedRoom?.officeId || review.request.officeId,
                      selectedRoom?.window?.startDate ||
                        review.request.startDate
                    )
                  "
                  >View this date in Building Master →</router-link
                >
              </p>
            </template>
            <section v-else class="warning">
              <h3>{{ actionLabel(review.request) }}</h3>
              <p>{{ specialReason }}</p>
              <p>
                Approving applies the requested change to the existing
                reservation.
              </p>
              <router-link
                :to="
                  buildingLink(
                    review.request.officeId,
                    review.request.startDate
                  )
                "
                >Review in Building Master</router-link
              >
            </section>
            <label class="comment"
              >Decision note<textarea
                v-model="comment"
                rows="3"
                placeholder="Add context for the provider (optional)"
                :disabled="saving"
              />
            </label>
            <section
              v-if="confirmAction"
              class="confirmation"
              aria-live="polite"
            >
              <strong
                >{{
                  confirmAction === 'approve'
                    ? 'Confirm approval'
                    : 'Confirm denial'
                }}
                for {{ review.request.providerName }}</strong
              >
              <p v-if="confirmAction === 'approve' && selectedRoom">
                {{ selectedRoom.officeName }} · {{ selectedRoom.roomLabel
                }}<br />{{ date(selectedRoom.window.startDate) }} ·
                {{ hours(review.request) }} ·
                {{ review.request.frequencyLabel }}
              </p>
              <p v-else-if="confirmAction === 'deny'">
                This request will be closed without reserving a room.
              </p>
              <button
                class="btn"
                :class="
                  confirmAction === 'approve' ? 'btn-primary' : 'btn-danger'
                "
                :disabled="
                  saving || (confirmAction === 'approve' && !canApprove)
                "
                @click="decide"
              >
                {{
                  saving
                    ? 'Saving…'
                    : confirmAction === 'approve'
                      ? 'Confirm approval'
                      : 'Deny request'
                }}
              </button>
              <button
                class="btn btn-secondary"
                :disabled="saving"
                @click="confirmAction = ''"
              >
                Go back
              </button>
            </section>
            <footer v-else class="decision">
              <button
                class="btn btn-primary"
                :disabled="!canApprove || saving"
                @click="confirmAction = 'approve'"
              >
                Review approval</button
              ><button
                class="btn btn-secondary"
                :disabled="saving"
                @click="confirmAction = 'deny'"
              >
                Deny request
              </button>
            </footer>
            <p class="muted">
              Availability is checked again when you confirm. Whole-hour room
              reservations remain in effect.
            </p>
          </template>
        </main>
        <p v-else class="pick">
          Select a request to review rooms, conflicts and dates.
        </p>
      </div>
    </template>
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import OfficeCoverageFlagsView from './OfficeCoverageFlagsView.vue';
const route = useRoute(),
  router = useRouter();
const emit = defineEmits(['decided']);
const requests = ref([]),
  loading = ref(false),
  saving = ref(false),
  error = ref(''),
  notice = ref(''),
  search = ref('');
const selectedKey = ref(''),
  review = ref(null),
  contextLoading = ref(false),
  detailError = ref(''),
  roomId = ref(null),
  comment = ref(''),
  acknowledged = ref(false),
  confirmAction = ref(''),
  detailElement = ref(null);
const showConflicts = ref(route.query.tab === 'conflicts');
let contextVersion = 0;
const filtered = computed(() =>
  requests.value.filter((r) =>
    `${r.providerName} ${r.officeName} ${r.key}`
      .toLowerCase()
      .includes(search.value.toLowerCase())
  )
);
const selectedRoom = computed(() =>
  review.value?.rooms.find((r) => Number(r.roomId) === Number(roomId.value))
);
const canApprove = computed(
  () =>
    !!review.value &&
    !contextLoading.value &&
    (review.value.special ||
      (selectedRoom.value?.available &&
        (!review.value.warnings.length || acknowledged.value)))
);
const specialReason = computed(() => {
  try {
    const data = JSON.parse(review.value?.request.notes || '{}');
    return (
      data.reason ||
      data.reasonText ||
      data.notes ||
      'Review the affected reservation and requested change before confirming.'
    );
  } catch {
    return review.value?.request.notes;
  }
});
const actionLabel = (r) =>
  ({
    DROP_ASSIGNMENT: 'Release recurring assignment',
    DELETE_EVENT: 'Delete office reservation',
    MOVE_ASSIGNMENT: 'Move recurring assignment',
    MOVE_OCCURRENCE: 'Move this reservation'
  })[r.requestType] || 'Office request';
const prefix = computed(() =>
  route.params.organizationSlug ? `/${route.params.organizationSlug}` : ''
);
function buildingLink(officeId, dateValue) {
  return {
    path: `${prefix.value}/buildings/schedule`,
    query: {
      ...(officeId ? { officeId: String(officeId) } : {}),
      ...(dateValue ? { weekStart: dateValue, date: dateValue } : {})
    }
  };
}
const date = (d) =>
  d
    ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString(
        'en-US',
        { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
      )
    : 'Date needs review';
const hour = (h) =>
  `${Number(h) % 12 || 12}${Number(h) % 24 < 12 ? 'am' : 'pm'}`;
const hours = (r) =>
  r.slots?.map((s) => `${hour(s.startHour)}–${hour(s.endHour)}`).join(', ') ||
  'Time needs review';
const instant = (value, timeZone) =>
  new Date(
    `${String(value).replace(' ', 'T').replace(/Z$/, '')}Z`
  ).toLocaleString('en-US', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short'
  });
async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/office-schedule/approvals');
    requests.value = data.requests || [];
    const key = selectedKey.value || String(route.query.request || '');
    if (key && requests.value.some((r) => r.key === key)) await select(key);
    else if (selectedKey.value) clearSelection();
  } catch (e) {
    error.value =
      e.response?.data?.error?.message || 'Unable to load office requests.';
  } finally {
    loading.value = false;
  }
}
async function select(key) {
  const version = ++contextVersion;
  selectedKey.value = key;
  review.value = null;
  detailError.value = '';
  contextLoading.value = true;
  confirmAction.value = '';
  acknowledged.value = false;
  comment.value = '';
  roomId.value = null;
  router.replace({ query: { ...route.query, request: key, tab: 'requests' } });
  await nextTick();
  detailElement.value?.focus({ preventScroll: true });
  try {
    const { data } = await api.get(
      `/office-schedule/approvals/${encodeURIComponent(key)}/context`
    );
    if (version !== contextVersion) return;
    review.value = data;
    roomId.value =
      data.rooms.find((r) => r.available && r.requested)?.roomId || null;
  } catch (e) {
    if (version === contextVersion)
      detailError.value =
        e.response?.data?.error?.message ||
        'Unable to verify room availability. Approval is disabled.';
  } finally {
    if (version === contextVersion) contextLoading.value = false;
  }
}
function clearSelection() {
  contextVersion++;
  selectedKey.value = '';
  review.value = null;
  router.replace({ query: { ...route.query, request: undefined } });
}
async function separateWindows() {
  saving.value = true;
  error.value = '';
  try {
    await api.post(
      `/office-schedule/approvals/${encodeURIComponent(selectedKey.value)}/decision`,
      { action: 'separate' }
    );
    notice.value =
      'Each time window now has its own request. No rooms have been assigned.';
    await load();
  } catch (e) {
    error.value =
      e.response?.data?.error?.message || 'Unable to separate this request.';
  } finally {
    saving.value = false;
  }
}
async function decide() {
  saving.value = true;
  error.value = '';
  const key = selectedKey.value;
  try {
    const response = await api.post(
      `/office-schedule/approvals/${encodeURIComponent(key)}/decision`,
      {
        action: confirmAction.value,
        roomId: roomId.value,
        approverComment: comment.value,
        reason: comment.value,
        acknowledgeExistingReservations: acknowledged.value
      }
    );
    notice.value =
      response.data?.warning ||
      'Decision saved. The office schedule and approval queue are updated.';
    clearSelection();
    await load();
    emit('decided');
  } catch (e) {
    error.value =
      e.response?.data?.error?.message ||
      'The request could not be decided. Refresh and review again.';
    await select(key);
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>
<style scoped>
.office-approvals {
  max-width: 1500px;
  margin: auto;
  padding: 20px;
  color: var(--text-primary, #233d35);
}
header,
nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}
h1 {
  margin: 0;
  font-size: 26px;
}
h2 {
  margin: 18px 0 4px;
}
h3 {
  font-size: 18px;
  margin: 0 0 10px;
}
p {
  line-height: 1.5;
}
button,
input,
textarea {
  font: inherit;
}
button {
  cursor: pointer;
  min-height: 44px;
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
a {
  color: var(--primary, #24684b);
}
.count,
.frequency {
  border-radius: 20px;
  background: #e5f1eb;
  padding: 4px 10px;
  font-size: 13px;
}
.tabs {
  justify-content: flex-start;
  border-bottom: 1px solid #dbe4df;
  margin: 16px 0;
}
.tabs button {
  border: 0;
  background: none;
  padding: 12px;
}
.tabs .active {
  border-bottom: 3px solid #286e50;
  font-weight: 700;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(250px, 320px) minmax(0, 1fr);
  gap: 20px;
}
.queue,
.detail {
  border: 1px solid var(--border-color, #dbe4df);
  border-radius: 16px;
  padding: 16px;
  min-width: 0;
}
.queue {
  align-self: start;
  max-height: 80vh;
  overflow: auto;
}
.request {
  display: flex;
  flex-direction: column;
  align-items: start;
  gap: 7px;
  width: 100%;
  text-align: left;
  padding: 14px;
  border: 1px solid #dde6e0;
  border-radius: 12px;
  background: var(--bg-primary, #fff);
  color: inherit;
  margin: 10px 0;
}
.request.selected {
  border: 2px solid #286e50;
  background: #f1f8f4;
}
.request small,
.muted {
  color: var(--text-secondary, #62716b);
  font-size: 13px;
}
.summary {
  background: #eff6f2;
  padding: 16px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.detail section {
  margin: 20px 0;
}
.room {
  display: flex;
  gap: 12px;
  align-items: start;
  padding: 14px;
  border: 1px solid #dbe4df;
  border-radius: 12px;
  margin: 10px 0;
}
.room input {
  width: 22px;
  min-width: 22px;
  height: 22px;
  margin-top: 3px;
}
.room > span {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.room.chosen {
  outline: 2px solid #286e50;
}
.room.blocked {
  background: #fff6f2;
}
.available {
  color: #24684b;
}
.unavailable {
  color: #923b27;
}
.dates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.dates span {
  background: #eef3f6;
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
}
.error,
.warning {
  background: #fff4df;
  color: #6b411b;
  padding: 16px;
  border-radius: 12px;
  overflow-wrap: anywhere;
}
.success {
  background: #e7f5eb;
  padding: 14px;
  border-radius: 10px;
}
.notes {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.comment,
.queue > label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
input[type='search'],
textarea {
  box-sizing: border-box;
  max-width: 100%;
  width: 100%;
  padding: 12px;
  border: 1px solid #bacbc1;
  border-radius: 8px;
  background: var(--bg-primary, #fff);
  color: inherit;
}
details {
  margin: 12px 0;
}
summary {
  cursor: pointer;
  min-height: 44px;
}
.ack {
  display: flex;
  gap: 10px;
  align-items: center;
}
.ack input {
  width: 22px;
  height: 22px;
}
.decision {
  display: flex;
  gap: 12px;
  padding: 14px 0;
  background: var(--bg-primary, #fff);
}
.confirmation {
  border: 2px solid #286e50;
  padding: 16px;
  border-radius: 12px;
}
.confirmation button {
  margin: 6px;
}
.back {
  display: none;
}
.pick {
  padding: 20px;
}
.btn {
  min-height: 44px;
}
li {
  margin: 8px 0;
}
@media (max-width: 760px) {
  .office-approvals {
    padding: 12px;
  }
  .workspace {
    display: block;
  }
  .queue {
    max-height: none;
  }
  .detail-open .queue {
    display: none;
  }
  .detail {
    padding: 12px;
  }
  .back {
    display: inline-flex;
  }
  .decision {
    padding-bottom: max(14px, env(safe-area-inset-bottom));
    border-top: 1px solid #dbe4df;
  }
  .decision button {
    flex: 1;
  }
  header nav {
    width: 100%;
  }
  .room {
    padding: 12px;
  }
  .confirmation button {
    width: 100%;
    margin: 6px 0;
  }
  .pick {
    display: none;
  }
}
</style>
