<template>
  <div class="container comms-feed">
    <div class="header" data-tour="comms-header">
      <div>
        <h2 data-tour="comms-title">Communications</h2>
        <p class="subtitle" data-tour="comms-subtitle">Workspace for texting, chat, calls, and delivery queues.</p>
      </div>
      <div class="header-actions" data-tour="comms-actions">
        <div class="tabs">
          <button class="tab" :class="{ active: activeTab === 'all' }" @click="setTab('all')">All</button>
          <button class="tab" :class="{ active: activeTab === 'texts' }" @click="setTab('texts')">Texting</button>
          <button class="tab" :class="{ active: activeTab === 'calls' }" @click="setTab('calls')">Calls</button>
          <button class="tab" :class="{ active: activeTab === 'automation' }" @click="setTab('automation')">
            {{ isProviderOrSchoolStaff ? 'My messages' : 'Automation' }}
            <span v-if="!isProviderOrSchoolStaff && pendingDeliveryCount > 0" class="tab-badge">{{ pendingDeliveryCount }}</span>
          </button>
          <button class="tab" :class="{ active: activeTab === 'school' }" @click="setTab('school')">School alerts</button>
          <button class="tab" :class="{ active: activeTab === 'proof' }" @click="setTab('proof')">Compliance proof</button>
        </div>
        <router-link v-if="!isPublicProofMode" class="btn btn-secondary" :to="smsInboxLink">SMS Inbox</router-link>
        <router-link v-if="!isPublicProofMode" class="btn btn-secondary" :to="preferencesLink">Preferences</router-link>
        <router-link v-if="!isPublicProofMode && canManageTexting" class="btn btn-secondary" :to="textingSettingsLink">Texting settings</router-link>
        <router-link v-if="!isPublicProofMode" class="btn btn-secondary" :to="chatsLink" data-tour="comms-go-chats">Chats</router-link>
        <router-link v-if="!isPublicProofMode" class="btn btn-secondary" :to="ticketsLink">
          Tickets
          <span v-if="openTicketsCount > 0" class="header-badge">{{ openTicketsCount }}</span>
        </router-link>
        <button v-if="!isPublicProofMode" class="btn btn-secondary" @click="refreshActive" :disabled="loading || schoolLoading">Refresh</button>
      </div>
    </div>

    <div
      v-if="pendingDeliveryCount > 0 && activeTab !== 'automation' && !isProviderOrSchoolStaff"
      class="delivery-alert-banner"
    >
      <span class="delivery-alert-text">{{ pendingDeliveryCount }} item(s) pending approval.</span>
      <button type="button" class="btn btn-primary btn-sm" @click="setTab('automation')">
        Review now
      </button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else class="card" data-tour="comms-card">
      <div v-if="activeTab === 'school'">
        <div v-if="schoolError" class="error-box">{{ schoolError }}</div>
        <div v-else-if="schoolLoading" class="loading">Loading…</div>
        <div v-else-if="schoolRows.length === 0" class="empty">No school notifications yet.</div>
        <div v-else class="list" data-tour="comms-list">
          <button
            v-for="item in schoolRows"
            :key="itemKey(item)"
            class="row"
            data-tour="comms-row"
            @click="openSchoolItem(item)"
            :title="item.preview"
            :class="{ unread: item.is_unread }"
          >
            <div class="left">
              <div class="top">
                <span class="badge" :class="schoolBadgeClass(item)">{{ schoolBadgeLabel(item) }}</span>
                <span class="client">
                  {{ item.school_name || `School #${item.school_id || '—'}` }}
                </span>
                <span class="owner">
                  {{ item.title || 'Notification' }}
                </span>
              </div>
              <div class="body">{{ item.preview }}</div>
            </div>
            <div class="right">
              <div class="time">{{ formatTime(itemTime(item)) }}</div>
              <div v-if="item.is_unread" class="pill">NEW</div>
              <button class="btn btn-secondary btn-xs" type="button" @click.stop="markSchoolRead(item)">
                Mark read
              </button>
            </div>
          </button>
        </div>
      </div>
      <div v-else-if="activeTab === 'calls'">
        <div class="card calls-settings-card">
          <div class="top" style="margin-bottom:8px;">
            <span class="badge ticket">CALL & TEXT SETTINGS</span>
            <span class="owner">Your number is used for both calling and texting. Toggle each per your preference.</span>
          </div>
          <div class="grid">
            <div class="form-group">
              <label>Inbound calls</label>
              <select v-model="callSettings.inbound_enabled" class="select">
                <option :value="true">Enabled</option>
                <option :value="false">Disabled</option>
              </select>
            </div>
            <div class="form-group">
              <label>Outbound calls</label>
              <select v-model="callSettings.outbound_enabled" class="select">
                <option :value="true">Enabled</option>
                <option :value="false">Disabled</option>
              </select>
            </div>
            <div class="form-group">
              <label>Inbound texts</label>
              <select v-model="callSettings.sms_inbound_enabled" class="select">
                <option :value="true">Enabled</option>
                <option :value="false">Disabled</option>
              </select>
            </div>
            <div class="form-group">
              <label>Outbound texts</label>
              <select v-model="callSettings.sms_outbound_enabled" class="select">
                <option :value="true">Enabled</option>
                <option :value="false">Disabled</option>
              </select>
            </div>
            <div class="form-group">
              <label>Forward calls to</label>
              <input v-model="callSettings.forward_to_phone" class="input" placeholder="+15551234567" />
            </div>
            <div class="form-group">
              <label>Call recording</label>
              <select v-model="callSettings.allow_call_recording" class="select">
                <option :value="false">Disabled</option>
                <option :value="true">Enabled</option>
              </select>
            </div>
            <div class="form-group">
              <label>Voicemail fallback</label>
              <select v-model="callSettings.voicemail_enabled" class="select">
                <option :value="false">Disabled</option>
                <option :value="true">Enabled</option>
              </select>
            </div>
            <div class="form-group">
              <label>Voicemail message</label>
              <input v-model="callSettings.voicemail_message" class="input" placeholder="Sorry we missed your call. Please call back later." />
            </div>
            <div class="form-group">
              <label>Provider ring timeout (agency)</label>
              <input :value="callSettings.provider_ring_timeout_seconds" class="input" disabled />
            </div>
          </div>
          <div class="actions">
            <button class="btn btn-secondary" @click="saveCallSettings" :disabled="savingCallSettings">
              {{ savingCallSettings ? 'Saving…' : 'Save call settings' }}
            </button>
          </div>
        </div>
        <div class="card calls-settings-card">
          <div class="top" style="margin-bottom:8px;">
            <span class="badge ticket">ANALYTICS</span>
            <span class="owner">Last {{ callAnalytics.days }} days</span>
          </div>
          <div class="grid">
            <div class="form-group">
              <label>Total calls</label>
              <div class="metric">{{ callAnalytics.summary.total }}</div>
            </div>
            <div class="form-group">
              <label>Answered</label>
              <div class="metric">{{ callAnalytics.summary.answered }}</div>
            </div>
            <div class="form-group">
              <label>Missed</label>
              <div class="metric">{{ callAnalytics.summary.missed }}</div>
            </div>
            <div class="form-group">
              <label>Avg duration</label>
              <div class="metric">{{ Math.round(callAnalytics.summary.avgDurationSeconds || 0) }}s</div>
            </div>
            <div class="form-group">
              <label>Voicemails</label>
              <div class="metric">{{ callAnalytics.summary.voicemailCount || 0 }}</div>
            </div>
          </div>
        </div>
        <div class="card calls-settings-card">
          <div class="top" style="margin-bottom:8px;">
            <span class="badge ticket">VOICEMAILS</span>
            <span class="owner">Recorded voicemail inbox</span>
          </div>
          <div v-if="voicemailLoading" class="loading">Loading voicemails…</div>
          <div v-else-if="voicemails.length === 0" class="empty">No voicemails in the selected period.</div>
          <div v-else class="list">
            <div v-for="vm in voicemails" :key="`vm-${vm.id}`" class="row">
              <div class="left">
                <div class="top">
                  <span class="badge in">VOICEMAIL</span>
                  <span class="client">From: {{ vm.from_number || '—' }}</span>
                  <span class="owner">To: {{ vm.to_number || '—' }}</span>
                </div>
                <div class="body">
                  Duration: {{ vm.duration_seconds || 0 }}s · Status: {{ String(vm.status || 'recorded').toUpperCase() }}
                </div>
                <div v-if="vm.transcription_text" class="transcription">
                  {{ vm.transcription_text }}
                </div>
              </div>
              <div class="right">
                <div class="time">{{ formatTime(vm.created_at) }}</div>
                <button class="btn btn-secondary btn-xs" @click="playVoicemail(vm)" :disabled="playingVoicemailId === vm.id">
                  {{ playingVoicemailId === vm.id ? 'Loading…' : 'Play' }}
                </button>
              </div>
            </div>
          </div>
          <audio v-if="voicemailAudioSrc" :src="voicemailAudioSrc" controls style="margin-top:8px; width:100%;" />
          <audio v-if="recordingAudioSrc" :src="recordingAudioSrc" controls style="margin-top:8px; width:100%;" />
        </div>
        <div v-if="callsSuccessMessage" class="success-box">{{ callsSuccessMessage }}</div>
        <div v-if="callsError" class="error-box">{{ callsError }}</div>
        <div v-else-if="callsLoading" class="loading">Loading call activity…</div>
        <div v-else-if="!callsEnabled" class="empty">
          Voice logs are not enabled in this environment yet. This tab is ready for Twilio voice rollout.
        </div>
        <div v-else-if="callRows.length === 0" class="empty">No call logs yet.</div>
        <div v-else class="list" data-tour="comms-list">
          <div v-for="c in callRows" :key="`call-${c.id || c.sid || c.created_at}`" class="row call-row">
            <div class="left">
              <div class="top">
                <span class="badge ticket">CALL</span>
                <span class="client">From: {{ c.from_number || c.from || '—' }}</span>
                <span class="owner">To: {{ c.to_number || c.to || '—' }}</span>
              </div>
              <div class="body">
                Status: {{ String(c.status || c.call_status || 'unknown').toUpperCase() }}
                <span v-if="c.duration_seconds || c.duration"> · Duration: {{ c.duration_seconds || c.duration }}s</span>
                <div v-if="getCallRecordingSid(c)" class="recording-row">
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    :disabled="playingRecordingId === c.id"
                    @click="playCallRecording(c)"
                  >
                    {{ playingRecordingId === c.id ? 'Loading…' : '▶ Play recording' }}
                  </button>
                </div>
              </div>
            </div>
            <div class="right">
              <div class="time">{{ formatTime(c.started_at || c.created_at || c.end_time) }}</div>
              <div v-if="isActiveCall(c)" class="call-actions">
                <button
                  v-if="!isCallOnHold(c)"
                  type="button"
                  class="btn btn-secondary btn-xs"
                  :disabled="holdLoading === (c.twilio_call_sid || c.sid)"
                  @click="holdCall(c)"
                >
                  {{ holdLoading === (c.twilio_call_sid || c.sid) ? '…' : 'Hold' }}
                </button>
                <button
                  v-else
                  type="button"
                  class="btn btn-secondary btn-xs"
                  :disabled="resumeLoading === (c.twilio_call_sid || c.sid)"
                  @click="resumeCall(c)"
                >
                  {{ resumeLoading === (c.twilio_call_sid || c.sid) ? '…' : 'Resume' }}
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-xs"
                  :disabled="transferLoading"
                  @click="openTransferModal(c)"
                >
                  Transfer
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="transferModalOpen" class="modal-overlay" @click.self="closeTransferModal">
          <div class="modal transfer-modal">
            <h3>Transfer call</h3>
            <div v-if="transferError" class="error-box">{{ transferError }}</div>
            <div class="form-group">
              <label>Transfer to</label>
              <select v-model="transferTargetType" class="select">
                <option value="phone">Phone number</option>
                <option value="user">Provider / staff</option>
              </select>
            </div>
            <div v-if="transferTargetType === 'phone'" class="form-group">
              <label for="transfer-phone">Phone number</label>
              <input
                id="transfer-phone"
                v-model="transferToPhone"
                type="tel"
                class="input"
                placeholder="+1234567890"
                @keydown.enter="submitTransfer"
              />
            </div>
            <div v-else class="form-group">
              <label for="transfer-user">Provider / staff</label>
              <select id="transfer-user" v-model="transferToUserId" class="select">
                <option value="">Select a person…</option>
                <option v-for="u in transferTargets" :key="u.id" :value="u.id">
                  {{ u.label }} {{ u.role ? `(${formatRole(u.role)})` : '' }}
                </option>
              </select>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" @click="closeTransferModal">Cancel</button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="!canSubmitTransfer || transferLoading"
                @click="submitTransfer"
              >
                {{ transferLoading ? 'Transferring…' : 'Transfer' }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="activeTab === 'automation'">
        <div v-if="!isProviderOrSchoolStaff" class="toolbar">
          <div class="inline">
            <select v-model="platformChannel" class="select">
              <option value="email">Email</option>
              <option value="sms">Text</option>
            </select>
            <select v-model="platformStatus" class="select">
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="sent">Sent</option>
            </select>
            <button class="btn btn-secondary" @click="loadPlatform" :disabled="platformLoading">
              {{ platformLoading ? 'Loading…' : 'Refresh queue' }}
            </button>
          </div>
          <div v-if="isSuperAdmin" class="test-email-panel">
            <div class="inline">
              <input
                v-model.trim="testEmailTo"
                class="input test-email-input"
                type="email"
                placeholder="Recipient email for system test"
              />
              <select v-model="testSenderIdentityId" class="select test-identity-select" :disabled="senderIdentityOptionsLoading">
                <option value="">Auto sender (default)</option>
                <option v-for="identity in senderIdentityOptions" :key="`sender-${identity.id}`" :value="String(identity.id)">
                  {{ formatSenderIdentityOption(identity) }}
                </option>
              </select>
              <button class="btn btn-secondary" @click="createTestEmailDraft" :disabled="testEmailSending">
                {{ testEmailSending ? 'Working…' : 'Create test draft' }}
              </button>
              <button class="btn btn-primary" @click="sendTestEmailNow" :disabled="testEmailSending">
                {{ testEmailSending ? 'Sending…' : 'Send test email now' }}
              </button>
              <button class="btn btn-secondary" @click="runEmailPreflight" :disabled="testEmailPreflightLoading">
                {{ testEmailPreflightLoading ? 'Checking…' : 'Preflight check' }}
              </button>
            </div>
            <div class="test-email-hint">
              Superadmin only. Draft creates a pending automation item; Send now immediately tests delivery.
            </div>
            <div v-if="testEmailPreflightError" class="error-box preflight-box">{{ testEmailPreflightError }}</div>
            <div v-else-if="testEmailPreflightResult" class="preflight-box">
              <div class="top">
                <span class="badge ticket">PREFLIGHT</span>
                <span class="owner">Recipient: {{ testEmailPreflightResult.recipient || '—' }}</span>
                <span class="owner">Agency: {{ testEmailPreflightResult.agencyId || '—' }}</span>
                <span class="owner">Mode: {{ testEmailPreflightResult.sendingMode || '—' }}</span>
              </div>
              <div class="preflight-readiness">
                Send now: <strong>{{ testEmailPreflightResult.readyForSendNow ? 'READY' : 'NOT READY' }}</strong>
                · Automation: <strong>{{ testEmailPreflightResult.readyForAutomation ? 'READY' : 'NOT READY' }}</strong>
              </div>
              <div class="preflight-checks">
                <div
                  v-for="check in testEmailPreflightResult.checks || []"
                  :key="`check-${check.key}`"
                  class="preflight-check-row"
                >
                  <span class="preflight-status" :class="check.ok ? 'ok' : 'bad'">
                    {{ check.ok ? 'PASS' : 'FAIL' }}
                  </span>
                  <span class="preflight-label">{{ check.label }}</span>
                  <span class="preflight-detail">{{ check.detail }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="toolbar">
          <button class="btn btn-secondary" @click="loadPlatform" :disabled="platformLoading">
            {{ platformLoading ? 'Loading…' : 'Refresh' }}
          </button>
        </div>
        <div v-if="testEmailError" class="error-box">{{ testEmailError }}</div>
        <div v-if="testEmailSuccess" class="success-box">{{ testEmailSuccess }}</div>
        <div v-if="platformError" class="error-box">{{ platformError }}</div>
        <div v-else-if="platformLoading" class="loading">
          {{ isProviderOrSchoolStaff ? 'Loading your messages…' : 'Loading delivery queue…' }}
        </div>
        <div v-else-if="platformRows.length === 0" class="empty">
          {{ isProviderOrSchoolStaff ? 'No platform messages sent to you yet.' : 'No platform communications found.' }}
        </div>
        <div v-else class="list">
          <div v-for="c in platformRows" :key="`automation-${c.id}`" class="row">
            <div class="left">
              <div class="top">
                <span class="badge">{{ String(c.channel || 'msg').toUpperCase() }}</span>
                <span class="client">{{ c.subject || formatTemplateType(c.template_type) || 'Message' }}</span>
                <span class="owner">
                  {{ isProviderOrSchoolStaff ? 'To: me' : (c.recipient_address || c.user_email || '—') }}
                </span>
              </div>
              <div class="body">{{ c.body }}</div>
            </div>
            <div class="right">
              <div class="time">{{ formatTime(c.generated_at || c.created_at) }}</div>
              <span v-if="isProviderOrSchoolStaff" class="badge status">{{ String(c.delivery_status || 'sent').toUpperCase() }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="activeTab === 'proof'" class="compliance-proof">
        <div class="proof-card">
          <h3>Tenant feature toggle (demo)</h3>
          <p class="muted">
            Existing text transport controls are already available under Calls (Inbound texts / Outbound texts). This demo
            toggle is for Campaign 4 rollout planning and billing workflows.
          </p>
          <label class="proof-radio">
            <input type="checkbox" v-model="tenantTextingNotificationsFeatureEnabled" />
            Texting notifications feature enabled (ITSCO tenant demo)
          </label>
          <p class="proof-disclosure" v-if="tenantTextingNotificationsFeatureEnabled">
            Demo mode ON: campaign consent setup can be tested in screenshots and preferences without sending production texts.
          </p>
          <p class="proof-disclosure" v-else>
            Demo mode OFF: workforce/school staff consent workflows remain preview-only.
          </p>
        </div>

        <div class="proof-card">
          <h3>Deployment link examples (use for screenshots)</h3>
          <p class="muted">
            Show both deployments in consent proof screenshots so Twilio reviewers can see co-branded usage.
          </p>
          <div class="proof-deployment-grid">
            <div v-for="d in proofDeployments" :key="d.name" class="proof-deployment-item">
              <div><strong>{{ d.name }}</strong> ({{ d.base }})</div>
              <div>Terms: <a :href="d.terms" target="_blank" rel="noopener noreferrer">{{ d.terms }}</a></div>
              <div>Privacy: <a :href="d.privacy" target="_blank" rel="noopener noreferrer">{{ d.privacy }}</a></div>
              <div>Public Proof: <a :href="d.publicProof" target="_blank" rel="noopener noreferrer">{{ d.publicProof }}</a></div>
            </div>
          </div>
        </div>

        <div class="proof-card">
          <h3>Campaign 1 - Appointment Scheduling + Reminders (Transactional)</h3>
          <p class="muted">
            Use this section for screenshots showing the intake/portal yes-no opt-in controls and the required disclosure language.
          </p>
          <div class="proof-consent-block">
            <h4>Email Communication Preference *</h4>
            <p class="proof-disclosure">
              Please choose what you would like to receive emails from us. If you opt in, we may email you about
              scheduling, appointment reminders, and-if selected-updates about mental health programs and services.
              Your email will never be shared or sold to third parties, and you may unsubscribe at any time.
            </p>
            <label class="proof-radio"><input type="radio" disabled checked /> Yes - Scheduling + all program communications</label>
            <label class="proof-radio"><input type="radio" disabled /> Yes - Scheduling only</label>
            <label class="proof-radio"><input type="radio" disabled /> No</label>
          </div>
          <div class="proof-consent-block">
            <h4>Text Message (SMS) Communication Preference *</h4>
            <p class="proof-disclosure">
              Please choose what you would like to receive text messages from us. If you opt in, we may text you
              about scheduling, appointment reminders, and-if selected-updates about mental health programs and services.
              Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time.
              Reply HELP for help. Terms/Privacy links vary by deployment (see deployment examples above).
            </p>
            <label class="proof-radio"><input type="radio" disabled checked /> Yes - Scheduling + all program communications</label>
            <label class="proof-radio"><input type="radio" disabled /> Yes - Scheduling only</label>
            <label class="proof-radio"><input type="radio" disabled /> No - Do not text me</label>
          </div>
        </div>

        <div class="proof-card">
          <h3>Campaign 2 - Provider ↔ Client 1:1 Conversational Texting</h3>
          <div class="proof-consent-block">
            <h4>SMS With Your Provider/Care Team *</h4>
            <p class="proof-disclosure">
              If you choose Yes, we may text you for service-related communication with your provider/care team (for example,
              responding to your questions and coordinating care). Message frequency varies. Message and data rates may apply.
              Reply STOP to opt out at any time. Reply HELP for help. Appointment reminders/confirmations are not sent from
              individual provider numbers. Terms/Privacy links vary by deployment (see deployment examples above).
            </p>
            <label class="proof-radio"><input type="radio" disabled checked /> Yes - I opt in to provider/care-team texting</label>
            <label class="proof-radio"><input type="radio" disabled /> No - Keep provider texting off</label>
          </div>
          <div class="proof-message-preview">
            <h4>Client-initiated SMS auto-reply examples (tenant-branded)</h4>
            <div class="proof-two-col">
              <div class="proof-tenant-card">
                <h5>ITSCO</h5>
                <div class="proof-chat-bubble proof-chat-bubble--incoming">Hi, this is Laurie. Can I move tomorrow's appointment?</div>
                <div class="proof-chat-bubble proof-chat-bubble--outgoing">
                  ITSCO: Thanks for the text! Our new platform will allow you to message me privately via our app during my office hours.
                  Message frequency varies. Msg &amp; data rates may apply.
                  Reply STOP to opt out, HELP for help.
                </div>
              </div>
              <div class="proof-tenant-card">
                <h5>NextLevelUp</h5>
                <div class="proof-chat-bubble proof-chat-bubble--incoming">Hi, this is Laurie. Can I move tomorrow's appointment?</div>
                <div class="proof-chat-bubble proof-chat-bubble--outgoing">
                  NextLevelUp: Thanks for the text! Our new platform will allow you to message me privately via our app during my office hours.
                  Message frequency varies. Msg &amp; data rates may apply.
                  Reply STOP to opt out, HELP for help.
                </div>
              </div>
            </div>
          </div>
          <div class="proof-message-preview">
            <h4>Email example we send for new texting app transition</h4>
            <div class="proof-two-col">
              <div class="proof-tenant-card">
                <h5>ITSCO</h5>
                <div class="proof-email-example">
                  Subject: New texting app for your care-team communication
                  <br />
                  Hi, it's [provider_first], we have a new app that is managing all texting for us.
                  My number is [provider_number]. If you'd like to opt in to text me, please do so by texting my number.
                  If not, no worries, I will still be available via email.
                </div>
              </div>
              <div class="proof-tenant-card">
                <h5>NextLevelUp</h5>
                <div class="proof-email-example">
                  Subject: New texting app for your care-team communication
                  <br />
                  Hi, it's [provider_first], we have a new app that is managing all texting for us.
                  My number is [provider_number]. If you'd like to opt in to text me, please do so by texting my number.
                  If not, no worries, I will still be available via email.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="proof-card">
          <h3>Campaign 3 - Program/Service Opportunities (Opted-in Updates)</h3>
          <div class="proof-two-col">
            <div class="proof-tenant-card">
              <h5>ITSCO</h5>
              <div class="proof-consent-block">
                <h4>Optional Program &amp; Service Updates *</h4>
                <p class="proof-disclosure">
                  If you choose Yes, we may text you updates about additional programs and services we offer based on your interests
                  (for example: tutoring, parent classes, workshops, new enrollment opportunities, and other promotional service offerings).
                  Message frequency varies and is limited based on your preferences.
                  Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
                </p>
                <label class="proof-radio"><input type="radio" disabled checked /> Yes - I want optional updates</label>
                <label class="proof-radio"><input type="radio" disabled /> No - Keep optional updates off</label>
              </div>
            </div>
            <div class="proof-tenant-card">
              <h5>NextLevelUp</h5>
              <div class="proof-consent-block">
                <h4>Optional Program &amp; Service Updates *</h4>
                <p class="proof-disclosure">
                  If you choose Yes, we may text you updates about additional programs and services we offer based on your interests
                  (for example: tutoring, parent classes, workshops, new enrollment opportunities, and other promotional service offerings).
                  Message frequency varies and is limited based on your preferences.
                  Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
                </p>
                <label class="proof-radio"><input type="radio" disabled checked /> Yes - I want optional updates</label>
                <label class="proof-radio"><input type="radio" disabled /> No - Keep optional updates off</label>
              </div>
            </div>
          </div>
        </div>

        <div class="proof-card">
          <h3>Campaign 4 - Internal Workforce + School Staff Notifications (Opt-In)</h3>
          <div class="proof-two-col">
            <div class="proof-tenant-card">
              <h5>ITSCO workforce consent</h5>
              <div class="proof-consent-block">
                <h4>Operational workforce SMS notifications *</h4>
                <p class="proof-disclosure">
                  By opting in, you agree to receive SMS/text messages from ITSCO for operational notifications and reminders,
                  internal announcements, and optional polls/voting related to your participation. Message frequency varies.
                  Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
                  Support: 833-756-8894 ext. 701 | hq@plottwistco.com.
                </p>
                <label class="proof-radio"><input type="radio" disabled checked /> Yes - Opt in</label>
                <label class="proof-radio"><input type="radio" disabled /> No - Keep SMS off</label>
              </div>
            </div>
            <div class="proof-tenant-card">
              <h5>NextLevelUp workforce consent</h5>
              <div class="proof-consent-block">
                <h4>Operational workforce SMS notifications *</h4>
                <p class="proof-disclosure">
                  By opting in, you agree to receive SMS/text messages from NextLevelUp for operational notifications and reminders,
                  internal announcements, and optional polls/voting related to your participation. Message frequency varies.
                  Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
                  Support: 833-756-8894 ext. 701 | hq@plottwistco.com.
                </p>
                <label class="proof-radio"><input type="radio" disabled checked /> Yes - Opt in</label>
                <label class="proof-radio"><input type="radio" disabled /> No - Keep SMS off</label>
              </div>
            </div>
          </div>
          <div class="proof-two-col">
            <div class="proof-tenant-card">
              <h5>ITSCO employee</h5>
              <div class="proof-status-row">
                <span>Workforce SMS notifications</span>
                <span class="proof-status-badge proof-status-badge--on">Opted in</span>
              </div>
              <div class="proof-status-sub">Receives operational reminders, announcements, and voting texts.</div>
            </div>
            <div class="proof-tenant-card">
              <h5>NextLevelUp employee</h5>
              <div class="proof-status-row">
                <span>Workforce SMS notifications</span>
                <span class="proof-status-badge proof-status-badge--on">Opted in</span>
              </div>
              <div class="proof-status-sub">Receives operational reminders, announcements, and voting texts.</div>
            </div>
          </div>
          <div class="proof-two-col">
            <div class="proof-tenant-card">
              <h5>ITSCO school staff</h5>
              <div class="proof-status-row">
                <span>School staff operational SMS</span>
                <span class="proof-status-badge proof-status-badge--on">Opted in</span>
              </div>
              <div class="proof-status-sub">Receives reduced-access operational notifications and reminders.</div>
            </div>
            <div class="proof-tenant-card">
              <h5>Splash opt-in page example</h5>
              <div class="proof-email-example">
                SMS Notifications
                <br />
                [ ] Yes, I agree to receive operational SMS notifications and reminders
                <br />
                [ ] No, keep SMS notifications off
                <br />
                By opting in, you agree to receive SMS/text messages for operational notifications, internal announcements,
                and optional polls/voting related to your participation. Message frequency varies.
                Msg &amp; data rates may apply. Reply STOP to opt out. Reply HELP for help.
              </div>
            </div>
          </div>
          <div class="proof-message-preview">
            <h4>Onboarding opt-in example (new employees)</h4>
            <div class="proof-email-example">
              Welcome. To receive operational SMS notifications, select:
              <br />
              [ ] Yes, I opt in to workforce SMS notifications
              <br />
              Disclosure includes message frequency, rates, STOP/HELP, Terms, and Privacy links.
            </div>
          </div>
        </div>

        <div class="proof-card">
          <h3>Guardian/Client Preferences view</h3>
          <p class="muted">
            Example of how guardian/client communication preferences are shown clearly in profile settings.
          </p>
          <div class="proof-pref-grid">
            <div class="proof-status-row">
              <span>Email: Scheduling + all program communications</span>
              <span class="proof-status-badge proof-status-badge--on">Opted in</span>
            </div>
            <div class="proof-status-row">
              <span>SMS Scheduling</span>
              <span class="proof-status-badge proof-status-badge--on">Opted in</span>
            </div>
            <div class="proof-status-row">
              <span>Provider/Care Team SMS</span>
              <span class="proof-status-badge proof-status-badge--on">Opted in</span>
            </div>
            <div class="proof-status-row">
              <span>Program/Service Updates</span>
              <span class="proof-status-badge proof-status-badge--off">Opted out</span>
            </div>
          </div>
          <p class="proof-disclosure">
            Message frequency varies by client need and platform activity. Message and data rates may apply.
            Reply STOP to opt out. Reply HELP for help or contact 833-756-8894 ext. 701 / hq@plottwistco.com.
            Terms/Privacy/Public Proof links vary by deployment (see deployment examples above).
          </p>
        </div>
      </div>
      <div v-else>
        <div v-if="filteredRows.length === 0" class="empty">No communications yet.</div>
        <div v-else class="list" data-tour="comms-list">
        <button
          v-for="item in filteredRows"
          :key="itemKey(item)"
          class="row"
          data-tour="comms-row"
          @click="openItem(item)"
          :title="item.preview"
        >
          <div class="left">
            <div class="top">
              <span
                class="badge"
                :class="item.kind === 'chat' ? 'chat' : (item.kind === 'ticket' ? 'ticket' : (item.direction === 'INBOUND' ? 'in' : 'out'))"
              >
                {{ item.kind === 'chat' ? 'CHAT' : (item.kind === 'ticket' ? 'TICKET' : item.direction) }}
              </span>
              <span v-if="item.kind === 'chat'" class="client">
                {{ chatLabel(item) }}
              </span>
              <span v-else-if="item.kind === 'ticket'" class="client">
                School: {{ item.school_name || (item.school_organization_id ? `#${item.school_organization_id}` : '—') }}
              </span>
              <span v-else class="client">
                Client: {{ item.client_initials || '—' }}
              </span>
              <span v-if="item.kind === 'chat' && item.last_sender_role" class="owner">
                From: {{ formatRole(item.last_sender_role) }}
              </span>
              <span v-else-if="item.kind === 'ticket'" class="owner">
                Status: {{ String(item.status || 'open').toUpperCase() }}
              </span>
              <span v-else-if="item.kind === 'sms'" class="owner">
                Owner: {{ formatOwner(item) }}
              </span>
            </div>
            <div class="body">{{ item.preview }}</div>
          </div>
          <div class="right">
            <div class="time">{{ formatTime(itemTime(item)) }}</div>
            <div v-if="item.kind === 'chat' && Number(item.unread_count || 0) > 0" class="pill">
              {{ Number(item.unread_count) }}
            </div>
            <div v-else-if="item.kind === 'ticket' && String(item.status || '').toLowerCase() === 'open'" class="pill">
              NEW
            </div>
          </div>
        </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useCommunicationsCountsStore } from '../../store/communicationsCounts';
import { useRouter, useRoute } from 'vue-router';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const communicationsCountsStore = useCommunicationsCountsStore();
const router = useRouter();
const route = useRoute();

const loading = ref(true);
const error = ref('');
const rows = ref([]);
const callsLoading = ref(false);
const callsError = ref('');
const callsSuccessMessage = ref('');

const showCallsSuccess = (msg) => {
  callsSuccessMessage.value = msg;
  callsError.value = '';
  setTimeout(() => { callsSuccessMessage.value = ''; }, 3000);
};
const callsEnabled = ref(false);
const callRows = ref([]);
const callSettings = ref({
  inbound_enabled: true,
  outbound_enabled: true,
  sms_inbound_enabled: true,
  sms_outbound_enabled: true,
  forward_to_phone: '',
  allow_call_recording: false,
  voicemail_enabled: false,
  voicemail_message: '',
  provider_ring_timeout_seconds: 20
});
const savingCallSettings = ref(false);
const callAnalytics = ref({
  enabled: false,
  days: 30,
  summary: { total: 0, inbound: 0, outbound: 0, answered: 0, missed: 0, avgDurationSeconds: 0, voicemailCount: 0 },
  byStatus: []
});
const voicemailLoading = ref(false);
const voicemails = ref([]);
const voicemailAudioSrc = ref('');
const playingVoicemailId = ref(null);
const platformLoading = ref(false);
const platformError = ref('');
const platformRows = ref([]);
const platformChannel = ref('email');
const platformStatus = ref('pending');
const testEmailTo = ref('');
const testSenderIdentityId = ref('');
const senderIdentityOptionsLoading = ref(false);
const senderIdentityOptions = ref([]);
const testEmailSending = ref(false);
const testEmailSuccess = ref('');
const testEmailError = ref('');
const testEmailPreflightLoading = ref(false);
const testEmailPreflightError = ref('');
const testEmailPreflightResult = ref(null);
const schoolLoading = ref(false);
const schoolError = ref('');
const schoolRows = ref([]);

const transferModalOpen = ref(false);
const transferCallRef = ref(null);
const transferTargetType = ref('phone');
const transferToPhone = ref('');
const transferToUserId = ref('');
const transferTargets = ref([]);
const transferLoading = ref(false);
const transferError = ref('');

const canSubmitTransfer = computed(() => {
  if (transferTargetType.value === 'phone') return !!String(transferToPhone.value || '').trim();
  return !!transferToUserId.value;
});
const holdLoading = ref(null);
const resumeLoading = ref(null);
const playingRecordingId = ref(null);
const recordingAudioSrc = ref('');

const getCallRecordingSid = (c) => {
  const md = c?.metadata;
  if (!md) return null;
  try {
    const parsed = typeof md === 'object' ? md : JSON.parse(md || '{}');
    return parsed?.recording_sid || null;
  } catch {
    return null;
  }
};

const isCallOnHold = (c) => {
  const md = c?.metadata;
  if (!md) return false;
  if (typeof md === 'object') return md.is_on_hold === true || !!md.hold_resume_url;
  try {
    const parsed = typeof md === 'string' ? JSON.parse(md) : md;
    return parsed?.is_on_hold === true || !!parsed?.hold_resume_url;
  } catch {
    return false;
  }
};

const isActiveCall = (c) => {
  const sid = c?.twilio_call_sid || c?.sid;
  if (!sid) return false;
  const s = String(c?.status || c?.call_status || '').toLowerCase();
  return ['in-progress', 'ringing', 'initiating', 'queued'].includes(s);
};

const chatsLink = computed(() => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}/admin/communications/chats`;
  return '/admin/communications/chats';
});
const smsInboxLink = computed(() => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}/admin/communications/sms`;
  return '/admin/communications/sms';
});
const preferencesLink = computed(() => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}/preferences`;
  return '/preferences';
});
const textingSettingsLink = computed(() => {
  const slug = route.params.organizationSlug;
  const base = typeof slug === 'string' && slug ? `/${slug}/admin/settings` : '/admin/settings';
  return `${base}?category=system&item=sms-numbers`;
});
const canManageTexting = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'admin' || role === 'support' || role === 'super_admin' || role === 'clinical_practice_assistant';
});
const isProviderOrSchoolStaff = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'provider' || role === 'school_staff';
});
const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const currentAgencyId = computed(() => {
  const direct = agencyStore.currentAgency?.id || agencyStore.currentAgency?.value?.id;
  if (direct) return Number(direct);
  const list = agencyStore.userAgencies?.value || agencyStore.userAgencies || [];
  return Number(list?.[0]?.id || 0) || null;
});

const ticketsLink = computed(() => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}/tickets`;
  return '/tickets';
});
const pendingDeliveryCount = computed(() => Number(communicationsCountsStore.pendingDeliveryCount || 0));
const openTicketsCount = computed(() => Number(communicationsCountsStore.openTicketsCount || 0));
const proofDeployments = [
  {
    name: 'ITSCO',
    base: 'https://app.itsco.health',
    terms: 'https://app.itsco.health/terms',
    privacy: 'https://app.itsco.health/privacypolicy',
    publicProof: 'https://app.itsco.health/publicproof'
  },
  {
    name: 'NextLevelUp',
    base: 'https://app.nextlevelup.com',
    terms: 'https://app.nextlevelup.com/terms',
    privacy: 'https://app.nextlevelup.com/privacypolicy',
    publicProof: 'https://app.nextlevelup.com/publicproof'
  }
];
const tenantTextingNotificationsFeatureEnabled = ref(false);
const isPublicProofMode = computed(() => !authStore.isAuthenticated && activeTab.value === 'proof');

const activeTab = computed(() => {
  const defaultTab = authStore.isAuthenticated ? 'all' : 'proof';
  const t = String(route.query?.tab || defaultTab);
  if (t === 'texts') return 'texts';
  if (t === 'calls') return 'calls';
  if (t === 'automation') return 'automation';
  if (t === 'school') return 'school';
  if (t === 'proof') return 'proof';
  return 'all';
});

const setTab = (tab) => {
  const slug = route.params.organizationSlug;
  const path = typeof slug === 'string' && slug ? `/${slug}/admin/communications` : '/admin/communications';
  router.replace({ path, query: { ...route.query, tab } });
};

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
};

const formatOwner = (m) => {
  const li = (m.user_last_name || '').slice(0, 1);
  return `${m.user_first_name || ''} ${li ? li + '.' : ''}`.trim() || '—';
};

const formatTemplateType = (t) => {
  if (!t) return null;
  const s = String(t);
  if (s === 'company_event_vote') return 'Event vote / RSVP';
  if (s === 'reminder_sms') return 'Reminder text';
  return s.replace(/_/g, ' ');
};

const formatSenderIdentityOption = (identity) => {
  if (!identity) return 'Unknown sender';
  const key = String(identity.identity_key || '').trim();
  const from = String(identity.from_email || '').trim();
  const name = String(identity.display_name || '').trim();
  const primary = name ? `${name} <${from || 'no-from'}>` : (from || 'no-from');
  return key ? `${primary} (${key})` : primary;
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/communications/feed', { params: { limit: 75 } });
    rows.value = Array.isArray(resp.data) ? resp.data : [];
  } catch (e) {
    // Graceful fallback: if unified feed fails, load user-scoped SMS feed so texting still works.
    try {
      const fallback = await api.get('/messages/recent', { params: { limit: 75 } });
      const smsRows = Array.isArray(fallback.data) ? fallback.data : [];
      rows.value = smsRows.map((m) => ({
        kind: 'sms',
        id: Number(m.id),
        agency_id: m.agency_id ? Number(m.agency_id) : null,
        user_id: m.user_id ? Number(m.user_id) : null,
        client_id: m.client_id ? Number(m.client_id) : null,
        direction: m.direction || null,
        preview: String(m.body || ''),
        created_at: m.created_at,
        client_initials: m.client_initials || null,
        user_first_name: m.user_first_name || null,
        user_last_name: m.user_last_name || null
      }));
      error.value = '';
    } catch (fallbackErr) {
      error.value =
        e.response?.data?.error?.message ||
        fallbackErr.response?.data?.error?.message ||
        'Failed to load messages';
      rows.value = [];
    }
  } finally {
    loading.value = false;
  }
};

const loadCalls = async () => {
  try {
    callsLoading.value = true;
    callsError.value = '';
    const params = { limit: 75 };
    if (currentAgencyId.value) params.agencyId = currentAgencyId.value;
    const resp = await api.get('/communications/calls', { params });
    callsEnabled.value = resp.data?.enabled === true;
    callRows.value = Array.isArray(resp.data?.items) ? resp.data.items : [];
  } catch (e) {
    callsError.value = e.response?.data?.error?.message || 'Failed to load call activity';
    callsEnabled.value = false;
    callRows.value = [];
  } finally {
    callsLoading.value = false;
  }
};

const openTransferModal = async (c) => {
  transferCallRef.value = c;
  transferTargetType.value = 'phone';
  transferToPhone.value = '';
  transferToUserId.value = '';
  transferError.value = '';
  transferModalOpen.value = true;
  try {
    const params = {};
    if (currentAgencyId.value) params.agencyId = currentAgencyId.value;
    const resp = await api.get('/communications/calls/transfer-targets', { params });
    transferTargets.value = Array.isArray(resp.data?.users) ? resp.data.users : [];
  } catch {
    transferTargets.value = [];
  }
};

const closeTransferModal = () => {
  transferModalOpen.value = false;
  transferCallRef.value = null;
  transferTargetType.value = 'phone';
  transferToPhone.value = '';
  transferToUserId.value = '';
  transferError.value = '';
};

const submitTransfer = async () => {
  const call = transferCallRef.value;
  const sid = call?.twilio_call_sid || call?.sid;
  if (!sid) return;
  const body =
    transferTargetType.value === 'phone'
      ? { toPhone: String(transferToPhone.value || '').trim() }
      : { toUserId: Number(transferToUserId.value) };
  if (!body.toPhone && !body.toUserId) return;
  try {
    transferLoading.value = true;
    transferError.value = '';
    await api.post(`/communications/calls/transfer/${sid}`, body);
    closeTransferModal();
    showCallsSuccess('Call transferred');
    await loadCalls();
  } catch (e) {
    transferError.value = e.response?.data?.error?.message || 'Transfer failed';
  } finally {
    transferLoading.value = false;
  }
};

const holdCall = async (c) => {
  const sid = c?.twilio_call_sid || c?.sid;
  if (!sid) return;
  try {
    holdLoading.value = sid;
    callsError.value = '';
    await api.post(`/communications/calls/hold/${sid}`);
    showCallsSuccess('Call on hold');
    await loadCalls();
  } catch (e) {
    callsError.value = e.response?.data?.error?.message || 'Hold failed';
  } finally {
    holdLoading.value = null;
  }
};

const resumeCall = async (c) => {
  const sid = c?.twilio_call_sid || c?.sid;
  if (!sid) return;
  try {
    resumeLoading.value = sid;
    callsError.value = '';
    await api.post(`/communications/calls/hold/${sid}/resume`, {});
    showCallsSuccess('Call resumed');
    await loadCalls();
  } catch (e) {
    callsError.value = e.response?.data?.error?.message || 'Resume failed';
  } finally {
    resumeLoading.value = null;
  }
};

const playCallRecording = async (c) => {
  if (!c?.id) return;
  try {
    playingRecordingId.value = c.id;
    const resp = await api.get(`/communications/calls/${c.id}/recording`, { responseType: 'blob' });
    if (recordingAudioSrc.value) URL.revokeObjectURL(recordingAudioSrc.value);
    recordingAudioSrc.value = URL.createObjectURL(resp.data);
  } catch (e) {
    callsError.value = e.response?.data?.error?.message || 'Failed to load recording';
  } finally {
    playingRecordingId.value = null;
  }
};

const loadCallSettings = async () => {
  try {
    const resp = await api.get('/communications/calls/settings');
    callSettings.value = {
      inbound_enabled: resp.data?.inbound_enabled !== false,
      outbound_enabled: resp.data?.outbound_enabled !== false,
      sms_inbound_enabled: resp.data?.sms_inbound_enabled !== false,
      sms_outbound_enabled: resp.data?.sms_outbound_enabled !== false,
      forward_to_phone: resp.data?.forward_to_phone || '',
      allow_call_recording: resp.data?.allow_call_recording === true,
      voicemail_enabled: resp.data?.voicemail_enabled === true,
      voicemail_message: resp.data?.voicemail_message || '',
      provider_ring_timeout_seconds: Number(resp.data?.provider_ring_timeout_seconds || 20) || 20
    };
  } catch {
    // keep defaults to avoid blocking calls tab
  }
};

const saveCallSettings = async () => {
  try {
    savingCallSettings.value = true;
    callsError.value = '';
    await api.put('/communications/calls/settings', {
      inbound_enabled: callSettings.value.inbound_enabled,
      outbound_enabled: callSettings.value.outbound_enabled,
      sms_inbound_enabled: callSettings.value.sms_inbound_enabled,
      sms_outbound_enabled: callSettings.value.sms_outbound_enabled,
      forward_to_phone: callSettings.value.forward_to_phone || null,
      allow_call_recording: callSettings.value.allow_call_recording,
      voicemail_enabled: callSettings.value.voicemail_enabled,
      voicemail_message: callSettings.value.voicemail_message || null
    });
  } catch (e) {
    callsError.value = e.response?.data?.error?.message || 'Failed to save call settings';
  } finally {
    savingCallSettings.value = false;
  }
};

const loadCallAnalytics = async () => {
  try {
    const params = { days: 30 };
    if (currentAgencyId.value) params.agencyId = currentAgencyId.value;
    const resp = await api.get('/communications/calls/analytics', { params });
    callAnalytics.value = {
      enabled: resp.data?.enabled === true,
      days: Number(resp.data?.days || 30) || 30,
      summary: {
        total: Number(resp.data?.summary?.total || 0),
        inbound: Number(resp.data?.summary?.inbound || 0),
        outbound: Number(resp.data?.summary?.outbound || 0),
        answered: Number(resp.data?.summary?.answered || 0),
        missed: Number(resp.data?.summary?.missed || 0),
        avgDurationSeconds: Number(resp.data?.summary?.avgDurationSeconds || 0),
        voicemailCount: Number(resp.data?.summary?.voicemailCount || 0)
      },
      byStatus: Array.isArray(resp.data?.byStatus) ? resp.data.byStatus : []
    };
  } catch {
    // Keep calls tab functional even if analytics is unavailable
  }
};

const loadVoicemails = async () => {
  try {
    voicemailLoading.value = true;
    const params = { days: 30, limit: 100 };
    if (currentAgencyId.value) params.agencyId = currentAgencyId.value;
    const resp = await api.get('/communications/calls/voicemails', { params });
    voicemails.value = Array.isArray(resp.data) ? resp.data : [];
  } catch {
    voicemails.value = [];
  } finally {
    voicemailLoading.value = false;
  }
};

const playVoicemail = async (vm) => {
  if (!vm?.id) return;
  try {
    playingVoicemailId.value = vm.id;
    const resp = await api.get(`/communications/calls/voicemails/${vm.id}/audio`, { responseType: 'blob' });
    if (voicemailAudioSrc.value) {
      URL.revokeObjectURL(voicemailAudioSrc.value);
    }
    voicemailAudioSrc.value = URL.createObjectURL(resp.data);
  } catch (e) {
    callsError.value = e.response?.data?.error?.message || 'Failed to load voicemail audio';
  } finally {
    playingVoicemailId.value = null;
  }
};

const loadPlatform = async () => {
  try {
    platformLoading.value = true;
    platformError.value = '';
    if (isProviderOrSchoolStaff.value) {
      const userId = authStore.user?.id;
      if (!userId) {
        platformRows.value = [];
        return;
      }
      const params = { limit: 100 };
      if (currentAgencyId.value) params.agencyId = currentAgencyId.value;
      const resp = await api.get(`/users/${userId}/communications`, { params });
      platformRows.value = Array.isArray(resp.data) ? resp.data : [];
    } else {
      if (!currentAgencyId.value) {
        platformRows.value = [];
        return;
      }
      const params = {
        agencyId: currentAgencyId.value,
        channel: platformChannel.value,
        status: platformStatus.value
      };
      const resp = await api.get('/communications/pending', { params });
      platformRows.value = Array.isArray(resp.data) ? resp.data : [];
    }
  } catch (e) {
    platformError.value = e.response?.data?.error?.message || 'Failed to load platform communications';
    platformRows.value = [];
  } finally {
    platformLoading.value = false;
  }
};

const loadSenderIdentityOptions = async () => {
  if (!isSuperAdmin.value) return;
  if (!currentAgencyId.value) {
    senderIdentityOptions.value = [];
    testSenderIdentityId.value = '';
    return;
  }
  try {
    senderIdentityOptionsLoading.value = true;
    const resp = await api.get('/email-senders', {
      params: {
        agencyId: currentAgencyId.value,
        includePlatformDefaults: true
      }
    });
    const rows = Array.isArray(resp.data) ? resp.data : [];
    senderIdentityOptions.value = rows.filter((r) => Number(r?.is_active) === 1);
    if (testSenderIdentityId.value) {
      const stillExists = senderIdentityOptions.value.some((r) => String(r.id) === String(testSenderIdentityId.value));
      if (!stillExists) testSenderIdentityId.value = '';
    }
  } catch {
    senderIdentityOptions.value = [];
    testSenderIdentityId.value = '';
  } finally {
    senderIdentityOptionsLoading.value = false;
  }
};

const runSystemTestEmail = async (queueOnly) => {
  testEmailError.value = '';
  testEmailSuccess.value = '';
  testEmailPreflightError.value = '';
  try {
    testEmailSending.value = true;
    const payload = {
      to: String(testEmailTo.value || '').trim() || undefined,
      agencyId: currentAgencyId.value || undefined,
      senderIdentityId: testSenderIdentityId.value ? Number(testSenderIdentityId.value) : undefined,
      queueOnly: Boolean(queueOnly)
    };
    const resp = await api.post('/communications/test-email', payload);
    if (queueOnly) {
      testEmailSuccess.value = 'Test automation draft created. Approve it from the queue when ready.';
    } else {
      testEmailSuccess.value = `Test email sent${resp.data?.communication?.recipient_address ? ` to ${resp.data.communication.recipient_address}` : ''}.`;
    }
    await loadPlatform();
  } catch (e) {
    testEmailError.value = e.response?.data?.error?.message || 'Failed to run email system test';
    if (e.response?.data?.communication) await loadPlatform();
  } finally {
    testEmailSending.value = false;
  }
};

const createTestEmailDraft = async () => {
  await runSystemTestEmail(true);
};

const sendTestEmailNow = async () => {
  await runSystemTestEmail(false);
};

const runEmailPreflight = async () => {
  testEmailPreflightError.value = '';
  testEmailPreflightResult.value = null;
  try {
    testEmailPreflightLoading.value = true;
    const payload = {
      to: String(testEmailTo.value || '').trim() || undefined,
      agencyId: currentAgencyId.value || undefined,
      senderIdentityId: testSenderIdentityId.value ? Number(testSenderIdentityId.value) : undefined
    };
    const resp = await api.post('/communications/test-email/preflight', payload);
    testEmailPreflightResult.value = resp.data || null;
  } catch (e) {
    testEmailPreflightError.value = e.response?.data?.error?.message || 'Failed to run preflight checks';
  } finally {
    testEmailPreflightLoading.value = false;
  }
};

const normalizeProgress = (raw) => {
  if (raw && typeof raw === 'object' && raw.by_org) return raw;
  const legacy = raw && typeof raw === 'object' ? raw : {};
  return { by_org: legacy, by_org_kind: {}, by_org_client_kind: {} };
};

const loadSchoolNotifications = async () => {
  try {
    schoolLoading.value = true;
    schoolError.value = '';
    schoolRows.value = [];

    await agencyStore.fetchUserAgencies();
    const current = agencyStore.currentAgency?.value || agencyStore.currentAgency;
    const userAgencies = agencyStore.userAgencies?.value || agencyStore.userAgencies || [];
    const agencyId = current?.id || userAgencies?.[0]?.id;
    if (!agencyId) {
      schoolError.value = 'No agency found for this user.';
      return;
    }

    const prefResp = await api.get(`/users/${authStore.user?.id}/preferences`);
    const progress = normalizeProgress(prefResp.data?.school_portal_notifications_progress || null);

    const overview = await api.get('/dashboard/school-overview', { params: { agencyId } });
    const schools = Array.isArray(overview.data?.schools) ? overview.data.schools : [];

    const feeds = await Promise.all(
      schools.map(async (s) => {
        const orgId = s.school_id;
        if (!orgId) return [];
        try {
          const resp = await api.get(`/school-portal/${orgId}/notifications/feed`);
          const list = Array.isArray(resp.data) ? resp.data : [];
          return list.map((it) => ({
            ...it,
            school_id: orgId,
            school_name: s.school_name,
            school_slug: s.school_slug,
            preview: String(it.message || '').trim()
          }));
        } catch {
          return [];
        }
      })
    );

    const toMs = (v) => {
      try {
        const t = v ? new Date(v).getTime() : 0;
        return Number.isFinite(t) ? t : 0;
      } catch {
        return 0;
      }
    };

    const withUnread = feeds.flat().map((it) => {
      const orgKey = String(it.school_id || '');
      const kind = String(it.kind || '').toLowerCase();
      const clientId = it.client_id ? String(it.client_id) : '';
      const byClient = progress?.by_org_client_kind?.[orgKey] || {};
      const byKind = progress?.by_org_kind?.[orgKey] || {};
      const orgSeen = progress?.by_org?.[orgKey] || null;
      const lastSeen = clientId ? (byClient?.[clientId]?.[kind] || byKind?.[kind] || orgSeen) : (byKind?.[kind] || orgSeen);
      const isUnread = toMs(it.created_at) > toMs(lastSeen);
      return { ...it, is_unread: isUnread };
    });

    schoolRows.value = withUnread
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 300);
  } catch (e) {
    schoolError.value = e.response?.data?.error?.message || 'Failed to load school notifications';
  } finally {
    schoolLoading.value = false;
  }
};

const itemKey = (i) => {
  if (i.kind === 'chat') return `chat-${i.thread_id}`;
  if (i.kind === 'ticket') return `ticket-${i.id}`;
  if (i.school_id) return `school-${i.school_id}-${i.kind}-${i.id}`;
  return `sms-${i.id}`;
};

const itemTime = (i) => (i.kind === 'chat' ? (i.last_message_at || i.updated_at) : i.created_at);

const formatRole = (r) => {
  const s = String(r || '').replace(/_/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '—';
};

const chatLabel = (i) => {
  const other = i.other_participant;
  const who = other ? `${other.first_name || ''} ${other.last_name || ''}`.trim() : `Thread #${i.thread_id}`;
  const org = i.organization_name ? ` · ${i.organization_name}` : '';
  return `${who}${org}`;
};

const openItem = async (i) => {
  if (i.kind === 'ticket') {
    const q = {};
    if (i.school_organization_id) q.schoolOrganizationId = String(i.school_organization_id);
    q.status = 'open';
    if (i.id) q.ticketId = String(i.id);
    const slug = route.params.organizationSlug;
    const path = typeof slug === 'string' && slug ? `/${slug}/tickets` : '/tickets';
    router.push({ path, query: q });
    return;
  }
  if (i.kind === 'sms') {
    if (!i.user_id || !i.client_id) return;
    const slug = route.params.organizationSlug;
    if (typeof slug === 'string' && slug) {
      router.push({ path: `/${slug}/admin/communications/sms`, query: { clientId: String(i.client_id) } });
    } else {
      router.push({ path: '/admin/communications/sms', query: { clientId: String(i.client_id) } });
    }
    return;
  }
  // Chat: go to chats UI and auto-open the thread.
  const threadId = i.thread_id;
  if (!threadId) return;
  const slug = i.organization_slug || route.params.organizationSlug;
  if (typeof slug === 'string' && slug) {
    router.push({ path: `/${slug}/admin/communications/chats`, query: { threadId: String(threadId), agencyId: String(i.agency_id || '') } });
  } else {
    router.push({ path: '/admin/communications/chats', query: { threadId: String(threadId), agencyId: String(i.agency_id || '') } });
  }
};

const openSchoolItem = async (i) => {
  const slug = i.school_slug;
  if (!slug) return;
  const query = { sp: 'notifications' };
  if (i.client_id) query.clientId = String(i.client_id);
  if (i.kind === 'comment') query.notif = 'comments';
  if (i.kind === 'message') query.notif = 'messages';
  router.push({ path: `/${slug}/dashboard`, query });
};

const markSchoolRead = async (i) => {
  if (!i.school_id) return;
  const kind = String(i.kind || '').toLowerCase();
  await api.post(`/school-portal/${i.school_id}/notifications/read`, {
    kind: kind || undefined,
    clientId: i.client_id || undefined
  });
  schoolRows.value = (schoolRows.value || []).map((row) => (
    row.school_id === i.school_id && String(row.id) === String(i.id) ? { ...row, is_unread: false } : row
  ));
};

const schoolBadgeLabel = (i) => {
  const kind = String(i.kind || '').toLowerCase();
  if (kind === 'ticket') return 'SCHOOL TICKET';
  if (kind === 'message') return 'SCHOOL MESSAGE';
  if (kind === 'comment') return 'SCHOOL COMMENT';
  if (kind === 'announcement') return 'ANNOUNCEMENT';
  if (kind === 'checklist') return 'CHECKLIST';
  if (kind === 'status') return 'STATUS';
  if (kind === 'assignment') return 'ASSIGNMENT';
  if (kind === 'client_created') return 'NEW CLIENT';
  if (kind === 'provider_slots') return 'SLOTS';
  if (kind === 'provider_day') return 'PROVIDER DAY';
  if (kind === 'doc') return 'DOC/LINK';
  return 'SCHOOL';
};

const schoolBadgeClass = (i) => {
  const kind = String(i.kind || '').toLowerCase();
  if (kind === 'ticket') return 'school-ticket';
  if (kind === 'message') return 'school-message';
  if (kind === 'comment') return 'school-comment';
  if (kind === 'announcement') return 'school-announcement';
  if (kind === 'checklist') return 'school-checklist';
  if (kind === 'status') return 'school-status';
  if (kind === 'assignment') return 'school-assignment';
  if (kind === 'client_created') return 'school-client';
  if (kind === 'provider_slots' || kind === 'provider_day') return 'school-provider';
  if (kind === 'doc') return 'school-doc';
  return 'school-default';
};

const refreshActive = async () => {
  if (activeTab.value === 'school') {
    await loadSchoolNotifications();
  } else if (activeTab.value === 'calls') {
    await Promise.all([loadCalls(), loadCallAnalytics(), loadVoicemails()]);
  } else if (activeTab.value === 'automation') {
    await loadPlatform();
  } else if (activeTab.value === 'proof') {
    return;
  } else {
    await load();
  }
};

const filteredRows = computed(() => {
  if (activeTab.value === 'texts') {
    return rows.value.filter((r) => r.kind === 'sms');
  }
  return rows.value;
});

onMounted(async () => {
  if (!authStore.isAuthenticated) {
    if (activeTab.value === 'proof') {
      loading.value = false;
      error.value = '';
      return;
    }
    router.push('/login');
    return;
  }
  void communicationsCountsStore.fetchCounts();
  await load();
  await Promise.all([loadCalls(), loadCallAnalytics(), loadVoicemails()]);
  await loadCallSettings();
  if (activeTab.value === 'school') await loadSchoolNotifications();
  if (activeTab.value === 'automation') await loadPlatform();
  testEmailTo.value = String(authStore.user?.email || authStore.user?.work_email || '').trim();
  await loadSenderIdentityOptions();
});

watch(activeTab, async (tab) => {
  if (tab === 'school' && schoolRows.value.length === 0 && !schoolLoading.value) {
    await loadSchoolNotifications();
  }
  if (tab === 'calls' && callRows.value.length === 0 && !callsLoading.value) {
    await Promise.all([loadCalls(), loadCallAnalytics(), loadVoicemails()]);
  }
  if (tab === 'automation' && platformRows.value.length === 0 && !platformLoading.value) {
    await loadPlatform();
  }
});

watch([platformChannel, platformStatus, currentAgencyId], async () => {
  if (!authStore.isAuthenticated) return;
  if (activeTab.value === 'automation') await loadPlatform();
});

watch([currentAgencyId, isSuperAdmin], async () => {
  if (!authStore.isAuthenticated) return;
  await loadSenderIdentityOptions();
});

onBeforeUnmount(() => {
  if (voicemailAudioSrc.value) URL.revokeObjectURL(voicemailAudioSrc.value);
  if (recordingAudioSrc.value) URL.revokeObjectURL(recordingAudioSrc.value);
});
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 14px;
}
.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.tabs {
  display: inline-flex;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px;
}
.tab {
  border: none;
  background: transparent;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  color: var(--text-secondary);
}
.tab.active {
  background: var(--bg);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
.subtitle { color: var(--text-secondary); margin: 6px 0 0 0; }
.delivery-alert-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 14px;
  background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 80%, transparent) 100%);
  color: white;
  border-radius: 12px;
  font-weight: 500;
}
.delivery-alert-banner .btn { flex-shrink: 0; }
.tab-badge, .header-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  background: var(--accent);
  color: white;
  border-radius: 999px;
}
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.calls-settings-card {
  margin-bottom: 12px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.input {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}
.metric {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}
.actions {
  margin-top: 10px;
}
.toolbar {
  margin-bottom: 10px;
}
.test-email-panel {
  margin-top: 10px;
  padding: 10px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg) 75%, white);
}
.test-email-input {
  min-width: 280px;
}
.test-identity-select {
  min-width: 320px;
}
.test-email-hint {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}
.preflight-box {
  margin-top: 10px;
}
.preflight-readiness {
  margin-top: 8px;
  font-size: 12px;
}
.preflight-checks {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preflight-check-row {
  display: grid;
  grid-template-columns: 48px 220px 1fr;
  gap: 8px;
  align-items: start;
  font-size: 12px;
}
.preflight-status.ok {
  color: #2e7d32;
  font-weight: 700;
}
.preflight-status.bad {
  color: #c62828;
  font-weight: 700;
}
.preflight-label {
  color: var(--text-primary);
}
.preflight-detail {
  color: var(--text-secondary);
}
.inline {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  border: 1px solid var(--border);
  background: white;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
}
.row.call-row {
  cursor: default;
}
.row.unread {
  border-color: rgba(14, 165, 233, 0.5);
  background: rgba(14, 165, 233, 0.08);
}
.badge.school-ticket {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.35);
  color: #1d4ed8;
}
.badge.school-message {
  background: rgba(155, 81, 224, 0.12);
  border-color: rgba(155, 81, 224, 0.35);
  color: #6a2aa3;
}
.badge.school-comment {
  background: rgba(45, 156, 219, 0.12);
  border-color: rgba(45, 156, 219, 0.35);
  color: #1b6fa0;
}
.badge.school-announcement {
  background: rgba(249, 115, 22, 0.12);
  border-color: rgba(249, 115, 22, 0.35);
  color: #9a3412;
}
.badge.school-checklist {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
  color: #065f46;
}
.badge.school-status {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
  color: #92400e;
}
.badge.school-assignment {
  background: rgba(14, 116, 144, 0.12);
  border-color: rgba(14, 116, 144, 0.35);
  color: #0e7490;
}
.badge.school-client {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
  color: #047857;
}
.badge.school-provider {
  background: rgba(79, 70, 229, 0.12);
  border-color: rgba(79, 70, 229, 0.35);
  color: #4338ca;
}
.badge.school-doc {
  background: rgba(100, 116, 139, 0.12);
  border-color: rgba(100, 116, 139, 0.35);
  color: #334155;
}
.badge.school-default {
  background: rgba(15, 23, 42, 0.08);
  border-color: rgba(15, 23, 42, 0.2);
  color: #334155;
}
.btn-xs {
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1;
}
.top {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: var(--text-secondary);
  font-size: 12px;
}
.badge {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 600;
}
.badge.in { background: rgba(253,176,34,0.15); }
.badge.out { background: rgba(23,178,106,0.15); }
.badge.ticket { background: rgba(108,117,125,0.12); }
.body {
  margin-top: 6px;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.transcription {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.right {
  min-width: 220px;
  text-align: right;
  color: var(--text-secondary);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.call-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.recording-row {
  margin-top: 6px;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.transfer-modal {
  background: white;
  border-radius: 12px;
  padding: 20px 24px;
  width: 360px;
  max-width: 92vw;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}
.transfer-modal h3 {
  margin: 0 0 8px;
  font-size: 18px;
}
.modal-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-secondary);
}
.transfer-modal .form-group {
  margin-bottom: 16px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.badge.status {
  font-size: 10px;
  padding: 2px 6px;
}
.time { font-weight: 600; color: var(--text-primary); }
.numbers { margin-top: 6px; }
.empty { color: var(--text-secondary); padding: 18px 6px; }
.success-box {
  background: #e8f5e9;
  border: 1px solid #a5d6a7;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
  color: #2e7d32;
}
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.compliance-proof {
  display: grid;
  gap: 14px;
}
.proof-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  background: #fff;
}
.proof-card h3 {
  margin: 0 0 10px;
}
.proof-consent-block {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-alt);
  padding: 12px;
  margin-top: 10px;
}
.proof-consent-block h4 {
  margin: 0 0 8px;
}
.proof-disclosure {
  margin: 0 0 8px;
  color: var(--text-secondary);
  line-height: 1.45;
}
.proof-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.proof-message-preview {
  margin-top: 10px;
}
.proof-message-preview h4 {
  margin: 0 0 8px;
}
.proof-two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.proof-tenant-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
}
.proof-tenant-card h5 {
  margin: 0 0 8px;
}
.proof-status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
  margin-top: 6px;
}
.proof-status-badge {
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.proof-status-badge--on {
  background: rgba(16, 185, 129, 0.14);
  color: #047857;
  border: 1px solid rgba(16, 185, 129, 0.4);
}
.proof-status-badge--off {
  background: rgba(148, 163, 184, 0.18);
  color: #475569;
  border: 1px solid rgba(148, 163, 184, 0.45);
}
.proof-status-sub {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}
.proof-chat-bubble {
  border-radius: 10px;
  padding: 10px 12px;
  margin-top: 6px;
  max-width: 680px;
}
.proof-chat-bubble--incoming {
  border: 1px solid var(--border);
  background: #fff;
}
.proof-chat-bubble--outgoing {
  border: 1px solid #cce5ff;
  background: #eaf5ff;
}
.proof-email-example {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
  line-height: 1.45;
}
.proof-pref-grid {
  display: grid;
  gap: 6px;
  margin: 10px 0;
}
.proof-deployment-grid {
  display: grid;
  gap: 10px;
}
.proof-deployment-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
  line-height: 1.5;
}
@media (max-width: 900px) {
  .proof-two-col {
    grid-template-columns: 1fr;
  }
}
.loading { color: var(--text-secondary); }
</style>

