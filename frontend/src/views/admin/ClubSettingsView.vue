<template>
  <div class="container">
    <div class="club-settings-header">
      <h1>Club Settings</h1>
      <p>Simple controls for your club brand and billing.</p>
    </div>

    <div v-if="loading" class="loading">Loading club settings...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="cards-grid">
      <section class="settings-card">
        <div class="card-header">
          <h2>Club Identity</h2>
          <p>Logo, icon, and colors used in your club portal.</p>
        </div>

        <div class="field">
          <label>Logo input method</label>
          <div class="mode-row">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :class="{ active: logoInputMethod === 'url' }"
              @click="logoInputMethod = 'url'"
            >
              URL
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :class="{ active: logoInputMethod === 'upload' }"
              @click="logoInputMethod = 'upload'"
            >
              Upload
            </button>
          </div>
        </div>

        <div v-if="logoInputMethod === 'url'" class="field">
          <label>Logo URL</label>
          <input v-model="form.logoUrl" type="url" placeholder="https://example.com/logo.png" />
        </div>

        <div v-else class="field">
          <label>Upload logo</label>
          <input
            ref="logoInputRef"
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
            @change="onUploadLogo"
          />
          <div v-if="uploadingLogo" class="hint">Uploading logo...</div>
          <div class="hint">Recommended: square image, 256x256 or larger.</div>
        </div>

        <div v-if="resolvedLogoUrl" class="logo-preview">
          <img :src="resolvedLogoUrl" alt="Club logo preview" />
        </div>

        <div class="field">
          <label>Club main icon</label>
          <div class="icon-row">
            <IconSelector v-model="form.iconId" :summit-stats-club-id="currentAgencyId" />
            <button
              v-if="form.iconId"
              type="button"
              class="btn btn-danger btn-sm"
              @click="form.iconId = null"
            >
              Clear
            </button>
          </div>
        </div>

        <div class="colors-grid">
          <div class="field">
            <label>Primary color</label>
            <input v-model="form.primaryColor" type="color" class="color-picker" />
            <input v-model="form.primaryColor" type="text" placeholder="#0f172a" />
          </div>
          <div class="field">
            <label>Secondary color</label>
            <input v-model="form.secondaryColor" type="color" class="color-picker" />
            <input v-model="form.secondaryColor" type="text" placeholder="#1e40af" />
          </div>
        </div>

        <div class="field">
          <label>Club font</label>
          <select v-model="form.fontFamily" class="club-font-select">
            <optgroup label="Web-safe stacks">
              <option v-for="opt in clubFontPresets" :key="`p-${opt.value || '__default'}`" :value="opt.value">
                {{ opt.label }}
              </option>
            </optgroup>
            <optgroup v-if="uploadedFontFamilies.length" label="Uploaded fonts (platform and tenant)">
              <option v-for="name in uploadedFontFamilies" :key="`u-${name}`" :value="familyToCssStack(name)">
                {{ name }}
              </option>
            </optgroup>
            <optgroup v-if="extraFontOption" label="Other">
              <option :value="extraFontOption.value">{{ extraFontOption.label }}</option>
            </optgroup>
          </select>
          <p class="hint">
            Choose a web-safe stack, or fonts uploaded under platform / tenant branding (same library as agency settings). Preview updates after you save.
          </p>
        </div>

        <div class="actions-row">
          <button type="button" class="btn btn-primary" :disabled="savingIdentity" @click="saveIdentity">
            {{ savingIdentity ? 'Saving...' : 'Save Club Identity' }}
          </button>
        </div>
      </section>

      <section class="settings-card">
        <div class="card-header">
          <h2>Billing</h2>
          <p>Essential billing details for this club.</p>
        </div>

        <div class="billing-beta-notice" role="status">
          <strong>Free trial (beta)</strong>
          <span>
            Your club is on a complimentary beta account. No subscription or card is required right now.
            When paid billing goes live, you will configure payment methods and invoices here.
          </span>
        </div>

        <div v-if="billingError" class="error">{{ billingError }}</div>
        <div v-if="billingLoading" class="hint">Loading billing...</div>

        <div v-else>
          <div class="billing-summary">
            <div><strong>Client payments mode:</strong> {{ billingSettings.clientPaymentsMode || 'not_configured' }}</div>
            <div><strong>Invoice count:</strong> {{ invoices.length }}</div>
            <div><strong>Payment methods:</strong> {{ paymentMethods.length }}</div>
          </div>

          <div class="mini-list">
            <h3>Payment Methods</h3>
            <div v-if="paymentMethods.length === 0" class="hint">No payment methods on file.</div>
            <div v-for="m in paymentMethods.slice(0, 3)" :key="m.id" class="mini-row">
              <span>{{ m.card_brand || m.brand || 'Card' }} •••• {{ m.last4 || '----' }}</span>
              <button
                v-if="!m.isDefault"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="setDefaultPaymentMethod(m.id)"
              >
                Set Default
              </button>
              <span v-else class="pill">Default</span>
            </div>
          </div>

          <div class="mini-list">
            <h3>Recent Invoices</h3>
            <div v-if="invoices.length === 0" class="hint">No invoices yet.</div>
            <div v-for="inv in invoices.slice(0, 5)" :key="inv.id" class="mini-row">
              <span>#{{ inv.id }} - {{ formatCurrency(inv.total_cents ?? inv.totalCents) }}</span>
              <button type="button" class="btn btn-secondary btn-sm" @click="downloadInvoice(inv.id)">
                PDF
              </button>
            </div>
          </div>

          <div class="actions-row">
            <button type="button" class="btn btn-secondary" :disabled="billingLoading" @click="loadBilling">
              Refresh Billing
            </button>
          </div>
        </div>
      </section>

      <!-- ── Time Preferences ────────────────────────────── -->
      <section class="settings-card">
        <div class="card-header">
          <h2>Time Preferences</h2>
          <p>Set the club's home timezone and how times are displayed to members.</p>
        </div>

        <div v-if="timePrefsError" class="error">{{ timePrefsError }}</div>
        <div v-if="timePrefsLoading" class="hint">Loading…</div>

        <div v-else class="settings-form">
          <div class="field">
            <label>Club timezone</label>
            <select v-model="timePrefsForm.timezone">
              <option value="">— Not set (uses season timezone) —</option>
              <optgroup v-for="grp in TIMEZONE_GROUPS" :key="grp.label" :label="grp.label">
                <option v-for="tz in grp.zones" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
              </optgroup>
            </select>
            <p class="hint">Season deadlines are shown to members relative to this timezone unless they set their own.</p>
          </div>

          <div class="field">
            <label>Clock format</label>
            <div class="toggle-row">
              <label class="toggle-option" :class="{ active: timePrefsForm.timeFormat === '12h' }">
                <input type="radio" v-model="timePrefsForm.timeFormat" value="12h" hidden />
                12-hour (1:30 PM)
              </label>
              <label class="toggle-option" :class="{ active: timePrefsForm.timeFormat === '24h' }">
                <input type="radio" v-model="timePrefsForm.timeFormat" value="24h" hidden />
                24-hour (13:30)
              </label>
            </div>
          </div>

          <div class="actions-row">
            <button type="button" class="btn btn-primary" :disabled="savingTimePrefs" @click="saveTimePrefs">
              {{ savingTimePrefs ? 'Saving…' : 'Save Time Preferences' }}
            </button>
          </div>
        </div>
      </section>

      <section class="settings-card">
        <div class="card-header">
          <h2>Club Records</h2>
          <p>Seed starting records. New record-breakers must be verified by a manager from workout submissions.</p>
        </div>
        <div v-if="recordsError" class="error">{{ recordsError }}</div>
        <div class="records-list">
          <div v-if="clubRecords.length === 0" class="hint">No records yet. Add your first all-time record.</div>
          <div v-for="(record, idx) in clubRecords" :key="record.id || `record-${idx}`" class="record-row">
            <input v-model="record.label" type="text" placeholder="Label (e.g., Longest Trail Run)" />
            <input v-model.number="record.value" type="number" step="0.01" placeholder="Seed value (e.g., 42.6)" />
            <input v-model="record.unit" type="text" placeholder="Unit (e.g., miles)" />
            <select v-model="record.metricKey">
              <option value="">Metric source</option>
              <option value="distance_miles">Distance (miles)</option>
              <option value="duration_minutes">Duration (minutes)</option>
              <option value="points">Points</option>
            </select>
            <input v-model="record.notes" type="text" placeholder="Notes (optional)" />
            <button type="button" class="btn btn-danger btn-sm" @click="removeRecord(idx)">Remove</button>
          </div>
        </div>
        <div class="actions-row">
          <button type="button" class="btn btn-secondary" @click="addRecord">Add Record</button>
          <button type="button" class="btn btn-primary" :disabled="savingRecords" @click="saveRecords">
            {{ savingRecords ? 'Saving...' : 'Save Club Records' }}
          </button>
        </div>
        <div class="hint" style="margin-top: 10px;">
          Record values are not manually broken. When a workout exceeds a tracked metric, a verification request appears below.
        </div>
        <div class="mini-list" style="margin-top: 12px;">
          <h3>Pending Record Verifications</h3>
          <div v-if="verificationsLoading" class="hint">Loading verification requests...</div>
          <div v-else-if="recordVerifications.length === 0" class="hint">No pending verification requests.</div>
          <div v-for="v in recordVerifications" :key="`verification-${v.id}`" class="mini-row">
            <span>
              <strong>{{ v.record_label }}</strong>:
              {{ Number(v.current_value).toFixed(2) }} -> {{ Number(v.candidate_value).toFixed(2) }}
              by {{ `${v.first_name || ''} ${v.last_name || ''}`.trim() || `User ${v.challenger_user_id}` }}
            </span>
            <div class="actions-row">
              <button type="button" class="btn btn-primary btn-sm" @click="reviewVerification(v.id, 'approved')">Approve</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="reviewVerification(v.id, 'rejected')">Reject</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Team Store ──────────────────────────────────── -->
      <section class="settings-card">
        <div class="card-header">
          <h2>🛒 Team Store</h2>
          <p>
            Link your club to an external store (e.g. CustomInk, BSNS, Shopify). When enabled, a
            store rail appears on every member's dashboard.
          </p>
        </div>

        <div v-if="storeConfigError" class="error">{{ storeConfigError }}</div>
        <div v-if="storeConfigLoading" class="hint">Loading…</div>

        <div v-else class="store-config-body">
          <div class="field">
            <label class="cap-toggle-label">
              <input v-model="storeForm.enabled" type="checkbox" class="cap-check" />
              Enable team store for members
            </label>
          </div>

          <template v-if="storeForm.enabled">
            <div class="field">
              <label>Store title <span class="cap-opt">(shown to members)</span></label>
              <input
                v-model="storeForm.title"
                type="text"
                class="store-input"
                placeholder="Team Store"
                maxlength="120"
              />
            </div>

            <div class="field">
              <label>Short description <span class="cap-opt">(optional)</span></label>
              <input
                v-model="storeForm.description"
                type="text"
                class="store-input"
                placeholder="Gear up for the season — apparel and accessories."
                maxlength="300"
              />
            </div>

            <div class="field">
              <label>Button label</label>
              <input
                v-model="storeForm.buttonText"
                type="text"
                class="store-input"
                placeholder="Shop Now"
                maxlength="60"
              />
            </div>

            <div class="field">
              <label>External store URL <span class="cap-opt">(full https:// link)</span></label>
              <input
                v-model="storeForm.url"
                type="url"
                class="store-input"
                placeholder="https://your-store.com"
                maxlength="500"
              />
            </div>

            <!-- Live preview -->
            <div v-if="storeForm.url" class="store-preview">
              <div class="store-preview-label">Preview</div>
              <div class="store-preview-rail">
                <div class="store-rail-icon">🛒</div>
                <div class="store-rail-body">
                  <div class="store-rail-title">{{ storeForm.title || 'Team Store' }}</div>
                  <div v-if="storeForm.description" class="store-rail-desc">{{ storeForm.description }}</div>
                </div>
                <a :href="storeForm.url" target="_blank" rel="noopener" class="store-rail-btn">
                  {{ storeForm.buttonText || 'Shop Now' }}
                </a>
              </div>
            </div>
          </template>

          <div class="actions-row" style="margin-top: 12px;">
            <button type="button" class="btn btn-primary" :disabled="savingStoreConfig" @click="saveStoreConfig">
              {{ savingStoreConfig ? 'Saving…' : 'Save Store Settings' }}
            </button>
          </div>
        </div>
      </section>

      <!-- ── Public Club Page ───────────────────────────── -->
      <section class="settings-card">
        <div class="card-header">
          <h2>🌐 Public Club Page</h2>
          <p>Customize your public-facing club page with a banner, highlights, and a photo slider.</p>
        </div>

        <div v-if="publicPageConfigError" class="error">{{ publicPageConfigError }}</div>
        <div v-if="publicPageConfigLoading" class="hint">Loading…</div>

        <div v-else class="store-config-body">
          <div class="field">
            <label>Public URL slug <span class="cap-opt">(optional)</span></label>
            <input
              v-model="publicPageForm.publicSlug"
              type="text"
              class="store-input"
              placeholder="your-club-name"
              maxlength="64"
            />
            <div class="hint">
              Lowercase letters, numbers, and dashes. If set, your public URL becomes:
              <code>{{ publicPageUrlPreview }}</code>
              Renaming the slug keeps previously shared links working; visitors are sent to the current URL.
            </div>
          </div>

          <div class="field">
            <label>Banner title <span class="cap-opt">(optional)</span></label>
            <input
              v-model="publicPageForm.bannerTitle"
              type="text"
              class="store-input"
              placeholder="Run Together. Rise Together."
              maxlength="120"
            />
          </div>
          <div class="field">
            <label>Banner subtitle <span class="cap-opt">(optional)</span></label>
            <input
              v-model="publicPageForm.bannerSubtitle"
              type="text"
              class="store-input"
              placeholder="Join our community and take on this season's challenge."
              maxlength="220"
            />
          </div>
          <div class="field">
            <label>Banner image <span class="cap-opt">(optional)</span></label>
            <input
              ref="bannerUploadInputRef"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
              class="visually-hidden-file"
              @change="onBannerImageSelected"
            />
            <div class="image-upload-row">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="bannerImageUploading"
                @click="bannerUploadInputRef?.click()"
              >
                {{ bannerImageUploading ? 'Uploading…' : (publicPageForm.bannerImageUrl ? 'Change Banner Image' : 'Upload Banner Image') }}
              </button>
              <button
                v-if="publicPageForm.bannerImageUrl"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="publicPageForm.bannerImageUrl = ''"
              >
                Remove
              </button>
            </div>
            <input
              v-model="publicPageForm.bannerImageUrl"
              type="url"
              class="store-input"
              placeholder="Or paste an image URL if you want"
              maxlength="500"
            />
            <div v-if="publicPageForm.bannerImageUrl" class="public-image-preview">
              <img :src="publicPageForm.bannerImageUrl" alt="Banner preview" />
            </div>
          </div>

          <div class="field">
            <label class="cap-toggle-label"><input v-model="publicPageForm.showCurrentSeason" type="checkbox" class="cap-check" /> Show current season block</label>
            <label class="cap-toggle-label"><input v-model="publicPageForm.showActiveParticipants" type="checkbox" class="cap-check" /> Show active participants</label>
            <label class="cap-toggle-label"><input v-model="publicPageForm.showFeaturedWorkout" type="checkbox" class="cap-check" /> Show featured workout (most kudos this week)</label>
            <label class="cap-toggle-label"><input v-model="publicPageForm.showPhotoAlbum" type="checkbox" class="cap-check" /> Show sliding photo album</label>
            <label class="cap-toggle-label"><input v-model="publicPageForm.showClubFeed" type="checkbox" class="cap-check" /> Show club feed on the public club page</label>
            <label class="cap-toggle-label"><input v-model="publicPageForm.publicFeedEnabled" type="checkbox" class="cap-check" /> Allow posts to appear on the public club page (members can mark club-wide posts as Public)</label>
          </div>

          <!-- Gender options for registration form -->
          <div class="field" style="margin-top: 8px;">
            <label style="font-weight: 700; font-size: 13px;">Registration form — gender options</label>
            <div class="hint" style="margin-bottom: 10px;">
              Choose which gender options appear on your club's member registration form. Default is Male and Female, and you can add any custom option below.
            </div>
            <div class="gender-options-list">
              <label
                v-for="opt in BUILT_IN_GENDER_OPTIONS"
                :key="opt.value"
                class="gender-option-row"
              >
                <input
                  type="checkbox"
                  :checked="genderOptionsSelected.includes(opt.value)"
                  @change="toggleBuiltInGender(opt.value)"
                  class="cap-check"
                />
                {{ opt.label }}
              </label>
              <!-- Custom options (non-built-in) -->
              <div
                v-for="val in genderOptionsSelected.filter(v => !isBuiltInGender(v))"
                :key="val"
                class="gender-option-row gender-option-custom"
              >
                <span class="gender-custom-chip">{{ val }}</span>
                <button type="button" class="gender-remove-btn" @click="removeGenderOption(val)">✕</button>
              </div>
            </div>
            <div class="gender-add-row">
              <input
                v-model="customGenderInput"
                type="text"
                class="store-input"
                style="max-width: 220px;"
                placeholder="Add custom option…"
                maxlength="60"
                @keydown.enter.prevent="addCustomGender"
              />
              <button type="button" class="btn btn-sm" @click="addCustomGender">Add</button>
            </div>
          </div>

          <div class="field">
            <label>Photo album slides</label>
            <input
              ref="albumUploadInputRef"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
              class="visually-hidden-file"
              multiple
              @change="onAlbumImagesSelected"
            />
            <div class="image-upload-row">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="albumImagesUploading"
                @click="albumUploadInputRef?.click()"
              >
                {{ albumImagesUploading ? 'Uploading…' : '+ Upload Photos' }}
              </button>
            </div>
            <textarea
              v-model="publicPageAlbumInput"
              rows="5"
              class="store-input"
              style="max-width: 100%; min-height: 110px;"
              placeholder="https://example.com/photo-1.jpg&#10;https://example.com/photo-2.jpg"
            />
            <div v-if="publicPageAlbumPreviewUrls.length" class="album-preview-grid">
              <div v-for="(url, idx) in publicPageAlbumPreviewUrls" :key="`${url}-${idx}`" class="album-preview-item">
                <img :src="url" alt="Album preview" />
                <button type="button" class="album-preview-remove" @click="removeAlbumSlide(idx)">✕</button>
              </div>
            </div>
            <div class="hint">If empty, the page automatically uses recent workout screenshots from your club.</div>
          </div>

          <div class="actions-row">
            <button type="button" class="btn btn-primary" :disabled="savingPublicPageConfig" @click="savePublicPageConfig">
              {{ savingPublicPageConfig ? 'Saving…' : 'Save Public Page Settings' }}
            </button>
          </div>
        </div>
      </section>

      <!-- ── Club Stats Configuration ───────────────────── -->
      <section class="settings-card stats-config-card">
        <div class="card-header">
          <h2>📊 Club Stats Display</h2>
          <p>
            Choose which stats appear on your club dashboard and public page. Enter historical seed values
            for any stats that were accumulating before this app — they'll be added to everything logged here.
          </p>
        </div>

        <div v-if="statsConfigError" class="error">{{ statsConfigError }}</div>
        <div v-if="statsConfigLoading" class="hint">Loading stats config…</div>

        <div v-else class="stats-config-body">
          <!-- Add stat picker -->
          <div class="stats-add-row" v-if="availableStatsToAdd.length">
            <select v-model="statsPickerSelected" class="stats-picker-select">
              <option value="">+ Add a stat to track…</option>
              <option v-for="s in availableStatsToAdd" :key="s.key" :value="s.key">
                {{ s.icon }} {{ s.label }}{{ s.unit ? ` (${s.unit})` : '' }}
              </option>
            </select>
            <button class="btn btn-secondary btn-sm" @click="addStat" :disabled="!statsPickerSelected">
              Add
            </button>
          </div>

          <!-- Configured stats list -->
          <div class="stats-config-list">
            <div
              v-for="(stat, idx) in statsConfigForm"
              :key="stat.key"
              class="stat-config-row"
              :class="{ 'stat-disabled': !stat.enabled }"
            >
              <div class="stat-config-left">
                <button class="stat-toggle-btn" :title="stat.enabled ? 'Hide stat' : 'Show stat'" @click="stat.enabled = !stat.enabled">
                  <span>{{ stat.enabled ? '👁' : '🚫' }}</span>
                </button>
                <span class="stat-icon-display">{{ stat.icon }}</span>
                <div class="stat-config-info">
                  <input
                    v-model="stat.label"
                    class="stat-label-input"
                    type="text"
                    placeholder="Stat label"
                    maxlength="60"
                  />
                  <span class="stat-key-badge">{{ stat.key }}</span>
                </div>
              </div>

              <div class="stat-config-right">
                <div class="stat-seed-field">
                  <label class="stat-seed-label">Historical starting value</label>
                  <div class="stat-seed-row">
                    <input
                      v-model.number="stat.seedValue"
                      type="number"
                      min="0"
                      step="0.1"
                      class="stat-seed-input"
                      placeholder="0"
                    />
                    <span class="stat-unit-badge" v-if="stat.unit">{{ stat.unit }}</span>
                  </div>
                  <div class="stat-value-preview" v-if="stat.liveValue != null">
                    <span class="stat-preview-label">Live from app:</span>
                    <span class="stat-preview-num">{{ formatStatNum(stat.liveValue, stat.key) }} {{ stat.unit }}</span>
                    <span class="stat-preview-sep">→</span>
                    <span class="stat-preview-total">Total: {{ formatStatNum((stat.seedValue || 0) + (stat.liveValue || 0), stat.key) }} {{ stat.unit }}</span>
                  </div>
                </div>
                <div class="stat-order-btns">
                  <button class="order-btn" :disabled="idx === 0" @click="moveStat(idx, -1)" title="Move up">↑</button>
                  <button class="order-btn" :disabled="idx === statsConfigForm.length - 1" @click="moveStat(idx, 1)" title="Move down">↓</button>
                  <button class="order-btn danger" @click="removeStat(idx)" title="Remove">✕</button>
                </div>
              </div>
            </div>

            <div v-if="!statsConfigForm.length" class="hint">
              No stats configured yet. Use the dropdown above to add stats you want to track and display.
            </div>
          </div>

          <div class="actions-row">
            <button type="button" class="btn btn-secondary" @click="loadStatsConfig" :disabled="statsConfigLoading">
              Refresh
            </button>
            <button type="button" class="btn btn-primary" :disabled="savingStatsConfig" @click="saveStatsConfig">
              {{ savingStatsConfig ? 'Saving…' : 'Save Stats Config' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { TIMEZONE_GROUPS } from '../../utils/timezones.js';
import { useSummitStatsChallengeChrome } from '../../composables/useSummitStatsChallengeChrome';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import IconSelector from '../../components/admin/IconSelector.vue';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const isSsc = useSummitStatsChallengeChrome();

const isAffiliationOrg = (a) => String(a?.organization_type || a?.organizationType || '').toLowerCase() === 'affiliation';

/**
 * Summit club APIs key off the affiliation (club) agency id. If currentAgency is the platform tenant,
 * localStorage, or org switcher left a non-affiliation selected, records/time prefs return 404 / 403.
 */
const resolveClubAgencyForSettings = () => {
  const list = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
  const affiliations = list.filter(isAffiliationOrg);
  if (!affiliations.length) return null;

  const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null;
  const currentId = Number(current?.id || 0);
  if (current && isAffiliationOrg(current) && affiliations.some((x) => Number(x.id) === currentId)) {
    return current;
  }

  const routeSlug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  if (routeSlug) {
    const bySlug = affiliations.find(
      (x) => String(x.slug || x.portal_url || x.portalUrl || '').trim().toLowerCase() === routeSlug
    );
    if (bySlug) return bySlug;
  }

  const qClub = Number(route.query?.clubId || route.query?.club || 0);
  if (qClub && affiliations.some((x) => Number(x.id) === qClub)) {
    return affiliations.find((x) => Number(x.id) === qClub) || null;
  }

  return affiliations[0] || null;
};

const loading = ref(true);
const error = ref('');
const savingIdentity = ref(false);
const uploadingLogo = ref(false);
const logoInputRef = ref(null);
const logoInputMethod = ref('url');

const billingLoading = ref(false);
const billingError = ref('');
const billingSettings = ref({});
const paymentMethods = ref([]);
const invoices = ref([]);
const clubRecords = ref([]);
const recordsError = ref('');
const savingRecords = ref(false);
const recordVerifications = ref([]);
const verificationsLoading = ref(false);

const form = ref({
  logoUrl: '',
  logoPath: '',
  iconId: null,
  primaryColor: '#0f172a',
  secondaryColor: '#1e40af',
  accentColor: '#f97316',
  fontFamily: ''
});

const clubFontPresets = [
  { value: '', label: 'Default (inherit platform)' },
  { value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', label: 'System UI (sans)' },
  { value: 'Georgia, "Times New Roman", Times, serif', label: 'Georgia (serif)' },
  { value: '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif', label: 'Trebuchet / Lucida' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif', label: 'Palatino (serif)' },
  { value: '"Courier New", Courier, monospace', label: 'Courier (monospace)' }
];

const uploadedFontFamilies = ref([]);

/** CSS font-family stack for an uploaded family name (matches /fonts/public resolution). */
const familyToCssStack = (familyName) => {
  const n = String(familyName || '').trim();
  if (!n) return '';
  const escaped = n.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}', sans-serif`;
};

const extraFontOption = computed(() => {
  const cur = String(form.value.fontFamily || '').trim();
  if (!cur) return null;
  const presetVals = clubFontPresets.map((p) => p.value);
  const uploadedVals = uploadedFontFamilies.value.map((name) => familyToCssStack(name));
  if (presetVals.includes(cur) || uploadedVals.includes(cur)) return null;
  const short = cur.length > 56 ? `${cur.slice(0, 56)}…` : cur;
  return { value: cur, label: `Saved font (${short})` };
});

const currentAgency = computed(() => agencyStore.currentAgency?.value || agencyStore.currentAgency || null);
const currentAgencyId = computed(() => Number(currentAgency.value?.id || 0) || null);

const normalizedHex = (raw, fallback) => {
  const src = String(raw || '').trim();
  if (!src) return fallback;
  const prefixed = src.startsWith('#') ? src : `#${src}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(prefixed)) return prefixed.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(prefixed)) {
    return `#${prefixed[1]}${prefixed[1]}${prefixed[2]}${prefixed[2]}${prefixed[3]}${prefixed[3]}`.toUpperCase();
  }
  return fallback;
};

const resolvedLogoUrl = computed(() => {
  if (logoInputMethod.value === 'upload' && form.value.logoPath) return toUploadsUrl(form.value.logoPath);
  return String(form.value.logoUrl || '').trim() || null;
});

const orgTo = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}${path}` : path;
};

const hydrateIdentity = async () => {
  if (!currentAgencyId.value) return;
  const { data } = await api.get(`/agencies/${currentAgencyId.value}`);
  const palette = data?.color_palette
    ? (typeof data.color_palette === 'string' ? JSON.parse(data.color_palette) : data.color_palette)
    : {};
  form.value = {
    logoUrl: data?.logo_url || '',
    logoPath: data?.logo_path || '',
    iconId: data?.icon_id ?? null,
    primaryColor: palette?.primary || '#0f172a',
    secondaryColor: palette?.secondary || '#1e40af',
    accentColor: palette?.accent || '#f97316',
    fontFamily: palette?.fontFamily != null && palette?.fontFamily !== undefined ? String(palette.fontFamily) : ''
  };
  logoInputMethod.value = form.value.logoPath ? 'upload' : 'url';

  const tenantId = Number(data?.affiliated_agency_id || 0) || null;
  try {
    const params = tenantId ? { agencyId: tenantId } : {};
    const res = await api.get('/fonts/families', { params, skipAuthRedirect: true });
    uploadedFontFamilies.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    uploadedFontFamilies.value = [];
  }
};

const saveIdentity = async () => {
  if (!currentAgencyId.value) return;
  try {
    savingIdentity.value = true;
    error.value = '';
    const colorPalette = {
      primary: normalizedHex(form.value.primaryColor, '#0F172A'),
      secondary: normalizedHex(form.value.secondaryColor, '#1E40AF'),
      accent: normalizedHex(form.value.accentColor, '#F97316')
    };
    if (String(form.value.fontFamily || '').trim()) {
      colorPalette.fontFamily = String(form.value.fontFamily).trim();
    } else {
      colorPalette.fontFamily = null;
    }
    const payload = {
      logoUrl: logoInputMethod.value === 'url' ? (form.value.logoUrl?.trim() || null) : null,
      logoPath: logoInputMethod.value === 'upload' ? (form.value.logoPath || null) : null,
      iconId: form.value.iconId ?? null,
      colorPalette
    };
    await api.put(`/agencies/${currentAgencyId.value}`, payload);
    await hydrateIdentity();
    await agencyStore.fetchUserAgencies();
    try {
      brandingStore.syncDocumentThemeFromSelectedAgency();
    } catch {
      // non-fatal
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save club identity';
  } finally {
    savingIdentity.value = false;
  }
};

const onUploadLogo = async (event) => {
  const file = event?.target?.files?.[0] || null;
  if (!file) return;
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    error.value = 'Invalid file type. Please upload PNG, JPG, GIF, SVG, or WebP.';
    return;
  }
  try {
    uploadingLogo.value = true;
    error.value = '';
    const formData = new FormData();
    formData.append('logo', file);
    const { data } = await api.post('/logos/upload', formData);
    if (data?.success && data?.path) {
      form.value.logoPath = data.path;
      form.value.logoUrl = '';
      logoInputMethod.value = 'upload';
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to upload logo';
  } finally {
    uploadingLogo.value = false;
    try {
      if (logoInputRef.value) logoInputRef.value.value = '';
    } catch {
      // ignore
    }
  }
};

const humanizeBillingLoadError = (raw) => {
  const msg = String(raw || '').trim();
  if (!msg) return 'Billing details could not be loaded.';
  if (/mysqld_stmt_execute|ER_WRONG_ARGUMENTS|Incorrect arguments/i.test(msg)) {
    return 'Billing service is temporarily unavailable. Your club remains on the free trial (beta); try Refresh Billing in a moment.';
  }
  return msg;
};

const loadBilling = async () => {
  if (!currentAgencyId.value) return;
  try {
    billingLoading.value = true;
    billingError.value = '';
    const [settingsRes, methodsRes, invoicesRes] = await Promise.all([
      api.get(`/billing/${currentAgencyId.value}/settings`),
      api.get(`/billing/${currentAgencyId.value}/payment-methods`),
      api.get(`/billing/${currentAgencyId.value}/invoices`)
    ]);
    billingSettings.value = settingsRes?.data || {};
    const methodsPayload = methodsRes?.data;
    paymentMethods.value = Array.isArray(methodsPayload?.methods)
      ? methodsPayload.methods
      : (Array.isArray(methodsPayload) ? methodsPayload : []);
    invoices.value = Array.isArray(invoicesRes?.data) ? invoicesRes.data : [];
  } catch (e) {
    billingError.value = humanizeBillingLoadError(
      e?.response?.data?.error?.message || e?.message || 'Failed to load billing'
    );
  } finally {
    billingLoading.value = false;
  }
};

// ── Time Preferences ───────────────────────────────────────
const timePrefsLoading = ref(false);
const timePrefsError   = ref('');
const savingTimePrefs  = ref(false);
const timePrefsForm    = ref({ timezone: '', timeFormat: '12h' });

// ── Team Store Configuration ────────────────────────────────
const storeConfigLoading = ref(false);
const savingStoreConfig  = ref(false);
const storeConfigError   = ref('');
const storeForm = ref({ enabled: false, title: 'Team Store', description: '', buttonText: 'Shop Now', url: '' });
const publicPageConfigLoading = ref(false);
const savingPublicPageConfig = ref(false);
const publicPageConfigError = ref('');
const publicPageAlbumInput = ref('');
const bannerUploadInputRef = ref(null);
const albumUploadInputRef = ref(null);
const bannerImageUploading = ref(false);
const albumImagesUploading = ref(false);
const publicPageForm = ref({
  publicSlug: '',
  bannerTitle: '',
  bannerSubtitle: '',
  bannerImageUrl: '',
  showCurrentSeason: true,
  showActiveParticipants: true,
  showFeaturedWorkout: true,
  showPhotoAlbum: true,
  showClubFeed: true,
  publicFeedEnabled: false
});

const BUILT_IN_GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' }
];
const genderOptionsSelected = ref(['male', 'female']);
const customGenderInput = ref('');

const toggleBuiltInGender = (value) => {
  const idx = genderOptionsSelected.value.indexOf(value);
  if (idx >= 0) {
    genderOptionsSelected.value.splice(idx, 1);
  } else {
    genderOptionsSelected.value.push(value);
  }
};
const addCustomGender = () => {
  const val = String(customGenderInput.value || '').trim();
  if (!val || genderOptionsSelected.value.includes(val)) { customGenderInput.value = ''; return; }
  genderOptionsSelected.value.push(val);
  customGenderInput.value = '';
};
const removeGenderOption = (value) => {
  genderOptionsSelected.value = genderOptionsSelected.value.filter((v) => v !== value);
};
const isBuiltInGender = (value) => BUILT_IN_GENDER_OPTIONS.some((o) => o.value === value);
const orgSlugForPreview = computed(() => String(route.params?.organizationSlug || '').trim() || 'ssc');
const publicPageUrlPreview = computed(() => {
  const slug = String(publicPageForm.value.publicSlug || '').trim();
  const ref = slug || String(currentAgencyId.value || '');
  if (!ref) return `${window.location.origin}/${orgSlugForPreview.value}/clubs`;
  return `${window.location.origin}/${orgSlugForPreview.value}/clubs/${ref}`;
});

const publicPageAlbumPreviewUrls = computed(() =>
  String(publicPageAlbumInput.value || '')
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter(Boolean)
);

const uploadPublicPageImage = async (file) => {
  if (!file) return null;
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Please upload PNG, JPG, GIF, SVG, or WebP.');
  }
  const formData = new FormData();
  formData.append('logo', file);
  const { data } = await api.post('/logos/upload', formData, {
    skipGlobalLoading: true,
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  if (!data?.success) throw new Error('Upload failed');
  return data?.path ? toUploadsUrl(data.path) : String(data?.url || '').trim();
};

const onBannerImageSelected = async (event) => {
  const file = event?.target?.files?.[0] || null;
  if (!file) return;
  try {
    bannerImageUploading.value = true;
    publicPageConfigError.value = '';
    const uploadedUrl = await uploadPublicPageImage(file);
    if (uploadedUrl) publicPageForm.value.bannerImageUrl = uploadedUrl;
  } catch (e) {
    publicPageConfigError.value = e?.response?.data?.error?.message || e?.message || 'Failed to upload banner image';
  } finally {
    bannerImageUploading.value = false;
    try {
      if (bannerUploadInputRef.value) bannerUploadInputRef.value.value = '';
    } catch {
      // ignore
    }
  }
};

const onAlbumImagesSelected = async (event) => {
  const files = Array.from(event?.target?.files || []);
  if (!files.length) return;
  try {
    albumImagesUploading.value = true;
    publicPageConfigError.value = '';
    const uploadedUrls = [];
    for (const file of files) {
      const uploadedUrl = await uploadPublicPageImage(file);
      if (uploadedUrl) uploadedUrls.push(uploadedUrl);
    }
    if (uploadedUrls.length) {
      const next = [...publicPageAlbumPreviewUrls.value, ...uploadedUrls].slice(0, 20);
      publicPageAlbumInput.value = next.join('\n');
    }
  } catch (e) {
    publicPageConfigError.value = e?.response?.data?.error?.message || e?.message || 'Failed to upload album photos';
  } finally {
    albumImagesUploading.value = false;
    try {
      if (albumUploadInputRef.value) albumUploadInputRef.value.value = '';
    } catch {
      // ignore
    }
  }
};

const removeAlbumSlide = (index) => {
  const next = [...publicPageAlbumPreviewUrls.value];
  next.splice(index, 1);
  publicPageAlbumInput.value = next.join('\n');
};

const loadStoreConfig = async () => {
  if (!currentAgencyId.value) return;
  storeConfigLoading.value = true;
  storeConfigError.value   = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/store-config`);
    if (data?.store) storeForm.value = { ...storeForm.value, ...data.store };
  } catch (e) {
    storeConfigError.value = e?.response?.data?.error?.message || 'Failed to load store config';
  } finally {
    storeConfigLoading.value = false;
  }
};

const saveStoreConfig = async () => {
  if (!currentAgencyId.value) return;
  savingStoreConfig.value = true;
  storeConfigError.value  = '';
  try {
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/store-config`, storeForm.value);
  } catch (e) {
    storeConfigError.value = e?.response?.data?.error?.message || 'Failed to save store config';
  } finally {
    savingStoreConfig.value = false;
  }
};

const loadPublicPageConfig = async () => {
  if (!currentAgencyId.value) return;
  publicPageConfigLoading.value = true;
  publicPageConfigError.value = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/public-page-config`);
    const cfg = data?.config || {};
    publicPageForm.value = {
      publicSlug: cfg.publicSlug || '',
      bannerTitle: cfg.bannerTitle || '',
      bannerSubtitle: cfg.bannerSubtitle || '',
      bannerImageUrl: cfg.bannerImageUrl || '',
      showCurrentSeason: cfg.showCurrentSeason !== false,
      showActiveParticipants: cfg.showActiveParticipants !== false,
      showFeaturedWorkout: cfg.showFeaturedWorkout !== false,
      showPhotoAlbum: cfg.showPhotoAlbum !== false,
      showClubFeed: cfg.showClubFeed !== false,
      publicFeedEnabled: cfg.publicFeedEnabled === true
    };
    genderOptionsSelected.value = Array.isArray(cfg.genderOptions) && cfg.genderOptions.length
      ? cfg.genderOptions
      : ['male', 'female'];
    publicPageAlbumInput.value = Array.isArray(cfg.albumSlides)
      ? cfg.albumSlides.map((s) => String(s?.imageUrl || '').trim()).filter(Boolean).join('\n')
      : '';
  } catch (e) {
    publicPageConfigError.value = e?.response?.data?.error?.message || 'Failed to load public page config';
  } finally {
    publicPageConfigLoading.value = false;
  }
};

const savePublicPageConfig = async () => {
  if (!currentAgencyId.value) return;
  savingPublicPageConfig.value = true;
  publicPageConfigError.value = '';
  try {
    const albumSlides = String(publicPageAlbumInput.value || '')
      .split('\n')
      .map((line) => String(line || '').trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((imageUrl) => ({ imageUrl, caption: '' }));
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/public-page-config`, {
      ...publicPageForm.value,
      albumSlides,
      genderOptions: genderOptionsSelected.value.filter(Boolean)
    });
    await loadPublicPageConfig();
  } catch (e) {
    publicPageConfigError.value = e?.response?.data?.error?.message || 'Failed to save public page config';
  } finally {
    savingPublicPageConfig.value = false;
  }
};

// ── Club Stats Configuration ────────────────────────────────
const statsConfigLoading  = ref(false);
const savingStatsConfig   = ref(false);
const statsConfigError    = ref('');
const statsConfigForm     = ref([]);  // ordered list of stat items (editable)
const availableStatsDefs  = ref([]); // full definition list from API
const statsPickerSelected = ref('');

const availableStatsToAdd = computed(() => {
  const inUse = new Set(statsConfigForm.value.map((s) => s.key));
  return availableStatsDefs.value.filter((d) => !inUse.has(d.key));
});

const formatStatNum = (val, key) => {
  const n = Number(val || 0);
  const decimalKeys = new Set(['total_miles', 'run_miles', 'ruck_miles']);
  return decimalKeys.has(key) ? n.toFixed(1) : Math.round(n).toLocaleString();
};

const loadStatsConfig = async () => {
  if (!currentAgencyId.value) return;
  statsConfigLoading.value = true;
  statsConfigError.value   = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/stats-config`);
    statsConfigForm.value    = Array.isArray(data?.config) ? data.config.map((c) => ({ ...c })) : [];
    availableStatsDefs.value = Array.isArray(data?.availableStats) ? data.availableStats : [];
  } catch (e) {
    statsConfigError.value = e?.response?.data?.error?.message || 'Failed to load stats config';
  } finally {
    statsConfigLoading.value = false;
  }
};

const saveStatsConfig = async () => {
  if (!currentAgencyId.value) return;
  savingStatsConfig.value = true;
  statsConfigError.value  = '';
  try {
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/stats-config`, {
      config: statsConfigForm.value.map((s) => ({
        key:       s.key,
        label:     s.label,
        unit:      s.unit,
        icon:      s.icon,
        enabled:   s.enabled,
        seedValue: Number(s.seedValue || 0)
      }))
    });
    await loadStatsConfig(); // reload to get fresh liveValue totals
  } catch (e) {
    statsConfigError.value = e?.response?.data?.error?.message || 'Failed to save stats config';
  } finally {
    savingStatsConfig.value = false;
  }
};

const addStat = () => {
  const key = statsPickerSelected.value;
  if (!key) return;
  const def = availableStatsDefs.value.find((d) => d.key === key);
  if (!def) return;
  statsConfigForm.value.push({
    key:       def.key,
    label:     def.label,
    unit:      def.unit || '',
    icon:      def.icon || '',
    enabled:   true,
    seedValue: 0,
    liveValue: 0,
    totalValue: 0
  });
  statsPickerSelected.value = '';
};

const removeStat = (idx) => {
  statsConfigForm.value.splice(idx, 1);
};

const moveStat = (idx, dir) => {
  const arr = statsConfigForm.value;
  const target = idx + dir;
  if (target < 0 || target >= arr.length) return;
  [arr[idx], arr[target]] = [arr[target], arr[idx]];
};

const loadTimePrefs = async () => {
  if (!currentAgencyId.value) return;
  timePrefsLoading.value = true;
  timePrefsError.value = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/time-preferences`);
    timePrefsForm.value = { timezone: data?.timezone || '', timeFormat: data?.timeFormat || '12h' };
  } catch (e) {
    timePrefsError.value = e?.response?.data?.error?.message || 'Failed to load time preferences';
  } finally {
    timePrefsLoading.value = false;
  }
};

const saveTimePrefs = async () => {
  if (!currentAgencyId.value) return;
  savingTimePrefs.value = true;
  timePrefsError.value = '';
  try {
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/time-preferences`, {
      timezone:   timePrefsForm.value.timezone || null,
      timeFormat: timePrefsForm.value.timeFormat
    });
  } catch (e) {
    timePrefsError.value = e?.response?.data?.error?.message || 'Failed to save time preferences';
  } finally {
    savingTimePrefs.value = false;
  }
};

const loadClubRecords = async () => {
  if (!currentAgencyId.value) return;
  try {
    recordsError.value = '';
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/records`);
    clubRecords.value = Array.isArray(data?.records)
      ? data.records.map((r, idx) => ({
        id: r.id || `record-${Date.now()}-${idx}`,
        label: r.label || '',
        value: r.value ?? null,
        unit: r.unit || '',
        notes: r.notes || '',
        metricKey: r.metricKey || ''
      }))
      : [];
  } catch (e) {
    clubRecords.value = [];
    recordsError.value = e?.response?.data?.error?.message || 'Failed to load club records';
  }
};

const addRecord = () => {
  clubRecords.value.push({
    id: `record-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    value: '',
    unit: '',
    notes: '',
    metricKey: ''
  });
};

const removeRecord = (idx) => {
  clubRecords.value.splice(idx, 1);
};

const saveRecords = async () => {
  if (!currentAgencyId.value) return;
  try {
    savingRecords.value = true;
    recordsError.value = '';
    const payload = {
      records: clubRecords.value.map((r) => ({
        id: r.id,
        label: String(r.label || '').trim(),
        value: r.value != null ? Number(r.value) : null,
        unit: String(r.unit || '').trim(),
        notes: String(r.notes || '').trim(),
        metricKey: String(r.metricKey || '').trim() || null
      }))
    };
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/records`, payload);
    await Promise.all([loadClubRecords(), loadRecordVerifications()]);
  } catch (e) {
    recordsError.value = e?.response?.data?.error?.message || 'Failed to save club records';
  } finally {
    savingRecords.value = false;
  }
};

const loadRecordVerifications = async () => {
  if (!currentAgencyId.value) return;
  try {
    verificationsLoading.value = true;
    const { data } = await api.get(`/summit-stats/clubs/${currentAgencyId.value}/records/verifications`);
    recordVerifications.value = Array.isArray(data?.verifications)
      ? data.verifications.filter((v) => String(v.status || '').toLowerCase() === 'pending')
      : [];
  } catch {
    recordVerifications.value = [];
  } finally {
    verificationsLoading.value = false;
  }
};

const reviewVerification = async (verificationId, status) => {
  if (!currentAgencyId.value || !verificationId) return;
  try {
    await api.put(`/summit-stats/clubs/${currentAgencyId.value}/records/verifications/${verificationId}`, { status });
    await Promise.all([loadRecordVerifications(), loadClubRecords()]);
  } catch (e) {
    recordsError.value = e?.response?.data?.error?.message || 'Failed to review verification request';
  }
};

const setDefaultPaymentMethod = async (paymentMethodId) => {
  if (!currentAgencyId.value || !paymentMethodId) return;
  try {
    await api.post(`/billing/${currentAgencyId.value}/payment-methods/${paymentMethodId}/default`);
    await loadBilling();
  } catch (e) {
    billingError.value = e?.response?.data?.error?.message || 'Failed to set default payment method';
  }
};

const downloadInvoice = (invoiceId) => {
  if (!invoiceId) return;
  const base = String(api.defaults.baseURL || '').replace(/\/api\/?$/, '');
  window.open(`${base}/api/billing/invoices/${invoiceId}/pdf`, '_blank', 'noopener');
};

const formatCurrency = (cents) => {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};

onMounted(async () => {
  try {
    loading.value = true;
    await agencyStore.fetchUserAgencies();
    if (!isSsc.value) {
      router.replace(orgTo('/admin/settings'));
      return;
    }
    const resolved = resolveClubAgencyForSettings();
    if (resolved) {
      agencyStore.setCurrentAgency(resolved);
    }
    if (!currentAgencyId.value) {
      error.value = 'No club context found for this user.';
      return;
    }
    if (!isAffiliationOrg(currentAgency.value)) {
      error.value =
        'Club settings need a Summit club organization selected. Your account may still be on the platform tenant — pick your club from the organization switcher, then return here.';
      return;
    }
    await Promise.all([hydrateIdentity(), loadBilling(), loadTimePrefs(), loadClubRecords(), loadRecordVerifications(), loadStatsConfig(), loadStoreConfig(), loadPublicPageConfig()]);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load club settings';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.club-settings-header {
  margin-bottom: 20px;
}

.club-settings-header h1 {
  margin: 0;
}

.club-settings-header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
}

.cards-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  max-width: 920px;
}

.settings-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 16px;
  box-shadow: var(--shadow);
  position: relative;
  z-index: 0;
  min-width: 0;
}

.card-header h2 {
  margin: 0;
  font-size: 18px;
}

.card-header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.field label {
  font-weight: 700;
}

/* ── Toggle-row (12h / 24h picker) ── */
.toggle-row {
  display: flex;
  gap: 8px;
}
.toggle-option {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: #fff;
  transition: background .15s, border-color .15s;
  user-select: none;
}
.toggle-option.active {
  background: var(--primary, #1d4ed8);
  color: #fff;
  border-color: var(--primary, #1d4ed8);
}

.mode-row,
.icon-row,
.actions-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mode-row .btn.active {
  border-color: var(--primary);
}

.logo-preview {
  margin-top: 12px;
  width: 88px;
  height: 88px;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-alt);
}

.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.colors-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 6px;
}

.color-picker {
  height: 36px;
  padding: 0;
}

.club-font-select {
  width: 100%;
  max-width: 420px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg, #fff);
  font-size: 14px;
}

.billing-beta-notice {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.08);
  color: var(--text-primary, #0f172a);
  font-size: 0.92rem;
  line-height: 1.45;
}
.billing-beta-notice strong {
  display: block;
  margin-bottom: 6px;
  color: var(--text-primary, #0f172a);
}

.billing-summary {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.mini-list {
  margin-top: 14px;
}

.mini-list h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.mini-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

.records-list {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.record-row {
  display: grid;
  gap: 8px;
  grid-template-columns: 1.2fr 0.7fr 0.8fr 0.9fr 1.2fr auto;
}

@media (max-width: 1200px) {
  .record-row {
    grid-template-columns: 1fr;
  }
}

.pill {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.hint {
  color: var(--text-secondary);
  font-size: 12px;
}

/* ── Team Store ───────────────────────────────────────────── */
.store-config-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.store-input {
  width: 100%;
  max-width: 480px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  background: white;
}
.visually-hidden-file {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.image-upload-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.public-image-preview {
  margin-top: 4px;
  width: min(100%, 420px);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: #f8fafc;
}
.public-image-preview img {
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: cover;
}

/* Gender options configurator */
.gender-options-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.gender-option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}
.gender-option-custom {
  gap: 6px;
}
.gender-custom-chip {
  background: #f1f5f9;
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 2px 10px;
  font-size: 12px;
  color: var(--text-secondary);
}
.gender-remove-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: #ef4444;
  padding: 0 2px;
  line-height: 1;
}
.gender-add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.album-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}
.album-preview-item {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: #f8fafc;
  min-height: 96px;
}
.album-preview-item img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 96px;
  object-fit: cover;
}
.album-preview-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  background: rgba(15, 23, 42, 0.72);
  color: white;
  cursor: pointer;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-2, #f1f5f9);
  cursor: pointer;
  font-weight: 600;
  color: var(--text);
}
.store-preview {
  margin-top: 4px;
}
.store-preview-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.store-preview-rail {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #eff6ff, #f0fdf4);
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  padding: 14px 16px;
}
.store-rail-icon {
  font-size: 24px;
  flex-shrink: 0;
}
.store-rail-body {
  flex: 1;
  min-width: 0;
}
.store-rail-title {
  font-weight: 700;
  font-size: 14px;
}
.store-rail-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.store-rail-btn {
  background: var(--primary, #2563eb);
  color: white;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
}
.store-rail-btn:hover {
  background: var(--primary-dark, #1d4ed8);
}

/* ── Stats Config ─────────────────────────────────────────── */
.stats-config-card {
  grid-column: 1 / -1; /* full-width on the settings grid */
}
.stats-config-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.stats-add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.stats-picker-select {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  background: white;
}
.stats-config-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.stat-config-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  background: var(--bg-secondary, #f8fafc);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  transition: opacity 0.15s;
}
.stat-config-row.stat-disabled {
  opacity: 0.5;
}
.stat-config-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.stat-toggle-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}
.stat-icon-display {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1.2;
}
.stat-config-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.stat-label-input {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  font-weight: 600;
  width: 200px;
  max-width: 100%;
}
.stat-key-badge {
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--bg-muted, #e8edf2);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: monospace;
  width: fit-content;
}
.stat-config-right {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
}
.stat-seed-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-seed-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}
.stat-seed-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stat-seed-input {
  width: 100px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  text-align: right;
}
.stat-unit-badge {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.stat-value-preview {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  flex-wrap: wrap;
  max-width: 260px;
}
.stat-preview-num   { font-weight: 600; color: var(--text-primary); }
.stat-preview-total { font-weight: 700; color: var(--accent, #2563eb); }
.stat-preview-sep   { color: var(--text-secondary); }
.stat-order-btns {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.order-btn {
  background: var(--bg-muted, #e8edf2);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 6px;
  line-height: 1.4;
}
.order-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.order-btn.danger { color: #dc2626; }
.order-btn.danger:hover { background: #fee2e2; }

@media (max-width: 640px) {
  .stats-add-row {
    flex-direction: column;
    align-items: stretch;
  }
  .stat-config-row {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }
  .stat-config-left,
  .stat-config-right {
    width: 100%;
  }
  .stat-config-right {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .stat-label-input,
  .stat-seed-input {
    width: 100%;
  }
  .stat-seed-row {
    align-items: center;
  }
  .stat-order-btns {
    flex-direction: row;
    justify-content: flex-end;
  }
  .order-btn {
    min-width: 42px;
    min-height: 38px;
  }
}
</style>
