<template>
  <div class="billing-management">
    <div class="section-header">
      <h2>Billing</h2>
      <p class="section-description">
        Transparent billing breakdown and QuickBooks integration.
      </p>
    </div>
    
    <div v-if="!currentAgencyId" class="placeholder-content">
      <div class="placeholder-icon">💳</div>
      <h3>Select an Agency</h3>
      <p>Choose an agency context to view billing details.</p>
      <div class="agency-picker" v-if="billingAgencies.length > 0">
        <input
          v-model="agencySearch"
          class="input"
          type="text"
          placeholder="Search agencies…"
        />
        <select v-model="selectedAgencyId" class="select">
          <option value="">Select an agency…</option>
          <option v-for="a in filteredBillingAgencies" :key="a.id" :value="String(a.id)">
            {{ a.name }} ({{ a.slug }})
          </option>
        </select>
        <button class="btn" :disabled="!selectedAgencyId" @click="applyAgencySelection">
          View Billing
        </button>
      </div>

      <div v-if="isSuperAdmin" class="card" style="margin-top: 16px; text-align: left;">
        <h3>Platform Billing Merchant</h3>
        <p class="muted">Connect the platform QuickBooks account here before assigning agencies to platform-managed subscription billing.</p>
        <div class="status-grid">
          <div>
            <div class="label">Connection</div>
            <div class="value">
              <span :class="['pill', platformQboStatus?.isConnected ? 'pill-on' : 'pill-off']">
                {{ platformQboStatus?.isConnected ? 'Connected' : 'Not connected' }}
              </span>
            </div>
          </div>
          <div>
            <div class="label">Payments</div>
            <div class="value">
              <span :class="['pill', platformQboStatus?.paymentsEnabled ? 'pill-on' : 'pill-off']">
                {{ platformQboStatus?.paymentsEnabled ? 'Payments ready' : 'Reconnect required' }}
              </span>
            </div>
          </div>
          <div>
            <div class="label">Action</div>
            <div class="inline">
              <button
                v-if="!platformQboStatus?.isConnected || platformQboStatus?.needsReconnectForPayments"
                class="btn"
                :disabled="connectingPlatformQbo"
                @click="connectPlatformQuickBooks"
              >
                {{ connectingPlatformQbo ? 'Redirecting…' : (platformQboStatus?.needsReconnectForPayments ? 'Reconnect For Payments' : 'Connect QuickBooks') }}
              </button>
              <button v-else class="btn btn-danger" :disabled="disconnectingPlatformQbo" @click="disconnectPlatformQuickBooks">
                {{ disconnectingPlatformQbo ? 'Disconnecting…' : 'Disconnect' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isSuperAdmin" class="card" style="margin-top: 16px; text-align: left;">
        <h3>Platform Default Pricing (Super Admin)</h3>
        <p class="muted">These defaults apply to all agencies unless overridden per agency.</p>

        <div v-if="pricingError" class="error">{{ pricingError }}</div>

        <div class="pricing-grid">
          <div class="form-group">
            <div class="label">Base Fee ($/month)</div>
            <input v-model.number="platformDraft.baseFeeDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Included Schools</div>
            <input v-model.number="platformDraft.includedSchools" class="input" type="number" step="1" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Programs</div>
            <input v-model.number="platformDraft.includedPrograms" class="input" type="number" step="1" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Admins</div>
            <input v-model.number="platformDraft.includedAdmins" class="input" type="number" step="1" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Active Candidates</div>
            <input v-model.number="platformDraft.includedActiveOnboardees" class="input" type="number" step="1" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Unit Cost: School ($/mo)</div>
            <input v-model.number="platformDraft.unitSchoolDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Program ($/mo)</div>
            <input v-model.number="platformDraft.unitProgramDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Admin ($/mo)</div>
            <input v-model.number="platformDraft.unitAdminDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Active Candidate ($/mo)</div>
            <input v-model.number="platformDraft.unitOnboardeeDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Phone Number ($/mo)</div>
            <input v-model.number="platformDraft.unitPhoneNumberDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">SMS Cost: Outbound to Clients ($/msg)</div>
            <input v-model.number="platformDraft.smsOutboundClientDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">SMS Cost: Inbound from Clients ($/msg)</div>
            <input v-model.number="platformDraft.smsInboundClientDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">SMS Cost: Notification SMS ($/msg)</div>
            <input v-model.number="platformDraft.smsNotificationDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: SMS Outbound ($/msg)</div>
            <input v-model.number="platformDraft.smsOutboundClientActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: SMS Outbound ($/msg)</div>
            <input v-model.number="platformDraft.smsOutboundClientMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: SMS Inbound ($/msg)</div>
            <input v-model.number="platformDraft.smsInboundClientActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: SMS Inbound ($/msg)</div>
            <input v-model.number="platformDraft.smsInboundClientMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: Notification SMS ($/msg)</div>
            <input v-model.number="platformDraft.smsNotificationActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: Notification SMS ($/msg)</div>
            <input v-model.number="platformDraft.smsNotificationMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: Phone Number ($/month)</div>
            <input v-model.number="platformDraft.phoneNumberActualDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: Phone Number ($/month)</div>
            <input v-model.number="platformDraft.phoneNumberMarkupDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: Voice Outbound ($/minute)</div>
            <input v-model.number="platformDraft.voiceOutboundMinuteActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: Voice Outbound ($/minute)</div>
            <input v-model.number="platformDraft.voiceOutboundMinuteMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: Voice Inbound ($/minute)</div>
            <input v-model.number="platformDraft.voiceInboundMinuteActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: Voice Inbound ($/minute)</div>
            <input v-model.number="platformDraft.voiceInboundMinuteMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: Video ($/participant minute)</div>
            <input v-model.number="platformDraft.videoParticipantMinuteActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: Video ($/participant minute)</div>
            <input v-model.number="platformDraft.videoParticipantMinuteMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Add-on: Public Availability ($/month)</div>
            <input v-model.number="platformDraft.publicAvailabilityAddonMonthlyDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Add-on: Momentum List ($/person/month)</div>
            <input v-model.number="platformDraft.momentumListAddonUnitDollars" class="input" type="number" step="0.01" min="0" :disabled="pricingLoading || pricingSaving" />
          </div>
        </div>

        <div style="display:flex; gap: 10px; margin-top: 12px;">
          <button class="btn" type="button" @click="savePlatformPricing" :disabled="pricingLoading || pricingSaving">
            {{ pricingSaving ? 'Saving…' : 'Save platform pricing' }}
          </button>
          <button class="btn btn-secondary" type="button" @click="loadPlatformPricing" :disabled="pricingLoading || pricingSaving">
            {{ pricingLoading ? 'Loading…' : 'Reload' }}
          </button>
        </div>
      </div>
    </div>

    <div v-else class="content">
      <div v-if="banner" class="banner" :class="banner.kind">
        <strong>{{ banner.title }}</strong>
        <span>{{ banner.message }}</span>
      </div>

      <div v-if="isSuperAdmin" class="card">
        <h3>Platform Billing</h3>
        <p class="muted">This connection is used when an agency’s subscription is billed through the platform merchant account.</p>
        <div class="status-grid">
          <div>
            <div class="label">Connection</div>
            <div class="value">
              <span :class="['pill', platformQboStatus?.isConnected ? 'pill-on' : 'pill-off']">
                {{ platformQboStatus?.isConnected ? 'Connected' : 'Not connected' }}
              </span>
            </div>
          </div>
          <div>
            <div class="label">Payments</div>
            <div class="value">
              <span :class="['pill', platformQboStatus?.paymentsEnabled ? 'pill-on' : 'pill-off']">
                {{ platformQboStatus?.paymentsEnabled ? 'Payments ready' : 'Reconnect required' }}
              </span>
            </div>
          </div>
          <div>
            <div class="label">Merchant Controls</div>
            <div class="inline">
              <button
                v-if="!platformQboStatus?.isConnected || platformQboStatus?.needsReconnectForPayments"
                class="btn"
                :disabled="connectingPlatformQbo"
                @click="connectPlatformQuickBooks"
              >
                {{ connectingPlatformQbo ? 'Redirecting…' : (platformQboStatus?.needsReconnectForPayments ? 'Reconnect For Payments' : 'Connect QuickBooks') }}
              </button>
              <button v-else class="btn btn-danger" :disabled="disconnectingPlatformQbo" @click="disconnectPlatformQuickBooks">
                {{ disconnectingPlatformQbo ? 'Disconnecting…' : 'Disconnect' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isSuperAdmin" class="card">
        <h3>Pricing (Super Admin)</h3>
        <p class="muted">Set global defaults and optionally override pricing for this agency.</p>

        <div v-if="pricingError" class="error">{{ pricingError }}</div>

        <div class="inline" style="align-items: end; margin-bottom: 12px;">
          <div style="flex: 1;">
            <div class="label">Agency override enabled</div>
            <select v-model="agencyOverrideEnabled" class="select" :disabled="pricingLoading || pricingSaving">
              <option :value="false">No (use platform defaults)</option>
              <option :value="true">Yes (override for this agency)</option>
            </select>
          </div>
          <button class="btn btn-secondary" type="button" @click="loadAgencyPricing" :disabled="pricingLoading || pricingSaving">
            {{ pricingLoading ? 'Loading…' : 'Reload' }}
          </button>
        </div>

        <div class="pricing-grid">
          <div class="form-group">
            <div class="label">Base Fee ($/month)</div>
            <input v-model.number="agencyDraft.baseFeeDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Included Schools</div>
            <input v-model.number="agencyDraft.includedSchools" class="input" type="number" step="1" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Programs</div>
            <input v-model.number="agencyDraft.includedPrograms" class="input" type="number" step="1" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Admins</div>
            <input v-model.number="agencyDraft.includedAdmins" class="input" type="number" step="1" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Included Active Candidates</div>
            <input v-model.number="agencyDraft.includedActiveOnboardees" class="input" type="number" step="1" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Unit Cost: School ($/mo)</div>
            <input v-model.number="agencyDraft.unitSchoolDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Program ($/mo)</div>
            <input v-model.number="agencyDraft.unitProgramDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Admin ($/mo)</div>
            <input v-model.number="agencyDraft.unitAdminDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Active Candidate ($/mo)</div>
            <input v-model.number="agencyDraft.unitOnboardeeDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Unit Cost: Phone Number ($/mo)</div>
            <input v-model.number="agencyDraft.unitPhoneNumberDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">SMS Cost: Outbound to Clients ($/msg)</div>
            <input v-model.number="agencyDraft.smsOutboundClientDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">SMS Cost: Inbound from Clients ($/msg)</div>
            <input v-model.number="agencyDraft.smsInboundClientDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">SMS Cost: Notification SMS ($/msg)</div>
            <input v-model.number="agencyDraft.smsNotificationDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: SMS Outbound ($/msg)</div>
            <input v-model.number="agencyDraft.smsOutboundClientActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: SMS Outbound ($/msg)</div>
            <input v-model.number="agencyDraft.smsOutboundClientMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: SMS Inbound ($/msg)</div>
            <input v-model.number="agencyDraft.smsInboundClientActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: SMS Inbound ($/msg)</div>
            <input v-model.number="agencyDraft.smsInboundClientMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: Notification SMS ($/msg)</div>
            <input v-model.number="agencyDraft.smsNotificationActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: Notification SMS ($/msg)</div>
            <input v-model.number="agencyDraft.smsNotificationMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: Phone Number ($/month)</div>
            <input v-model.number="agencyDraft.phoneNumberActualDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: Phone Number ($/month)</div>
            <input v-model.number="agencyDraft.phoneNumberMarkupDollars" class="input" type="number" step="0.01" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: Voice Outbound ($/minute)</div>
            <input v-model.number="agencyDraft.voiceOutboundMinuteActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: Voice Outbound ($/minute)</div>
            <input v-model.number="agencyDraft.voiceOutboundMinuteMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: Voice Inbound ($/minute)</div>
            <input v-model.number="agencyDraft.voiceInboundMinuteActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: Voice Inbound ($/minute)</div>
            <input v-model.number="agencyDraft.voiceInboundMinuteMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Twilio Cost: Video ($/participant minute)</div>
            <input v-model.number="agencyDraft.videoParticipantMinuteActualDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>
          <div class="form-group">
            <div class="label">Markup: Video ($/participant minute)</div>
            <input v-model.number="agencyDraft.videoParticipantMinuteMarkupDollars" class="input" type="number" step="0.0001" min="0" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving" />
          </div>

          <div class="form-group">
            <div class="label">Add-on: Public Availability</div>
            <select v-model="agencyDraft.publicAvailabilityAddonEnabled" class="select" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving">
              <option :value="false">Disabled</option>
              <option :value="true">Enabled (billed monthly)</option>
            </select>
          </div>
          <div class="form-group">
            <div class="label">Add-on: Momentum List</div>
            <select v-model="agencyDraft.momentumListAddonEnabled" class="select" :disabled="!agencyOverrideEnabled || pricingLoading || pricingSaving">
              <option :value="false">Disabled</option>
              <option :value="true">Enabled ($5/person, active employees)</option>
            </select>
          </div>
        </div>

        <div style="display:flex; gap: 10px; margin-top: 12px;">
          <button class="btn" type="button" @click="saveAgencyPricingOverride" :disabled="pricingLoading || pricingSaving">
            {{ pricingSaving ? 'Saving…' : (agencyOverrideEnabled ? 'Save agency override' : 'Clear agency override') }}
          </button>
        </div>
      </div>

      <div class="card">
        <h3>Current Plan Status</h3>
        <div class="status-grid">
          <div>
            <div class="label">Current Bill (Estimated)</div>
            <div class="big">{{ estimate ? money(estimate.totals.totalCents) : '—' }}</div>
          </div>
          <div>
            <div class="label">Billing Cycle</div>
            <div class="value">{{ estimate?.billingCycle?.label || '—' }}</div>
          </div>
          <div>
            <div class="label">Billing Merchant</div>
            <div class="value">
              <span :class="['pill', 'pill-on']">
                {{ merchantModeLabel }}
              </span>
            </div>
          </div>
          <div>
            <div class="label">Payments</div>
            <div class="value">
              <span :class="['pill', qboStatus?.paymentsEnabled ? 'pill-on' : 'pill-off']">
                {{ qboStatus?.paymentsEnabled ? 'Payments ready' : 'Reconnect required' }}
              </span>
            </div>
          </div>
          <div>
            <div class="label">Connection Source</div>
            <div class="value">{{ agencyBillingConnectionLabel }}</div>
          </div>
        </div>
        <div v-if="estimateError" class="error">{{ estimateError }}</div>
      </div>

      <div class="card">
        <h3>Usage Breakdown</h3>
        <p class="muted">Only “Active Candidates” (users in ONBOARDING) count toward active onboardee billing.</p>

        <table class="table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Included</th>
              <th>Currently Used</th>
              <th>Overage</th>
              <th>Unit Cost</th>
              <th>Total Extra</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in breakdownRows" :key="row.key">
              <td>{{ row.label }}</td>
              <td>{{ row.included }}</td>
              <td>{{ row.used }}</td>
              <td>{{ row.overage }}</td>
              <td>{{ row.unitCost }}</td>
              <td>{{ row.extra }}</td>
            </tr>
            <tr class="base-row">
              <td>Platform Base</td>
              <td>—</td>
              <td>—</td>
              <td>—</td>
              <td>{{ estimate ? money(estimate.totals.baseFeeCents) : '—' }}</td>
              <td>{{ estimate ? money(estimate.totals.baseFeeCents) : '—' }}</td>
            </tr>
            <tr class="total-row">
              <td colspan="5"><strong>TOTAL</strong></td>
              <td><strong>{{ estimate ? money(estimate.totals.totalCents) : '—' }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Management</h3>
        <div class="manage-grid">
          <div>
            <div class="label">Subscription Merchant</div>
            <div class="inline">
              <select v-model="subscriptionMerchantMode" class="select">
                <option value="agency_managed">Agency-owned QuickBooks</option>
                <option value="platform_managed">Platform-owned QuickBooks</option>
              </select>
              <button class="btn" :disabled="savingSettings" @click="saveBillingSettings">
                {{ savingSettings ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>

          <div>
            <div class="label">Billing Email</div>
            <div class="inline">
              <input v-model="billingEmail" class="input" type="email" placeholder="accounting@agency.com" />
              <button class="btn" :disabled="savingSettings" @click="saveBillingSettings">
                {{ savingSettings ? 'Saving…' : 'Update' }}
              </button>
            </div>
          </div>

          <div>
            <div class="label">Collection Flow</div>
            <div class="inline">
              <select v-model="autopayEnabled" class="select">
                <option :value="true">Autopay when card on file</option>
                <option :value="false">Invoice manually</option>
              </select>
              <button class="btn" :disabled="savingSettings" @click="saveBillingSettings">
                {{ savingSettings ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>

          <div>
            <div class="label">QuickBooks Connection</div>
            <div v-if="subscriptionMerchantMode === 'agency_managed'" class="inline">
              <button
                v-if="!qboStatus?.isConnected || qboStatus?.needsReconnectForPayments"
                class="btn"
                :disabled="connectingQbo"
                @click="connectQuickBooks"
              >
                {{ connectingQbo ? 'Redirecting…' : (qboStatus?.needsReconnectForPayments ? 'Reconnect For Payments' : 'Connect QuickBooks') }}
              </button>
              <button v-else class="btn btn-danger" :disabled="disconnectingQbo" @click="disconnectQuickBooks">
                {{ disconnectingQbo ? 'Disconnecting…' : 'Disconnect' }}
              </button>
            </div>
            <div v-else class="value">
              This agency uses the platform billing merchant. Cards and invoice collection run through the platform QuickBooks connection.
            </div>
          </div>

          <div>
            <div class="label">Invoices</div>
            <div class="inline">
              <button class="btn" :disabled="generatingInvoice" @click="generateInvoice">
                {{ generatingInvoice ? 'Generating…' : 'Generate Invoice' }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="manageError" class="error">{{ manageError }}</div>
        <div v-if="qboStatus?.needsReconnectForPayments" class="error" style="margin-top: 10px;">
          {{ subscriptionMerchantMode === 'platform_managed'
            ? 'The platform QuickBooks merchant is connected for accounting, but still needs Payments access before cards on file or autopay will work.'
            : 'QuickBooks is connected for accounting, but this agency still needs to reconnect with QuickBooks Payments access before cards on file or autopay will work.' }}
        </div>

        <div class="card" style="margin-top: 16px;">
          <AgencyStripeConnectSection
            v-if="currentAgencyId"
            :agency-id="currentAgencyId"
            @status-changed="onStripeStatusChanged"
          />
        </div>

        <div class="card" style="margin-top: 16px;">
          <h4 style="margin: 0 0 10px 0;">Payment Methods</h4>
          <p class="muted">Cards on file are used only for this agency’s subscription billing. They are stored under the currently selected billing merchant.</p>
          <div class="manage-grid">
            <div>
              <div class="label">Cardholder Name</div>
              <input v-model="paymentMethodDraft.name" class="input" type="text" placeholder="Billing contact name" />
            </div>
            <div>
              <div class="label">Card Number</div>
              <input v-model="paymentMethodDraft.number" class="input" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="4111111111111111" />
            </div>
            <div>
              <div class="label">Exp Month</div>
              <input v-model="paymentMethodDraft.expMonth" class="input" type="number" min="1" max="12" autocomplete="cc-exp-month" placeholder="12" />
            </div>
            <div>
              <div class="label">Exp Year</div>
              <input v-model="paymentMethodDraft.expYear" class="input" type="number" min="2024" max="2100" autocomplete="cc-exp-year" placeholder="2028" />
            </div>
            <div>
              <div class="label">CVC</div>
              <input v-model="paymentMethodDraft.cvc" class="input" type="password" inputmode="numeric" autocomplete="cc-csc" placeholder="123" />
            </div>
            <div>
              <div class="label">Postal Code</div>
              <input v-model="paymentMethodDraft.postalCode" class="input" type="text" autocomplete="postal-code" placeholder="12345" />
            </div>
            <div>
              <div class="label">Default</div>
              <select v-model="paymentMethodDraft.isDefault" class="select">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
            </div>
            <div class="inline" style="align-items: end;">
              <button class="btn" :disabled="addingPaymentMethod || !qboStatus?.paymentsEnabled" @click="addPaymentMethod">
                {{ addingPaymentMethod ? 'Saving…' : 'Add Billing Card' }}
              </button>
            </div>
          </div>

          <div v-if="paymentMethods.length === 0" class="empty" style="margin-top: 10px;">No payment methods saved yet.</div>
          <table v-else class="table" style="margin-top: 10px;">
            <thead>
              <tr>
                <th>Card</th>
                <th>Expires</th>
                <th>Default</th>
                <th style="width: 160px;"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="method in paymentMethods" :key="method.id">
                <td>{{ method.card_brand || 'Card' }} ending in {{ method.last4 || '----' }}</td>
                <td>{{ method.exp_month || '—' }}/{{ method.exp_year || '—' }}</td>
                <td>
                  <span :class="['pill', method.is_default ? 'pill-on' : 'pill-off']">
                    {{ method.is_default ? 'Default' : 'Saved' }}
                  </span>
                </td>
                <td class="actions">
                  <button
                    class="btn btn-secondary"
                    :disabled="method.is_default || settingDefaultPaymentMethodId === method.id"
                    @click="setDefaultPaymentMethod(method.id)"
                  >
                    {{ settingDefaultPaymentMethodId === method.id ? 'Updating…' : 'Make Default' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="invoices.length === 0" class="empty">No invoices yet.</div>
        <table v-else class="table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Total</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Delivery</th>
              <th>QuickBooks Invoice</th>
              <th style="width: 260px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="inv in invoices" :key="inv.id">
              <td class="mono">{{ inv.period_start }} - {{ inv.period_end }}</td>
              <td>{{ money(inv.total_cents) }}</td>
              <td>
                <span :class="['pill', inv.status === 'sent' || inv.status === 'paid' ? 'pill-on' : ['failed', 'payment_failed'].includes(inv.status) ? 'pill-bad' : 'pill-off']">
                  {{ inv.status }}
                </span>
              </td>
              <td class="mono">{{ inv.payment_status || 'unpaid' }}</td>
              <td class="mono">{{ inv.invoice_delivery_status || 'not_sent' }}</td>
              <td class="mono">{{ inv.qbo_invoice_id || '—' }}</td>
              <td class="actions">
                <button
                  v-if="inv.payment_status !== 'paid' && autopayEnabled"
                  class="btn btn-secondary"
                  :disabled="retryingInvoiceId === inv.id || !qboStatus?.paymentsEnabled"
                  @click="retryInvoicePayment(inv.id)"
                >
                  {{ retryingInvoiceId === inv.id ? 'Retrying…' : 'Retry Autopay' }}
                </button>
                <button
                  v-if="inv.payment_status !== 'paid'"
                  class="btn btn-secondary"
                  :disabled="sendingInvoiceId === inv.id || !inv.qbo_invoice_id"
                  @click="sendInvoice(inv.id)"
                >
                  {{ sendingInvoiceId === inv.id ? 'Sending…' : 'Send Invoice' }}
                </button>
                <button class="btn" @click="downloadPdf(inv.id)" :disabled="!inv.pdf_storage_path">
                  Download PDF
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>Linked Schools (for billing)</h3>
        <p class="muted">
          These schools count toward your billing “Schools” usage. Link schools even before any clients exist.
        </p>

        <div class="row">
          <input
            v-model="schoolSearch"
            class="input"
            type="text"
            placeholder="Search schools by name or slug…"
            @input="debouncedLoadAvailableSchools"
          />
          <select v-model="selectedSchoolId" class="select">
            <option value="">Select a school…</option>
            <option v-for="s in availableSchools" :key="s.id" :value="String(s.id)">
              {{ s.name }} ({{ s.slug }})
            </option>
          </select>
          <button class="btn" :disabled="!selectedSchoolId || linking" @click="linkSelectedSchool">
            {{ linking ? 'Linking…' : 'Link School' }}
          </button>
        </div>

        <div v-if="error" class="error">{{ error }}</div>

        <div v-if="linkedSchools.length === 0" class="empty">
          No schools linked yet.
        </div>

        <table v-else class="table">
          <thead>
            <tr>
              <th>School</th>
              <th>Slug</th>
              <th>Status</th>
              <th style="width: 120px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in linkedSchools" :key="row.id">
              <td>{{ row.school_name }}</td>
              <td class="mono">{{ row.school_slug }}</td>
              <td>
                <span :class="['pill', row.is_active ? 'pill-on' : 'pill-off']">
                  {{ row.is_active ? 'Linked' : 'Unlinked' }}
                </span>
              </td>
              <td class="actions">
                <button class="btn btn-danger" :disabled="unlinkingId === row.school_organization_id" @click="unlink(row.school_organization_id)">
                  {{ unlinkingId === row.school_organization_id ? 'Unlinking…' : 'Unlink' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="currentAgencyId" class="card">
        <h3>Organization link requests</h3>
        <p class="muted">
          To link a school or program that already belongs to another agency, the organization must approve your request first.
          After they approve, use “Link School” again.
        </p>
        <div v-if="affiliationOutgoingLoading" class="muted">Loading…</div>
        <div v-else-if="affiliationOutgoingError" class="error">{{ affiliationOutgoingError }}</div>
        <ul v-else-if="affiliationOutgoingRequests.length" class="table" style="list-style: none; padding: 0; margin: 0;">
          <li
            v-for="r in affiliationOutgoingRequests"
            :key="r.id"
            style="padding: 8px 0; border-bottom: 1px solid var(--border);"
          >
            <strong>{{ r.organization_name }}</strong>
            <span class="mono muted" style="margin-left: 8px;">{{ r.organization_slug }}</span>
            — <span class="pill" :class="r.status === 'pending' ? 'pill-warn' : 'pill-off'">{{ r.status }}</span>
          </li>
        </ul>
        <p v-else class="muted">No outgoing requests.</p>
        <p v-if="affiliationConsentHint" class="hint" style="margin-top: 12px;">
          {{ affiliationConsentHint }}
          <button
            v-if="pendingAffiliationOrgId"
            type="button"
            class="btn btn-secondary"
            style="margin-left: 8px;"
            :disabled="requestingAffiliation"
            @click="submitAffiliationRequestForPendingOrg"
          >
            {{ requestingAffiliation ? 'Submitting…' : 'Request approval' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import AgencyStripeConnectSection from './AgencyStripeConnectSection.vue';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();

const currentAgencyId = computed(() => agencyStore.currentAgency?.id || null);
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');
const agencySearch = ref('');
const selectedAgencyId = ref('');

const normalizeText = (v) => String(v || '').trim().toLowerCase();
const billingAgencies = computed(() => {
  const list = agencyStore.agencies || agencyStore.userAgencies || [];
  return [...list]
    .filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => normalizeText(a?.name).localeCompare(normalizeText(b?.name)));
});

const filteredBillingAgencies = computed(() => {
  const q = normalizeText(agencySearch.value);
  if (!q) return billingAgencies.value;
  return billingAgencies.value.filter((a) => {
    const hay = `${normalizeText(a?.name)} ${normalizeText(a?.slug)} ${normalizeText(a?.portal_url)}`;
    return hay.includes(q);
  });
});

const applyAgencySelection = async () => {
  const id = parseInt(selectedAgencyId.value, 10);
  if (!id) return;
  const agency = billingAgencies.value.find((a) => a.id === id);
  if (!agency) return;
  agencyStore.setCurrentAgency(agency);
};

const applyAgencyFromQuery = () => {
  const raw = route.query.agencyId;
  const id = parseInt(String(raw || ''), 10);
  if (!id) return false;
  const agency = billingAgencies.value.find((a) => a.id === id);
  if (!agency) return false;
  selectedAgencyId.value = String(id);
  agencyStore.setCurrentAgency(agency);
  return true;
};

const estimate = ref(null);
const estimateError = ref('');
const qboStatus = ref(null);
const platformQboStatus = ref(null);
const invoices = ref([]);
const billingEmail = ref('');
const autopayEnabled = ref(false);
const subscriptionMerchantMode = ref('agency_managed');
const clientPaymentsMode = ref('not_configured');
const paymentMethods = ref([]);
const manageError = ref('');

const savingSettings = ref(false);
const connectingQbo = ref(false);
const disconnectingQbo = ref(false);
const connectingPlatformQbo = ref(false);
const disconnectingPlatformQbo = ref(false);
const generatingInvoice = ref(false);
const addingPaymentMethod = ref(false);
const settingDefaultPaymentMethodId = ref(null);
const retryingInvoiceId = ref(null);
const sendingInvoiceId = ref(null);

const banner = ref(null);

const pricingLoading = ref(false);
const pricingSaving = ref(false);
const pricingError = ref('');

const platformDraft = ref({
  baseFeeDollars: 0,
  includedSchools: 0,
  includedPrograms: 0,
  includedAdmins: 0,
  includedActiveOnboardees: 0,
  unitSchoolDollars: 0,
  unitProgramDollars: 0,
  unitAdminDollars: 0,
  unitOnboardeeDollars: 0,
  unitPhoneNumberDollars: 0,
  smsOutboundClientDollars: 0,
  smsInboundClientDollars: 0,
  smsNotificationDollars: 0,
  smsOutboundClientActualDollars: 0,
  smsOutboundClientMarkupDollars: 0,
  smsInboundClientActualDollars: 0,
  smsInboundClientMarkupDollars: 0,
  smsNotificationActualDollars: 0,
  smsNotificationMarkupDollars: 0,
  phoneNumberActualDollars: 0,
  phoneNumberMarkupDollars: 0,
  voiceOutboundMinuteActualDollars: 0,
  voiceOutboundMinuteMarkupDollars: 0,
  voiceInboundMinuteActualDollars: 0,
  voiceInboundMinuteMarkupDollars: 0,
  videoParticipantMinuteActualDollars: 0,
  videoParticipantMinuteMarkupDollars: 0,
  publicAvailabilityAddonMonthlyDollars: 0,
  momentumListAddonUnitDollars: 5,
  momentumListAddonEnabled: false
});

const agencyOverrideEnabled = ref(false);
const agencyDraft = ref({
  baseFeeDollars: 0,
  includedSchools: 0,
  includedPrograms: 0,
  includedAdmins: 0,
  includedActiveOnboardees: 0,
  unitSchoolDollars: 0,
  unitProgramDollars: 0,
  unitAdminDollars: 0,
  unitOnboardeeDollars: 0,
  unitPhoneNumberDollars: 0,
  smsOutboundClientDollars: 0,
  smsInboundClientDollars: 0,
  smsNotificationDollars: 0,
  smsOutboundClientActualDollars: 0,
  smsOutboundClientMarkupDollars: 0,
  smsInboundClientActualDollars: 0,
  smsInboundClientMarkupDollars: 0,
  smsNotificationActualDollars: 0,
  smsNotificationMarkupDollars: 0,
  phoneNumberActualDollars: 0,
  phoneNumberMarkupDollars: 0,
  voiceOutboundMinuteActualDollars: 0,
  voiceOutboundMinuteMarkupDollars: 0,
  voiceInboundMinuteActualDollars: 0,
  voiceInboundMinuteMarkupDollars: 0,
  videoParticipantMinuteActualDollars: 0,
  videoParticipantMinuteMarkupDollars: 0,
  publicAvailabilityAddonEnabled: false,
  momentumListAddonEnabled: false
});

const paymentMethodDraft = ref({
  name: '',
  number: '',
  expMonth: '',
  expYear: '',
  cvc: '',
  postalCode: '',
  isDefault: true
});

const linkedSchools = ref([]);
const availableSchools = ref([]);
const selectedSchoolId = ref('');
const schoolSearch = ref('');
const error = ref('');

const linking = ref(false);
const unlinkingId = ref(null);
const affiliationOutgoingRequests = ref([]);
const affiliationOutgoingLoading = ref(false);
const affiliationOutgoingError = ref('');
const affiliationConsentHint = ref('');
const pendingAffiliationOrgId = ref(null);
const requestingAffiliation = ref(false);

const money = (cents) => {
  const v = Number(cents || 0) / 100;
  return `$${v.toFixed(2)}`;
};

const merchantModeLabel = computed(() => subscriptionMerchantMode.value === 'platform_managed' ? 'Platform-managed' : 'Agency-managed');
const clientPaymentsModeLabel = computed(() => {
  if (clientPaymentsMode.value === 'agency_managed') return 'Agency-owned setup';
  if (clientPaymentsMode.value === 'platform_managed') return 'Platform-assisted setup';
  return 'Not configured';
});
const agencyBillingConnectionLabel = computed(() => {
  if (!qboStatus.value) return 'Not configured';
  return qboStatus.value.connectionOwnerType === 'platform' ? 'Platform QuickBooks' : 'Agency QuickBooks';
});

const dollarsToCents = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
};

const setDraftFromPricing = (draftRef, pricing) => {
  const p = pricing || {};
  const comm = p.communicationRateCents || {};
  draftRef.value = {
    baseFeeDollars: Number(p.baseFeeCents || 0) / 100,
    includedSchools: Number(p.included?.schools || 0),
    includedPrograms: Number(p.included?.programs || 0),
    includedAdmins: Number(p.included?.admins || 0),
    includedActiveOnboardees: Number(p.included?.activeOnboardees || 0),
    unitSchoolDollars: Number(p.unitCents?.school || 0) / 100,
    unitProgramDollars: Number(p.unitCents?.program || 0) / 100,
    unitAdminDollars: Number(p.unitCents?.admin || 0) / 100,
    unitOnboardeeDollars: Number(p.unitCents?.onboardee || 0) / 100,
    unitPhoneNumberDollars: Number(p.unitCents?.phoneNumber || 0) / 100,
    smsOutboundClientDollars: Number(p.smsUnitCents?.outboundClient || 0) / 100,
    smsInboundClientDollars: Number(p.smsUnitCents?.inboundClient || 0) / 100,
    smsNotificationDollars: Number(p.smsUnitCents?.notification || 0) / 100,
    smsOutboundClientActualDollars: Number(comm.smsOutboundClient?.actualCostCents || 0) / 100,
    smsOutboundClientMarkupDollars: Number(comm.smsOutboundClient?.markupCents || 0) / 100,
    smsInboundClientActualDollars: Number(comm.smsInboundClient?.actualCostCents || 0) / 100,
    smsInboundClientMarkupDollars: Number(comm.smsInboundClient?.markupCents || 0) / 100,
    smsNotificationActualDollars: Number(comm.smsNotification?.actualCostCents || 0) / 100,
    smsNotificationMarkupDollars: Number(comm.smsNotification?.markupCents || 0) / 100,
    phoneNumberActualDollars: Number(comm.phoneNumberMonthly?.actualCostCents || 0) / 100,
    phoneNumberMarkupDollars: Number(comm.phoneNumberMonthly?.markupCents || 0) / 100,
    voiceOutboundMinuteActualDollars: Number(comm.voiceOutboundMinute?.actualCostCents || 0) / 100,
    voiceOutboundMinuteMarkupDollars: Number(comm.voiceOutboundMinute?.markupCents || 0) / 100,
    voiceInboundMinuteActualDollars: Number(comm.voiceInboundMinute?.actualCostCents || 0) / 100,
    voiceInboundMinuteMarkupDollars: Number(comm.voiceInboundMinute?.markupCents || 0) / 100,
    videoParticipantMinuteActualDollars: Number(comm.videoParticipantMinute?.actualCostCents || 0) / 100,
    videoParticipantMinuteMarkupDollars: Number(comm.videoParticipantMinute?.markupCents || 0) / 100,
    publicAvailabilityAddonMonthlyDollars: Number(p.addonsUnitCents?.publicAvailability || 0) / 100,
    publicAvailabilityAddonEnabled: Boolean(p.addonsEnabled?.publicAvailability),
    momentumListAddonUnitDollars: Number(p.addonsUnitCents?.momentumList || 0) / 100,
    momentumListAddonEnabled: Boolean(p.addonsEnabled?.momentumList)
  };
};

const buildPricingPayloadFromDraft = (draft) => {
  const d = draft || {};
  const smsOutboundBillable = dollarsToCents(d.smsOutboundClientActualDollars) + dollarsToCents(d.smsOutboundClientMarkupDollars);
  const smsInboundBillable = dollarsToCents(d.smsInboundClientActualDollars) + dollarsToCents(d.smsInboundClientMarkupDollars);
  const smsNotificationBillable = dollarsToCents(d.smsNotificationActualDollars) + dollarsToCents(d.smsNotificationMarkupDollars);
  const phoneNumberBillable = dollarsToCents(d.phoneNumberActualDollars) + dollarsToCents(d.phoneNumberMarkupDollars);
  return {
    baseFeeCents: dollarsToCents(d.baseFeeDollars),
    included: {
      schools: Math.max(0, parseInt(d.includedSchools || 0, 10) || 0),
      programs: Math.max(0, parseInt(d.includedPrograms || 0, 10) || 0),
      admins: Math.max(0, parseInt(d.includedAdmins || 0, 10) || 0),
      activeOnboardees: Math.max(0, parseInt(d.includedActiveOnboardees || 0, 10) || 0)
    },
    unitCents: {
      school: dollarsToCents(d.unitSchoolDollars),
      program: dollarsToCents(d.unitProgramDollars),
      admin: dollarsToCents(d.unitAdminDollars),
      onboardee: dollarsToCents(d.unitOnboardeeDollars),
      phoneNumber: phoneNumberBillable || dollarsToCents(d.unitPhoneNumberDollars)
    },
    smsUnitCents: {
      inboundClient: smsInboundBillable || dollarsToCents(d.smsInboundClientDollars),
      outboundClient: smsOutboundBillable || dollarsToCents(d.smsOutboundClientDollars),
      notification: smsNotificationBillable || dollarsToCents(d.smsNotificationDollars)
    },
    communicationRateCents: {
      smsOutboundClient: {
        actualCostCents: dollarsToCents(d.smsOutboundClientActualDollars),
        markupCents: dollarsToCents(d.smsOutboundClientMarkupDollars)
      },
      smsInboundClient: {
        actualCostCents: dollarsToCents(d.smsInboundClientActualDollars),
        markupCents: dollarsToCents(d.smsInboundClientMarkupDollars)
      },
      smsNotification: {
        actualCostCents: dollarsToCents(d.smsNotificationActualDollars),
        markupCents: dollarsToCents(d.smsNotificationMarkupDollars)
      },
      phoneNumberMonthly: {
        actualCostCents: dollarsToCents(d.phoneNumberActualDollars),
        markupCents: dollarsToCents(d.phoneNumberMarkupDollars)
      },
      voiceOutboundMinute: {
        actualCostCents: dollarsToCents(d.voiceOutboundMinuteActualDollars),
        markupCents: dollarsToCents(d.voiceOutboundMinuteMarkupDollars)
      },
      voiceInboundMinute: {
        actualCostCents: dollarsToCents(d.voiceInboundMinuteActualDollars),
        markupCents: dollarsToCents(d.voiceInboundMinuteMarkupDollars)
      },
      videoParticipantMinute: {
        actualCostCents: dollarsToCents(d.videoParticipantMinuteActualDollars),
        markupCents: dollarsToCents(d.videoParticipantMinuteMarkupDollars)
      }
    },
    addonsUnitCents: {
      publicAvailability: dollarsToCents(d.publicAvailabilityAddonMonthlyDollars),
      momentumList: dollarsToCents(d.momentumListAddonUnitDollars)
    },
    addonsEnabled: {
      publicAvailability: Boolean(d.publicAvailabilityAddonEnabled),
      momentumList: Boolean(d.momentumListAddonEnabled)
    }
  };
};

const breakdownRows = computed(() => {
  const items = estimate.value?.lineItems || [];
  return items.map(it => ({
    key: it.key,
    label: it.label,
    included: it.included,
    used: it.used,
    overage: it.overage,
    unitCost: `$${(Number(it.unitCostCents || 0) / 100).toFixed(2)}`,
    extra: money(it.extraCents)
  }));
});

let searchTimer = null;
const debouncedLoadAvailableSchools = () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadAvailableSchools(), 250);
};

const loadEstimate = async () => {
  estimateError.value = '';
  if (!currentAgencyId.value) return;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/estimate`);
    estimate.value = res.data;
  } catch (e) {
    estimateError.value = e?.response?.data?.error?.message || 'Failed to load billing estimate';
  }
};

const loadPlatformPricing = async () => {
  if (!isSuperAdmin.value) return;
  pricingError.value = '';
  pricingLoading.value = true;
  try {
    const res = await api.get('/billing/pricing/default');
    setDraftFromPricing(platformDraft, res.data?.pricing || null);
  } catch (e) {
    pricingError.value = e?.response?.data?.error?.message || 'Failed to load platform pricing';
  } finally {
    pricingLoading.value = false;
  }
};

const savePlatformPricing = async () => {
  if (!isSuperAdmin.value) return;
  pricingError.value = '';
  pricingSaving.value = true;
  try {
    await api.put('/billing/pricing/default', { pricing: buildPricingPayloadFromDraft(platformDraft.value) });
    await loadPlatformPricing();
  } catch (e) {
    pricingError.value = e?.response?.data?.error?.message || 'Failed to save platform pricing';
  } finally {
    pricingSaving.value = false;
  }
};

const loadAgencyPricing = async () => {
  pricingError.value = '';
  if (!currentAgencyId.value) return;
  pricingLoading.value = true;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/pricing`);
    const override = res.data?.pricingOverride ?? null;
    agencyOverrideEnabled.value = override != null;
    setDraftFromPricing(agencyDraft, (override != null ? override : res.data?.platformPricing) || null);
  } catch (e) {
    pricingError.value = e?.response?.data?.error?.message || 'Failed to load agency pricing';
  } finally {
    pricingLoading.value = false;
  }
};

const saveAgencyPricingOverride = async () => {
  if (!isSuperAdmin.value) return;
  pricingError.value = '';
  if (!currentAgencyId.value) return;
  pricingSaving.value = true;
  try {
    // If an add-on is being enabled, we must persist an override payload (billing gate).
    if ((agencyDraft.value?.publicAvailabilityAddonEnabled || agencyDraft.value?.momentumListAddonEnabled) && !agencyOverrideEnabled.value) {
      agencyOverrideEnabled.value = true;
    }
    const payload = agencyOverrideEnabled.value ? buildPricingPayloadFromDraft(agencyDraft.value) : null;
    await api.put(`/billing/${currentAgencyId.value}/pricing`, { pricing: payload });
    await Promise.all([loadAgencyPricing(), loadEstimate()]);
  } catch (e) {
    pricingError.value = e?.response?.data?.error?.message || 'Failed to save agency pricing override';
  } finally {
    pricingSaving.value = false;
  }
};

const loadQboStatus = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/quickbooks/status`);
    qboStatus.value = res.data;
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to load QuickBooks status';
  }
};

const loadPlatformQboStatus = async () => {
  if (!isSuperAdmin.value) return;
  try {
    const res = await api.get('/billing/platform/quickbooks/status');
    platformQboStatus.value = res.data;
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to load platform QuickBooks status';
  }
};

const loadSettings = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/settings`);
    billingEmail.value = res.data?.billingEmail || '';
    autopayEnabled.value = !!res.data?.autopayEnabled;
    subscriptionMerchantMode.value = res.data?.subscriptionMerchantMode || 'agency_managed';
    clientPaymentsMode.value = res.data?.clientPaymentsMode || 'not_configured';
    if (res.data?.quickBooksStatus) {
      qboStatus.value = res.data.quickBooksStatus;
    }
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to load billing settings';
  }
};

const saveBillingSettings = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  savingSettings.value = true;
  try {
    await api.put(`/billing/${currentAgencyId.value}/settings`, {
      billingEmail: billingEmail.value || null,
      autopayEnabled: !!autopayEnabled.value,
      subscriptionMerchantMode: subscriptionMerchantMode.value,
      clientPaymentsMode: clientPaymentsMode.value
    });
    await Promise.all([loadSettings(), loadQboStatus(), loadPaymentMethods()]);
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to update billing settings';
  } finally {
    savingSettings.value = false;
  }
};

const loadPaymentMethods = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/payment-methods`);
    paymentMethods.value = res.data?.methods || [];
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to load payment methods';
  }
};

const resetPaymentMethodDraft = () => {
  paymentMethodDraft.value = {
    name: '',
    number: '',
    expMonth: '',
    expYear: '',
    cvc: '',
    postalCode: '',
    isDefault: true
  };
};

const addPaymentMethod = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  addingPaymentMethod.value = true;
  try {
    await api.post(`/billing/${currentAgencyId.value}/payment-methods`, {
      card: {
        name: paymentMethodDraft.value.name || null,
        number: paymentMethodDraft.value.number || null,
        expMonth: paymentMethodDraft.value.expMonth ? String(paymentMethodDraft.value.expMonth) : null,
        expYear: paymentMethodDraft.value.expYear ? String(paymentMethodDraft.value.expYear) : null,
        cvc: paymentMethodDraft.value.cvc || null,
        address: {
          postalCode: paymentMethodDraft.value.postalCode || null
        }
      },
      isDefault: !!paymentMethodDraft.value.isDefault
    });
    resetPaymentMethodDraft();
    await Promise.all([loadPaymentMethods(), loadQboStatus()]);
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to add payment method';
  } finally {
    addingPaymentMethod.value = false;
  }
};

const setDefaultPaymentMethod = async (paymentMethodId) => {
  manageError.value = '';
  if (!currentAgencyId.value || !paymentMethodId) return;
  settingDefaultPaymentMethodId.value = paymentMethodId;
  try {
    await api.post(`/billing/${currentAgencyId.value}/payment-methods/${paymentMethodId}/default`);
    await loadPaymentMethods();
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to update default payment method';
  } finally {
    settingDefaultPaymentMethodId.value = null;
  }
};

const connectQuickBooks = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  connectingQbo.value = true;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/quickbooks/connect`);
    const authUrl = res.data?.authUrl;
    if (!authUrl) throw new Error('Missing QuickBooks authUrl');
    window.location.href = authUrl;
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || e?.message || 'Failed to start QuickBooks connection';
    connectingQbo.value = false;
  }
};

const connectPlatformQuickBooks = async () => {
  manageError.value = '';
  connectingPlatformQbo.value = true;
  try {
    const res = await api.get('/billing/platform/quickbooks/connect');
    const authUrl = res.data?.authUrl;
    if (!authUrl) throw new Error('Missing QuickBooks authUrl');
    window.location.href = authUrl;
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || e?.message || 'Failed to start platform QuickBooks connection';
    connectingPlatformQbo.value = false;
  }
};

const disconnectQuickBooks = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  disconnectingQbo.value = true;
  try {
    await api.post(`/billing/${currentAgencyId.value}/quickbooks/disconnect`);
    await loadQboStatus();
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to disconnect QuickBooks';
  } finally {
    disconnectingQbo.value = false;
  }
};

const disconnectPlatformQuickBooks = async () => {
  manageError.value = '';
  disconnectingPlatformQbo.value = true;
  try {
    await api.post('/billing/platform/quickbooks/disconnect');
    await Promise.all([loadPlatformQboStatus(), loadQboStatus()]);
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to disconnect platform QuickBooks';
  } finally {
    disconnectingPlatformQbo.value = false;
  }
};

const loadInvoices = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/invoices`);
    invoices.value = res.data || [];
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to load invoices';
  }
};

const generateInvoice = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  generatingInvoice.value = true;
  try {
    await api.post(`/billing/${currentAgencyId.value}/invoices/generate`);
    await Promise.all([loadInvoices(), loadEstimate()]);
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to generate invoice';
  } finally {
    generatingInvoice.value = false;
  }
};

const retryInvoicePayment = async (invoiceId) => {
  manageError.value = '';
  if (!currentAgencyId.value || !invoiceId) return;
  retryingInvoiceId.value = invoiceId;
  try {
    await api.post(`/billing/${currentAgencyId.value}/invoices/${invoiceId}/retry-payment`, {
      agencyId: currentAgencyId.value
    });
    await Promise.all([loadInvoices(), loadQboStatus()]);
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to retry automatic payment';
  } finally {
    retryingInvoiceId.value = null;
  }
};

const sendInvoice = async (invoiceId) => {
  manageError.value = '';
  if (!currentAgencyId.value || !invoiceId) return;
  sendingInvoiceId.value = invoiceId;
  try {
    await api.post(`/billing/${currentAgencyId.value}/invoices/${invoiceId}/send`, {
      agencyId: currentAgencyId.value,
      sendTo: billingEmail.value || null
    });
    await loadInvoices();
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to send invoice from QuickBooks';
  } finally {
    sendingInvoiceId.value = null;
  }
};

const downloadPdf = (invoiceId) => {
  const url = `${api.defaults.baseURL}/billing/invoices/${invoiceId}/pdf`;
  window.open(url, '_blank');
};

const loadLinkedSchools = async () => {
  error.value = '';
  if (!currentAgencyId.value) return;
  const res = await api.get(`/agencies/${currentAgencyId.value}/schools`, { params: { includeInactive: true } });
  linkedSchools.value = res.data || [];
};

const loadAvailableSchools = async () => {
  error.value = '';
  const params = {};
  if (schoolSearch.value && schoolSearch.value.trim()) params.search = schoolSearch.value.trim();
  const res = await api.get('/agencies/schools', { params });
  availableSchools.value = res.data || [];
};

const loadAffiliationOutgoing = async () => {
  affiliationOutgoingError.value = '';
  if (!currentAgencyId.value) {
    affiliationOutgoingRequests.value = [];
    return;
  }
  affiliationOutgoingLoading.value = true;
  try {
    const res = await api.get(`/agencies/${currentAgencyId.value}/organization-affiliation-requests`);
    affiliationOutgoingRequests.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    affiliationOutgoingRequests.value = [];
    affiliationOutgoingError.value =
      e?.response?.data?.error?.message || e.message || 'Failed to load affiliation requests';
  } finally {
    affiliationOutgoingLoading.value = false;
  }
};

const submitAffiliationRequestForPendingOrg = async () => {
  const aid = currentAgencyId.value;
  const oid = pendingAffiliationOrgId.value;
  if (!aid || !oid) return;
  requestingAffiliation.value = true;
  affiliationConsentHint.value = '';
  try {
    await api.post(`/agencies/${aid}/organization-affiliation-requests`, { organizationId: oid });
    pendingAffiliationOrgId.value = null;
    await loadAffiliationOutgoing();
    affiliationConsentHint.value =
      'Request sent. When the organization approves, return here and click Link School again.';
  } catch (e) {
    affiliationConsentHint.value =
      e?.response?.data?.error?.message || e.message || 'Could not submit affiliation request';
  } finally {
    requestingAffiliation.value = false;
  }
};

const linkSelectedSchool = async () => {
  if (!currentAgencyId.value || !selectedSchoolId.value) return;
  error.value = '';
  affiliationConsentHint.value = '';
  pendingAffiliationOrgId.value = null;
  linking.value = true;
  try {
    await api.post(`/agencies/${currentAgencyId.value}/schools`, {
      schoolOrganizationId: parseInt(selectedSchoolId.value, 10),
      isActive: true
    });
    selectedSchoolId.value = '';
    await loadLinkedSchools();
  } catch (e) {
    const code = e?.response?.data?.error?.code;
    const orgId = parseInt(selectedSchoolId.value, 10);
    if (code === 'AFFILIATION_CONSENT_REQUIRED' && orgId) {
      pendingAffiliationOrgId.value = orgId;
      affiliationConsentHint.value =
        'This organization must approve your agency before it can be linked. Submit a request, then link again after approval.';
      error.value = '';
    } else {
      error.value = e?.response?.data?.error?.message || 'Failed to link school';
    }
  } finally {
    linking.value = false;
  }
};

const unlink = async (schoolOrganizationId) => {
  if (!currentAgencyId.value) return;
  error.value = '';
  unlinkingId.value = schoolOrganizationId;
  try {
    await api.delete(`/agencies/${currentAgencyId.value}/schools/${schoolOrganizationId}`);
    await loadLinkedSchools();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to unlink school';
  } finally {
    unlinkingId.value = null;
  }
};

onMounted(async () => {
  if (!agencyStore.currentAgency) {
    if (authStore.user?.role === 'super_admin') {
      await agencyStore.fetchAgencies();
    } else {
      await agencyStore.fetchUserAgencies();
    }
  }

  if (isSuperAdmin.value) {
    await Promise.all([loadPlatformPricing(), loadPlatformQboStatus()]);
  }

  // Deep-link support (e.g. from admin billing overage acknowledgement)
  applyAgencyFromQuery();

  const qboParam = String(route.query.qbo || '');
  const qboOwner = String(route.query.qboOwner || 'agency');
  if (qboParam === 'connected') {
    banner.value = {
      kind: 'success',
      title: 'QuickBooks connected.',
      message: qboOwner === 'platform'
        ? 'The platform billing merchant is now connected to QuickBooks Online.'
        : 'Your agency billing merchant is now connected to QuickBooks Online.'
    };
  } else if (qboParam === 'error') {
    banner.value = { kind: 'error', title: 'QuickBooks connection failed.', message: 'Please try again or contact support.' };
  }

  await Promise.all([
    loadEstimate(),
    loadAgencyPricing(),
    loadQboStatus(),
    loadSettings(),
    loadPaymentMethods(),
    loadInvoices(),
    loadAvailableSchools(),
    loadLinkedSchools(),
    loadAffiliationOutgoing(),
    ...(isSuperAdmin.value ? [loadPlatformQboStatus()] : [])
  ]);
});

watch(billingAgencies, () => {
  if (!currentAgencyId.value) applyAgencyFromQuery();
});

watch(currentAgencyId, async (newId, oldId) => {
  if (!newId || newId === oldId) return;
  await Promise.all([
    loadEstimate(),
    loadAgencyPricing(),
    loadQboStatus(),
    loadSettings(),
    loadPaymentMethods(),
    loadInvoices(),
    loadAvailableSchools(),
    loadLinkedSchools(),
    loadAffiliationOutgoing(),
    ...(isSuperAdmin.value ? [loadPlatformQboStatus()] : [])
  ]);
});

const onStripeStatusChanged = (newStatus) => {
  // Optionally reload settings to reflect new stripe connect status
  if (newStatus === 'active') loadSettings();
};

</script>

<style scoped>
.billing-management {
  width: 100%;
}

.section-header {
  margin-bottom: 32px;
}

.section-header h2 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.section-description {
  color: var(--text-secondary);
  margin: 0;
}

.placeholder-content {
  text-align: center;
  padding: 60px 20px;
  background: var(--bg-alt);
  border-radius: 12px;
  border: 2px dashed var(--border);
}

.placeholder-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.placeholder-content h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.placeholder-content p {
  margin: 8px 0;
  color: var(--text-secondary);
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}

.agency-picker {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1fr 280px 140px;
  gap: 10px;
  align-items: center;
  max-width: 860px;
  margin-left: auto;
  margin-right: auto;
}

@media (max-width: 900px) {
  .agency-picker {
    grid-template-columns: 1fr;
  }
}

.placeholder-note {
  font-style: italic;
  color: var(--text-secondary);
  opacity: 0.8;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.banner {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-primary);
}

.banner.success {
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.12);
}

.banner.error {
  border-color: rgba(220, 38, 38, 0.35);
  background: rgba(220, 38, 38, 0.12);
}

.card {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}

.card h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
}

.muted {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  align-items: end;
}

.label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.big {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.value {
  font-size: 14px;
  color: var(--text-primary);
}

.manage-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  margin-top: 8px;
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@media (max-width: 1100px) {
  .pricing-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 700px) {
  .pricing-grid {
    grid-template-columns: 1fr;
  }
}

.inline {
  display: flex;
  gap: 10px;
  align-items: center;
}

.row {
  display: grid;
  grid-template-columns: 1fr 280px 140px;
  gap: 10px;
  align-items: center;
  margin: 12px 0 16px 0;
}

.input,
.select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-primary);
}

.btn {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--primary);
  color: white;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.btn-danger {
  background: transparent;
  color: var(--danger, #dc2626);
  border-color: var(--danger, #dc2626);
}

.error {
  margin: 8px 0 0 0;
  color: var(--danger, #dc2626);
}

.empty {
  padding: 10px 0;
  color: var(--text-secondary);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 10px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  color: var(--text-primary);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: var(--text-secondary);
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.pill {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--border);
}

.pill-on {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
  color: var(--text-primary);
}

.pill-off {
  background: rgba(107, 114, 128, 0.12);
  border-color: rgba(107, 114, 128, 0.35);
  color: var(--text-secondary);
}

.pill-bad {
  background: rgba(220, 38, 38, 0.12);
  border-color: rgba(220, 38, 38, 0.35);
  color: var(--text-primary);
}

.base-row td {
  padding-top: 14px;
}

.total-row td {
  border-bottom: none;
  padding-top: 14px;
}
</style>
