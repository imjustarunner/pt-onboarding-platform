<template>
  <div class="workspace" :class="{'ehr-sidebar-collapsed': !patientPortal && sidebarCollapsed}">
    <AnnouncementToasts v-if="account?.id && practice && !patientPortal"
      :storage-key="`auricwell:${account.id}:practice:${practice.id || route.params.slug}`"
      :load-items="loadOfficeToasts" />
    <aside class="sidebar">
      <RouterLink to="/app" class="brand"
        ><img src="/auricwell-logo.png" alt="AuricWell"
      /></RouterLink>
      <div class="practice-label">
        <span class="eyebrow">{{
          patientPortal ? "Patient portal" : "Practice workspace"
        }}</span
        ><strong>{{ practice?.name || "Your practice" }}</strong>
      </div>
      <button v-if="!patientPortal && can('clinical') && practice?.sessionFeatures?.alwaysAvailableOffice" class="outline" title="Permanent private office link. Snapshot review and individual admission required. Premium: one guest. Premium Plus: couples and families." @click="showOffice=true">My virtual office ↗</button>
      <nav aria-label="Practice">
        <RouterLink
          v-for="item in navigation"
          :key="item.key"
          :to="`${root}/${item.key}`"
          :class="{ active: section === item.key }"
          :title="item.label"
          :aria-label="item.label"
          :aria-current="section === item.key ? 'page' : undefined"
          ><span class="nav-icon" aria-hidden="true">{{ item.icon }}</span
          ><span class="nav-label">{{ item.label }}</span><span v-if="item.key === 'messages' && unread" class="count">{{
            unread
          }}</span></RouterLink
        >
      </nav>
      <div class="sidebar-bottom">
        <button v-if="!patientPortal" type="button" class="link-button ehr-sidebar-toggle" :aria-expanded="!sidebarCollapsed" :aria-label="sidebarCollapsed?'Expand sidebar':'Collapse sidebar'" @click="sidebarCollapsed=!sidebarCollapsed">{{ sidebarCollapsed?'→':'← Collapse' }}</button>
        <div class="small-mark">A</div>
        <p>More room<br />for care.</p>
        <RouterLink to="/account/text-verification">Account security</RouterLink>
        <button class="link-button" @click="signOut">Sign out</button>
      </div>
    </aside>
    <div class="workspace-body">
      <header class="topbar">
        <RouterLink to="/app" class="text-link">← Practices</RouterLink
        ><button
          class="outline"
          @click="showNotifications = !showNotifications"
          :aria-expanded="showNotifications"
        >
          Notifications {{ notifications.length }}</button
        ><span class="topbar-context">{{ practice?.name }}</span
        ><span class="account-avatar">{{ initials(account?.name) }}</span>
        <div>
          <strong>{{ account?.name }}</strong
          ><small>{{ patientPortal ? "Patient access" : "AuricWell" }}</small>
        </div>
      </header>
      <main class="workspace-main">
        <article v-if="showNotifications" class="card">
          <h2>Notifications</h2>
          <RouterLink
            v-for="n in notifications"
            :key="n.id"
            class="list-row"
            :to="`${root}/${n.section}`"
            @click="showNotifications = false"
            >{{ n.title }}</RouterLink
          >
          <p v-if="!notifications.length">You’re caught up.</p>
        </article>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
        <SmsPreferenceNotices :base="base" />
        <SessionPreferences v-if="reminderPatient" :key="reminderPatient" :base="base" :patient-id="reminderPatient" /><button v-if="reminderPatient" class="outline" @click="reminderPatient=''">Close reminder preferences</button>
        <SessionDeliveries v-if="deliveryAppointment" :key="deliveryAppointment" :base="base" :appointment-id="deliveryAppointment" @close="deliveryAppointment=''" />
        <p v-if="loading" class="muted" role="status">
          Loading your workspace…
        </p>
        <template v-else-if="data">
          <PracticeOverview v-if="section === 'home' && !patientPortal" :account="account" :practice="practice" :data="data" :navigation="navigation" :notifications="notifications" @navigate="navigateOverview" />
          <div v-else-if="section === 'announcements' && canManageToasts" class="stack">
            <ToastAnnouncementManager :request="api" :base-path="`${base}/toasts`" />
            <ToastAnnouncementManager v-if="account?.operator" :request="api" base-path="/support-toasts" support />
          </div>
          <RecordsRequests v-else-if="section === 'records-requests' && (patientPortal || can('records_manager'))" :key="`${base}/records-requests`" :base="base" :manage="!patientPortal" :request-id="String(route.query.request || '')" :patients="data.patients" />
          <Settings
            v-else-if="section === 'settings' && can('admin')"
            :base="base"
            :operator="account?.operator"
            @platform-changed="run(load)"
            :patients="data.patients"
          />
          <Agreements
            v-else-if="section === 'agreements'"
            :base="base"
            :account="account"
            :can-manage="can('agreements')"
            :patients="data.patients"
          />
          <Imports
            v-else-if="section === 'imports' && can('migration')"
            :base="base"
            :patients="data.patients"
          />
          <Intake
            v-else-if="section === 'intake' && practice?.capabilities.intake"
            :base="base"
            :practice-name="practice?.name"
            :patient-portal="patientPortal"
            :can-manage="can('admin')"
            :patients="data.patients"
            @changed="run(load)"
          />
          <Schedule
            v-else-if="
              section === 'schedule' && practice?.capabilities.schedule
            "
            :key="base"
            :base="base"
            :practice="practice"
            :patients="data.patients"
            :providers="data.providers"
            :appointments="data.appointments"
            :appointment-requests="data.appointmentRequests"
            :current-account-id="account.id"
            :can-manage="!!can('schedule')"
            :patient-portal="patientPortal"
            @changed="run(load)"
            @join-video="joinVideo"
            @reminder-preferences="reminderPatient=$event"
            @delivery-status="deliveryAppointment=$event"
            @resolve-request="resolveRequest"
          />
          <article v-else-if="section === 'records-requests'" class="card"><h1>Records Manager access required</h1><p>Contact your practice administrator to arrange records-request access.</p><RouterLink v-if="can('admin')" :to="`${root}/settings`">Configure Records Managers</RouterLink></article>
          <template v-else
            ><div class="page-heading">
              <div>
                <span class="eyebrow">{{ today }}</span>
                <h1>{{ headings[section] || "Your workspace" }}</h1>
                <p>
                  {{
                    descriptions[section] ||
                    "Your practice, thoughtfully connected."
                  }}
                </p>
              </div>
              <button v-if="createLabel" @click="editor = true">
                ＋ {{ createLabel }}
              </button>
            </div>
            <article
              v-if="editor && section !== 'documentation'"
              class="card editor"
            >
              <div class="section-heading">
                <h2>{{ editing ? "Update record" : createLabel }}</h2>
                <button
                  class="icon-button"
                  @click="closeEditor"
                  aria-label="Close editor"
                >
                  ×
                </button>
              </div>
              <RecordForm
                :fields="fields"
                :initial="formInitial"
                :busy="busy"
                cancelable
                @cancel="closeEditor"
                @save="saveRecord"
                @change="formChanged"
              >
                <template #default="{ model }">
                  <StructuredNoteFields
                    v-if="section === 'documentation'"
                    :model="model"
                    :templates="noteTemplates"
                  />
                </template>
              </RecordForm>
            </article>
            <template v-if="section === 'home'"
              ><section class="welcome-banner">
                <div>
                  <span class="eyebrow">Welcome back</span>
                  <h2>
                    {{
                      firstName
                        ? `A little clarity for your day, ${firstName}.`
                        : "A little clarity for your day."
                    }}
                  </h2>
                  <p>Your schedule, records and conversations, together.</p>
                </div>
                <div class="welcome-symbol" aria-hidden="true">✦</div>
              </section>
              <div class="stats-grid">
                <article class="stat">
                  <span>Appointments today</span
                  ><strong>{{ todaysAppointments.length }}</strong
                  ><span class="muted">Your care schedule</span>
                </article>
                <article class="stat">
                  <span>{{
                    patientPortal ? "Your charts" : "Accessible clients"
                  }}</span
                  ><strong>{{ data.patients.length }}</strong
                  ><span class="muted">Within this practice</span>
                </article>
                <article class="stat">
                  <span>{{
                    patientPortal ? "Messages" : "Notes in draft"
                  }}</span
                  ><strong>{{
                    patientPortal ? data.messages.length : draftNotes.length
                  }}</strong
                  ><span class="muted">{{
                    patientPortal
                      ? "Secure conversations"
                      : "Ready for your attention"
                  }}</span>
                </article>
              </div>
              <div class="dashboard-grid">
                <article class="card">
                  <div class="section-heading">
                    <h2>Today’s schedule</h2>
                    <RouterLink :to="`${root}/schedule`"
                      >View schedule →</RouterLink
                    >
                  </div>
                  <div
                    v-for="a in todaysAppointments"
                    :key="a.id"
                    class="appointment-row"
                  >
                    <div class="time-block">{{ time(a.data.start) }}</div>
                    <div class="avatar">
                      {{ initials(patientName(a.patientId)) }}
                    </div>
                    <div>
                      <strong>{{ patientName(a.patientId) }}</strong
                      ><span class="muted"
                        >{{ a.data.serviceCode }} ·
                        {{ providerName(a.data.providerId) }}</span
                      >
                    </div>
                    <span class="badge">{{ a.data.status }}</span>
                  </div>
                  <div v-if="!todaysAppointments.length" class="empty">
                    <span class="empty-icon">◷</span>
                    <h3>A little breathing room.</h3>
                    <p>No appointments are scheduled for today.</p>
                  </div>
                </article>
                <article class="card">
                  <h2>Quick actions</h2>
                  <div class="quick-actions">
                    <RouterLink :to="`${root}/schedule`"
                      >◷<span>Open schedule</span></RouterLink
                    ><RouterLink :to="`${root}/messages`"
                      >✉<span>Secure messages</span></RouterLink
                    ><RouterLink
                      :to="`${root}/${patientPortal ? 'agreements' : 'documentation'}`"
                      >▤<span>{{
                        patientPortal ? "Your forms" : "Documentation"
                      }}</span></RouterLink
                    ><RouterLink v-if="can('admin')" :to="`${root}/settings`"
                      >⚙<span>Practice setup</span></RouterLink
                    >
                  </div>
                  <p class="muted">
                    Everything here is limited to your access in this practice.
                  </p>
                </article>
              </div></template
            >
            <template v-else-if="section === 'clients'"
              ><div class="toolbar">
                <label class="search-label"
                  ><span>⌕</span
                  ><input
                    v-model="search"
                    placeholder="Search clients by name…"
                    aria-label="Search clients" /></label
                ><span class="muted"
                  >{{ filteredPatients.length }} clients</span
                >
              </div>
              <div class="client-grid">
                <button
                  v-for="p in filteredPatients"
                  :key="p.id"
                  class="card client-card"
                  @click="
                    selectedPatient = selectedPatient === p.id ? '' : p.id
                  "
                >
                  <span class="avatar large">{{ initials(p.data.name) }}</span
                  ><strong>{{ p.data.name }}</strong
                  ><span class="muted">Born {{ p.data.dob }}</span
                  ><span class="badge">{{ p.data.status }}</span>
                </button>
              </div>
              <article v-if="selectedPatient" class="card">
                <h2>{{ patientName(selectedPatient) }}</h2>
                <p>Chart reference: {{ selectedPatient }}</p>
                <button class="outline" @click="reminderPatient=selectedPatient">Message preferences</button>
                <ClientSmsInbox v-if="!patientPortal" :base="base" :patient-id="selectedPatient" />
                <p>
                  {{
                    data.patients.find((p) => p.id === selectedPatient)?.data
                      .phone
                  }}
                </p>
                <div class="actions">
                  <button
                    class="outline"
                    v-if="can('clinical') || can('schedule')"
                    @click="editPatient(selectedPatient)"
                  >
                    Edit client</button
                  ><RouterLink
                    class="button outline"
                    :to="`${root}/documentation`"
                    >Documentation</RouterLink
                  ><RouterLink class="button outline" :to="`${root}/messages`"
                    >Messages</RouterLink
                  >
                </div>
              </article>
              <EmptyState
                v-if="!filteredPatients.length"
                title="Your client list starts here."
                text="Add a client or bring in reviewed records through the migration workspace."
            /></template>
            <NoteWorkspace
              v-else-if="section === 'documentation'"
              ref="noteWorkspace"
              :key="base"
              :base="base"
              :account-id="account.id"
              :patients="data.patients"
              :providers="data.providers"
              :notes="data.notes"
              :appointments="data.appointments"
              :timezone="practiceTimezone"
              :editor="editor"
              :editing-id="editing?.id"
              :can-clinical="!!can('clinical')"
              :can-supervise="!!can('supervise')"
              @edit="editNote"
              @sign="signNote"
              @cosign="signNote($event, true)"
              @share="shareDocument"
              @use-draft="useAiDraft"
              @close-editor="closeEditor"
            >
              <template #editor>
                <article v-if="editor" class="card editor">
                  <div class="section-heading">
                    <h2>{{ editing ? "Update record" : createLabel }}</h2>
                    <button
                      class="icon-button"
                      @click="closeEditor"
                      aria-label="Close editor"
                    >
                      ×
                    </button>
                  </div>
                  <RecordForm
                    :fields="fields"
                    :initial="formInitial"
                    :busy="busy"
                    cancelable
                    @cancel="closeEditor"
                    @save="saveRecord"
                    @change="formChanged"
                  >
                    <template #default="{ model }">
                      <StructuredNoteFields
                        v-if="section === 'documentation'"
                        :model="model"
                        :templates="noteTemplates"
                      />
                    </template>
                  </RecordForm>
                </article>
              </template>
            </NoteWorkspace>
            <template v-else-if="section === 'providers'"
              ><div class="client-grid">
                <article v-for="p in data.providers" :key="p.id" class="card">
                  <span class="avatar large">{{ initials(p.data.name) }}</span>
                  <h2>{{ p.data.name }}</h2>
                  <p>{{ p.data.credential }} · {{ p.data.status }}</p>
                  <p class="muted">{{ (p.data.services || []).join(", ") }}</p>
                  <span class="badge">{{
                    p.data.credentialsReviewed &&
                    p.data.credentialMappingCurrent !== false
                      ? "Credentials reviewed"
                      : "Review required"
                  }}</span
                  ><button
                    class="outline"
                    v-if="can('admin')"
                    @click="editProvider(p)"
                  >
                    Configure provider
                  </button>
                  <p v-if="p.canonicalUserId" class="muted">
                    Shared staff #{{ p.canonicalUserId }} ·
                    {{ p.data.sharedCredential || "Credential not configured" }}
                    {{
                      p.data.sharedIdentityActive === false
                        ? "· Inactive or unavailable"
                        : ""
                    }}
                  </p>
                </article>
              </div>
              <EmptyState
                v-if="!data.providers.length"
                title="Build your care team."
                text="Create a staff account in Settings, then configure its clinical credentials, services and supervision here."
            /></template>
            <template v-else-if="section === 'billing'"
              ><BillingSetup
                v-if="can('billing') && billingTab !== 'shared'"
                :base="base"
                :patients="data.patients"
                :claims="data.claims"
                :ledger="data.ledger"
                @changed="load"
              /><Payments
                v-if="patientPortal"
                :base="base"
                :patients="
                  data.patients.filter((p) =>
                    (data.billingPatientIds || []).includes(p.id),
                  )
                "
                @changed="load"
              />
              <div class="tabbar">
                <button
                  v-for="tab in (can('billing') ? ['shared', 'ledger', 'claims', 'payers'] : ['ledger'])"
                  :key="tab"
                  :class="{ selected: billingTab === tab }"
                  @click="
                    billingTab = tab;
                    closeEditor();
                  "
                >
                  {{
                    tab === "shared" ? "Insurance claims" : tab === "ledger"
                      ? "Patient ledger"
                      : tab === "claims"
                        ? "Earlier claims"
                        : "Payers"
                  }}
                </button>
              </div>
              <SharedBilling v-if="billingTab === 'shared' && can('billing')" :key="base" :base="base" :patients="data.patients" />
              <p v-if="billingTab !== 'shared'" class="notice">
                Manual entries record transactions already handled by your
                practice. Electronic claims and payments require verified
                practice connections and explicit approval.
              </p>
              <article v-if="billingTab === 'ledger'" class="card">
                <h2>Patient balances</h2>
                <div
                  v-for="p in data.patients.filter(
                    (p) =>
                      !patientPortal ||
                      (data.billingPatientIds || []).includes(p.id),
                  )"
                  :key="p.id"
                  class="list-row"
                >
                  <strong>{{ p.data.name }}</strong
                  ><span>{{ currency(data.balances[p.id] || 0) }}</span
                  ><a
                    class="text-link"
                    :href="`/api/auricwell${base}/patients/${p.id}/statement`"
                    >Statement</a
                  ><button v-if="can('billing') && (data.balances[p.id] || 0)>0" class="outline" @click="sendBillingText(p.id)">Send billing notice</button>
                </div>
                <h3>Transactions</h3>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Patient</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="e in data.ledger" :key="e.id">
                        <td>{{ e.data.date }}</td>
                        <td>{{ patientName(e.patientId) }}</td>
                        <td>{{ e.data.type.replaceAll("_", " ") }}</td>
                        <td>{{ e.data.reason }}</td>
                        <td>
                          {{ currency(e.data.amountCents) }}
                          <a
                            v-if="['payment', 'refund'].includes(e.data.type)"
                            :href="`/api/auricwell${base}/patients/${e.patientId}/statement?receiptId=${e.id}`"
                            >Receipt</a
                          >
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </article>
              <article v-else-if="billingTab === 'claims'" class="card">
                <label>Client claims<select v-model="billingClient"><option value="">All clients</option><option v-for="p in data.patients" :key="p.id" :value="p.id">{{ p.data.name }}</option></select></label>
                <p class="muted">Earlier claim records remain here for follow-up. Prepare new claims in Insurance claims after completing the service’s chart note.</p>
                <div v-for="c in data.claims.filter(c => !billingClient || c.patientId === billingClient)" :key="c.id" class="list-row">
                  <div>
                    <strong
                      >{{ patientName(c.patientId) }} ·
                      {{ c.data.serviceCode }}</strong
                    ><span class="muted"
                      >{{ c.data.date }} · {{ currency(c.data.amountCents) }} ·
                      {{ c.data.status }}</span
                    >
                  </div>
                  <button
                    v-if="c.data.status === 'draft'"
                    class="outline"
                    @click="reviewClaim(c)"
                  >
                    Approve reviewed draft
                  </button>
                </div>
                <EmptyState
                  v-if="!data.claims.some(c => !billingClient || c.patientId === billingClient)"
                  title="No claims to review."
                  text="Prepare a draft from signed, billable documentation after provider and payer setup."
                />
              </article>
              <article v-else-if="billingTab === 'payers'" class="card">
                <div v-for="p in payers" :key="p.id" class="list-row">
                  <div>
                    <strong>{{ p.data.name }}</strong
                    ><span class="muted">{{
                      p.data.electronicPayerId ||
                      "Electronic payer match needed"
                    }}</span>
                  </div>
                  <span class="badge">{{
                    p.data.electronicMatchReviewed
                      ? "Electronic identity reviewed"
                      : "Verification required"
                  }}</span
                  ><button class="outline" @click="editPayer(p)">
                    Review payer identity
                  </button>
                </div>
              </article></template
            >
            <template v-else-if="section === 'messages'"
              ><ClientSmsInbox v-if="!patientPortal" :base="base" /><AgencyFaxInbox v-if="!patientPortal && (can('admin') || can('schedule'))" :base="base" :request="api" /><details v-if="can('admin')"><summary>Texting coverage, automatic answers and delivery activity</summary><ClientMessagingOperations :base="base" /></details><p>New messages about a child are shared with all authorized guardians and their care team. There are no private child-related conversations here.</p><article
                v-for="m in data.messages"
                :key="m.id"
                class="card message-card"
              >
                <div class="section-heading">
                  <strong>{{ patientName(m.patientId) }}</strong
                  ><span class="muted">{{
                    new Date(m.data.sentAt).toLocaleString()
                  }}</span>
                </div>
                <p>{{ m.data.body }}</p>
                <span class="muted">{{
                  m.data.sender === account.id
                    ? "Sent by you"
                    : "Secure message"
                }}</span
                ><button
                  v-if="!m.data.readBy.includes(account.id)"
                  class="outline"
                  @click="markRead(m)"
                >
                  Mark read
                </button>
              </article>
              <EmptyState
                v-if="!data.messages.length"
                title="A secure place to connect."
                text="Messages stay inside the practice. Start a conversation with an authorized care-team member."
            /></template>
            <template v-else-if="section === 'reports'"
              ><div class="stats-grid">
                <article class="stat">
                  <span>Appointments</span
                  ><strong>{{ data.appointments.length }}</strong>
                </article>
                <article class="stat">
                  <span>Signed notes</span
                  ><strong>{{
                    data.notes.filter((n) =>
                      ["signed", "cosigned"].includes(n.data.status),
                    ).length
                  }}</strong>
                </article>
                <article class="stat" v-if="can('billing')">
                  <span>Ledger balance</span
                  ><strong>{{
                    currency(
                      Object.values(data.balances).reduce((a, b) => a + b, 0),
                    )
                  }}</strong>
                </article>
              </div>
              <article class="card">
                <h2>Practice activity</h2>
                <p>
                  Totals reflect records accessible to your account in this
                  practice.
                </p>
                <button class="outline" @click="exportReport">
                  Download activity summary
                </button>
              </article></template
            >
          </template>
        </template>
      </main>
      <footer class="app-footer">
        AuricWell <span>Care, connected.</span>
      </footer>
    </div>
    <div v-if="externalSession" class="modal-backdrop"><section class="modal"><h2>Your video session is ready</h2><p>Google Meet opens in another tab. You can keep AuricWell open while you meet.</p><a :href="externalSession.url" target="_blank" rel="noopener noreferrer" class="button">Open Google Meet ↗</a><button class="outline" @click="externalSession=null">Close</button></section></div>
    <div v-if="showOffice" class="modal-backdrop"><section class="modal" style="max-width:1250px;width:95vw"><button class="outline" @click="showOffice=false">Close office</button><PrivateVirtualOffice product-name="AuricWell" :request="officeRequest" /></section></div>
    <div v-if="video" class="modal-backdrop">
      <section class="modal">
        <div class="section-heading">
          <h2>Video appointment</h2>
          <button class="outline" @click="leaveVideo">Leave session</button>
        </div>
        <p v-if="videoError" class="error">{{ videoError }}</p>
        <div id="aw-video-subscribers" class="video-stage"></div>
        <div id="aw-video-publisher"></div>
      </section>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted, h, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "./api";
import RecordForm from "./RecordForm.vue";
import RecordsRequests from "./RecordsRequests.vue";
import AnnouncementToasts from '../../frontend/src/components/notifications/AnnouncementToasts.vue';
import PracticeOverview from '../../frontend/src/auricwell/PracticeOverview.vue';
import { useDashboardCardState } from '../../frontend/src/composables/useDashboardCardState.js';
import ToastAnnouncementManager from '../../frontend/src/components/admin/ToastAnnouncementManager.vue';
import Settings from "./Settings.vue";
import SessionPreferences from "./SessionPreferences.vue";
import ClientSmsInbox from "./ClientSmsInbox.vue";
import AgencyFaxInbox from "../../frontend/src/components/communications/AgencyFaxInbox.vue";
import ClientMessagingOperations from "./ClientMessagingOperations.vue";
import SmsPreferenceNotices from "./SmsPreferenceNotices.vue";
import SessionDeliveries from "./SessionDeliveries.vue";
import Agreements from "./Agreements.vue";
import Imports from "./Imports.vue";
import Intake from "./Intake.vue";
import Schedule from "./Schedule.vue";
import { dateInZone } from "./calendar.js";
import NoteWorkspace from "./NoteWorkspace.vue";
import StructuredNoteFields from "./StructuredNoteFields.vue";
import BillingSetup from "./BillingSetup.vue";
import SharedBilling from "./SharedBilling.vue";
import Payments from "./Payments.vue";
import PrivateVirtualOffice from '../../frontend/src/components/meetings/PrivateVirtualOffice.vue';
const showOffice=ref(false);
const officeRequest=(path,options)=>api(`${base}/office${path}`,options);
const EmptyState = (props) =>
  h("div", { class: "empty" }, [
    h("span", { class: "empty-icon" }, "◇"),
    h("h3", props.title),
    h("p", props.text),
  ]);
const route = useRoute(),
  router = useRouter(),
  root = `/app/${route.params.slug}`,
  base = `/practices/${encodeURIComponent(route.params.slug)}`;
const account = ref(null),
  practice = ref(null),
  data = ref(null),
  payers = ref([]),
  members = ref([]),
  error = ref(""),
  notice = ref(""),
  loading = ref(true),
  busy = ref(false),
  editor = ref(false),
  editing = ref(null),
  formInitial = ref({}),
  search = ref(""),
  selectedPatient = ref(""),
  billingTab = ref("shared"),
  video = ref(null),
  videoError = ref("");
const clinicalPatient = ref("");
const billingClient = ref("");
const noteTemplates = ref([]);
const noteWorkspace = ref(null);
const contacts = ref([]),
  notifications = ref([]),
  showNotifications = ref(false);
const operationKey = ref("");
const abort = new AbortController();
let videoSession;
const sendBillingText=async id=>{try{await api(`${base}/sms/billing-notices/${id}`,{method:'POST',body:{requestId:crypto.randomUUID()}});notice.value='Billing notice queued. Consent and balance will be checked again before sending.';}catch(e){error.value=e.message;}};
const reminderPatient = ref('');
const deliveryAppointment = ref('');
const externalSession = ref(null);
const section = computed(() => route.params.section || "home"),
  patientPortal = computed(() => practice.value?.actorType !== "staff");
const can = (p) => practice.value?.permissions?.includes(p);
const sidebarState=useDashboardCardState({kind:'auricwell-practice-sidebar',userId:computed(()=>account.value?.id),agencyId:computed(()=>practice.value?.id||route.params.slug),cardIds:['navigation']});
const sidebarCollapsed=computed({get:()=>sidebarState.collapsedCards.value.includes('navigation'),set:value=>sidebarState.setCollapsed('navigation',value)});
async function navigateOverview(target) {
  if (!navigation.value.some(item=>item.key===target.section)) return;
  await router.push(`${root}/${target.section}`);
  await nextTick();
  if (target.patientId) selectedPatient.value=target.patientId;
  if (target.note) noteWorkspace.value?.openNote(target.note);
}
const canManageToasts = computed(() => !patientPortal.value && (can('admin') || can('announcements') || account.value?.operator));
const loadOfficeToasts = () => api(`${base}/toasts/active`);
const practiceTimezone = computed(
  () => practice.value?.timezone || "America/Denver",
);
const today = computed(() =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: practiceTimezone.value,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date()),
);
const firstName = computed(() => account.value?.name?.split(" ")[0]);
const headings = {
  home: "Your day, at a glance.",
  schedule: "Schedule",
  clients: "Clients",
  documentation: "Documentation & Note Aid",
  billing: "Billing & claims",
  messages: "Secure messages",
  reports: "Practice reports",
  providers: "Your providers",
};
const descriptions = {
  schedule: "Make space for meaningful care.",
  clients: "A clear view of the people in your care.",
  documentation: "From a thoughtful draft to a signed clinical record.",
  billing: "Track practice finances with a clear record of every step.",
  messages: "Conversations stay in your practice.",
  providers: "Credentials, services and responsibilities, clearly defined.",
};
const navigation = computed(() =>
  [
    { key: "home", label: patientPortal.value ? "Home" : "Overview", icon: "⌂" },
    ...(canManageToasts.value ? [{ key: "announcements", label: "Announcements", icon: "◉" }] : []),
    ...(patientPortal.value || can("records_manager") ? [{ key: "records-requests", label: patientPortal.value ? "Request my records" : "Records requests", icon: "▤" }] : []),
    {
      key: "schedule",
      label: patientPortal.value ? "Appointments" : "Schedule",
      icon: "◷",
    },
    ...(!patientPortal.value
      ? [
          { key: "clients", label: "Clients", icon: "♙" },
          ...(can("clinical")
            ? [{ key: "documentation", label: "Documentation", icon: "▤" }]
            : []),
          ...(can("admin")
            ? [{ key: "providers", label: "Providers", icon: "♧" }]
            : []),
        ]
      : []),
    ...(patientPortal.value || can("billing")
      ? [{ key: "billing", label: "Billing", icon: "▭" }]
      : []),
    { key: "messages", label: "Messages", icon: "✉" },
    ...(patientPortal.value ||
    can("admin") ||
    can("clinical") ||
    can("supervise")
      ? [
          {
            key: "intake",
            label: patientPortal.value ? "Intake forms" : "Patient intake",
            icon: "▤",
          },
        ]
      : []),
    {
      key: "agreements",
      label: patientPortal.value ? "Forms & agreements" : "Agreements",
      icon: "☷",
    },
    ...(!patientPortal.value
      ? [{ key: "reports", label: "Reports", icon: "▥" }]
      : []),
    ...(can("migration")
      ? [{ key: "imports", label: "Migration", icon: "⇧" }]
      : []),
    ...(can("admin")
      ? [{ key: "settings", label: "Settings", icon: "⚙" }]
      : []),
  ].filter(
    (item) =>
      ![
        "schedule",
        "clients",
        "documentation",
        "billing",
        "messages",
        "imports",
        "intake",
      ].includes(item.key) || practice.value?.capabilities?.[item.key] === true,
  ),
);
const unread = computed(
  () =>
    data.value?.messages.filter(
      (m) => !m.data.readBy?.includes(account.value?.id),
    ).length || 0,
);
const todaysAppointments = computed(
  () =>
    data.value?.appointments.filter(
      (a) =>
        dateInZone(a.data.start, practiceTimezone.value) ===
        dateInZone(new Date(), practiceTimezone.value),
    ) || [],
);
const draftNotes = computed(
  () => data.value?.notes.filter((n) => n.data.status === "draft") || [],
);
const filteredPatients = computed(
  () =>
    data.value?.patients.filter((p) =>
      p.data.name.toLowerCase().includes(search.value.toLowerCase()),
    ) || [],
);
const patientName = (id) =>
  data.value?.patients.find((p) => p.id === id)?.data.name || "Client";
const providerName = (id) =>
  data.value?.providers.find((p) => p.id === id)?.data.name || "Provider";
const initials = (name) =>
  (name || "")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const time = (d) =>
    new Date(d).toLocaleTimeString([], {
      timeZone: practiceTimezone.value,
      hour: "numeric",
      minute: "2-digit",
    }),
  date = (d) =>
    new Date(d).toLocaleDateString([], {
      timeZone: practiceTimezone.value,
      month: "short",
      day: "numeric",
    }),
  currency = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(n / 100);
const patientOptions = computed(
  () =>
    data.value?.patients.map((p) => ({ value: p.id, label: p.data.name })) ||
    [],
);
const field = (key, label, type = "text", options) => ({
  key,
  label,
  type,
  options,
  required: true,
});
const createLabel = computed(() =>
  section.value === "clients" &&
  (can("clinical") || can("schedule") || can("admin"))
    ? "Add client"
    : section.value === "documentation" && can("clinical")
      ? "New note"
      : section.value === "providers" && can("admin")
        ? "Configure provider"
        : section.value === "messages"
          ? "New message"
          : section.value === "billing" && can("billing")
            ? ['shared', 'claims'].includes(billingTab.value) ? '' : billingTab.value === "payers"
              ? "Add payer"
              : billingTab.value === "claims"
                ? "Prepare claim"
                : "Record transaction"
            : "",
);
const fields = computed(() => {
  const patient = field("patientId", "Patient", "select", patientOptions.value);
  if (section.value === "clients")
    return [
      field("name", "Full name"),
      field("dob", "Birth date", "date"),
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Address" },
      field("status", "Status", "select", ["active", "waitlist", "discharged"]),
      {
        key: "careTeam",
        label: "Assigned care team",
        options: data.value.providers
          .filter((p) => p.data.status === "active")
          .map((p) => ({ value: p.data.accountId, label: p.data.name })),
        multiple: true,
      },
    ];
  if (section.value === "documentation")
    return [
      patient,
      field("title", "Title"),
      field("type", "Note type", "select", [
        "Progress note",
        "Intake assessment",
        "Treatment plan",
        "Treatment summary",
        "Discharge summary",
        "Amendment",
      ]),
      field("serviceDate", "Service date", "date"),
      {
        key: "appointmentId",
        label: "Appointment",
        options: data.value.appointments
          .filter((a) => a.data.providerAccountId === account.value.id)
          .map((a) => ({
            value: a.id,
            label: `${patientName(a.patientId)} · ${date(a.data.start)} ${time(a.data.start)}`,
          })),
      },
      { key: "serviceCode", label: "Service code" },
      { key: "diagnoses", label: "Diagnosis codes, comma separated" },
      {
        key: "content",
        label: "Clinical documentation / additional narrative",
        type: "textarea",
      },
      { key: "billable", label: "Billable service", type: "checkbox" },
    ];
  if (section.value === "providers")
    return [
      field(
        "accountId",
        "Staff account",
        "select",
        members.value
          .filter((m) => m.actorType === "staff")
          .map((m) => ({ value: m.id, label: m.name })),
      ),
      {
        ...field("name", "Provider name"),
        readonly: !!editing.value?.canonicalUserId,
      },
      field("credential", "Credential", "select", [
        "LPC",
        "LPCC",
        "LMFT",
        "MFTC",
        "LCSW",
        "LSW",
        "PSYCHOLOGIST",
        "PSYCHOLOGY CANDIDATE",
        "TRAINEE",
      ]),
      field("license", "License number"),
      field("licenseExpires", "License expiration", "date"),
      field("jurisdiction", "Jurisdiction", "select", ["CO"]),
      field("status", "Status", "select", ["active", "inactive"]),
      field("services", "Service codes, comma separated"),
      field("locations", "Locations, comma separated"),
      {
        key: "availability",
        label:
          "Availability: one day number (0=Sunday) HH:MM-HH:MM per line, practice timezone",
        type: "textarea",
      },
      {
        key: "payerIds",
        label: "Verified payer enrollments",
        options: payers.value.map((p) => ({ value: p.id, label: p.data.name })),
        multiple: true,
      },
      {
        key: "enrollmentReviewed",
        label:
          "I verified payer enrollment separately from clinical credentials",
        type: "checkbox",
      },
      { key: "billingFirstName", label: "Billing legal first name" },
      { key: "billingLastName", label: "Billing legal last name" },
      { key: "npi", label: "NPI" },
      { key: "taxonomy", label: "Taxonomy" },
      {
        key: "credentialsReviewed",
        label: "Credentials reviewed",
        type: "checkbox",
      },
      {
        key: "supervisionRequired",
        label: "Requires supervision",
        type: "checkbox",
      },
      {
        key: "supervisorAccountId",
        label: "Assigned supervisor",
        options: members.value
          .filter((m) => m.permissions.includes("supervise"))
          .map((m) => ({ value: m.id, label: m.name })),
      },
    ];
  if (section.value === "messages")
    return [
      patient,
      field(
        "recipients",
        "Recipient",
        "select",
        contacts.value.map((p) => ({ value: p.id, label: p.name })),
      ),
      field("body", "Message", "textarea"),
    ];
  if (section.value === "billing" && billingTab.value === "payers")
    return [
      field("name", "Payer name"),
      { key: "electronicPayerId", label: "Electronic payer ID" },
      { key: "address", label: "Payer address" },
      {
        key: "electronicMatchReviewed",
        label: "I reviewed the electronic payer identity",
        type: "checkbox",
      },
      {
        key: "matchEvidence",
        label: "Payer identity verification evidence",
        type: "textarea",
      },
      {
        key: "supervisionMapping",
        label: "Supervised billing mapping",
        options: ["supervisor_rendering", "service_rendering_with_supervisor"],
      },
      { key: "planType", label: "Exact insurance plan type" },
      { key: "effectiveFrom", label: "Rule effective from", type: "date" },
      {
        key: "effectiveThrough",
        label: "Rule effective through",
        type: "date",
      },
      {
        key: "ruleReference",
        label: "Verified payer rule reference",
        type: "textarea",
      },
      {
        key: "supervisionReviewed",
        label: "I verified this dated payer supervision rule",
        type: "checkbox",
      },
    ];
  if (section.value === "billing" && billingTab.value === "claims")
    return [
      field(
        "noteId",
        "Signed billable note",
        "select",
        (data.value.billingNotes || data.value.notes)
          .filter(
            (n) =>
              n.data.billable && ["signed", "cosigned"].includes(n.data.status) && (!billingClient.value || n.patientId === billingClient.value),
          )
          .map((n) => ({
            value: n.id,
            label: `${patientName(n.patientId)} · ${n.data.title}`,
          })),
      ),
      field(
        "payerId",
        "Payer",
        "select",
        payers.value.map((p) => ({ value: p.id, label: p.data.name })),
      ),
      field("amountCents", "Charge (cents)", "number"),
      { key: "units", label: "Units (default 1)", type: "number" },
      { key: "modifiers", label: "Modifiers, comma separated" },
      { key: "placeOfService", label: "Place of service (default 11)" },
    ];
  if (section.value === "billing")
    return [
      patient,
      field("type", "Transaction", "select", [
        "charge",
        "opening_balance",
        "payment",
        "adjustment",
        "refund",
      ]),
      field("amountCents", "Amount (cents)", "number"),
      field("date", "Transaction date", "date"),
      field("method", "Method", "select", [
        "cash",
        "check",
        "external",
        "insurance",
        "none",
      ]),
      field("reason", "Description / external reference"),
      {
        key: "paymentId",
        label: "Original payment for refund",
        options: data.value.ledger
          .filter((e) => e.data.type === "payment")
          .map((e) => ({
            value: e.id,
            label: `${patientName(e.patientId)} · ${currency(e.data.amountCents)}`,
          })),
      },
    ];
  return [];
});
async function run(fn) {
  error.value = "";
  notice.value = "";
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
    if (e.status === 401) router.replace({ path: '/app', query: section.value === 'records-requests' ? { records: '1', request: route.query.request || '' } : {} });
  } finally {
    busy.value = false;
  }
}
async function load() {
  const b = await api("/bootstrap", { signal: abort.signal });
  account.value = b.account;
  practice.value = b.practices.find((p) => p.slug === route.params.slug);
  if (!practice.value)
    throw new Error("This practice is not available to your account.");
  data.value = await api(`${base}/workspace`, { signal: abort.signal });
  notifications.value = await api(`${base}/notifications`, {
    signal: abort.signal,
  });
  practice.value = { ...practice.value, ...data.value.practice };
  if (!can('billing')) billingTab.value = 'ledger';
  if (
    (can("clinical") || can("supervise")) &&
    practice.value.capabilities.documentation
  )
    noteTemplates.value = await api(`${base}/note-templates`, {
      signal: abort.signal,
    });
  if (can("billing") && practice.value.capabilities.billing)
    payers.value = await api(`${base}/payers`, { signal: abort.signal });
  if (can("admin"))
    members.value = await api(`${base}/members`, { signal: abort.signal });
}
async function formChanged(input) {
  if (section.value === "documentation") {
    if (clinicalPatient.value && clinicalPatient.value !== input.patientId)
      formInitial.value = {
        ...input,
        content: "",
        title: "",
        diagnoses: "",
        appointmentId: "",
        structured: input.structured
          ? { ...input.structured, answers: {} }
          : null,
      };
    clinicalPatient.value = input.patientId || "";
  }
  if (section.value === "messages" && input.patientId)
    await run(async () => {
      contacts.value = await api(
        `${base}/patients/${input.patientId}/message-contacts`,
      );
    });
}
function useAiDraft(draft) {
  clinicalPatient.value = draft.patientId;
  editing.value = null;
  formInitial.value = draft;
  editor.value = true;
}
function closeEditor() {
  clinicalPatient.value = "";
  operationKey.value = "";
  editor.value = false;
  editing.value = null;
  formInitial.value = {};
}
function editPatient(id) {
  const p = data.value.patients.find((p) => p.id === id);
  editing.value = p;
  formInitial.value = { ...p.data };
  editor.value = true;
}

function editNote(n) {
  clinicalPatient.value = n.patientId;
  editing.value = n;
  formInitial.value = {
    ...n.data,
    content: n.data.narrative ?? n.data.content,
    structured: n.data.structured
      ? JSON.parse(JSON.stringify(n.data.structured))
      : null,
    diagnoses: (n.data.diagnoses || []).join(", "),
  };
  editor.value = true;
}
function editPayer(p) {
  editing.value = p;
  formInitial.value = {
    ...p.data,
    ...(p.data.supervisionRule || {}),
    supervisionMapping: p.data.supervisionRule?.mapping,
    ruleReference: p.data.supervisionRule?.reference,
  };
  editor.value = true;
}
function editProvider(p) {
  editing.value = p;
  formInitial.value = {
    ...p.data,
    services: (p.data.services || []).join(", "),
    locations: (p.data.locations || []).join(", "),
    payerIds: (p.data.payerEnrollments || [])
      .filter((e) => e.verified)
      .map((e) => e.payerId),
    availability: (p.data.availability || [])
      .map((a) => `${a.day} ${a.start}-${a.end}`)
      .join("\n"),
  };
  editor.value = true;
}
async function saveRecord(input) {
  await run(async () => {
    let path,
      body = { ...input };
    if (section.value === "clients") path = "patients";
    if (section.value === "providers") {
      path = "providers";
      body.availability = (body.availability || "")
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => {
          const m = s.trim().match(/^([0-6]) (\d{2}:\d{2})-(\d{2}:\d{2})$/);
          if (!m)
            throw new Error("Use availability lines such as 1 09:00-17:00.");
          return { day: Number(m[1]), start: m[2], end: m[3] };
        });
      body.payerEnrollments = body.enrollmentReviewed
        ? (body.payerIds || []).map((payerId) => ({ payerId, verified: true }))
        : editing.value?.data.payerEnrollments || [];
      body.services = (body.services || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      body.locations = (body.locations || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (section.value === "documentation") {
      path = "notes";
      body.diagnoses = (body.diagnoses || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (section.value === "messages") {
      path = "messages";
      body.recipients = [body.recipients];
    }
    if (section.value === "billing") {
      path =
        billingTab.value === "payers"
          ? "payers"
          : billingTab.value === "claims"
            ? "claims"
            : "ledger";
      if (path === "claims") {
        body.modifiers = (body.modifiers || "")
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        if (!body.units) delete body.units;
      }
      if (path === "ledger") {
        operationKey.value ||= crypto.randomUUID();
        body.idempotencyKey = operationKey.value;
      }
    }
    if (editing.value) {
      body.revision = editing.value.revision;
      if (["clients", "providers"].includes(section.value))
        body.sharedFingerprint = editing.value.sharedFingerprint;
    }
    await api(`${base}/${path}${editing.value ? `/${editing.value.id}` : ""}`, {
      method: editing.value ? "PUT" : "POST",
      body,
    });
    closeEditor();
    await load();
    notice.value = "Saved to this practice.";
  });
}
const shareDocument = (n, shared) =>
  run(async () => {
    if (
      !window.confirm(
        shared
          ? "Share this reviewed document with the patient and authorized guardians?"
          : "Revoke patient access to this document?",
      )
    )
      return;
    await api(`${base}/notes/${n.id}/share`, {
      method: "POST",
      body: { revision: n.revision, reviewed: true, shared },
    });
    notice.value = shared
      ? "Document shared with authorized portal users."
      : "Patient sharing revoked.";
  });
const markRead = (m) =>
  run(async () => {
    await api(`${base}/messages/${m.id}/read`, { method: "POST", body: {} });
    await load();
  });
const signNote = (n, cosign = false) =>
  run(async () => {
    if (
      !window.confirm(
        "I have reviewed the complete note and intend to sign this version.",
      )
    )
      return;
    await api(`${base}/notes/${n.id}/sign`, {
      method: "POST",
      body: { revision: n.revision, reviewed: true, cosign },
    });
    await load();
  });
const reviewClaim = (c) =>
  run(async () => {
    if (
      !window.confirm(
        `Approve this draft for ${patientName(c.patientId)}, ${c.data.serviceCode}, ${currency(c.data.amountCents)}? No claim will be transmitted.`,
      )
    )
      return;
    await api(`${base}/claims/${c.id}/review`, {
      method: "POST",
      body: { revision: c.revision, approved: true },
    });
    await load();
  });
async function signOut() {
  try {
    await api("/auth/logout", { method: "POST", body: {} });
  } finally {
    data.value = null;
    router.replace("/app");
  }
}
function exportReport() {
  const rows = [
    ["Metric", "Value"],
    ["Appointments", data.value.appointments.length],
    ["Accessible clients", data.value.patients.length],
    ["Notes", data.value.notes.length],
  ];
  const url = URL.createObjectURL(
    new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "auricwell-activity.csv";
  a.click();
  URL.revokeObjectURL(url);
}
const resolveRequest = (r, decision = "approved") =>
  run(async () => {
    const resolution = window.prompt(
      r.data.appointmentId ? (decision === "declined" ? "Why are you declining this request?" : "Record your decision. Approving cancellation cancels the visit; reschedule requests require changing the time first.") : "Record the scheduling resolution. Book or update the appointment separately.",
    );
    if (!resolution) return;
    await api(`${base}/appointment-requests/${r.id}/resolve`, {
      method: "POST",
      body: { resolution, decision },
    });
    await load();
  });
async function joinVideo(a) {
  // Reserve a tab during the user gesture so browsers do not block the async launch.
  const popup = window.open('about:blank', '_blank');
  if (popup) popup.opener = null;
  await run(async () => {
    let result;
    try { result = await api(`${base}/appointments/${a.id}/video`, {
      method: "POST",
      body: {},
    });
    } catch (e) { popup?.close(); throw e; }
    if (result.provider === 'google_meet') {
      if (popup) popup.location.replace(result.url);
      else externalSession.value = result;
      return;
    }
    popup?.close();
    video.value = result;
    await nextTick();
    const { default: OT } = await import("@vonage/client-sdk-video");
    videoSession = OT.initSession(video.value.apiKey, video.value.sessionId);
    videoSession.on("streamCreated", (event) =>
      videoSession.subscribe(
        event.stream,
        "aw-video-subscribers",
        { insertMode: "append", width: "100%", height: 420 },
        (e) => {
          if (e) videoError.value = e.message;
        },
      ),
    );
    videoSession.connect(video.value.token, (e) => {
      if (e) {
        videoError.value = e.message;
        return;
      }
      const publisher = OT.initPublisher(
        "aw-video-publisher",
        { width: 240, height: 180 },
        (err) => {
          if (err) videoError.value = err.message;
        },
      );
      videoSession.publish(publisher);
    });
  });
}
function leaveVideo() {
  videoSession?.disconnect();
  videoSession = null;
  video.value = null;
}
watch(section, async (next) => {
  closeEditor();
  contacts.value = [];
  error.value = "";
  notice.value = "";
  if (
    next === "documentation" &&
    (can("clinical") || can("supervise")) &&
    practice.value?.capabilities.documentation
  ) {
    noteTemplates.value = [];
    await run(async () => {
      noteTemplates.value = await api(`${base}/note-templates`, {
        signal: abort.signal,
      });
    });
  }
});
onMounted(async () => {
  await run(load);
  loading.value = false;
});
onUnmounted(() => {
  abort.abort();
  leaveVideo();
  data.value = null;
});
</script>
