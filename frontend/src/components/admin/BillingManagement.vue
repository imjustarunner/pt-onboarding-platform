<template>
  <div class="billing-management">
    <div class="section-header">
      <h2>Billing</h2>
      <p class="section-description">
        Subscription account, charges, invoices, receipts, and merchant controls for this tenant.
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
        <p class="muted">Configure the platform-level merchant connection that tenants can inherit. Stripe is ready to be your primary subscription path, and QuickBooks can stay available for accounting workflows when you want it.</p>
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

    </div>

    <div v-else class="content">
      <div v-if="banner" class="banner" :class="banner.kind">
        <strong>{{ banner.title }}</strong>
        <span>{{ banner.message }}</span>
      </div>

      <div class="billing-toolbar">
        <div>
          <h3 class="billing-toolbar-title">{{ isSuperAdmin ? 'Tenant billing account' : 'Your billing account' }}</h3>
          <p class="billing-toolbar-copy">Feature toggles and pricing now live in Features so billing can stay focused on charges, invoices, receipts, and payment collection.</p>
        </div>
        <div class="inline billing-toolbar-actions">
          <button class="btn btn-secondary" type="button" @click="openFeaturesPage">Open features</button>
          <button
            v-if="isSuperAdmin"
            class="btn"
            type="button"
            :disabled="generatingInvoice || !canUseLiveBilling"
            @click="generateInvoice"
          >
            {{ generatingInvoice ? 'Generating…' : 'Generate invoice' }}
          </button>
        </div>
      </div>

      <div class="card rollout-card" :class="{ 'rollout-card-live': billingRolloutActive }">
        <div class="rollout-card-header">
          <div>
            <h3>{{ billingRolloutActive ? 'Billing is live' : 'Billing coming soon' }}</h3>
            <p class="muted">
              {{ billingRolloutActive
                ? 'Invoices, receipts, payment collection, and billing history are active for this tenant.'
                : (billingRollout?.comingSoonMessage || 'Platform billing is coming soon for this tenant.') }}
            </p>
          </div>
          <span :class="['pill', billingRolloutActive ? 'pill-on' : 'pill-off']">
            {{ billingRolloutActive ? 'Active' : 'Coming soon' }}
          </span>
        </div>
        <div class="status-grid">
          <div>
            <div class="label">Subscription provider</div>
            <div class="value">{{ subscriptionProviderLabel }}</div>
          </div>
          <div>
            <div class="label">Payment readiness</div>
            <div class="value">{{ subscriptionProviderStatus?.paymentsEnabled ? 'Ready' : 'Setup required' }}</div>
          </div>
          <div>
            <div class="label">Invoices</div>
            <div class="value">{{ billingProviderReadiness?.invoiceDownloadsEnabled ? 'Download enabled' : 'Not ready' }}</div>
          </div>
          <div>
            <div class="label">Receipts</div>
            <div class="value">{{ billingProviderReadiness?.receiptDownloadsEnabled ? 'Download enabled' : 'Not ready' }}</div>
          </div>
        </div>
        <div v-if="isSuperAdmin" class="rollout-editor">
          <div class="form-group">
            <div class="label">Rollout status</div>
            <select v-model="billingRollout.status" class="select">
              <option value="coming_soon">Coming soon</option>
              <option value="active">Active</option>
            </select>
          </div>
          <div class="form-group" style="flex: 1;">
            <div class="label">Tenant message</div>
            <input v-model="billingRollout.comingSoonMessage" class="input" type="text" placeholder="Platform billing is coming soon for this tenant." />
          </div>
          <div class="inline" style="align-items: end;">
            <button class="btn" :disabled="savingRollout" @click="saveBillingRollout">
              {{ savingRollout ? 'Saving…' : 'Save rollout' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="isSuperAdmin" class="card">
        <h3>Platform merchant connection</h3>
        <p class="muted">QuickBooks can remain available for accounting workflows later, while Stripe can be chosen per tenant as the primary subscription and invoicing path.</p>
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

      <div class="card">
        <h3>Current charges</h3>
        <p class="muted">This page handles the money side of the relationship. Feature access and pricing controls now live in Features.</p>
        <div class="status-grid">
          <div>
            <div class="label">Current Bill (Estimated)</div>
            <div class="big">{{ canUseLiveBilling ? (estimate ? money(estimate.totals.totalCents) : '—') : 'Coming soon' }}</div>
          </div>
          <div>
            <div class="label">Billing Cycle</div>
            <div class="value">{{ canUseLiveBilling ? (estimate?.billingCycle?.label || '—') : 'Not active yet' }}</div>
          </div>
          <div>
            <div class="label">Billing Merchant</div>
            <div class="value">
              <span :class="['pill', 'pill-on']">
                {{ merchantModeLabel }} · {{ subscriptionProviderLabel }}
              </span>
            </div>
          </div>
          <div>
            <div class="label">Payments</div>
            <div class="value">
              <span :class="['pill', subscriptionProviderStatus?.paymentsEnabled ? 'pill-on' : 'pill-off']">
                {{ subscriptionProviderStatus?.paymentsEnabled ? 'Payments ready' : 'Reconnect required' }}
              </span>
            </div>
          </div>
          <div>
            <div class="label">Connection Source</div>
            <div class="value">{{ agencyBillingConnectionLabel }}</div>
          </div>
          <div>
            <div class="label">Rollout</div>
            <div class="value">{{ billingRolloutActive ? 'Billing live' : 'Coming soon' }}</div>
          </div>
          <div>
            <div class="label">Billing contact</div>
            <div class="value">{{ billingEmail || 'Not set yet' }}</div>
          </div>
        </div>
        <div v-if="estimateError" class="error">{{ estimateError }}</div>
      </div>

      <div class="card">
        <div class="billing-features-handoff">
          <div>
            <h3>Features moved</h3>
            <p class="muted">Use the dedicated Features page for enablement, pricing, overrides, and a-la-carte controls. Billing stays cleaner when it only shows charges, invoices, receipts, and collection settings.</p>
          </div>
          <button class="btn btn-secondary" type="button" @click="openFeaturesPage">Go to Features</button>
        </div>
      </div>

      <div class="card">
        <h3>Charges this cycle</h3>
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
        <h3>Billing setup & collections</h3>
        <p class="muted">Stripe is the preferred subscription path here. QuickBooks can still be used when you want a QuickBooks-managed billing flow.</p>
        <div class="manage-grid">
          <div>
            <div class="label">Who handles platform billing</div>
            <div class="inline">
              <select v-model="subscriptionMerchantMode" class="select">
                <option value="platform_managed">Use platform billing (tenant pays you)</option>
                <option value="agency_managed">Use tenant billing account</option>
              </select>
              <button class="btn" :disabled="savingSettings" @click="saveBillingSettings">
                {{ savingSettings ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>

          <div>
            <div class="label">Platform billing provider</div>
            <div class="inline">
              <select v-model="subscriptionPaymentProvider" class="select">
                <option value="STRIPE">Stripe</option>
                <option value="QUICKBOOKS">QuickBooks Payments</option>
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
            <div class="label">{{ usingStripeForSubscription ? 'Stripe Connection' : 'QuickBooks Connection' }}</div>
            <div v-if="!usingStripeForSubscription && subscriptionMerchantMode === 'agency_managed'" class="inline">
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
            <div v-else-if="!usingStripeForSubscription" class="value">
              This agency uses the platform billing merchant. Cards and invoice collection run through the platform QuickBooks connection.
            </div>
            <div v-else-if="subscriptionMerchantMode === 'agency_managed'" class="value">
              {{ subscriptionProviderStatus?.isConnected
                ? 'This tenant has an active Stripe Connect account for subscription billing.'
                : 'This tenant must finish Stripe Connect onboarding before Stripe subscription cards can be saved.' }}
            </div>
            <div v-else class="value">
              {{ subscriptionProviderStatus?.isConnected
                ? 'Platform Stripe is configured for subscription billing.'
                : 'Platform Stripe keys are not configured yet.' }}
            </div>
          </div>

          <div>
            <div class="label">Invoices</div>
            <div class="inline">
              <button class="btn" :disabled="generatingInvoice || !canUseLiveBilling" @click="generateInvoice">
                {{ generatingInvoice ? 'Generating…' : 'Generate Invoice' }}
              </button>
            </div>
          </div>
        </div>

        <div class="merchant-choice-callout">
          <strong>{{ subscriptionMerchantMode === 'platform_managed' ? 'Use platform billing' : 'Use tenant billing account' }}</strong>
          <span>
            {{
              subscriptionMerchantMode === 'platform_managed'
                ? (usingStripeForSubscription
                  ? 'This tenant will pay the platform through your platform Stripe account.'
                  : 'This tenant will pay the platform through your platform QuickBooks merchant.')
                : (usingStripeForSubscription
                  ? 'This tenant will use its own Stripe-connected billing account to pay the platform.'
                  : 'This tenant will use its own QuickBooks billing connection to pay the platform.')
            }}
          </span>
        </div>

        <div v-if="manageError" class="error">{{ manageError }}</div>
        <div v-if="!usingStripeForSubscription && qboStatus?.needsReconnectForPayments" class="error" style="margin-top: 10px;">
          {{ subscriptionMerchantMode === 'platform_managed'
            ? 'The platform QuickBooks merchant is connected for accounting, but still needs Payments access before cards on file or autopay will work.'
            : 'QuickBooks is connected for accounting, but this agency still needs to reconnect with QuickBooks Payments access before cards on file or autopay will work.' }}
        </div>
        <div v-if="usingStripeForSubscription && !subscriptionProviderStatus?.paymentsEnabled" class="error" style="margin-top: 10px;">
          {{ subscriptionMerchantMode === 'platform_managed'
            ? 'Platform Stripe is not configured yet for tenant subscription billing.'
            : 'Stripe Connect must be active for this tenant before Stripe subscription billing can charge cards.' }}
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
          <p class="muted">Cards on file are used only for this agency’s subscription billing. They are stored under the currently selected billing merchant and payment provider.</p>
          <div v-if="usingStripeForSubscription" class="stripe-card-panel">
            <div class="manage-grid">
              <div>
                <div class="label">Cardholder Name</div>
                <input v-model="stripeCardholderName" class="input" type="text" placeholder="Billing contact name" />
              </div>
              <div style="grid-column: span 2;">
                <div class="label">Card</div>
                <div class="stripe-card-shell">
                  <div v-if="stripeLoading" class="muted" style="margin: 0;">Loading Stripe form…</div>
                  <div ref="stripeMountRef" class="stripe-card-mount"></div>
                </div>
                <div v-if="stripeElementError" class="error">{{ stripeElementError }}</div>
              </div>
              <div class="inline" style="align-items: end;">
                <button class="btn" :disabled="addingPaymentMethod || !subscriptionProviderStatus?.paymentsEnabled" @click="addPaymentMethod">
                  {{ addingPaymentMethod ? 'Saving…' : 'Add Stripe Billing Card' }}
                </button>
              </div>
            </div>
          </div>
          <div v-else class="manage-grid">
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
                  :disabled="retryingInvoiceId === inv.id || !subscriptionProviderStatus?.paymentsEnabled || !canUseLiveBilling"
                  @click="retryInvoicePayment(inv.id)"
                >
                  {{ retryingInvoiceId === inv.id ? 'Retrying…' : 'Retry Autopay' }}
                </button>
                <button
                  v-if="inv.payment_status !== 'paid'"
                  class="btn btn-secondary"
                  :disabled="sendingInvoiceId === inv.id || !inv.qbo_invoice_id || !canUseLiveBilling"
                  @click="sendInvoice(inv.id)"
                >
                  {{ sendingInvoiceId === inv.id ? 'Sending…' : 'Send Invoice' }}
                </button>
                <button class="btn" @click="downloadPdf(inv.id)" :disabled="!inv.pdf_storage_path">
                  {{ inv.payment_status === 'paid' ? 'Download Receipt' : 'Download Invoice' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="canUseLiveBilling" class="card">
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

      <div v-if="currentAgencyId && canUseLiveBilling" class="card">
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadStripe } from '@stripe/stripe-js';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import AgencyStripeConnectSection from './AgencyStripeConnectSection.vue';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

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

const openFeaturesPage = () => {
  router.push({
    path: route.path,
    query: {
      ...route.query,
      category: 'general',
      item: 'tenant-features'
    }
  });
};

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
const subscriptionPaymentProvider = ref('QUICKBOOKS');
const clientPaymentsMode = ref('not_configured');
const billingRollout = ref({
  status: 'coming_soon',
  comingSoonMessage: 'Platform billing is coming soon for this tenant. Invoices and payment collection will appear here once billing is activated.',
  activationLabel: null,
  isActive: false
});
const billingProviderReadiness = ref({
  subscriptionProvider: 'quickbooks',
  subscriptionStripeReady: false,
  invoicesEnabled: true,
  invoiceDownloadsEnabled: true,
  receiptDownloadsEnabled: true
});
const paymentMethods = ref([]);
const manageError = ref('');
const savingRollout = ref(false);
const savingFeatureSelections = ref(false);
const subscriptionProviderStatus = ref({
  provider: 'QUICKBOOKS',
  isConnected: false,
  paymentsEnabled: false,
  needsReconnectForPayments: false,
  stripePublishableKey: null,
  stripeConnectedAccountId: null
});

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
const platformFeatureDrafts = ref([]);
const agencyFeatureDrafts = ref([]);

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
const stripeCardholderName = ref('');
const stripeMountRef = ref(null);
const stripeElementError = ref('');
const stripeLoading = ref(false);
let stripeInstance = null;
let stripeElements = null;
let stripeCardElement = null;
let stripeClientSecret = null;

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

const formatFeaturePricing = (feature) => {
  const amount = Number(feature?.unitAmountCents || 0) / 100;
  if (feature?.pricingModel === 'usage') return `$${amount.toFixed(2)} / ${feature?.unitLabel || 'unit'}`;
  if (feature?.pricingModel === 'manual_quantity') return `$${amount.toFixed(2)} / ${feature?.unitLabel || 'unit'}`;
  return `$${amount.toFixed(2)} / month`;
};

const merchantModeLabel = computed(() => subscriptionMerchantMode.value === 'platform_managed' ? 'Platform-managed' : 'Agency-managed');
const subscriptionProviderLabel = computed(() => subscriptionPaymentProvider.value === 'STRIPE' ? 'Stripe' : 'QuickBooks');
const clientPaymentsModeLabel = computed(() => {
  if (clientPaymentsMode.value === 'agency_managed') return 'Agency-owned setup';
  if (clientPaymentsMode.value === 'platform_managed') return 'Platform-assisted setup';
  return 'Not configured';
});
const agencyBillingConnectionLabel = computed(() => {
  if (subscriptionPaymentProvider.value === 'STRIPE') {
    return subscriptionMerchantMode.value === 'platform_managed' ? 'Platform Stripe' : 'Agency Stripe Connect';
  }
  if (!qboStatus.value) return 'Not configured';
  return qboStatus.value.connectionOwnerType === 'platform' ? 'Platform QuickBooks' : 'Agency QuickBooks';
});
const billingRolloutActive = computed(() => billingRollout.value?.status === 'active');
const canUseLiveBilling = computed(() => isSuperAdmin.value || billingRolloutActive.value);
const usingStripeForSubscription = computed(() => subscriptionPaymentProvider.value === 'STRIPE');
const visibleAgencyFeatures = computed(() => {
  const rows = Array.isArray(agencyFeatureDrafts.value) ? agencyFeatureDrafts.value : [];
  if (isSuperAdmin.value) return rows;
  return rows.filter((row) => row.available || row.enabled || row.included);
});
const selectedFeatureCount = computed(() => visibleAgencyFeatures.value.filter((row) => row.enabled).length);

const dollarsToCents = (v) => {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
};

const featureCatalogToDraftRows = (catalog, entitlements = {}) => {
  const source = catalog && typeof catalog === 'object' ? catalog : {};
  return Object.values(source).map((feature) => {
    const entitlement = entitlements?.[feature.key] || {};
    return {
      key: feature.key,
      label: feature.label || feature.key,
      description: feature.description || '',
      pricingModel: feature.pricingModel || 'flat_monthly',
      unitAmountDollars: Number(feature.unitAmountCents || 0) / 100,
      unitLabel: feature.unitLabel || 'month',
      usageKey: feature.usageKey || null,
      defaultAvailable: feature.defaultAvailable === true,
      tenantSelfServe: feature.tenantSelfServe !== false,
      available: entitlement.available === true,
      enabled: entitlement.enabled === true,
      included: entitlement.included === true,
      locked: entitlement.locked === true,
      quantity: entitlement.quantity != null ? Number(entitlement.quantity) : 0,
      unitAmountOverrideDollars: entitlement.unitAmountCents != null ? Number(entitlement.unitAmountCents || 0) / 100 : null,
      notes: entitlement.notes || ''
    };
  });
};

const buildFeatureCatalogPayload = (rows) => {
  const payload = {};
  for (const row of rows || []) {
    if (!row?.key) continue;
    payload[row.key] = {
      key: row.key,
      label: row.label || row.key,
      description: row.description || '',
      pricingModel: row.pricingModel || 'flat_monthly',
      unitAmountCents: dollarsToCents(row.unitAmountDollars),
      unitLabel: row.unitLabel || 'month',
      usageKey: row.usageKey || null,
      defaultAvailable: row.defaultAvailable === true,
      tenantSelfServe: row.tenantSelfServe !== false
    };
  }
  return payload;
};

const buildFeatureEntitlementsPayload = (rows, { adminView = false } = {}) => {
  const payload = {};
  for (const row of rows || []) {
    if (!row?.key) continue;
    payload[row.key] = {
      available: adminView ? row.available === true : undefined,
      enabled: row.enabled === true,
      included: adminView ? row.included === true : undefined,
      locked: adminView ? row.locked === true : undefined,
      quantity: row.pricingModel === 'manual_quantity' ? Math.max(0, Number(row.quantity || 0)) : undefined,
      unitAmountCents: adminView && row.unitAmountOverrideDollars != null ? dollarsToCents(row.unitAmountOverrideDollars) : undefined,
      notes: adminView ? (row.notes || '') : undefined
    };
  }
  return payload;
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
    },
    featureCatalog: buildFeatureCatalogPayload(platformFeatureDrafts.value)
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
    platformFeatureDrafts.value = featureCatalogToDraftRows(res.data?.featureCatalog || res.data?.pricing?.featureCatalog || {});
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
    agencyFeatureDrafts.value = featureCatalogToDraftRows(res.data?.featureCatalog || {}, res.data?.featureEntitlements || {});
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
    const payload = agencyOverrideEnabled.value ? {
      ...buildPricingPayloadFromDraft(agencyDraft.value),
      featureCatalog: undefined
    } : null;
    await api.put(`/billing/${currentAgencyId.value}/pricing`, {
      pricing: payload,
      featureEntitlements: buildFeatureEntitlementsPayload(agencyFeatureDrafts.value, { adminView: true })
    });
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
    subscriptionPaymentProvider.value = res.data?.subscriptionPaymentProvider || 'QUICKBOOKS';
    clientPaymentsMode.value = res.data?.clientPaymentsMode || 'not_configured';
    billingRollout.value = res.data?.billingRollout || billingRollout.value;
    billingProviderReadiness.value = res.data?.billingProviderReadiness || billingProviderReadiness.value;
    subscriptionProviderStatus.value = res.data?.subscriptionProviderStatus || subscriptionProviderStatus.value;
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
      subscriptionPaymentProvider: subscriptionPaymentProvider.value,
      clientPaymentsMode: clientPaymentsMode.value
    });
    await Promise.all([loadSettings(), loadQboStatus(), loadPaymentMethods()]);
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to update billing settings';
  } finally {
    savingSettings.value = false;
  }
};

const saveBillingRollout = async () => {
  manageError.value = '';
  if (!currentAgencyId.value || !isSuperAdmin.value) return;
  savingRollout.value = true;
  try {
    await api.put(`/billing/${currentAgencyId.value}/settings`, {
      billingRollout: {
        status: billingRollout.value?.status || 'coming_soon',
        comingSoonMessage: billingRollout.value?.comingSoonMessage || '',
        activationLabel: billingRollout.value?.activationLabel || null
      }
    });
    await Promise.all([loadSettings(), loadEstimate()]);
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to update billing rollout';
  } finally {
    savingRollout.value = false;
  }
};

const saveFeatureSelections = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  savingFeatureSelections.value = true;
  try {
    await api.put(`/billing/${currentAgencyId.value}/settings`, {
      featureEntitlements: buildFeatureEntitlementsPayload(agencyFeatureDrafts.value, { adminView: false })
    });
    await Promise.all([loadAgencyPricing(), loadEstimate(), loadSettings()]);
  } catch (e) {
    manageError.value = e?.response?.data?.error?.message || 'Failed to update selected features';
  } finally {
    savingFeatureSelections.value = false;
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

const destroyStripeCardElement = () => {
  if (stripeCardElement) {
    stripeCardElement.destroy();
    stripeCardElement = null;
  }
  stripeElements = null;
  stripeInstance = null;
  stripeClientSecret = null;
};

const loadStripePaymentSetup = async () => {
  stripeElementError.value = '';
  destroyStripeCardElement();
  if (!currentAgencyId.value || !usingStripeForSubscription.value) return;
  if (subscriptionProviderStatus.value?.provider !== 'STRIPE') return;
  stripeLoading.value = true;
  try {
    const res = await api.get(`/billing/${currentAgencyId.value}/payment-methods/setup`);
    const publishableKey = res.data?.publishableKey;
    const connectedAccountId = res.data?.connectedAccountId || null;
    stripeClientSecret = res.data?.clientSecret || null;
    if (!publishableKey || !stripeClientSecret) {
      throw new Error('Stripe setup is incomplete for this tenant.');
    }
    stripeInstance = connectedAccountId
      ? await loadStripe(publishableKey, { stripeAccount: connectedAccountId })
      : await loadStripe(publishableKey);
    if (!stripeInstance) throw new Error('Stripe could not be initialized.');
    await nextTick();
    if (!stripeMountRef.value) throw new Error('Stripe card container is missing.');
    stripeElements = stripeInstance.elements();
    stripeCardElement = stripeElements.create('card', {
      style: {
        base: {
          color: '#111827',
          fontSize: '16px',
          '::placeholder': { color: '#9ca3af' }
        }
      }
    });
    stripeCardElement.mount(stripeMountRef.value);
    stripeCardElement.on('change', (event) => {
      stripeElementError.value = event?.error?.message || '';
    });
  } catch (e) {
    stripeElementError.value = e?.response?.data?.error?.message || e?.message || 'Failed to initialize Stripe billing card setup.';
  } finally {
    stripeLoading.value = false;
  }
};

const addPaymentMethod = async () => {
  manageError.value = '';
  if (!currentAgencyId.value) return;
  addingPaymentMethod.value = true;
  try {
    if (usingStripeForSubscription.value) {
      if (!stripeInstance || !stripeCardElement || !stripeClientSecret) {
        throw new Error('Stripe billing form is not ready yet.');
      }
      if (!stripeCardholderName.value.trim()) {
        throw new Error('Cardholder name is required.');
      }
      const { error, setupIntent } = await stripeInstance.confirmCardSetup(stripeClientSecret, {
        payment_method: {
          card: stripeCardElement,
          billing_details: { name: stripeCardholderName.value.trim() }
        }
      });
      if (error) throw new Error(error.message || 'Stripe card could not be saved.');
      await api.post(`/billing/${currentAgencyId.value}/payment-methods`, {
        stripePaymentMethodId: setupIntent?.payment_method || null,
        isDefault: true
      });
      stripeCardholderName.value = '';
      await loadStripePaymentSetup();
    } else {
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
    }
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
  await loadStripePaymentSetup();
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
  await loadStripePaymentSetup();
});

watch([subscriptionPaymentProvider, currentAgencyId, canUseLiveBilling], async () => {
  await loadStripePaymentSetup();
}, { flush: 'post' });

const onStripeStatusChanged = (newStatus) => {
  // Optionally reload settings to reflect new stripe connect status
  if (newStatus === 'active') loadSettings();
};

onBeforeUnmount(() => {
  destroyStripeCardElement();
});

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

.billing-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(16, 185, 129, 0.06));
}

.billing-toolbar-title {
  margin: 0 0 6px 0;
  color: var(--text-primary);
}

.billing-toolbar-copy {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.billing-toolbar-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
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

.rollout-card {
  border-color: rgba(107, 114, 128, 0.28);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(59, 130, 246, 0.06));
}

.rollout-card-live {
  border-color: rgba(16, 185, 129, 0.28);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.09), rgba(59, 130, 246, 0.05));
}

.rollout-card-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.rollout-editor {
  margin-top: 16px;
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.billing-features-handoff {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.merchant-choice-callout {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
}

.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.feature-catalog-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.feature-catalog-header h4 {
  margin: 0 0 6px 0;
}

.feature-catalog-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.feature-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
}

.feature-item-admin {
  align-items: flex-start;
}

.feature-copy {
  min-width: 0;
  flex: 1;
}

.feature-title {
  font-weight: 700;
  color: var(--text-primary);
}

.feature-key {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
}

.feature-description {
  margin-top: 6px;
  color: var(--text-secondary);
}

.feature-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 10px;
}

.feature-price-preview {
  font-size: 13px;
  color: var(--text-secondary);
}

.feature-controls-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.feature-controls-inline {
  display: flex;
  gap: 12px;
  align-items: center;
}

.feature-qty {
  min-width: 110px;
}

.stripe-card-panel {
  margin-top: 8px;
}

.stripe-card-shell {
  min-height: 44px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.stripe-card-mount {
  min-height: 18px;
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

  .feature-controls-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .pricing-grid {
    grid-template-columns: 1fr;
  }

  .status-grid,
  .manage-grid,
  .row,
  .rollout-editor,
  .feature-item,
  .feature-controls-grid {
    grid-template-columns: 1fr;
  }

  .feature-item,
  .rollout-card-header,
  .rollout-editor,
  .billing-toolbar,
  .billing-features-handoff {
    flex-direction: column;
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
