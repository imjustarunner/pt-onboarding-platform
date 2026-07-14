<template>
  <div class="cr" :class="{ 'cr--editing': canEditCareers }" :style="rootStyle">
    <!-- Logged-in hiring managers: edit this public page in place -->
    <div v-if="canEditCareers" class="cr-editor-bar" :class="{ 'cr-editor-bar--active': editing }">
      <template v-if="!editing">
        <button class="cr-editor-btn cr-editor-btn--primary" type="button" @click="startEdit">
          Edit page
        </button>
        <router-link class="cr-editor-link" :to="adminCareersPath">Full editor</router-link>
      </template>
      <template v-else>
        <span class="cr-editor-hint">Editing</span>
        <button class="cr-editor-btn" type="button" @click="showPhotoPicker = !showPhotoPicker">
          {{ showPhotoPicker ? 'Hide photo' : 'Change photo' }}
        </button>
        <button class="cr-editor-btn" type="button" @click="openStoryForEdit('why')">Why</button>
        <button class="cr-editor-btn" type="button" @click="openStoryForEdit('impact')">Impact / stats</button>
        <button
          class="cr-editor-btn cr-editor-btn--primary"
          type="button"
          :disabled="savingEdit"
          @click="saveEdit"
        >{{ savingEdit ? 'Saving…' : 'Save' }}</button>
        <button class="cr-editor-btn" type="button" :disabled="savingEdit" @click="cancelEdit">Cancel</button>
        <router-link class="cr-editor-link" :to="adminCareersPath">Full editor</router-link>

        <div class="cr-style-strip">
          <label class="cr-style-field">
            <span>Accent</span>
            <input v-model="editDraft.accentColor" type="color" class="cr-style-color" />
          </label>
          <label class="cr-style-field">
            <span>Body font</span>
            <select v-model="editDraft.fontFamily" class="cr-style-select">
              <option v-for="f in fontOptions" :key="`body-${f.id || 'default'}`" :value="f.id">{{ f.label }}</option>
            </select>
          </label>
          <label class="cr-style-field">
            <span>Headings</span>
            <select v-model="editDraft.headingFontFamily" class="cr-style-select">
              <option v-for="f in fontOptions" :key="`head-${f.id || 'default'}`" :value="f.id">{{ f.label }}</option>
            </select>
          </label>
          <label class="cr-style-field">
            <span>Style target</span>
            <select v-model="styleTarget" class="cr-style-select">
              <option v-for="t in textStyleKeys" :key="t.id" :value="t.id">{{ t.label }}</option>
            </select>
          </label>
          <button
            class="cr-style-toggle"
            type="button"
            :class="{ 'cr-style-toggle--on': activeTextStyle.bold }"
            title="Bold"
            @click="toggleStyleFlag('bold')"
          >B</button>
          <button
            class="cr-style-toggle cr-style-toggle--italic"
            type="button"
            :class="{ 'cr-style-toggle--on': activeTextStyle.italic }"
            title="Italic"
            @click="toggleStyleFlag('italic')"
          >I</button>
          <label class="cr-style-field">
            <span>Size</span>
            <select :value="activeTextStyle.fontSize" class="cr-style-select" @change="setStyleFontSize($event.target.value)">
              <option v-for="s in sizePresets" :key="`size-${s.id || 'default'}`" :value="s.css">{{ s.label }}</option>
            </select>
          </label>
          <label class="cr-style-field">
            <span>Color</span>
            <input
              :value="activeTextStyle.color || '#0f172a'"
              type="color"
              class="cr-style-color"
              @input="setStyleColor($event.target.value)"
            />
          </label>
          <label class="cr-style-field">
            <span>Field font</span>
            <select :value="activeTextStyle.fontFamily" class="cr-style-select" @change="setStyleFontFamily($event.target.value)">
              <option v-for="f in fontOptions" :key="`field-${f.id || 'default'}`" :value="f.id">{{ f.label }}</option>
            </select>
          </label>
        </div>
      </template>
      <p v-if="editError" class="cr-editor-error">{{ editError }}</p>
      <p v-if="editSavedFlash" class="cr-editor-ok">Saved</p>
    </div>

    <!-- ── NAV ── -->
    <nav class="cr-nav">
      <div class="cr-nav-inner">
        <a class="cr-nav-brand" href="#top" @click.prevent="scrollToId('top')">
          <img v-if="headerLogoUrl" class="cr-nav-logo" :src="headerLogoUrl" :alt="headerLogoAlt" loading="eager" />
          <span class="cr-nav-wordmark">
            <span class="cr-nav-wordmark-name">{{ brandWordmark }}</span>
            <span class="cr-nav-careers-label">CAREERS</span>
          </span>
        </a>
        <div class="cr-nav-links">
          <template v-if="editing && editDraft">
            <div
              v-for="(item, i) in editDraft.navItems"
              :key="`nav-edit-${i}`"
              class="cr-nav-edit"
              :class="{ 'cr-nav-edit--button': item.style === 'button' }"
            >
              <input v-model="item.label" class="cr-inline-input cr-inline-input--nav" type="text" :aria-label="`Nav label ${i + 1}`" />
            </div>
          </template>
          <template v-else>
            <template v-for="item in navItems" :key="item.label">
              <a
                v-if="item.style === 'button'"
                class="cr-nav-btn"
                href="#"
                @click.prevent="handleNavAction(item)"
              >{{ item.label }}</a>
              <a
                v-else
                class="cr-nav-link"
                href="#"
                @click.prevent="handleNavAction(item)"
              >
                <img
                  v-if="featureIconSrc(item.icon)"
                  class="cr-nav-link-icon"
                  :src="featureIconSrc(item.icon)"
                  alt=""
                  aria-hidden="true"
                />
                {{ item.label }}
              </a>
            </template>
          </template>
        </div>
      </div>
    </nav>

    <!-- ── HERO ── -->
    <header id="top" class="cr-hero">
      <div class="cr-hero-inner">
        <div id="why" class="cr-hero-copy">
          <template v-if="editing && editDraft">
            <input
              v-model="editDraft.eyebrow"
              class="cr-inline-input cr-eyebrow cr-inline-input--block"
              type="text"
              placeholder="Eyebrow (optional)"
              :style="fieldStyle('eyebrow')"
              @focus="styleTarget = 'eyebrow'"
            />
            <h1 class="cr-hero-h1">
              <input
                v-model="editDraft.heroHeadline"
                class="cr-inline-input cr-hero-headline cr-inline-input--block"
                type="text"
                placeholder="Headline"
                :style="fieldStyle('heroHeadline', { asHeading: true })"
                @focus="styleTarget = 'heroHeadline'"
              />
              <input
                v-model="editDraft.heroSubheadline"
                class="cr-inline-input cr-hero-subheadline cr-inline-input--block"
                type="text"
                placeholder="Subheadline"
                :style="fieldStyle('heroSubheadline', { asHeading: true })"
                @focus="styleTarget = 'heroSubheadline'"
              />
            </h1>
            <textarea
              v-model="editDraft.lead"
              class="cr-inline-input cr-hero-lead cr-inline-input--area"
              rows="3"
              placeholder="Lead paragraph"
              :style="fieldStyle('lead')"
              @focus="styleTarget = 'lead'"
            />
            <div class="cr-feature-cards">
              <div
                v-for="(card, i) in editDraft.featureCards"
                :key="`feat-${i}`"
                class="cr-feature-card cr-feature-card--editing"
              >
                <span class="cr-feature-icon" aria-hidden="true">
                  <img v-if="featureIconSrc(card.icon)" class="cr-feature-icon-img" :src="featureIconSrc(card.icon)" alt="" />
                  <template v-else>{{ cardIconEmoji(card.icon) }}</template>
                </span>
                <div class="cr-feature-edit">
                  <input
                    v-model="card.title"
                    class="cr-inline-input cr-inline-input--block"
                    type="text"
                    placeholder="Feature title"
                    :style="fieldStyle('featureTitle', { asHeading: true })"
                    @focus="styleTarget = 'featureTitle'"
                  />
                  <textarea
                    v-model="card.body"
                    class="cr-inline-input cr-inline-input--area"
                    rows="2"
                    placeholder="Feature body"
                    :style="fieldStyle('featureBody')"
                    @focus="styleTarget = 'featureBody'"
                  />
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <span v-if="eyebrow" class="cr-eyebrow" :style="fieldStyle('eyebrow')">{{ eyebrow }}</span>
            <h1 class="cr-hero-h1">
              <span v-if="heroHeadline" class="cr-hero-headline" :style="fieldStyle('heroHeadline', { asHeading: true })">{{ heroHeadline }}</span>
              <span v-if="heroSubheadline" class="cr-hero-subheadline" :style="fieldStyle('heroSubheadline', { asHeading: true })">{{ heroSubheadline }}</span>
            </h1>
            <p v-if="careersSubtitle" class="cr-hero-lead" :style="fieldStyle('lead')">{{ careersSubtitle }}</p>
            <div v-if="agencyFeatureCards.length" class="cr-feature-cards">
              <div v-for="card in agencyFeatureCards" :key="card.title" class="cr-feature-card">
                <span class="cr-feature-icon" aria-hidden="true">
                  <img v-if="featureIconSrc(card.icon)" class="cr-feature-icon-img" :src="featureIconSrc(card.icon)" alt="" />
                  <template v-else>{{ cardIconEmoji(card.icon) }}</template>
                </span>
                <div>
                  <strong class="cr-feature-title" :style="fieldStyle('featureTitle', { asHeading: true })">{{ card.title }}</strong>
                  <span v-if="card.body" class="cr-feature-body" :style="fieldStyle('featureBody')">{{ card.body }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <figure
          class="cr-hero-fig"
          :class="{
            'cr-hero-fig--preframed': heroFrameStyle === 'preframed',
            'cr-hero-fig--organic': heroFrameStyle === 'organic',
            'cr-hero-fig--editing': editing
          }"
        >
          <div class="cr-hero-frame">
            <img
              class="cr-hero-img"
              :src="heroDisplayUrl"
              :alt="careersHeroImageAlt"
              :style="{ objectPosition: careersHeroImagePosition }"
              loading="eager"
            />
            <div v-if="editing" class="cr-hero-photo-overlay">
              <button class="cr-editor-btn cr-editor-btn--primary" type="button" @click="showPhotoPicker = !showPhotoPicker">
                {{ showPhotoPicker ? 'Close photo tools' : 'Replace photo' }}
              </button>
            </div>
          </div>

          <div v-if="editing && showPhotoPicker && editDraft" class="cr-photo-picker">
            <p class="cr-photo-picker-title">Hero photo</p>
            <div class="cr-photo-presets">
              <button
                v-for="preset in heroPresets"
                :key="preset.id"
                type="button"
                class="cr-photo-preset"
                :class="{ 'cr-photo-preset--active': editDraft.heroImageUrl === preset.url }"
                @click="applyHeroPreset(preset)"
              >
                <img :src="preset.url" :alt="preset.label" />
                <span>{{ preset.label }}</span>
              </button>
            </div>
            <label class="cr-photo-upload">
              <span>Upload your own</span>
              <input ref="heroFileInputRef" type="file" accept="image/*" @change="onHeroFileChange" />
            </label>
            <p v-if="pendingHeroFileName" class="cr-photo-upload-name">Selected: {{ pendingHeroFileName }}</p>
            <label class="cr-style-field cr-style-field--block">
              <span>Alt text</span>
              <input v-model="editDraft.heroImageAlt" class="cr-inline-input" type="text" placeholder="Describe the photo" />
            </label>
            <label class="cr-style-field cr-style-field--block">
              <span>Focal point</span>
              <input v-model="editDraft.heroImagePosition" class="cr-inline-input" type="text" placeholder="center center" />
            </label>
            <label class="cr-style-field cr-style-field--block">
              <span>Frame style</span>
              <select v-model="editDraft.heroFrameStyle" class="cr-style-select">
                <option value="preframed">Pre-framed artwork</option>
                <option value="organic">Organic photo crop</option>
                <option value="rounded">Rounded</option>
              </select>
            </label>
          </div>
        </figure>
      </div>
    </header>

    <!-- ── FILTERS ── -->
    <div class="cr-filters-wrap">
      <div class="cr-filters">
        <div class="cr-pill-group">
          <button class="cr-pill" :class="{ 'cr-pill--active': !selectedRoleType }" type="button" @click="selectedRoleType = ''">All Roles</button>
          <button
            v-for="rt in availableRoleTypes"
            :key="rt"
            class="cr-pill"
            :class="{ 'cr-pill--active': selectedRoleType === rt }"
            type="button"
            @click="selectedRoleType = rt"
          >{{ rt }}</button>
        </div>

        <div class="cr-pill-group cr-pill-group--location">
          <svg class="cr-loc-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1.5A4.5 4.5 0 0 1 12.5 6c0 3.5-4.5 8.5-4.5 8.5S3.5 9.5 3.5 6A4.5 4.5 0 0 1 8 1.5Z" stroke="currentColor" stroke-width="1.3"/>
            <circle cx="8" cy="6" r="1.5" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          <button class="cr-pill" :class="{ 'cr-pill--active': !selectedLocation }" type="button" @click="selectedLocation = ''">All Locations</button>
          <button
            v-for="loc in availableLocations"
            :key="loc"
            class="cr-pill"
            :class="{ 'cr-pill--active': selectedLocation === loc }"
            type="button"
            @click="selectedLocation = loc"
          >{{ loc }}</button>
        </div>

        <div class="cr-sort-wrap">
          <svg class="cr-sort-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="4" width="12" height="1.3" rx="0.65" fill="currentColor"/>
            <rect x="4" y="7.3" width="8" height="1.3" rx="0.65" fill="currentColor"/>
            <rect x="6" y="10.6" width="4" height="1.3" rx="0.65" fill="currentColor"/>
          </svg>
          <select v-model="sortBy" class="cr-select">
            <option value="featured_desc">Newest Posted</option>
            <option value="posted_asc">Oldest Posted</option>
            <option value="city_asc">City / State (A–Z)</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="editing || bannerText" id="impact" class="cr-banner-wrap">
      <div class="cr-banner" :class="{ 'cr-banner--editing': editing }">
        <img
          v-if="bannerIconUrl"
          class="cr-banner-icon-img"
          :src="bannerIconUrl"
          alt=""
          aria-hidden="true"
        />
        <div class="cr-banner-body">
          <template v-if="editing && editDraft">
            <textarea
              v-model="editDraft.bannerText"
              class="cr-inline-input cr-inline-input--area cr-banner-text"
              rows="2"
              placeholder="Banner message"
              :style="fieldStyle('bannerText')"
              @focus="styleTarget = 'bannerText'"
            />
            <textarea
              v-model="bannerBulletsText"
              class="cr-inline-input cr-inline-input--area"
              rows="3"
              placeholder="Bullets (one per line)"
            />
            <div class="cr-banner-link-edit">
              <input v-model="editDraft.bannerLinkText" class="cr-inline-input" type="text" placeholder="Link text" />
            </div>
          </template>
          <template v-else>
            <p class="cr-banner-text" :style="fieldStyle('bannerText')">{{ bannerText }}</p>
            <p v-if="bannerBullets.length" class="cr-banner-bullets">
              <span v-for="(b, i) in bannerBullets" :key="b">{{ i > 0 ? ' • ' : '' }}{{ b }}</span>
            </p>
          </template>
        </div>
        <a
          v-if="!editing && bannerLinkText && (bannerLinkHref || bannerLinkAction)"
          class="cr-banner-link"
          href="#"
          @click.prevent="handleNavAction({ action: bannerLinkAction, href: bannerLinkHref })"
        >{{ bannerLinkText }} →</a>
      </div>
    </div>

    <div v-if="loading" class="cr-status">Loading open positions…</div>
    <div v-else-if="error" class="cr-status cr-status--error">{{ error }}</div>
    <div v-else-if="!jobs.length" id="jobs" class="cr-status">No open positions right now.</div>

    <template v-else>
      <div v-if="!filteredJobs.length" id="jobs" class="cr-status">No roles match the selected filters.</div>

      <ul v-else id="jobs" class="cr-list">
        <li v-for="job in pagedJobs" :key="job.jobId" class="cr-item">
          <article class="cr-card" :class="{ 'cr-card--featured': job.isFeatured }">
            <span v-if="job.isFeatured" class="cr-featured-badge">FEATURED</span>

            <div class="cr-card-icon" :class="jobIconToneClass(job)">
              <img
                :src="jobIconSrc(job)"
                :alt="job.roleType || 'Role icon'"
                class="cr-card-icon-img"
              />
            </div>

            <div class="cr-card-body">
              <h2 class="cr-card-title">{{ job.title }}</h2>
              <div class="cr-card-meta">
                <span v-if="job.city || job.state" class="cr-meta-item">
                  <svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1.5A3.5 3.5 0 0 1 10.5 5c0 2.8-3.5 7-3.5 7S3.5 7.8 3.5 5A3.5 3.5 0 0 1 7 1.5Z" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="5" r="1.2" stroke="currentColor" stroke-width="1.2"/></svg>
                  {{ [job.city, job.state].filter(Boolean).join(', ') }}
                </span>
                <span v-if="job.roleType" class="cr-meta-item">
                  <svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="2" y="4" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 4V3a2 2 0 0 1 4 0v1" stroke="currentColor" stroke-width="1.2"/></svg>
                  {{ job.roleType }}
                </span>
                <span class="cr-meta-item">
                  <svg viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M7 4v3.5l2 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                  {{ job.applicationDeadline ? `Apply by ${formatDate(job.applicationDeadline)}` : 'Ongoing' }}
                </span>
              </div>
              <p class="cr-card-desc">{{ trimText(job.descriptionText, 220) }}</p>
              <div v-if="job.tags && job.tags.length" class="cr-tags">
                <span v-for="tag in job.tags" :key="tag" class="cr-tag">{{ tag }}</span>
              </div>
            </div>

            <div class="cr-card-actions">
              <a
                class="cr-apply-btn"
                :class="{ 'cr-apply-btn--solid': job.isFeatured, 'cr-apply-btn--outline': !job.isFeatured }"
                :href="buildPublicIntakeUrl(job.applicationPublicKey)"
                target="_blank"
                rel="noopener noreferrer"
              >Apply Now →</a>
              <button
                class="cr-save-btn"
                type="button"
                :class="{ 'cr-save-btn--saved': savedJobs.has(job.jobId) }"
                :aria-label="savedJobs.has(job.jobId) ? 'Unsave job' : 'Save job'"
                @click="toggleSave(job.jobId)"
              >
                <svg viewBox="0 0 16 18" fill="none" aria-hidden="true">
                  <path d="M3 1h10a1 1 0 0 1 1 1v14l-6-4-6 4V2a1 1 0 0 1 1-1Z" :fill="savedJobs.has(job.jobId) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.4"/>
                </svg>
                {{ savedJobs.has(job.jobId) ? 'Saved' : 'Save' }}
              </button>
            </div>
          </article>
        </li>
      </ul>

      <div v-if="filteredJobs.length > 0" class="cr-pagination">
        <p class="cr-pagination-count">
          Showing {{ pageStart + 1 }}–{{ pageEnd }} of {{ filteredJobs.length }} role{{ filteredJobs.length !== 1 ? 's' : '' }}
        </p>
        <div class="cr-pagination-pages">
          <button
            v-for="p in totalPages"
            :key="p"
            class="cr-page-btn"
            :class="{ 'cr-page-btn--active': p === currentPage }"
            type="button"
            @click="currentPage = p"
          >{{ p }}</button>
          <button
            v-if="currentPage < totalPages"
            class="cr-page-btn cr-page-btn--next"
            type="button"
            @click="currentPage++"
          >›</button>
        </div>
        <button class="cr-view-all-link" type="button" @click="showAll = !showAll">
          {{ showAll ? 'Paginate results' : 'View all roles' }} →
        </button>
      </div>
    </template>

    <div v-if="learnMoreJob" class="cr-modal-overlay" @click.self="learnMoreJob = null">
      <div class="cr-modal">
        <div class="cr-modal-header">
          <h3>{{ learnMoreJob.title }}</h3>
          <button class="cr-modal-close" type="button" @click="learnMoreJob = null">✕</button>
        </div>
        <div class="cr-modal-body">
          <p class="cr-modal-desc">{{ learnMoreJob.descriptionText || 'No description available.' }}</p>
          <div v-if="learnMoreJob.jobDescriptionFileUrl" class="cr-embed-wrap">
            <iframe :src="learnMoreJob.jobDescriptionFileUrl" class="cr-embed" title="Job description" />
          </div>
          <div v-else class="cr-modal-nodoc">No attached job description document.</div>
          <div class="cr-modal-actions">
            <a
              class="cr-apply-btn cr-apply-btn--solid"
              :href="buildPublicIntakeUrl(learnMoreJob.applicationPublicKey)"
              target="_blank"
              rel="noopener noreferrer"
            >Apply Now →</a>
          </div>
        </div>
      </div>
    </div>

    <!-- Why modal -->
    <div v-if="activeStoryModal === 'why' && whyModal?.enabled !== false" class="cr-modal-overlay" @click.self="activeStoryModal = null">
      <div class="cr-story-modal" role="dialog" aria-modal="true" :aria-label="whyModal.title || 'Why join us'">
        <button class="cr-story-close" type="button" aria-label="Close" @click="activeStoryModal = null">✕</button>
        <template v-if="editing && editDraft?.whyModal">
          <div class="cr-story-header">
            <img v-if="featureIconSrc(editDraft.whyModal.icon)" class="cr-story-hero-icon" :src="featureIconSrc(editDraft.whyModal.icon)" alt="" />
            <div class="cr-story-edit-head">
              <input v-model="editDraft.whyModal.title" class="cr-inline-input cr-inline-input--block" type="text" placeholder="Modal title" />
              <textarea v-model="editDraft.whyModal.subtitle" class="cr-inline-input cr-inline-input--area" rows="2" placeholder="Subtitle" />
            </div>
          </div>
          <div class="cr-why-grid">
            <div v-for="(card, i) in editDraft.whyModal.cards" :key="`why-${i}`" class="cr-why-card cr-why-card--editing">
              <img v-if="featureIconSrc(card.icon)" :src="featureIconSrc(card.icon)" alt="" />
              <input v-model="card.title" class="cr-inline-input cr-inline-input--block" type="text" placeholder="Card title" />
              <textarea v-model="card.body" class="cr-inline-input cr-inline-input--area" rows="3" placeholder="Card body" />
            </div>
          </div>
          <input v-model="editDraft.whyModal.ctaText" class="cr-inline-input cr-inline-input--block" type="text" placeholder="CTA button text" />
        </template>
        <template v-else>
          <div class="cr-story-header">
            <img v-if="featureIconSrc(whyModal.icon)" class="cr-story-hero-icon" :src="featureIconSrc(whyModal.icon)" alt="" />
            <div>
              <h3>{{ whyModal.title }}</h3>
              <p v-if="whyModal.subtitle">{{ whyModal.subtitle }}</p>
            </div>
          </div>
          <div class="cr-why-grid">
            <div v-for="card in whyModal.cards" :key="card.title" class="cr-why-card">
              <img v-if="featureIconSrc(card.icon)" :src="featureIconSrc(card.icon)" alt="" />
              <strong>{{ card.title }}</strong>
              <span>{{ card.body }}</span>
            </div>
          </div>
          <button
            v-if="whyModal.ctaText"
            class="cr-apply-btn cr-apply-btn--solid cr-story-cta"
            type="button"
            @click="handleNavAction({ action: whyModal.ctaAction, href: whyModal.ctaHref })"
          >{{ whyModal.ctaText }}</button>
        </template>
      </div>
    </div>

    <!-- Impact modal -->
    <div v-if="activeStoryModal === 'impact' && impactModal?.enabled !== false" class="cr-modal-overlay" @click.self="activeStoryModal = null">
      <div class="cr-story-modal cr-story-modal--impact" role="dialog" aria-modal="true" :aria-label="impactModal.title || 'Our Impact'">
        <button class="cr-story-close" type="button" aria-label="Close" @click="activeStoryModal = null">✕</button>
        <template v-if="editing && editDraft?.impactModal">
          <div class="cr-story-header">
            <img v-if="featureIconSrc(editDraft.impactModal.icon || 'community')" class="cr-story-hero-icon" :src="featureIconSrc(editDraft.impactModal.icon || 'community')" alt="" />
            <div class="cr-story-edit-head">
              <input v-model="editDraft.impactModal.title" class="cr-inline-input cr-inline-input--block" type="text" placeholder="Impact title" />
              <textarea v-model="editDraft.impactModal.subtitle" class="cr-inline-input cr-inline-input--area" rows="2" placeholder="Subtitle" />
            </div>
          </div>
          <div class="cr-impact-stats">
            <div v-for="(stat, i) in editDraft.impactModal.stats" :key="`stat-${i}`" class="cr-impact-stat cr-impact-stat--editing">
              <img v-if="featureIconSrc(stat.icon)" :src="featureIconSrc(stat.icon)" alt="" />
              <input v-model="stat.value" class="cr-inline-input cr-impact-value cr-inline-input--block" type="text" placeholder="Value" />
              <input v-model="stat.label" class="cr-inline-input cr-impact-label cr-inline-input--block" type="text" placeholder="Label" />
              <textarea v-model="stat.body" class="cr-inline-input cr-inline-input--area" rows="2" placeholder="Description" />
            </div>
          </div>
          <div class="cr-impact-bottom">
            <div class="cr-growth">
              <input v-model="editDraft.impactModal.growthTitle" class="cr-inline-input cr-inline-input--block" type="text" placeholder="Growth chart title" />
              <div class="cr-growth-chart cr-growth-chart--editing" aria-hidden="true">
                <div
                  v-for="(pt, i) in editDraft.impactModal.growthPoints"
                  :key="`gp-${i}`"
                  class="cr-growth-col cr-growth-col--editing"
                >
                  <input v-model.number="pt.value" class="cr-inline-input" type="number" min="0" :aria-label="`Growth value ${i + 1}`" />
                  <div class="cr-growth-bar" :style="{ height: growthBarHeight(pt.value) }"></div>
                  <input v-model="pt.label" class="cr-inline-input" type="text" placeholder="Year" />
                </div>
              </div>
              <input v-model="editDraft.impactModal.growthLabel" class="cr-inline-input cr-inline-input--block" type="text" placeholder="Legend label" />
            </div>
            <aside class="cr-impact-side">
              <img v-if="featureIconSrc('growth')" :src="featureIconSrc('growth')" alt="" />
              <input v-model="editDraft.impactModal.sidebarTitle" class="cr-inline-input cr-inline-input--block" type="text" placeholder="Sidebar title" />
              <textarea v-model="editDraft.impactModal.sidebarBody" class="cr-inline-input cr-inline-input--area" rows="4" placeholder="Sidebar body" />
              <input v-model="editDraft.impactModal.sidebarButtonText" class="cr-inline-input cr-inline-input--block" type="text" placeholder="Sidebar button text" />
            </aside>
          </div>
        </template>
        <template v-else>
          <div class="cr-story-header">
            <img v-if="featureIconSrc(impactModal.icon || 'community')" class="cr-story-hero-icon" :src="featureIconSrc(impactModal.icon || 'community')" alt="" />
            <div>
              <h3>{{ impactModal.title }}</h3>
              <p v-if="impactModal.subtitle">{{ impactModal.subtitle }}</p>
            </div>
          </div>
          <div class="cr-impact-stats">
            <div v-for="stat in impactModal.stats" :key="stat.label" class="cr-impact-stat">
              <img v-if="featureIconSrc(stat.icon)" :src="featureIconSrc(stat.icon)" alt="" />
              <div class="cr-impact-value">{{ stat.value }}</div>
              <div class="cr-impact-label">{{ stat.label }}</div>
              <p>{{ stat.body }}</p>
            </div>
          </div>
          <div class="cr-impact-bottom">
            <div class="cr-growth">
              <h4>{{ impactModal.growthTitle }}</h4>
              <div class="cr-growth-chart" aria-hidden="true">
                <div
                  v-for="pt in impactModal.growthPoints"
                  :key="pt.label"
                  class="cr-growth-col"
                >
                  <span class="cr-growth-val">{{ formatGrowthValue(pt.value) }}</span>
                  <div class="cr-growth-bar" :style="{ height: growthBarHeight(pt.value) }"></div>
                  <span class="cr-growth-year">{{ pt.label }}</span>
                </div>
              </div>
              <div class="cr-growth-legend">
                <span class="cr-growth-swatch"></span>
                {{ impactModal.growthLabel }}
              </div>
            </div>
            <aside class="cr-impact-side">
              <img v-if="featureIconSrc('growth')" :src="featureIconSrc('growth')" alt="" />
              <h4>{{ impactModal.sidebarTitle }}</h4>
              <p>{{ impactModal.sidebarBody }}</p>
              <button
                v-if="impactModal.sidebarButtonText"
                class="cr-apply-btn cr-apply-btn--solid"
                type="button"
                @click="handleNavAction({ action: impactModal.sidebarButtonAction, href: impactModal.sidebarButtonHref })"
              >{{ impactModal.sidebarButtonText }}</button>
            </aside>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import {
  blankTextStyle,
  CAREERS_FONT_OPTIONS,
  CAREERS_HERO_PRESETS,
  CAREERS_SIZE_PRESETS,
  CAREERS_TEXT_STYLE_KEYS,
  compactCareersPageForSave,
  ensureCareersGoogleFonts,
  getFeatureIconUrl,
  getHeroPresetByUrl,
  mergeCareersPageWithDefaults,
  normalizeImpactModal,
  normalizeTextStyles,
  normalizeWhyModal,
  resolveDefaultJobIconUrl,
  textStyleToCss
} from '../../utils/careersAssets';

const PER_PAGE = 5;
const SAVED_JOBS_KEY = 'pt_careers_saved_jobs';

const route = useRoute();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const slug = computed(() => String(route.params?.agencySlug || '').trim());
const loading = ref(false);
const error = ref('');
const jobs = ref([]);
const agencyId = ref(null);
const agencyName = ref('');
const agencyCareersPageRaw = ref({});
const selectedLocation = ref('');
const selectedRoleType = ref('');
const sortBy = ref('featured_desc');
const learnMoreJob = ref(null);
const activeStoryModal = ref(null);
const savedJobs = ref(new Set());
const currentPage = ref(1);
const showAll = ref(false);

const editDraft = ref(null);
const savingEdit = ref(false);
const editError = ref('');
const editSavedFlash = ref(false);
const editing = computed(() => !!editDraft.value);
const showPhotoPicker = ref(false);
const styleTarget = ref('heroHeadline');
const pendingHeroFile = ref(null);
const pendingHeroPreviewUrl = ref('');
const pendingHeroFileName = ref('');
const heroFileInputRef = ref(null);
const fontOptions = CAREERS_FONT_OPTIONS;
const sizePresets = CAREERS_SIZE_PRESETS;
const textStyleKeys = CAREERS_TEXT_STYLE_KEYS;
const heroPresets = CAREERS_HERO_PRESETS;

const userBelongsToAgency = (user, id) => {
  if (!user || !id) return false;
  if (String(user.role || '').toLowerCase() === 'super_admin') return true;
  const lists = [
    user.agencyIds,
    user.agencies
  ];
  try {
    const stored = JSON.parse(localStorage.getItem('userAgencies') || 'null');
    if (stored) lists.push(stored);
  } catch { /* ignore */ }
  return lists.some((list) =>
    Array.isArray(list) && list.some((a) => Number(a?.id ?? a) === Number(id))
  );
};

const canEditCareers = computed(() => {
  if (!authStore.isAuthenticated || !agencyId.value) return false;
  const user = authStore.user;
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  const caps = user.capabilities;
  if (caps && typeof caps === 'object' && Object.keys(caps).length > 0 && !caps.canManageHiring) {
    return false;
  }
  return userBelongsToAgency(user, agencyId.value);
});

const adminCareersPath = computed(() => {
  const s = slug.value;
  return s ? `/${encodeURIComponent(s)}/admin/careers` : '/admin/careers';
});

onMounted(async () => {
  try {
    const raw = localStorage.getItem(SAVED_JOBS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    if (Array.isArray(ids)) savedJobs.value = new Set(ids.map(Number).filter(Boolean));
  } catch { /* ignore */ }
  if (authStore.isAuthenticated) {
    try { await authStore.refreshUser(); } catch { /* best effort */ }
  }
});

onUnmounted(() => {
  clearPendingHeroFile();
});

const savedPage = computed(() =>
  mergeCareersPageWithDefaults(agencyCareersPageRaw.value, {
    slug: slug.value,
    agencyName: agencyName.value
  })
);

const page = computed(() => editDraft.value || savedPage.value);

const startEdit = () => {
  editError.value = '';
  editSavedFlash.value = false;
  showPhotoPicker.value = false;
  clearPendingHeroFile();
  const draft = JSON.parse(JSON.stringify(savedPage.value));
  draft.whyModal = normalizeWhyModal(draft.whyModal);
  draft.impactModal = normalizeImpactModal(draft.impactModal);
  draft.textStyles = normalizeTextStyles(draft.textStyles);
  draft.fontFamily = String(draft.fontFamily || '').trim().toLowerCase();
  draft.headingFontFamily = String(draft.headingFontFamily || '').trim().toLowerCase();
  draft.accentColor = String(draft.accentColor || '#1a8c54').trim() || '#1a8c54';
  const features = Array.isArray(draft.featureCards) ? draft.featureCards : [];
  while (features.length < 4) features.push({ icon: 'team', title: '', body: '' });
  draft.featureCards = features.slice(0, 4);
  if (!Array.isArray(draft.navItems) || !draft.navItems.length) {
    draft.navItems = [
      { label: 'Why join us', href: '', style: 'link', action: 'why', icon: 'care' },
      { label: 'Our Impact', href: '', style: 'link', action: 'impact', icon: 'team' },
      { label: 'Open roles', href: '#jobs', style: 'button', action: 'jobs' }
    ];
  }
  if (!Array.isArray(draft.bannerBullets)) draft.bannerBullets = [];
  editDraft.value = draft;
  styleTarget.value = 'heroHeadline';
};

const clearPendingHeroFile = () => {
  if (pendingHeroPreviewUrl.value) {
    try { URL.revokeObjectURL(pendingHeroPreviewUrl.value); } catch { /* ignore */ }
  }
  pendingHeroFile.value = null;
  pendingHeroPreviewUrl.value = '';
  pendingHeroFileName.value = '';
  if (heroFileInputRef.value) heroFileInputRef.value.value = '';
};

const cancelEdit = () => {
  editDraft.value = null;
  editError.value = '';
  editSavedFlash.value = false;
  showPhotoPicker.value = false;
  clearPendingHeroFile();
};

const openStoryForEdit = (which) => {
  if (!editing.value) startEdit();
  activeStoryModal.value = which;
};

const ensureActiveTextStyle = () => {
  if (!editDraft.value) return blankTextStyle();
  if (!editDraft.value.textStyles || typeof editDraft.value.textStyles !== 'object') {
    editDraft.value.textStyles = {};
  }
  const key = styleTarget.value;
  if (!editDraft.value.textStyles[key]) {
    editDraft.value.textStyles[key] = blankTextStyle();
  }
  return editDraft.value.textStyles[key];
};

const activeTextStyle = computed(() => {
  if (!editDraft.value) return blankTextStyle();
  const key = styleTarget.value;
  return editDraft.value.textStyles?.[key] || blankTextStyle();
});

const toggleStyleFlag = (flag) => {
  const style = ensureActiveTextStyle();
  style[flag] = !style[flag];
};

const setStyleFontSize = (value) => {
  ensureActiveTextStyle().fontSize = String(value || '');
};

const setStyleColor = (value) => {
  ensureActiveTextStyle().color = String(value || '');
};

const setStyleFontFamily = (value) => {
  ensureActiveTextStyle().fontFamily = String(value || '').trim().toLowerCase();
};

const fieldStyle = (key, { asHeading = false } = {}) =>
  textStyleToCss(page.value?.textStyles?.[key], {
    pageFont: page.value?.fontFamily,
    headingFont: page.value?.headingFontFamily,
    asHeading
  });

const applyHeroPreset = (preset) => {
  if (!editDraft.value || !preset) return;
  clearPendingHeroFile();
  editDraft.value.heroImageUrl = preset.url;
  editDraft.value.heroFrameStyle = preset.frameStyle || 'preframed';
  if (!String(editDraft.value.heroImageAlt || '').trim()) {
    editDraft.value.heroImageAlt = preset.label;
  }
};

const onHeroFileChange = (event) => {
  const file = event?.target?.files?.[0];
  if (!file || !editDraft.value) return;
  clearPendingHeroFile();
  pendingHeroFile.value = file;
  pendingHeroFileName.value = file.name;
  pendingHeroPreviewUrl.value = URL.createObjectURL(file);
  editDraft.value.heroFrameStyle = editDraft.value.heroFrameStyle === 'preframed'
    ? 'organic'
    : (editDraft.value.heroFrameStyle || 'organic');
};

const bannerBulletsText = computed({
  get: () => (editDraft.value?.bannerBullets || []).join('\n'),
  set: (v) => {
    if (!editDraft.value) return;
    editDraft.value.bannerBullets = String(v || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  }
});

const saveEdit = async () => {
  if (!editDraft.value || !agencyId.value) return;
  savingEdit.value = true;
  editError.value = '';
  editSavedFlash.value = false;
  try {
    const fd = new FormData();
    fd.append('agencyId', String(agencyId.value));
    fd.append('careersPageJson', JSON.stringify(compactCareersPageForSave(editDraft.value)));
    if (pendingHeroFile.value) fd.append('agencyHeroImage', pendingHeroFile.value);
    const r = await api.put('/hiring/careers-page', fd);
    agencyCareersPageRaw.value =
      r.data?.careersPage && typeof r.data.careersPage === 'object' ? r.data.careersPage : compactCareersPageForSave(editDraft.value);
    clearPendingHeroFile();
    editDraft.value = null;
    showPhotoPicker.value = false;
    editSavedFlash.value = true;
    setTimeout(() => { editSavedFlash.value = false; }, 2500);
  } catch (e) {
    editError.value = e.response?.data?.error?.message || 'Failed to save careers page';
  } finally {
    savingEdit.value = false;
  }
};

const hexToRgba = (hex, alpha) => {
  const clean = String(hex || '').replace(/^#/, '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) || 26;
  const g = parseInt(full.slice(2, 4), 16) || 140;
  const b = parseInt(full.slice(4, 6), 16) || 84;
  return `rgba(${r},${g},${b},${alpha})`;
};

const accentColor = computed(() => {
  const explicit = String(page.value?.accentColor || '').trim();
  if (explicit && /^#[0-9a-fA-F]{3,8}$/.test(explicit)) return explicit;
  const brand =
    brandingStore.portalTheme?.colorPalette?.primary ||
    brandingStore.portalAgency?.colorPalette?.primary ||
    brandingStore.primaryColor;
  if (brand && String(brand).startsWith('#')) return String(brand).trim();
  return '#1a8c54';
});

const rootStyle = computed(() => {
  const bodyFont = textStyleToCss({}, { pageFont: page.value?.fontFamily }).fontFamily;
  const headingFont = textStyleToCss({}, {
    pageFont: page.value?.fontFamily,
    headingFont: page.value?.headingFontFamily,
    asHeading: true
  }).fontFamily;
  return {
    '--accent': accentColor.value,
    '--accent-light': hexToRgba(accentColor.value, 0.1),
    '--accent-mid': hexToRgba(accentColor.value, 0.18),
    '--accent-border': hexToRgba(accentColor.value, 0.28),
    ...(bodyFont ? { fontFamily: bodyFont, '--cr-body-font': bodyFont } : {}),
    ...(headingFont ? { '--cr-heading-font': headingFont } : {})
  };
});

watch(
  () => page.value,
  (p) => {
    if (!p) return;
    const ids = [p.fontFamily, p.headingFontFamily];
    for (const s of Object.values(p.textStyles || {})) {
      if (s?.fontFamily) ids.push(s.fontFamily);
    }
    ensureCareersGoogleFonts(ids);
  },
  { immediate: true, deep: true }
);

const brandWordmark = computed(() => String(page.value?.brandWordmark || agencyName.value || 'Careers').trim());
const navItems = computed(() => (Array.isArray(page.value?.navItems) ? page.value.navItems : []));
const eyebrow = computed(() => String(page.value?.eyebrow || '').trim());
const heroHeadline = computed(() => String(page.value?.heroHeadline || '').trim());
const heroSubheadline = computed(() => String(page.value?.heroSubheadline || '').trim());
const careersSubtitle = computed(() => String(page.value?.lead || '').trim());
const careersHeroImageUrl = computed(() => {
  const raw = String(page.value?.heroImageUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/assets/')) return raw;
  return toUploadsUrl(raw) || raw;
});
const heroDisplayUrl = computed(() => pendingHeroPreviewUrl.value || careersHeroImageUrl.value);
const careersHeroImageAlt = computed(() =>
  String(page.value?.heroImageAlt || `${agencyName.value || 'Agency'} careers`).trim()
);
const careersHeroImagePosition = computed(() =>
  String(page.value?.heroImagePosition || 'center center').trim()
);
const heroFrameStyle = computed(() => {
  const explicit = String(page.value?.heroFrameStyle || '').trim().toLowerCase();
  if (['preframed', 'organic', 'rounded'].includes(explicit)) return explicit;
  const preset = getHeroPresetByUrl(String(page.value?.heroImageUrl || '').trim());
  return preset?.frameStyle || 'preframed';
});
const agencyFeatureCards = computed(() =>
  (Array.isArray(page.value?.featureCards) ? page.value.featureCards : [])
    .map((c) => ({
      icon: String(c?.icon || ''),
      title: String(c?.title || '').trim(),
      body: String(c?.body || '').trim()
    }))
    .filter((c) => c.title || c.body)
    .slice(0, 4)
);
const bannerText = computed(() => String(page.value?.bannerText || '').trim());
const bannerBullets = computed(() =>
  Array.isArray(page.value?.bannerBullets) ? page.value.bannerBullets.filter(Boolean) : []
);
const bannerLinkText = computed(() => String(page.value?.bannerLinkText || '').trim());
const bannerLinkHref = computed(() => String(page.value?.bannerLinkHref || '').trim());
const bannerLinkAction = computed(() => String(page.value?.bannerLinkAction || '').trim());
const bannerIconUrl = computed(() => getFeatureIconUrl('team'));
const whyModal = computed(() => page.value?.whyModal || null);
const impactModal = computed(() => page.value?.impactModal || null);

const headerLogoUrl = computed(() => {
  const t = brandingStore.portalTheme;
  const u = t?.logoUrl || brandingStore.portalAgency?.logoUrl;
  return u ? String(u).trim() : '';
});
const headerLogoAlt = computed(() => {
  const n = brandingStore.portalTheme?.agencyName || brandingStore.portalAgency?.name || agencyName.value;
  return n ? `${n} logo` : 'Organization logo';
});

const availableRoleTypes = computed(() =>
  Array.from(new Set((jobs.value || []).map((j) => String(j?.roleType || '').trim()).filter(Boolean))).sort()
);
const availableLocations = computed(() =>
  Array.from(new Set((jobs.value || []).map((j) => String(j?.city || '').trim()).filter(Boolean))).sort()
);

const filteredJobs = computed(() => {
  let list = (jobs.value || []).slice();
  if (selectedRoleType.value) list = list.filter((j) => String(j.roleType || '').trim() === selectedRoleType.value);
  if (selectedLocation.value) list = list.filter((j) => String(j.city || '').trim() === selectedLocation.value);
  if (sortBy.value === 'city_asc') {
    list.sort((a, b) => `${a.city || ''} ${a.state || ''}`.localeCompare(`${b.city || ''} ${b.state || ''}`));
  } else if (sortBy.value === 'posted_asc') {
    list.sort((a, b) => String(a.postedDate || '').localeCompare(String(b.postedDate || '')));
  } else {
    list.sort((a, b) => {
      if (b.isFeatured !== a.isFeatured) return (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0);
      return String(b.postedDate || b.postedAt || '').localeCompare(String(a.postedDate || a.postedAt || ''));
    });
  }
  return list;
});

watch([selectedRoleType, selectedLocation, sortBy], () => { currentPage.value = 1; });

const totalPages = computed(() => (showAll.value ? 1 : Math.max(1, Math.ceil(filteredJobs.value.length / PER_PAGE))));
const pageStart = computed(() => (showAll.value ? 0 : (currentPage.value - 1) * PER_PAGE));
const pageEnd = computed(() =>
  (showAll.value ? filteredJobs.value.length : Math.min(currentPage.value * PER_PAGE, filteredJobs.value.length))
);
const pagedJobs = computed(() => filteredJobs.value.slice(pageStart.value, pageEnd.value));

const cardIconEmoji = (icon) => {
  const map = { school: '🏫', office: '🏢', people: '👥', growth: '📈', heart: '❤️', shield: '🛡️', lock: '🔒', handshake: '🤝', star: '⭐' };
  return map[String(icon || '').toLowerCase()] || '✦';
};
const featureIconSrc = (icon) => getFeatureIconUrl(icon);
const roleTypeKey = (rt) => String(rt || '').toLowerCase().replace(/[^a-z]/g, '') || 'default';
const resolveIconUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/assets/')) return raw;
  return toUploadsUrl(raw) || raw;
};
const jobIconSrc = (job) => {
  const custom = resolveIconUrl(job?.iconUrl);
  if (custom) return custom;
  return resolveDefaultJobIconUrl(job?.roleType, job?.educationLevel);
};
const jobIconToneClass = (job) => {
  const key = roleTypeKey(job?.roleType || job?.educationLevel);
  if (job?.isFeatured) return 'cr-card-icon--featured';
  if (key.includes('facilitat')) return 'cr-card-icon--facilitator';
  if (key.includes('intern') || key.includes('student')) return 'cr-card-icon--intern';
  if (key.includes('provider') || key.includes('clinic') || key.includes('therap')) return 'cr-card-icon--provider';
  if (key.includes('admin') || key.includes('office')) return 'cr-card-icon--admin';
  return 'cr-card-icon--default';
};

const formatDate = (v) => {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return raw;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const trimText = (text, max = 220) => {
  const raw = String(text || '').trim();
  if (!raw) return 'No description provided.';
  return raw.length <= max ? raw : `${raw.slice(0, max).trim()}…`;
};
const persistSavedJobs = () => {
  try {
    localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify([...savedJobs.value]));
  } catch { /* ignore */ }
};
const toggleSave = (jobId) => {
  const s = new Set(savedJobs.value);
  if (s.has(jobId)) s.delete(jobId); else s.add(jobId);
  savedJobs.value = s;
  persistSavedJobs();
};

const scrollToId = (id) => {
  const el = document.getElementById(String(id || '').replace(/^#/, ''));
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
const handleNavAction = (item = {}) => {
  const action = String(item?.action || '').trim().toLowerCase();
  const href = String(item?.href || '').trim();
  if (action === 'why') {
    activeStoryModal.value = 'why';
    return;
  }
  if (action === 'impact') {
    activeStoryModal.value = 'impact';
    return;
  }
  if (action === 'jobs' || href === '#jobs') {
    activeStoryModal.value = null;
    scrollToId('jobs');
    return;
  }
  if (href.startsWith('#')) {
    activeStoryModal.value = null;
    scrollToId(href.slice(1));
    return;
  }
  if (href) {
    window.open(href, '_blank', 'noopener,noreferrer');
  }
};
const growthMax = computed(() => {
  const pts = (editing.value ? editDraft.value?.impactModal?.growthPoints : null)
    || impactModal.value?.growthPoints
    || [];
  return Math.max(1, ...pts.map((p) => Number(p.value) || 0));
});
const growthBarHeight = (value) => {
  const pct = Math.max(8, Math.round(((Number(value) || 0) / growthMax.value) * 100));
  return `${pct}%`;
};
const formatGrowthValue = (value) => {
  const n = Number(value) || 0;
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`.replace('.0k', 'k');
  return String(n);
};

const loadCareers = async () => {
  if (!slug.value) return;
  cancelEdit();
  loading.value = true;
  error.value = '';
  try {
    try { await brandingStore.fetchAgencyTheme(slug.value, { pageContext: 'public_events' }); } catch { /* best effort */ }
    const r = await api.get(`/public-intake/careers/${encodeURIComponent(slug.value)}`, {
      skipAuthRedirect: true,
      timeout: 15000
    });
    agencyId.value = r.data?.agency?.id != null ? Number(r.data.agency.id) : null;
    agencyName.value = String(r.data?.agency?.officialName || r.data?.agency?.name || '').trim();
    agencyCareersPageRaw.value =
      r.data?.agency?.careersPage && typeof r.data.agency.careersPage === 'object'
        ? r.data.agency.careersPage
        : {};
    jobs.value = Array.isArray(r.data?.jobs) ? r.data.jobs : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Unable to load careers at this time.';
    jobs.value = [];
    agencyId.value = null;
    agencyCareersPageRaw.value = {};
  } finally {
    loading.value = false;
  }
};

watch(slug, () => loadCareers(), { immediate: true });
</script>

<style scoped>
.cr {
  --accent: #1a8c54;
  --accent-light: rgba(26,140,84,0.1);
  --accent-mid: rgba(26,140,84,0.18);
  --accent-border: rgba(26,140,84,0.28);
  --dark: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --card-radius: 18px;
  min-height: 100vh;
  background: #f7faf8;
  color: var(--dark);
  font-family: inherit;
}

.cr-nav { background: #fff; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 20; }
.cr-nav-inner { max-width: 1160px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.cr-nav-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; }
.cr-nav-logo { height: 42px; width: auto; object-fit: contain; }
.cr-nav-wordmark { display: inline-flex; align-items: baseline; gap: 8px; }
.cr-nav-wordmark-name { font-size: 1.05rem; font-weight: 800; letter-spacing: 0.04em; color: var(--dark); text-transform: uppercase; }
.cr-nav-careers-label { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.14em; color: var(--accent); text-transform: uppercase; }
.cr-nav-links { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.cr-nav-link { font-size: 0.9rem; font-weight: 600; color: var(--dark); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: color 0.15s; }
.cr-nav-link-icon { width: 18px; height: 18px; object-fit: contain; }
.cr-nav-link:hover { color: var(--accent); }
.cr-nav-btn { font-size: 0.88rem; font-weight: 700; color: var(--accent); border: 1.5px solid var(--accent); border-radius: 999px; padding: 8px 18px; text-decoration: none; transition: background 0.15s, color 0.15s; }
.cr-nav-btn:hover { background: var(--accent); color: #fff; }

.cr-hero { background: linear-gradient(180deg, #ffffff 0%, #f7faf8 100%); padding: 52px 24px 44px; }
.cr-hero-inner { max-width: 1160px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); align-items: center; gap: 36px; }
.cr-eyebrow { display: inline-block; background: var(--accent-light); color: var(--accent); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 12px; border-radius: 99px; margin-bottom: 14px; }
.cr-hero-h1 { margin: 0 0 16px; line-height: 1.05; display: flex; flex-direction: column; gap: 4px; }
.cr-hero-headline { font-size: clamp(2rem, 4.4vw, 3.15rem); font-weight: 800; color: var(--dark); letter-spacing: -0.03em; font-family: var(--cr-heading-font, inherit); }
.cr-hero-subheadline { font-size: clamp(2rem, 4.4vw, 3.15rem); font-weight: 800; color: var(--accent); letter-spacing: -0.03em; font-family: var(--cr-heading-font, inherit); }
.cr-hero-lead { margin: 0 0 28px; font-size: 1.05rem; line-height: 1.65; color: var(--muted); max-width: 540px; }
.cr-feature-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.cr-feature-card { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: #fff; border: 1px solid var(--accent-border); border-radius: 14px; box-shadow: 0 8px 20px -16px rgba(15, 23, 42, 0.35); }
.cr-feature-icon { width: 42px; height: 42px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 1.35rem; }
.cr-feature-icon-img { width: 42px; height: 42px; object-fit: contain; display: block; }
.cr-feature-title { display: block; font-size: 0.92rem; font-weight: 700; color: var(--dark); margin-bottom: 3px; }
.cr-feature-body { display: block; font-size: 0.82rem; color: var(--muted); line-height: 1.4; }
.cr-hero-fig { position: relative; margin: 0; display: flex; justify-content: flex-end; align-items: center; }
.cr-hero-frame { position: relative; width: 100%; }
.cr-hero-img { display: block; width: 100%; max-width: 560px; margin-left: auto; object-fit: contain; background: transparent; }
.cr-hero-fig--preframed .cr-hero-img { border-radius: 0; box-shadow: none; }
.cr-hero-fig--organic .cr-hero-img {
  aspect-ratio: 1.45 / 1;
  object-fit: cover;
  border-radius: 42% 58% 40% 60% / 48% 40% 55% 45%;
  box-shadow: 0 28px 60px -30px rgba(15, 23, 42, 0.45);
}

.cr-filters-wrap { padding: 0 24px 8px; }
.cr-filters {
  max-width: 1160px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 8px 24px -18px rgba(15, 23, 42, 0.35);
}
.cr-pill-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-right: 12px; border-right: 1px solid var(--border); }
.cr-pill-group--location { display: flex; align-items: center; gap: 6px; }
.cr-loc-icon { width: 14px; height: 14px; color: var(--muted); flex-shrink: 0; }
.cr-pill { font-size: 0.82rem; font-weight: 500; padding: 6px 14px; border-radius: 99px; border: 1.5px solid var(--border); background: #fff; color: var(--dark); cursor: pointer; transition: all 0.12s; white-space: nowrap; }
.cr-pill:hover { border-color: var(--accent); color: var(--accent); }
.cr-pill--active { background: var(--accent-mid); border-color: var(--accent); color: var(--accent); font-weight: 700; }
.cr-sort-wrap { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.cr-sort-icon { width: 14px; height: 14px; color: var(--muted); flex-shrink: 0; }
.cr-select { font-size: 0.82rem; border: 1.5px solid var(--border); border-radius: 8px; padding: 7px 10px; color: var(--dark); background: #fff; cursor: pointer; }

.cr-status { max-width: 760px; margin: 40px auto; padding: 0 24px; text-align: center; color: var(--muted); }
.cr-status--error { color: #b91c1c; }

.cr-banner-wrap { max-width: 1000px; margin: 22px auto 0; padding: 0 24px; }
.cr-banner { display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: var(--accent-light); border: 1px solid var(--accent-border); border-radius: 16px; }
.cr-banner-icon-img { width: 44px; height: 44px; object-fit: contain; flex-shrink: 0; }
.cr-banner-body { flex: 1; min-width: 0; }
.cr-banner-text { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--dark); }
.cr-banner-bullets { margin: 3px 0 0; font-size: 0.82rem; color: var(--muted); }
.cr-banner-link { font-size: 0.85rem; font-weight: 600; color: var(--accent); text-decoration: none; white-space: nowrap; flex-shrink: 0; }
.cr-banner-link:hover { text-decoration: underline; }

.cr-list { list-style: none; margin: 18px auto; padding: 0 24px; max-width: 1000px; display: flex; flex-direction: column; gap: 14px; scroll-margin-top: 88px; }
.cr-item { display: block; }
.cr-card { position: relative; display: grid; grid-template-columns: 72px 1fr auto; align-items: start; gap: 18px; padding: 22px; background: #fff; border: 1.5px solid var(--border); border-radius: var(--card-radius); transition: box-shadow 0.15s, border-color 0.15s, transform 0.15s; overflow: hidden; }
.cr-card:hover { box-shadow: 0 10px 28px -12px rgba(15, 23, 42, 0.16); border-color: var(--accent-border); transform: translateY(-1px); }
.cr-card--featured { background: linear-gradient(135deg, var(--accent-light), #fff 55%); border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-border), 0 10px 28px -14px rgba(26, 140, 84, 0.28); }
.cr-featured-badge { position: absolute; top: 0; left: 18px; background: var(--accent); color: #fff; font-size: 0.65rem; font-weight: 800; letter-spacing: 0.1em; padding: 4px 12px; border-radius: 0 0 10px 10px; text-transform: uppercase; }
.cr-card-icon { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; overflow: hidden; background: #f1f5f9; border: 2px solid #e2e8f0; }
.cr-card-icon--featured { background: #ecfdf5; border-color: var(--accent-border); }
.cr-card-icon--provider { background: #ecfdf5; border-color: #a7f3d0; }
.cr-card-icon--facilitator { background: #f5f3ff; border-color: #ddd6fe; }
.cr-card-icon--intern { background: #eff6ff; border-color: #bfdbfe; }
.cr-card-icon--admin { background: #fff7ed; border-color: #fed7aa; }
.cr-card-icon--default { background: #f8fafc; border-color: #e2e8f0; }
.cr-card-icon-img { width: 100%; height: 100%; object-fit: cover; }
.cr-card-body { min-width: 0; }
.cr-card-title { margin: 0 0 6px; font-size: 1.08rem; font-weight: 700; color: var(--dark); }
.cr-card-meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 0.8rem; color: var(--muted); margin-bottom: 8px; }
.cr-meta-item { display: inline-flex; align-items: center; gap: 4px; }
.cr-meta-item svg { width: 12px; height: 12px; flex-shrink: 0; }
.cr-card-desc { margin: 0 0 10px; font-size: 0.88rem; color: var(--muted); line-height: 1.5; }
.cr-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.cr-tag { font-size: 0.75rem; font-weight: 600; padding: 3px 10px; border-radius: 99px; background: var(--accent-light); color: var(--accent); border: 1px solid var(--accent-border); }
.cr-card--featured .cr-tag { background: #fff; }
.cr-card-icon--facilitator ~ .cr-card-body .cr-tag { background: #f5f3ff; color: #6d28d9; border-color: #ddd6fe; }
.cr-card-icon--intern ~ .cr-card-body .cr-tag { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.cr-card-icon--admin ~ .cr-card-body .cr-tag { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
.cr-card-actions { display: flex; flex-direction: column; gap: 8px; align-items: stretch; min-width: 128px; }
.cr-apply-btn { display: inline-flex; align-items: center; justify-content: center; font-size: 0.88rem; font-weight: 700; padding: 10px 18px; border-radius: 12px; text-decoration: none; cursor: pointer; white-space: nowrap; transition: opacity 0.15s, background 0.15s, color 0.15s; }
.cr-apply-btn--solid { background: var(--accent); color: #fff; border: 1.5px solid var(--accent); }
.cr-apply-btn--solid:hover { opacity: 0.9; }
.cr-apply-btn--outline { background: #fff; color: var(--accent); border: 1.5px solid var(--accent); }
.cr-apply-btn--outline:hover { background: var(--accent); color: #fff; }
.cr-save-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.8rem; font-weight: 500; padding: 8px 14px; border-radius: 10px; background: #fff; color: var(--muted); border: 1.5px solid var(--border); cursor: pointer; transition: all 0.12s; white-space: nowrap; }
.cr-save-btn svg { width: 14px; height: 16px; }
.cr-save-btn:hover { border-color: var(--accent); color: var(--accent); }
.cr-save-btn--saved { color: var(--accent); border-color: var(--accent); background: var(--accent-light); }

.cr-pagination { max-width: 1000px; margin: 24px auto 48px; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.cr-pagination-count { font-size: 0.85rem; color: var(--muted); margin: 0; }
.cr-pagination-pages { display: flex; align-items: center; gap: 4px; }
.cr-page-btn { width: 34px; height: 34px; border-radius: 8px; font-size: 0.88rem; font-weight: 600; border: 1.5px solid var(--border); background: #fff; color: var(--dark); cursor: pointer; transition: all 0.12s; }
.cr-page-btn:hover { border-color: var(--accent); color: var(--accent); }
.cr-page-btn--active { background: var(--accent); border-color: var(--accent); color: #fff; }
.cr-page-btn--next { font-size: 1.1rem; }
.cr-view-all-link { font-size: 0.85rem; font-weight: 600; color: var(--accent); background: none; border: none; cursor: pointer; padding: 0; }
.cr-view-all-link:hover { text-decoration: underline; }

.cr-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.cr-modal { width: min(960px, 100%); background: #fff; border-radius: 16px; border: 1px solid var(--border); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }
.cr-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); gap: 12px; }
.cr-modal-header h3 { margin: 0; font-size: 1.05rem; }
.cr-modal-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: var(--muted); padding: 4px 8px; border-radius: 6px; }
.cr-modal-close:hover { background: var(--border); }
.cr-modal-body { padding: 16px 20px; overflow: auto; flex: 1; }
.cr-modal-desc { margin: 0 0 16px; color: var(--muted); line-height: 1.55; }
.cr-embed-wrap { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.cr-embed { width: 100%; min-height: 520px; border: 0; }
.cr-modal-nodoc { color: var(--muted); font-size: 0.85rem; font-style: italic; }
.cr-modal-actions { margin-top: 16px; }

.cr-story-modal {
  width: min(980px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 22px;
  border: 1px solid var(--border);
  box-shadow: 0 30px 80px -36px rgba(15, 23, 42, 0.55);
  padding: 28px;
  position: relative;
}
.cr-story-close {
  position: absolute; top: 14px; right: 14px;
  border: none; background: #f1f5f9; color: #64748b;
  width: 34px; height: 34px; border-radius: 999px; cursor: pointer; font-size: 1rem;
}
.cr-story-header { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 22px; padding-right: 36px; }
.cr-story-hero-icon { width: 56px; height: 56px; object-fit: contain; flex-shrink: 0; }
.cr-story-header h3 { margin: 0 0 6px; font-size: 1.45rem; font-weight: 800; color: var(--dark); }
.cr-story-header p { margin: 0; color: var(--muted); line-height: 1.5; }
.cr-why-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cr-why-card {
  background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 16px;
  display: flex; flex-direction: column; gap: 6px;
}
.cr-why-card img { width: 36px; height: 36px; object-fit: contain; }
.cr-why-card strong { color: var(--dark); font-size: 0.98rem; }
.cr-why-card span { color: var(--muted); font-size: 0.86rem; line-height: 1.45; }
.cr-story-cta { margin-top: 18px; width: 100%; max-width: 280px; }
.cr-impact-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.cr-impact-stat {
  border: 1px solid var(--border); border-radius: 16px; padding: 14px; background: #fff;
}
.cr-impact-stat img { width: 30px; height: 30px; object-fit: contain; margin-bottom: 8px; }
.cr-impact-value { font-size: 1.55rem; font-weight: 800; color: var(--accent); line-height: 1.1; }
.cr-impact-label { font-size: 0.88rem; font-weight: 700; color: var(--dark); margin: 4px 0 6px; }
.cr-impact-stat p { margin: 0; font-size: 0.8rem; color: var(--muted); line-height: 1.4; }
.cr-impact-bottom { display: grid; grid-template-columns: 1.35fr 0.85fr; gap: 14px; }
.cr-growth { border: 1px solid var(--border); border-radius: 16px; padding: 16px; background: #fff; }
.cr-growth h4 { margin: 0 0 14px; font-size: 1rem; }
.cr-growth-chart { display: flex; align-items: flex-end; gap: 14px; height: 180px; padding: 0 8px 8px; }
.cr-growth-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; height: 100%; }
.cr-growth-bar { width: 100%; max-width: 48px; border-radius: 10px 10px 4px 4px; background: var(--accent); min-height: 12px; }
.cr-growth-val { font-size: 0.75rem; font-weight: 700; color: var(--dark); }
.cr-growth-year { font-size: 0.78rem; color: var(--muted); }
.cr-growth-legend { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 0.82rem; color: var(--muted); }
.cr-growth-swatch { width: 12px; height: 12px; border-radius: 3px; background: var(--accent); }
.cr-impact-side {
  border-radius: 16px; padding: 18px; background: var(--accent-light); border: 1px solid var(--accent-border);
  display: flex; flex-direction: column; gap: 10px;
}
.cr-impact-side img { width: 36px; height: 36px; object-fit: contain; }
.cr-impact-side h4 { margin: 0; color: var(--accent); font-size: 1.05rem; }
.cr-impact-side p { margin: 0; color: var(--dark); line-height: 1.5; font-size: 0.9rem; flex: 1; }

.cr--editing { padding-bottom: 140px; }
.cr-editor-bar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 60;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 10px 16px;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 14px;
  box-shadow: 0 16px 40px -18px rgba(15, 23, 42, 0.65);
  max-height: min(42vh, 320px);
  overflow: auto;
}
.cr-editor-bar--active { background: #14532d; }
.cr-editor-hint { font-size: 0.82rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin-right: 4px; }
.cr-editor-btn {
  border: 1px solid rgba(248, 250, 252, 0.35);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}
.cr-editor-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.cr-editor-btn--primary { background: #fff; color: #0f172a; border-color: #fff; }
.cr-editor-bar--active .cr-editor-btn--primary { background: #bbf7d0; color: #14532d; border-color: #bbf7d0; }
.cr-editor-link { color: #cbd5e1; font-size: 0.82rem; font-weight: 600; margin-left: auto; }
.cr-editor-error { flex-basis: 100%; margin: 0; color: #fecaca; font-size: 0.82rem; }
.cr-editor-ok { flex-basis: 100%; margin: 0; color: #bbf7d0; font-size: 0.82rem; }

.cr-style-strip {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(248, 250, 252, 0.18);
}
.cr-style-field { display: inline-flex; flex-direction: column; gap: 3px; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #cbd5e1; }
.cr-style-field--block { display: flex; width: 100%; margin-top: 8px; color: var(--dark); text-transform: none; letter-spacing: 0; font-size: 0.8rem; }
.cr-style-select {
  border: 1px solid rgba(248, 250, 252, 0.28);
  background: rgba(15, 23, 42, 0.35);
  color: #f8fafc;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 0.8rem;
  min-width: 110px;
}
.cr-style-color {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(248, 250, 252, 0.28);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.cr-style-toggle {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(248, 250, 252, 0.28);
  background: transparent;
  color: #f8fafc;
  font-weight: 800;
  cursor: pointer;
}
.cr-style-toggle--italic { font-style: italic; font-family: Georgia, serif; }
.cr-style-toggle--on { background: #bbf7d0; color: #14532d; border-color: #bbf7d0; }

.cr-hero-photo-overlay {
  position: absolute;
  inset: auto 12px 12px auto;
  display: flex;
  gap: 8px;
}
.cr-photo-picker {
  margin-top: 14px;
  padding: 14px;
  background: #fff;
  border: 1px dashed var(--accent-border);
  border-radius: 14px;
  box-shadow: 0 12px 28px -20px rgba(15, 23, 42, 0.45);
}
.cr-photo-picker-title { margin: 0 0 10px; font-size: 0.85rem; font-weight: 800; color: var(--dark); }
.cr-photo-presets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
.cr-photo-preset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}
.cr-photo-preset img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 8px; }
.cr-photo-preset span { font-size: 0.72rem; font-weight: 700; color: var(--muted); }
.cr-photo-preset--active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-light); }
.cr-photo-upload {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--dark);
  margin-bottom: 8px;
}
.cr-photo-upload input { font-size: 0.8rem; }
.cr-photo-upload-name { margin: 0 0 8px; font-size: 0.78rem; color: var(--accent); font-weight: 600; }

.cr-inline-input {
  font: inherit;
  color: inherit;
  background: rgba(255, 255, 255, 0.92);
  border: 1.5px dashed var(--accent-border);
  border-radius: 8px;
  padding: 6px 10px;
  width: 100%;
  box-sizing: border-box;
}
.cr-inline-input:focus {
  outline: none;
  border-style: solid;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}
.cr-inline-input--block { display: block; margin-bottom: 8px; }
.cr-inline-input--area { resize: vertical; line-height: 1.45; }
.cr-inline-input--nav { width: auto; min-width: 96px; max-width: 160px; font-size: 0.88rem; font-weight: 600; }
.cr-nav-edit { display: inline-flex; }
.cr-nav-edit--button .cr-inline-input--nav { border-radius: 999px; border-color: var(--accent); color: var(--accent); font-weight: 700; }
.cr-feature-edit { flex: 1; min-width: 0; }
.cr-feature-card--editing { align-items: stretch; }
.cr-banner--editing { align-items: flex-start; }
.cr-banner-link-edit { margin-top: 8px; max-width: 220px; }
.cr-story-edit-head { flex: 1; min-width: 0; }
.cr-why-card--editing, .cr-impact-stat--editing { align-items: stretch; }
.cr-growth-chart--editing { align-items: flex-end; }
.cr-growth-col--editing { gap: 6px; }
.cr-growth-col--editing .cr-inline-input { text-align: center; font-size: 0.75rem; padding: 4px 6px; }

@media (max-width: 840px) {
  .cr-hero-inner { grid-template-columns: 1fr; }
  .cr-hero-fig { order: -1; max-width: 520px; margin: 0 auto; }
  .cr-hero-lead { max-width: 100%; }
  .cr-card { grid-template-columns: 56px 1fr; }
  .cr-card-actions { grid-column: 1 / -1; flex-direction: row; }
  .cr-feature-cards { grid-template-columns: 1fr; }
  .cr-banner { flex-wrap: wrap; }
  .cr-why-grid, .cr-impact-stats, .cr-impact-bottom { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .cr-nav-inner { flex-direction: column; align-items: flex-start; gap: 10px; }
  .cr-hero { padding: 28px 16px 24px; }
  .cr-filters-wrap, .cr-list, .cr-pagination, .cr-banner-wrap { padding-left: 12px; padding-right: 12px; }
  .cr-card { padding: 18px 14px; gap: 12px; grid-template-columns: 1fr; }
  .cr-card-icon { width: 52px; height: 52px; }
  .cr-card-actions { flex-direction: row; }
  .cr-pill-group { padding-right: 0; border-right: 0; }
  .cr-pagination { flex-direction: column; align-items: flex-start; }
  .cr-why-grid, .cr-impact-stats, .cr-impact-bottom { grid-template-columns: 1fr; }
  .cr-story-modal { padding: 18px; }
}
</style>
