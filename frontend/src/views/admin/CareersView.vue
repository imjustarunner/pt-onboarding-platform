<template>
  <div class="container careers-root">
    <div class="header">
      <div>
        <h2>Careers</h2>
        <div class="subtle">Manage active and inactive job postings and their application forms.</div>
      </div>
      <div class="header-actions">
        <div v-if="canChooseAgency" class="agency-picker">
          <label class="agency-label">Agency</label>
          <select v-model="selectedAgencyId" class="input agency-select">
            <option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">
              {{ a.name }}
            </option>
          </select>
        </div>
        <button class="btn btn-secondary" @click="refresh" :disabled="loading">Refresh</button>
      </div>
    </div>
    <div class="panel public-link-panel">
      <div>
        <strong>Public careers page</strong>
        <div class="muted small">{{ publicCareersUrl || 'No agency slug found for this tenant yet.' }}</div>
      </div>
      <div class="row-actions">
        <a
          v-if="publicCareersUrl"
          class="btn btn-secondary btn-sm"
          :href="publicCareersUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open public page
        </a>
        <button class="btn btn-secondary btn-sm" :disabled="!publicCareersUrl" @click="copyPublicCareersUrl">
          Copy public link
        </button>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <section class="panel agency-careers-panel">
      <div class="config-header">
        <div>
          <h3>Careers page settings</h3>
          <div class="muted small">Customize how your public careers page looks and the defaults used on every job application form.</div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="savingAgencyCareers" @click="applyBrandStarterContent">
          Load starter content
        </button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="savingAgencyCareers" @click="saveAgencyCareersPage">
          {{ savingAgencyCareers ? 'Saving...' : 'Save defaults' }}
        </button>
      </div>
      <div class="application-page-config agency-page-config">
        <!-- Page layout diagram -->
        <div class="page-diagram">
          <div class="pd-nav">Nav bar → <em>logo, nav links, CTA button</em></div>
          <div class="pd-hero">
            <div class="pd-hero-copy">Hero copy → <em>eyebrow, headline (dark), subheadline (accent color), lead text, feature cards</em></div>
            <div class="pd-hero-img">Hero photo →</div>
          </div>
          <div class="pd-filters">Filters bar → <em>role type pills, city pills, sort</em></div>
          <div class="pd-banner">Banner strip → <em>text, bullet points, link</em></div>
          <div class="pd-jobs">Job cards → <em>icon, title, tags, Apply Now</em></div>
        </div>

        <h5 class="config-section-label">🎨 Brand colors &amp; hero</h5>
        <div class="form-grid">
          <div class="field-with-hint">
            <input v-model="agencyPageForm.heroHeadline" class="input" type="text" placeholder="Hero headline — large dark text, e.g. Make a difference." />
            <span class="field-hint">Appears as the first large line in the hero section (dark color)</span>
          </div>
          <div class="field-with-hint">
            <input v-model="agencyPageForm.heroSubheadline" class="input" type="text" placeholder="Hero subheadline — large accent text, e.g. Build brighter futures." />
            <span class="field-hint">Appears as the second large line in the hero (your brand color)</span>
          </div>
          <div class="color-field">
            <label class="color-label small">Brand accent color <span class="field-hint">— buttons, pills, highlights, and tags all use this color</span></label>
            <div class="color-row">
              <input v-model="agencyPageForm.accentColor" type="color" class="color-swatch" />
              <input v-model="agencyPageForm.accentColor" class="input" type="text" placeholder="#1a8c54" style="flex:1" />
            </div>
          </div>
          <div class="field-with-hint">
            <input v-model="agencyPageForm.eyebrow" class="input" type="text" placeholder="Small eyebrow label, e.g. Careers" />
            <span class="field-hint">Tiny uppercase pill above the headline</span>
          </div>
          <div class="field-with-hint">
            <input v-model="agencyPageForm.lead" class="input" type="text" placeholder="Lead paragraph, e.g. Join a supportive, purpose-driven team…" />
            <span class="field-hint">Paragraph shown below the headline</span>
          </div>
          <label class="checkbox-inline">
            <input v-model="agencyPageForm.showLeafAccent" type="checkbox" />
            Show decorative leaf accent near hero photo (custom rounded photos only)
          </label>
          <div class="hero-upload-field" style="grid-column: 1 / -1;">
            <label class="field-label">Hero frame presets <span class="field-hint">— auto: ITSCO uses ITSCO frame, NLU uses NLU frame, others use Neutral until you override</span></label>
            <p v-if="!agencyPageForm.heroImageUrl && agencyDefaultHero" class="muted small" style="margin:0 0 8px;">
              Currently using default: <strong>{{ agencyDefaultHero.label }}</strong> (shown on the public page automatically)
            </p>
            <div class="hero-preset-grid">
              <button
                v-for="preset in heroPresets"
                :key="preset.id"
                type="button"
                class="hero-preset-card"
                :class="{ 'hero-preset-card--active': (agencyPageForm.heroImageUrl || agencyDefaultHero?.url) === preset.url }"
                @click="applyHeroPreset(agencyPageForm, preset)"
              >
                <img :src="preset.url" :alt="preset.label" />
                <span>{{ preset.label }}</span>
              </button>
            </div>
            <div class="upload-row" style="margin-top:10px;">
              <input v-model="agencyPageForm.heroImageUrl" class="input" type="text" placeholder="Paste image URL or use the upload button →" style="flex:1" />
              <button type="button" class="btn btn-secondary btn-sm" @click="triggerAgencyHeroUpload">📷 Upload photo</button>
            </div>
            <input ref="agencyHeroFileRef" type="file" accept="image/png,image/jpeg,image/webp,image/*" class="hidden-file" @change="onAgencyHeroFileChange" />
            <div v-if="agencyHeroImageFile" class="upload-preview-label">✓ Selected: {{ agencyHeroImageFile.name }}</div>
            <div v-else-if="agencyPageForm.heroImageUrl" class="hero-thumb">
              <img :src="displayAssetUrl(agencyPageForm.heroImageUrl)" alt="Hero image preview" />
            </div>
          </div>
          <input v-model="agencyPageForm.heroImageAlt" class="input" type="text" placeholder="Hero image alt text (for accessibility)" />
          <input v-model="agencyPageForm.heroImagePosition" class="input" type="text" placeholder="Photo focal point, e.g. center top, 30% 50%" />
        </div>

        <div class="display-card-editor">
          <h5>🔗 Navigation items</h5>
          <p class="muted small" style="margin:0 0 8px;">Links shown in the top nav bar next to your logo. Use "Button" style for the primary call-to-action (e.g. "Join Our Team").</p>
          <div class="nav-items-list">
            <div v-for="(item, idx) in agencyPageForm.navItems" :key="idx" class="nav-item-row nav-item-row--rich">
              <input v-model="item.label" class="input" type="text" placeholder="Label, e.g. Why ITSCO" />
              <select v-model="item.action" class="input">
                <option value="">Open URL</option>
                <option value="why">Open Why modal</option>
                <option value="impact">Open Impact modal</option>
                <option value="jobs">Scroll to jobs</option>
              </select>
              <input v-model="item.href" class="input" type="text" placeholder="URL (only if Open URL)" :disabled="!!item.action && item.action !== 'link'" />
              <select v-model="item.style" class="input">
                <option value="link">Link</option>
                <option value="button">Button</option>
              </select>
              <select v-model="item.icon" class="input">
                <option v-for="opt in cardIconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <button type="button" class="btn btn-secondary btn-sm" @click="agencyPageForm.navItems.splice(idx, 1)">✕</button>
            </div>
            <button
              v-if="agencyPageForm.navItems.length < 6"
              type="button"
              class="btn btn-secondary btn-sm"
              @click="agencyPageForm.navItems.push({ label: '', href: '', style: 'link', action: '', icon: 'none' })"
            >+ Add nav item</button>
          </div>
        </div>

        <h5 class="config-section-label" style="margin-top:14px;">💬 Why modal <span class="field-hint">— opens when a nav item uses “Open Why modal”</span></h5>
        <label class="checkbox-inline" style="margin-bottom:8px;">
          <input v-model="agencyPageForm.whyModal.enabled" type="checkbox" />
          Enable Why modal
        </label>
        <div class="form-grid">
          <input v-model="agencyPageForm.whyModal.title" class="input" type="text" placeholder="Modal title, e.g. Why ITSCO" />
          <select v-model="agencyPageForm.whyModal.icon" class="input">
            <option v-for="opt in cardIconOptions" :key="`why-icon-${opt.value}`" :value="opt.value">{{ opt.label }}</option>
          </select>
          <textarea v-model="agencyPageForm.whyModal.subtitle" class="textarea" rows="2" placeholder="Modal subtitle" style="grid-column:1 / -1;" />
          <input v-model="agencyPageForm.whyModal.ctaText" class="input" type="text" placeholder="CTA button text" />
          <select v-model="agencyPageForm.whyModal.ctaAction" class="input">
            <option value="jobs">Scroll to jobs</option>
            <option value="impact">Open Impact modal</option>
            <option value="">Open URL</option>
          </select>
          <input v-model="agencyPageForm.whyModal.ctaHref" class="input" type="text" placeholder="CTA URL (optional)" style="grid-column:1 / -1;" />
        </div>
        <div class="display-card-grid" style="margin-top:10px;">
          <div v-for="(card, idx) in agencyPageForm.whyModal.cards" :key="`why-card-${idx}`" class="display-card-draft">
            <select v-model="card.icon" class="input">
              <option v-for="opt in cardIconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <input v-model="card.title" class="input" type="text" :placeholder="`Why card ${idx + 1} title`" />
            <textarea v-model="card.body" class="textarea" rows="2" :placeholder="`Why card ${idx + 1} detail`" />
          </div>
        </div>

        <h5 class="config-section-label" style="margin-top:14px;">📈 Impact modal <span class="field-hint">— opens when a nav item uses “Open Impact modal”</span></h5>
        <label class="checkbox-inline" style="margin-bottom:8px;">
          <input v-model="agencyPageForm.impactModal.enabled" type="checkbox" />
          Enable Impact modal
        </label>
        <div class="form-grid">
          <input v-model="agencyPageForm.impactModal.title" class="input" type="text" placeholder="Modal title, e.g. Our Impact on Colorado" />
          <select v-model="agencyPageForm.impactModal.icon" class="input">
            <option v-for="opt in cardIconOptions" :key="`impact-icon-${opt.value}`" :value="opt.value">{{ opt.label }}</option>
          </select>
          <textarea v-model="agencyPageForm.impactModal.subtitle" class="textarea" rows="2" placeholder="Modal subtitle" style="grid-column:1 / -1;" />
        </div>
        <div class="display-card-grid" style="margin-top:10px;">
          <div v-for="(stat, idx) in agencyPageForm.impactModal.stats" :key="`impact-stat-${idx}`" class="display-card-draft">
            <select v-model="stat.icon" class="input">
              <option v-for="opt in cardIconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <input v-model="stat.value" class="input" type="text" placeholder="Stat value, e.g. 15,000+" />
            <input v-model="stat.label" class="input" type="text" placeholder="Stat label, e.g. Students Supported" />
            <textarea v-model="stat.body" class="textarea" rows="2" placeholder="Short description" />
          </div>
        </div>
        <div class="form-grid" style="margin-top:10px;">
          <input v-model="agencyPageForm.impactModal.growthTitle" class="input" type="text" placeholder="Growth chart title" style="grid-column:1 / -1;" />
          <input v-model="agencyPageForm.impactModal.growthLabel" class="input" type="text" placeholder="Growth legend label" style="grid-column:1 / -1;" />
        </div>
        <div class="nav-items-list" style="margin-top:8px;">
          <div v-for="(pt, idx) in agencyPageForm.impactModal.growthPoints" :key="`growth-${idx}`" class="nav-item-row">
            <input v-model="pt.label" class="input" type="text" placeholder="Year label" style="flex:1" />
            <input v-model.number="pt.value" class="input" type="number" min="0" placeholder="Value" style="flex:1" />
          </div>
        </div>
        <div class="form-grid" style="margin-top:10px;">
          <input v-model="agencyPageForm.impactModal.sidebarTitle" class="input" type="text" placeholder="Sidebar title" />
          <input v-model="agencyPageForm.impactModal.sidebarButtonText" class="input" type="text" placeholder="Sidebar button text" />
          <textarea v-model="agencyPageForm.impactModal.sidebarBody" class="textarea" rows="3" placeholder="Sidebar body" style="grid-column:1 / -1;" />
          <select v-model="agencyPageForm.impactModal.sidebarButtonAction" class="input">
            <option value="why">Open Why modal</option>
            <option value="jobs">Scroll to jobs</option>
            <option value="">Open URL</option>
          </select>
          <input v-model="agencyPageForm.impactModal.sidebarButtonHref" class="input" type="text" placeholder="Sidebar button URL (optional)" />
        </div>

        <h5 class="config-section-label" style="margin-top:14px;">📣 Banner strip <span class="field-hint">— full-width tinted row shown above job listings</span></h5>
        <div class="form-grid">
          <input v-model="agencyPageForm.bannerText" class="input" type="text" placeholder="Banner headline, e.g. Join a team supporting 1,000+ students" style="grid-column: 1 / -1;" />
          <input v-model="agencyPageForm.bannerLinkText" class="input" type="text" placeholder="Banner link text, e.g. Learn more about ITSCO" />
          <select v-model="agencyPageForm.bannerLinkAction" class="input">
            <option value="">Open URL</option>
            <option value="why">Open Why modal</option>
            <option value="impact">Open Impact modal</option>
            <option value="jobs">Scroll to jobs</option>
          </select>
          <input v-model="agencyPageForm.bannerLinkHref" class="input" type="text" placeholder="Banner link URL (optional)" style="grid-column: 1 / -1;" />
        </div>
        <div class="display-card-editor">
          <h5>Banner bullet points</h5>
          <div class="nav-items-list">
            <div v-for="(bullet, idx) in agencyPageForm.bannerBullets" :key="idx" class="nav-item-row">
              <input v-model="agencyPageForm.bannerBullets[idx]" class="input" type="text" :placeholder="`Bullet ${idx + 1}, e.g. Flexible schedules`" style="flex:1" />
              <button type="button" class="btn btn-secondary btn-sm" @click="agencyPageForm.bannerBullets.splice(idx, 1)">✕</button>
            </div>
            <button
              v-if="agencyPageForm.bannerBullets.length < 6"
              type="button"
              class="btn btn-secondary btn-sm"
              @click="agencyPageForm.bannerBullets.push('')"
            >+ Add bullet</button>
          </div>
        </div>

        <h5 class="config-section-label" style="margin-top:14px;">📋 Application landing page defaults <span class="field-hint">— shown on the form applicants fill out after clicking Apply Now</span></h5>
        <div class="form-grid">
          <input v-model="agencyPageForm.titleHighlight" class="input" type="text" placeholder="Title highlight text, e.g. Colorado Springs" />
          <input v-model="agencyPageForm.secureTitle" class="input" type="text" placeholder="Header secure title, e.g. Secure & Confidential" />
          <input v-model="agencyPageForm.secureSubtitle" class="input" type="text" placeholder="Header secure subtitle" />
          <input v-model="agencyPageForm.startHeading" class="input" type="text" placeholder="Start card heading" />
          <input v-model="agencyPageForm.startSubtitle" class="input" type="text" placeholder="Start card subtitle" />
          <input v-model="agencyPageForm.startButtonText" class="input" type="text" placeholder="Start button text" />
          <input v-model="agencyPageForm.startTimeNote" class="input" type="text" placeholder="Time note, e.g. Takes 3-5 minutes to begin" />
        </div>
        <div class="display-card-editor">
          <h5>Feature cards <span class="field-hint">— icon + title + description shown in the hero section</span></h5>
          <div class="display-card-grid">
            <div v-for="(card, idx) in agencyPageForm.featureCards" :key="`agency-feature-${idx}`" class="display-card-draft">
              <select v-model="card.icon" class="input">
                <option v-for="opt in cardIconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <input v-model="card.title" class="input" type="text" :placeholder="`Feature ${idx + 1} title`" />
              <textarea v-model="card.body" class="textarea" rows="2" :placeholder="`Feature ${idx + 1} detail`" />
            </div>
          </div>
        </div>
        <div class="display-card-editor">
          <h5>Default trust cells</h5>
          <div class="display-card-grid display-card-grid-trust">
            <div v-for="(card, idx) in agencyPageForm.trustItems" :key="`agency-trust-${idx}`" class="display-card-draft">
              <select v-model="card.icon" class="input">
                <option v-for="opt in cardIconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <input v-model="card.title" class="input" type="text" :placeholder="`Trust ${idx + 1} title`" />
              <textarea v-model="card.body" class="textarea" rows="2" :placeholder="`Trust ${idx + 1} detail`" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="panel create-panel">
      <h3>Create job posting</h3>
      <div class="form-grid">
        <input v-model="createForm.title" class="input" type="text" placeholder="Job title" />
        <input v-model="createForm.roleType" class="input" type="text" placeholder="Role type label, e.g. Provider, Facilitator, Intern" />
        <div class="job-icon-field">
          <label class="field-label">Job card icon <span class="field-hint">— pick from the careers icon library (page 2) or upload your own</span></label>
          <div class="job-icon-picker">
            <button
              v-for="icon in jobIconLibrary"
              :key="icon.id"
              type="button"
              class="job-icon-option"
              :class="{ 'job-icon-option--active': createForm.iconUrl === icon.url }"
              :title="icon.label"
              @click="selectJobIcon(createForm, icon)"
            >
              <img :src="icon.url" :alt="icon.label" />
            </button>
          </div>
          <div class="upload-row">
            <input v-model="createForm.iconUrl" class="input" type="text" placeholder="Paste icon URL or upload →" style="flex:1" />
            <button type="button" class="btn btn-secondary btn-sm" @click="createIconFileRef?.click()">📷 Upload icon</button>
          </div>
          <input ref="createIconFileRef" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/*" class="hidden-file" @change="onCreateIconFileChange" />
          <div v-if="createForm.iconFile" class="upload-preview-label">✓ Selected: {{ createForm.iconFile.name }}</div>
          <div v-else-if="createForm.iconUrl" class="icon-thumb">
            <img :src="displayAssetUrl(createForm.iconUrl)" alt="Job icon preview" />
          </div>
        </div>
        <input ref="jobFileRef" class="input" type="file" @change="onCreateFileChange" />
        <input v-model="createForm.city" class="input" type="text" placeholder="City" />
        <input v-model="createForm.state" class="input" type="text" placeholder="State" />
        <input v-model="createForm.postedDate" class="input" type="date" />
        <select v-model="createForm.educationLevel" class="input">
          <option value="">Education level (optional)</option>
          <option v-for="opt in educationLevelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <label class="checkbox-inline">
          <input v-model="createForm.ongoing" type="checkbox" />
          Ongoing (no deadline)
        </label>
        <input v-model="createForm.applicationDeadline" class="input" type="date" :disabled="createForm.ongoing" />
        <label class="checkbox-inline">
          <input v-model="createForm.isFeatured" type="checkbox" />
          Pin as featured on careers page
        </label>
        <div class="tags-field" style="grid-column: 1 / -1;">
          <label class="small" style="display:block;margin-bottom:4px;color:#374151;">Display tags (shown as chips on the job card)</label>
          <div class="tags-input-row">
            <div class="tags-chips">
              <span v-for="(tag, idx) in createForm.tags" :key="idx" class="tag-chip">{{ tag }}<button type="button" @click="createForm.tags.splice(idx,1)">✕</button></span>
            </div>
            <input
              class="input tag-input"
              type="text"
              placeholder="Add tag, press Enter…"
              @keydown.enter.prevent="addTag(createForm, $event.target)"
              @keydown.comma.prevent="addTag(createForm, $event.target)"
            />
          </div>
        </div>
        <textarea
          v-model="createForm.descriptionText"
          class="textarea"
          rows="4"
          placeholder="Quick description shown on careers page"
          style="grid-column: 1 / -1;"
        />
      </div>
      <div class="application-page-config">
        <div class="config-header">
          <h4>Single job posting override</h4>
          <span class="muted small">Optional. Empty fields fall back to the agency defaults above.</span>
        </div>
        <div class="form-grid">
          <input v-model="createForm.applicationPage.eyebrow" class="input" type="text" placeholder="Small label, e.g. Join Our Team" />
          <input v-model="createForm.applicationPage.lead" class="input" type="text" placeholder="Lead line under the title" />
          <input v-model="createForm.applicationPage.titleHighlight" class="input" type="text" placeholder="Title highlight text, e.g. Colorado Springs" />
          <label class="checkbox-inline">
            <input v-model="createForm.applicationPage.showLeafAccent" type="checkbox" />
            Show leaf accent near photo
          </label>
          <div class="hero-upload-field">
            <input v-model="createForm.applicationPage.heroImageUrl" class="input" type="text" placeholder="Hero image URL or upload below" />
            <button type="button" class="btn btn-secondary btn-sm" @click="triggerCreateHeroUpload">Upload photo</button>
            <input
              ref="createHeroFileRef"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/*"
              class="hidden-file"
              @change="onCreateHeroFileChange"
            />
            <div v-if="createForm.heroImageFile" class="muted small">Selected: {{ createForm.heroImageFile.name }}</div>
            <div v-else-if="createForm.applicationPage.heroImageUrl" class="hero-thumb">
              <img :src="displayAssetUrl(createForm.applicationPage.heroImageUrl)" alt="Hero preview" />
            </div>
          </div>
          <input v-model="createForm.applicationPage.heroImageAlt" class="input" type="text" placeholder="Hero image alt text" />
          <input v-model="createForm.applicationPage.heroImagePosition" class="input" type="text" placeholder="Photo focus, e.g. center center" />
          <input v-model="createForm.applicationPage.secureTitle" class="input" type="text" placeholder="Header secure title, e.g. Secure & Confidential" />
          <input v-model="createForm.applicationPage.secureSubtitle" class="input" type="text" placeholder="Header secure subtitle" />
          <input v-model="createForm.applicationPage.startHeading" class="input" type="text" placeholder="Start card heading" />
          <input v-model="createForm.applicationPage.startSubtitle" class="input" type="text" placeholder="Start card subtitle" />
          <input v-model="createForm.applicationPage.startButtonText" class="input" type="text" placeholder="Start button text" />
          <input v-model="createForm.applicationPage.startTimeNote" class="input" type="text" placeholder="Time note, e.g. Takes 3-5 minutes to begin" />
        </div>
        <div class="display-card-editor">
          <h5>Feature cells</h5>
          <div class="display-card-grid">
            <div v-for="(card, idx) in createForm.applicationPage.featureCards" :key="`create-feature-${idx}`" class="display-card-draft">
              <select v-model="card.icon" class="input">
                <option v-for="opt in cardIconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <input v-model="card.title" class="input" type="text" :placeholder="`Feature ${idx + 1} title`" />
              <textarea v-model="card.body" class="textarea" rows="2" :placeholder="`Feature ${idx + 1} detail`" />
            </div>
          </div>
        </div>
        <div class="display-card-editor">
          <h5>Trust cells</h5>
          <div class="display-card-grid display-card-grid-trust">
            <div v-for="(card, idx) in createForm.applicationPage.trustItems" :key="`create-trust-${idx}`" class="display-card-draft">
              <select v-model="card.icon" class="input">
                <option v-for="opt in cardIconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <input v-model="card.title" class="input" type="text" :placeholder="`Trust ${idx + 1} title`" />
              <textarea v-model="card.body" class="textarea" rows="2" :placeholder="`Trust ${idx + 1} detail`" />
            </div>
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" :disabled="creating || !createForm.title.trim()" @click="createJob">
          {{ creating ? 'Creating…' : 'Create job + application' }}
        </button>
      </div>
    </section>

    <section class="panel jobs-panel">
      <h3>Job postings</h3>
      <div v-if="loading" class="muted">Loading jobs…</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Applicants</th>
            <th>Posted</th>
            <th>Deadline</th>
            <th>Location</th>
            <th>Application form</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in jobRows" :key="row.id">
            <td>
              <div class="name">{{ row.title }}</div>
              <div class="muted small">{{ row.descriptionText || 'No description yet.' }}</div>
            </td>
            <td>
              <span class="pill" :class="row.isActive ? 'pill-active' : 'pill-inactive'">
                {{ row.isActive ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td>
              <div>{{ row.activeApplicantCount }} active</div>
              <div class="muted small">{{ row.inactiveApplicantCount }} inactive</div>
            </td>
            <td>{{ formatDate(row.postedDate) || '—' }}</td>
            <td>{{ row.applicationDeadline ? formatDate(row.applicationDeadline) : 'Ongoing' }}</td>
            <td>{{ [row.city, row.state].filter(Boolean).join(', ') || '—' }}</td>
            <td>
              <template v-if="row.applicationUrl">
                <a :href="row.applicationUrl" target="_blank" rel="noopener noreferrer">Open link</a>
              </template>
              <span v-else class="muted">Not created</span>
            </td>
            <td>
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" @click="openEdit(row)">Edit</button>
                <button class="btn btn-secondary btn-sm" @click="toggleActive(row)">
                  {{ row.isActive ? 'Deactivate' : 'Activate' }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="openApplicants(row)">View applicants</button>
                <button class="btn btn-secondary btn-sm" @click="openForm(row)">
                  {{ row.linkId ? 'Form' : 'Create form' }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="copyLink(row)" :disabled="!row.applicationUrl">Copy link</button>
              </div>
            </td>
          </tr>
          <tr v-if="jobRows.length === 0">
            <td colspan="8" class="muted">No jobs created yet.</td>
          </tr>
        </tbody>
      </table>
    </section>

    <div v-if="editingRow" class="modal-overlay" @click.self="closeEdit">
      <div class="modal">
        <div class="modal-header">
          <h3>Edit job posting</h3>
          <button class="btn btn-secondary btn-sm" @click="closeEdit">Close</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <input v-model="editForm.title" class="input" type="text" placeholder="Job title" />
            <input v-model="editForm.roleType" class="input" type="text" placeholder="Role type label, e.g. Provider, Facilitator, Intern" />
            <div class="job-icon-field">
              <label class="field-label">Job card icon <span class="field-hint">— pick from the careers icon library (page 2) or upload your own</span></label>
              <div class="job-icon-picker">
                <button
                  v-for="icon in jobIconLibrary"
                  :key="`edit-${icon.id}`"
                  type="button"
                  class="job-icon-option"
                  :class="{ 'job-icon-option--active': editForm.iconUrl === icon.url }"
                  :title="icon.label"
                  @click="selectJobIcon(editForm, icon)"
                >
                  <img :src="icon.url" :alt="icon.label" />
                </button>
              </div>
              <div class="upload-row">
                <input v-model="editForm.iconUrl" class="input" type="text" placeholder="Paste icon URL or upload →" style="flex:1" />
                <button type="button" class="btn btn-secondary btn-sm" @click="editIconFileRef?.click()">📷 Upload icon</button>
              </div>
              <input ref="editIconFileRef" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/*" class="hidden-file" @change="onEditIconFileChange" />
              <div v-if="editForm.iconFile" class="upload-preview-label">✓ Selected: {{ editForm.iconFile.name }}</div>
              <div v-else-if="editForm.iconUrl" class="icon-thumb">
                <img :src="displayAssetUrl(editForm.iconUrl)" alt="Job icon preview" />
              </div>
            </div>
            <input ref="editFileRef" class="input" type="file" @change="onEditFileChange" />
            <div v-if="editingRow?.hasFile" class="muted small">
              Current file: {{ editingRow.originalName || 'Uploaded file' }}
              <button type="button" class="btn btn-secondary btn-sm" style="margin-left:8px;" @click="openJobFile(editingRow)">
                View
              </button>
            </div>
            <input v-model="editForm.city" class="input" type="text" placeholder="City" />
            <input v-model="editForm.state" class="input" type="text" placeholder="State" />
            <input v-model="editForm.postedDate" class="input" type="date" />
            <select v-model="editForm.educationLevel" class="input">
              <option value="">Education level (optional)</option>
              <option v-for="opt in educationLevelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <label class="checkbox-inline">
              <input v-model="editForm.ongoing" type="checkbox" />
              Ongoing (no deadline)
            </label>
            <input v-model="editForm.applicationDeadline" class="input" type="date" :disabled="editForm.ongoing" />
            <label class="checkbox-inline">
              <input v-model="editForm.isFeatured" type="checkbox" />
              Pin as featured on careers page
            </label>
            <div class="tags-field" style="grid-column: 1 / -1;">
              <label class="small" style="display:block;margin-bottom:4px;color:#374151;">Display tags</label>
              <div class="tags-input-row">
                <div class="tags-chips">
                  <span v-for="(tag, idx) in editForm.tags" :key="idx" class="tag-chip">{{ tag }}<button type="button" @click="editForm.tags.splice(idx,1)">✕</button></span>
                </div>
                <input
                  class="input tag-input"
                  type="text"
                  placeholder="Add tag, press Enter…"
                  @keydown.enter.prevent="addTag(editForm, $event.target)"
                  @keydown.comma.prevent="addTag(editForm, $event.target)"
                />
              </div>
            </div>
            <textarea
              v-model="editForm.descriptionText"
              class="textarea"
              rows="4"
              placeholder="Quick description shown on careers page"
              style="grid-column: 1 / -1;"
            />
          </div>
          <div class="application-page-config">
            <div class="config-header">
              <h4>Application landing page</h4>
              <span class="muted small">Optional single-job override. Empty fields fall back to agency defaults.</span>
            </div>
            <div class="form-grid">
              <input v-model="editForm.applicationPage.eyebrow" class="input" type="text" placeholder="Small label, e.g. Join Our Team" />
              <input v-model="editForm.applicationPage.lead" class="input" type="text" placeholder="Lead line under the title" />
              <input v-model="editForm.applicationPage.titleHighlight" class="input" type="text" placeholder="Title highlight text, e.g. Colorado Springs" />
              <label class="checkbox-inline">
                <input v-model="editForm.applicationPage.showLeafAccent" type="checkbox" />
                Show leaf accent near photo
              </label>
              <div class="hero-upload-field">
                <input v-model="editForm.applicationPage.heroImageUrl" class="input" type="text" placeholder="Hero image URL or upload below" />
                <button type="button" class="btn btn-secondary btn-sm" @click="triggerEditHeroUpload">Upload photo</button>
                <input
                  ref="editHeroFileRef"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/*"
                  class="hidden-file"
                  @change="onEditHeroFileChange"
                />
                <div v-if="editForm.heroImageFile" class="muted small">Selected: {{ editForm.heroImageFile.name }}</div>
                <div v-else-if="editForm.applicationPage.heroImageUrl" class="hero-thumb">
                  <img :src="displayAssetUrl(editForm.applicationPage.heroImageUrl)" alt="Hero preview" />
                </div>
              </div>
              <input v-model="editForm.applicationPage.heroImageAlt" class="input" type="text" placeholder="Hero image alt text" />
              <input v-model="editForm.applicationPage.heroImagePosition" class="input" type="text" placeholder="Photo focus, e.g. center center" />
              <input v-model="editForm.applicationPage.secureTitle" class="input" type="text" placeholder="Header secure title, e.g. Secure & Confidential" />
              <input v-model="editForm.applicationPage.secureSubtitle" class="input" type="text" placeholder="Header secure subtitle" />
              <input v-model="editForm.applicationPage.startHeading" class="input" type="text" placeholder="Start card heading" />
              <input v-model="editForm.applicationPage.startSubtitle" class="input" type="text" placeholder="Start card subtitle" />
              <input v-model="editForm.applicationPage.startButtonText" class="input" type="text" placeholder="Start button text" />
              <input v-model="editForm.applicationPage.startTimeNote" class="input" type="text" placeholder="Time note, e.g. Takes 3-5 minutes to begin" />
            </div>
            <div class="display-card-editor">
              <h5>Feature cells</h5>
              <div class="display-card-grid">
                <div v-for="(card, idx) in editForm.applicationPage.featureCards" :key="`edit-feature-${idx}`" class="display-card-draft">
                  <select v-model="card.icon" class="input">
                    <option v-for="opt in cardIconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <input v-model="card.title" class="input" type="text" :placeholder="`Feature ${idx + 1} title`" />
                  <textarea v-model="card.body" class="textarea" rows="2" :placeholder="`Feature ${idx + 1} detail`" />
                </div>
              </div>
            </div>
            <div class="display-card-editor">
              <h5>Trust cells</h5>
              <div class="display-card-grid display-card-grid-trust">
                <div v-for="(card, idx) in editForm.applicationPage.trustItems" :key="`edit-trust-${idx}`" class="display-card-draft">
                  <select v-model="card.icon" class="input">
                    <option v-for="opt in cardIconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <input v-model="card.title" class="input" type="text" :placeholder="`Trust ${idx + 1} title`" />
                  <textarea v-model="card.body" class="textarea" rows="2" :placeholder="`Trust ${idx + 1} detail`" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" :disabled="savingEdit || !editForm.title.trim()" @click="saveEdit">
            {{ savingEdit ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import {
  CAREERS_HERO_PRESETS,
  CAREERS_JOB_ICONS,
  blankImpactModal,
  blankWhyModal,
  normalizeImpactModal,
  normalizeWhyModal,
  resolveDefaultCareersPage,
  resolveDefaultHeroPreset
} from '../../utils/careersAssets';
const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const creating = ref(false);
const savingEdit = ref(false);
const savingAgencyCareers = ref(false);
const error = ref('');
const jobs = ref([]);
const links = ref([]);
const applicantCounts = ref({});
const agencyHeroImageFile = ref(null);

const cardIconOptions = [
  { value: 'team', label: 'Team (illustration)' },
  { value: 'care', label: 'Care (illustration)' },
  { value: 'growth', label: 'Growth (illustration)' },
  { value: 'learning', label: 'Learning (illustration)' },
  { value: 'list', label: 'List (illustration)' },
  { value: 'location', label: 'Location (illustration)' },
  { value: 'clock', label: 'Clock (illustration)' },
  { value: 'bookmark', label: 'Bookmark (illustration)' },
  { value: 'community', label: 'Community (job icon)' },
  { value: 'badge', label: 'Badge (job icon)' },
  { value: 'school', label: 'School (emoji)' },
  { value: 'office', label: 'Office (emoji)' },
  { value: 'people', label: 'People (emoji)' },
  { value: 'heart', label: 'Heart (emoji)' },
  { value: 'shield', label: 'Shield (emoji)' },
  { value: 'lock', label: 'Lock (emoji)' },
  { value: 'handshake', label: 'Handshake (emoji)' },
  { value: 'star', label: 'Star (emoji)' },
  { value: 'none', label: 'No icon' }
];
const heroPresets = CAREERS_HERO_PRESETS;
const jobIconLibrary = CAREERS_JOB_ICONS;
const agencyDefaultHero = computed(() =>
  resolveDefaultHeroPreset({
    slug: selectedAgency.value?.slug || '',
    agencyName: selectedAgency.value?.name || selectedAgency.value?.official_name || ''
  })
);
const blankDisplayCard = () => ({ icon: 'none', title: '', body: '' });
const blankApplicationPage = () => ({
  heroHeadline: '',
  heroSubheadline: '',
  accentColor: '#1a8c54',
  navItems: [],
  eyebrow: '',
  lead: '',
  titleHighlight: '',
  heroImageUrl: '',
  heroImageAlt: '',
  heroImagePosition: '',
  heroFrameStyle: '',
  secureTitle: '',
  secureSubtitle: '',
  startHeading: '',
  startSubtitle: '',
  startButtonText: '',
  startTimeNote: '',
  showLeafAccent: true,
  bannerText: '',
  bannerBullets: [],
  bannerLinkText: '',
  bannerLinkHref: '',
  bannerLinkAction: '',
  featureCards: [blankDisplayCard(), blankDisplayCard(), blankDisplayCard(), blankDisplayCard()],
  trustItems: [blankDisplayCard(), blankDisplayCard(), blankDisplayCard()],
  whyModal: blankWhyModal(),
  impactModal: blankImpactModal()
});
const normalizeDisplayCard = (card) => ({
  icon: String(card?.icon || 'none').trim() || 'none',
  title: String(card?.title || '').trim(),
  body: String(card?.body || '').trim()
});
const normalizeApplicationPage = (page) => {
  const rawFeatures = Array.isArray(page?.featureCards) ? page.featureCards : [];
  const rawTrust = Array.isArray(page?.trustItems) ? page.trustItems : [];
  const rawNav = Array.isArray(page?.navItems) ? page.navItems : [];
  const rawBullets = Array.isArray(page?.bannerBullets) ? page.bannerBullets : [];
  const next = {
    heroHeadline: String(page?.heroHeadline || '').trim(),
    heroSubheadline: String(page?.heroSubheadline || '').trim(),
    accentColor: String(page?.accentColor || '#1a8c54').trim(),
    navItems: rawNav.map((n) => ({
      label: String(n?.label || '').trim(),
      href: String(n?.href || '').trim(),
      style: String(n?.style || 'link').trim() === 'button' ? 'button' : 'link',
      action: String(n?.action || '').trim(),
      icon: String(n?.icon || 'none').trim() || 'none'
    })).filter((n) => n.label),
    eyebrow: String(page?.eyebrow || '').trim(),
    lead: String(page?.lead || '').trim(),
    titleHighlight: String(page?.titleHighlight || page?.title_highlight || '').trim(),
    heroImageUrl: String(page?.heroImageUrl || '').trim(),
    heroImageAlt: String(page?.heroImageAlt || '').trim(),
    heroImagePosition: String(page?.heroImagePosition || page?.hero_image_position || '').trim(),
    heroFrameStyle: String(page?.heroFrameStyle || page?.hero_frame_style || '').trim(),
    secureTitle: String(page?.secureTitle || page?.secure_title || '').trim(),
    secureSubtitle: String(page?.secureSubtitle || page?.secure_subtitle || '').trim(),
    startHeading: String(page?.startHeading || page?.start_heading || '').trim(),
    startSubtitle: String(page?.startSubtitle || page?.start_subtitle || '').trim(),
    startButtonText: String(page?.startButtonText || page?.start_button_text || '').trim(),
    startTimeNote: String(page?.startTimeNote || page?.start_time_note || '').trim(),
    showLeafAccent: page?.showLeafAccent !== false && page?.show_leaf_accent !== false,
    bannerText: String(page?.bannerText || '').trim(),
    bannerBullets: rawBullets.map((b) => String(b || '').trim()).filter(Boolean),
    bannerLinkText: String(page?.bannerLinkText || '').trim(),
    bannerLinkHref: String(page?.bannerLinkHref || '').trim(),
    bannerLinkAction: String(page?.bannerLinkAction || '').trim(),
    featureCards: rawFeatures.map(normalizeDisplayCard).slice(0, 4),
    trustItems: rawTrust.map(normalizeDisplayCard).slice(0, 3),
    whyModal: normalizeWhyModal(page?.whyModal),
    impactModal: normalizeImpactModal(page?.impactModal)
  };
  while (next.featureCards.length < 4) next.featureCards.push(blankDisplayCard());
  while (next.trustItems.length < 3) next.trustItems.push(blankDisplayCard());
  return next;
};
const compactApplicationPage = (page) => {
  const normalized = normalizeApplicationPage(page);
  return {
    heroHeadline: normalized.heroHeadline,
    heroSubheadline: normalized.heroSubheadline,
    accentColor: normalized.accentColor,
    navItems: normalized.navItems,
    eyebrow: normalized.eyebrow,
    lead: normalized.lead,
    titleHighlight: normalized.titleHighlight,
    heroImageUrl: normalized.heroImageUrl,
    heroImageAlt: normalized.heroImageAlt,
    heroImagePosition: normalized.heroImagePosition,
    heroFrameStyle: normalized.heroFrameStyle,
    secureTitle: normalized.secureTitle,
    secureSubtitle: normalized.secureSubtitle,
    startHeading: normalized.startHeading,
    startSubtitle: normalized.startSubtitle,
    startButtonText: normalized.startButtonText,
    startTimeNote: normalized.startTimeNote,
    showLeafAccent: normalized.showLeafAccent,
    bannerText: normalized.bannerText,
    bannerBullets: normalized.bannerBullets,
    bannerLinkText: normalized.bannerLinkText,
    bannerLinkHref: normalized.bannerLinkHref,
    bannerLinkAction: normalized.bannerLinkAction,
    featureCards: normalized.featureCards.filter((card) => card.title || card.body),
    trustItems: normalized.trustItems.filter((card) => card.title || card.body),
    whyModal: {
      ...normalized.whyModal,
      cards: normalized.whyModal.cards.filter((c) => c.title || c.body)
    },
    impactModal: {
      ...normalized.impactModal,
      stats: normalized.impactModal.stats.filter((s) => s.value || s.label || s.body)
    }
  };
};
const agencyPageForm = ref(blankApplicationPage());

const createForm = ref({
  title: '',
  descriptionText: '',
  postedDate: '',
  applicationDeadline: '',
  ongoing: true,
  city: '',
  state: '',
  educationLevel: '',
  roleType: '',
  isFeatured: false,
  tags: [],
  iconUrl: '',
  iconFile: null,
  applicationPage: blankApplicationPage(),
  heroImageFile: null,
  file: null
});
const editForm = ref({
  title: '',
  descriptionText: '',
  postedDate: '',
  applicationDeadline: '',
  ongoing: true,
  city: '',
  state: '',
  educationLevel: '',
  roleType: '',
  isFeatured: false,
  tags: [],
  iconUrl: '',
  iconFile: null,
  applicationPage: blankApplicationPage(),
  heroImageFile: null,
  file: null
});
const editingRow = ref(null);
const jobFileRef = ref(null);
const editFileRef = ref(null);
const agencyHeroFileRef = ref(null);
const createHeroFileRef = ref(null);
const editHeroFileRef = ref(null);
const createIconFileRef = ref(null);
const editIconFileRef = ref(null);

const agencyChoices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);
  return (base || [])
    .filter((o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});
const canChooseAgency = computed(() => agencyChoices.value.length > 1);
const selectedAgencyId = ref('');
const orgPath = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  if (!slug) return path;
  return `/${slug}${path}`;
};
const effectiveAgencyId = computed(() => {
  const chosen = Number(selectedAgencyId.value || 0) || null;
  if (chosen) return chosen;
  return Number(agencyStore.currentAgency?.id || authStore.user?.agencyId || 0) || null;
});
const selectedAgency = computed(() =>
  agencyChoices.value.find((a) => Number(a?.id) === Number(effectiveAgencyId.value)) || null
);
const educationLevelOptions = [
  { value: 'bachelors', label: 'Bachelors' },
  { value: 'masters_level_intern', label: 'Masters level intern' },
  { value: 'masters_or_doctoral', label: 'Masters/Doctoral level' }
];
const publicCareersUrl = computed(() => {
  const slug = String(selectedAgency.value?.slug || '').trim();
  if (!slug) return '';
  return `${window.location.origin.replace(/\/$/, '')}/careers/${slug}`;
});

const jobRows = computed(() => {
  const mapByJob = new Map();
  for (const l of links.value || []) {
    const jdId = Number(l.job_description_id || l.jobDescriptionId || 0);
    if (!jdId) continue;
    if (!mapByJob.has(jdId)) mapByJob.set(jdId, l);
  }
  return (jobs.value || [])
    .slice()
    .sort((a, b) => {
      const aActive = a?.isActive ? 1 : 0;
      const bActive = b?.isActive ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || ''));
    })
    .map((j) => {
    const link = mapByJob.get(Number(j.id)) || null;
    return {
      ...j,
      linkId: link?.id || null,
      linkPublicKey: link?.public_key || link?.publicKey || null,
      applicationUrl: link?.public_key || link?.publicKey ? buildPublicIntakeUrl(link.public_key || link.publicKey) : '',
      activeApplicantCount: Number(applicantCounts.value?.[j.id]?.active || 0),
      inactiveApplicantCount: Number(applicantCounts.value?.[j.id]?.inactive || 0)
    };
  });
});
const formatDate = (v) => {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return raw;
  return dt.toLocaleDateString();
};

const onCreateFileChange = (e) => {
  createForm.value.file = e?.target?.files?.[0] || null;
};
const onEditFileChange = (e) => {
  editForm.value.file = e?.target?.files?.[0] || null;
};
const displayAssetUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/assets/') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
  return toUploadsUrl(raw) || raw;
};
const triggerCreateHeroUpload = () => {
  createHeroFileRef.value?.click?.();
};
const triggerEditHeroUpload = () => {
  editHeroFileRef.value?.click?.();
};
const triggerAgencyHeroUpload = () => {
  agencyHeroFileRef.value?.click?.();
};
const onAgencyHeroFileChange = (e) => {
  const file = e?.target?.files?.[0] || null;
  agencyHeroImageFile.value = file;
  if (file) {
    agencyPageForm.value.heroImageUrl = file.name;
    agencyPageForm.value.heroFrameStyle = 'rounded';
  }
};
const onCreateHeroFileChange = (e) => {
  const file = e?.target?.files?.[0] || null;
  createForm.value.heroImageFile = file;
  if (file) createForm.value.applicationPage.heroImageUrl = file.name;
};
const onEditHeroFileChange = (e) => {
  const file = e?.target?.files?.[0] || null;
  editForm.value.heroImageFile = file;
  if (file) editForm.value.applicationPage.heroImageUrl = file.name;
};
const onCreateIconFileChange = (e) => {
  const file = e?.target?.files?.[0] || null;
  createForm.value.iconFile = file;
  if (file) createForm.value.iconUrl = file.name;
};
const onEditIconFileChange = (e) => {
  const file = e?.target?.files?.[0] || null;
  editForm.value.iconFile = file;
  if (file) editForm.value.iconUrl = file.name;
};
const applyHeroPreset = (form, preset) => {
  if (!form || !preset) return;
  form.heroImageUrl = preset.url;
  form.heroFrameStyle = preset.frameStyle || 'preframed';
  form.heroImageAlt = form.heroImageAlt || preset.label;
  if (preset.frameStyle === 'preframed') form.showLeafAccent = false;
  agencyHeroImageFile.value = null;
};
const applyBrandStarterContent = () => {
  const starter = resolveDefaultCareersPage({
    slug: selectedAgency.value?.slug || '',
    agencyName: selectedAgency.value?.name || selectedAgency.value?.official_name || ''
  });
  agencyPageForm.value = normalizeApplicationPage({
    ...agencyPageForm.value,
    ...starter,
    // Keep any already-saved application landing defaults
    titleHighlight: agencyPageForm.value.titleHighlight,
    secureTitle: agencyPageForm.value.secureTitle,
    secureSubtitle: agencyPageForm.value.secureSubtitle,
    startHeading: agencyPageForm.value.startHeading,
    startSubtitle: agencyPageForm.value.startSubtitle,
    startButtonText: agencyPageForm.value.startButtonText,
    startTimeNote: agencyPageForm.value.startTimeNote,
    trustItems: agencyPageForm.value.trustItems
  });
  agencyHeroImageFile.value = null;
};
const selectJobIcon = (form, icon) => {
  if (!form || !icon) return;
  form.iconUrl = icon.url;
  form.iconFile = null;
};

const buildDefaultJobApplicationSteps = () => ([
  { id: `step_${Date.now()}_resume`, type: 'upload', label: 'Resume', accept: '.pdf,.doc,.docx,.txt', maxFiles: 1, required: true, visibility: 'always', allowPasteText: true },
  { id: `step_${Date.now()}_cover`, type: 'upload', label: 'Cover Letter', accept: '.pdf,.doc,.docx,.txt', maxFiles: 1, required: false, visibility: 'always', allowPasteText: true },
  {
    id: `step_${Date.now()}_references`,
    type: 'references',
    label: 'Professional references',
    required: true,
    waivable: true,
    minReferences: 3,
    authorizationNotice:
      'By submitting this information, you authorize [tenant] to contact the individuals listed and obtain information regarding your employment history, educational background, professional conduct, and qualifications for employment. If you do not waive references, you must provide a valid email for each required reference so we may send a confidential digital reference form if you are offered an interview or a job.'
  }
]);

const loadJobs = async () => {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/hiring/job-descriptions', {
    params: { agencyId: effectiveAgencyId.value, includeInactive: 1 }
  });
  jobs.value = Array.isArray(r.data) ? r.data : [];
};

const loadLinks = async () => {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/intake-links');
  links.value = (Array.isArray(r.data) ? r.data : []).filter((l) => (
    String(l.form_type || l.formType || '').toLowerCase() === 'job_application'
    && Number(l.organization_id || l.organizationId || 0) === Number(effectiveAgencyId.value)
  ));
};

const loadApplicantCounts = async () => {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/hiring/candidates', { params: { agencyId: effectiveAgencyId.value, stageFilter: 'all', status: 'PROSPECTIVE' } });
  const list = Array.isArray(r.data) ? r.data : [];
  const counts = {};
  for (const row of list) {
    const id = Number(row.job_description_id || 0);
    if (!id) continue;
    if (!counts[id]) counts[id] = { active: 0, inactive: 0 };
    const stage = String(row.stage || '').trim().toLowerCase();
    if (stage === 'not_hired') counts[id].inactive += 1;
    else if (stage !== 'hired') counts[id].active += 1;
  }
  applicantCounts.value = counts;
};

const loadAgencyCareersPage = async () => {
  if (!effectiveAgencyId.value) return;
  const r = await api.get('/hiring/careers-page', {
    params: { agencyId: effectiveAgencyId.value }
  });
  agencyPageForm.value = normalizeApplicationPage(r.data?.careersPage);
  agencyHeroImageFile.value = null;
  if (agencyHeroFileRef.value) agencyHeroFileRef.value.value = '';
};

const ensureApplicationLink = async (jobId) => {
  const existing = (links.value || []).find((l) => Number(l.job_description_id || l.jobDescriptionId || 0) === Number(jobId));
  if (existing?.id) return existing;
  const created = await api.post(`/intake-links/from-job/${jobId}`);
  const link = created.data?.link;
  if (link?.id) {
    await api.put(`/intake-links/${link.id}`, {
      intakeSteps: buildDefaultJobApplicationSteps()
    });
  }
  return link || null;
};

const refresh = async () => {
  if (!effectiveAgencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    await Promise.all([loadJobs(), loadLinks(), loadApplicantCounts(), loadAgencyCareersPage()]);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load careers data';
  } finally {
    loading.value = false;
  }
};

const saveAgencyCareersPage = async () => {
  if (!effectiveAgencyId.value) return;
  try {
    savingAgencyCareers.value = true;
    error.value = '';
    const fd = new FormData();
    fd.append('agencyId', String(effectiveAgencyId.value));
    fd.append('careersPageJson', JSON.stringify(compactApplicationPage(agencyPageForm.value)));
    if (agencyHeroImageFile.value) fd.append('agencyHeroImage', agencyHeroImageFile.value);
    const r = await api.put('/hiring/careers-page', fd);
    agencyPageForm.value = normalizeApplicationPage(r.data?.careersPage);
    agencyHeroImageFile.value = null;
    if (agencyHeroFileRef.value) agencyHeroFileRef.value.value = '';
    await loadJobs();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save careers page defaults';
  } finally {
    savingAgencyCareers.value = false;
  }
};

const createJob = async () => {
  if (!effectiveAgencyId.value) return;
  try {
    creating.value = true;
    const fd = new FormData();
    fd.append('agencyId', String(effectiveAgencyId.value));
    fd.append('title', String(createForm.value.title || '').trim());
    if (String(createForm.value.descriptionText || '').trim()) fd.append('descriptionText', String(createForm.value.descriptionText || '').trim());
    if (String(createForm.value.postedDate || '').trim()) fd.append('postedDate', String(createForm.value.postedDate || '').trim());
    if (!createForm.value.ongoing && String(createForm.value.applicationDeadline || '').trim()) {
      fd.append('applicationDeadline', String(createForm.value.applicationDeadline || '').trim());
    } else {
      fd.append('applicationDeadline', '');
    }
    if (String(createForm.value.city || '').trim()) fd.append('city', String(createForm.value.city || '').trim());
    if (String(createForm.value.state || '').trim()) fd.append('state', String(createForm.value.state || '').trim());
    if (String(createForm.value.educationLevel || '').trim()) fd.append('educationLevel', String(createForm.value.educationLevel || '').trim());
    if (String(createForm.value.roleType || '').trim()) fd.append('roleType', String(createForm.value.roleType || '').trim());
    fd.append('isFeatured', createForm.value.isFeatured ? '1' : '0');
    fd.append('tagsJson', JSON.stringify(createForm.value.tags || []));
    const createPage = {
      ...compactApplicationPage(createForm.value.applicationPage),
      iconUrl: String(createForm.value.iconUrl || '').trim()
    };
    fd.append('applicationPageJson', JSON.stringify(createPage));
    if (createForm.value.heroImageFile) fd.append('heroImage', createForm.value.heroImageFile);
    if (createForm.value.iconFile) fd.append('jobIcon', createForm.value.iconFile);
    if (createForm.value.file) fd.append('file', createForm.value.file);
    const r = await api.post('/hiring/job-descriptions', fd);
    const jobId = Number(r.data?.id || 0);
    if (jobId) await ensureApplicationLink(jobId);
    createForm.value = {
      title: '',
      descriptionText: '',
      postedDate: '',
      applicationDeadline: '',
      ongoing: true,
      city: '',
      state: '',
      educationLevel: '',
      roleType: '',
      isFeatured: false,
      tags: [],
      iconUrl: '',
      iconFile: null,
      applicationPage: blankApplicationPage(),
      heroImageFile: null,
      file: null
    };
    if (jobFileRef.value) jobFileRef.value.value = '';
    if (createHeroFileRef.value) createHeroFileRef.value.value = '';
    if (createIconFileRef.value) createIconFileRef.value.value = '';
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create job';
  } finally {
    creating.value = false;
  }
};

const openEdit = (row) => {
  editingRow.value = row;
  editForm.value = {
    title: row.title || '',
    descriptionText: row.descriptionText || '',
    postedDate: row.postedDate || '',
    applicationDeadline: row.applicationDeadline || '',
    ongoing: !row.applicationDeadline,
    city: row.city || '',
    state: row.state || '',
    educationLevel: row.educationLevel || '',
    roleType: row.roleType || '',
    isFeatured: !!row.isFeatured,
    tags: Array.isArray(row.tags) ? [...row.tags] : [],
    iconUrl: String(row.applicationPage?.iconUrl || '').trim(),
    iconFile: null,
    applicationPage: normalizeApplicationPage(row.applicationPage),
    heroImageFile: null,
    file: null
  };
  if (editFileRef.value) editFileRef.value.value = '';
  if (editHeroFileRef.value) editHeroFileRef.value.value = '';
  if (editIconFileRef.value) editIconFileRef.value.value = '';
};
const closeEdit = () => {
  editingRow.value = null;
  editForm.value = {
    title: '',
    descriptionText: '',
    postedDate: '',
    applicationDeadline: '',
    ongoing: true,
    city: '',
    state: '',
    educationLevel: '',
    roleType: '',
    isFeatured: false,
    tags: [],
    iconUrl: '',
    iconFile: null,
    applicationPage: blankApplicationPage(),
    heroImageFile: null,
    file: null
  };
};

const saveEdit = async () => {
  if (!editingRow.value?.id || !effectiveAgencyId.value) return;
  try {
    savingEdit.value = true;
    const fd = new FormData();
    fd.append('agencyId', String(effectiveAgencyId.value));
    fd.append('title', String(editForm.value.title || '').trim());
    fd.append('descriptionText', String(editForm.value.descriptionText || '').trim());
    fd.append('postedDate', String(editForm.value.postedDate || '').trim());
    fd.append('applicationDeadline', editForm.value.ongoing ? '' : String(editForm.value.applicationDeadline || '').trim());
    fd.append('city', String(editForm.value.city || '').trim());
    fd.append('state', String(editForm.value.state || '').trim());
    fd.append('educationLevel', String(editForm.value.educationLevel || '').trim());
    fd.append('roleType', String(editForm.value.roleType || '').trim());
    fd.append('isFeatured', editForm.value.isFeatured ? '1' : '0');
    fd.append('tagsJson', JSON.stringify(editForm.value.tags || []));
    const editPage = {
      ...compactApplicationPage(editForm.value.applicationPage),
      iconUrl: String(editForm.value.iconUrl || '').trim()
    };
    fd.append('applicationPageJson', JSON.stringify(editPage));
    if (editForm.value.heroImageFile) fd.append('heroImage', editForm.value.heroImageFile);
    if (editForm.value.iconFile) fd.append('jobIcon', editForm.value.iconFile);
    if (editForm.value.file) fd.append('file', editForm.value.file);
    await api.put(`/hiring/job-descriptions/${editingRow.value.id}`, fd);
    closeEdit();
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save job';
  } finally {
    savingEdit.value = false;
  }
};

const toggleActive = async (row) => {
  if (!row?.id || !effectiveAgencyId.value) return;
  try {
    const fd = new FormData();
    fd.append('agencyId', String(effectiveAgencyId.value));
    fd.append('isActive', row.isActive ? '0' : '1');
    await api.put(`/hiring/job-descriptions/${row.id}`, fd);
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update status';
  }
};
const openJobFile = async (row) => {
  if (!row?.id || !effectiveAgencyId.value) return;
  try {
    const r = await api.get(`/hiring/job-descriptions/${row.id}/view`, {
      params: { agencyId: effectiveAgencyId.value }
    });
    const url = String(r.data?.url || '').trim();
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // ignore
  }
};

const openApplicants = (row) => {
  router.push({
    path: orgPath('/admin/hiring'),
    query: { filterJobId: String(row.id) }
  });
};

const openForm = async (row) => {
  if (!row?.id) return;
  try {
    let linkId = Number(row.linkId || 0) || null;
    if (!linkId) {
      const ensured = await ensureApplicationLink(row.id);
      linkId = Number(ensured?.id || 0) || null;
      await refresh();
    }
    if (!linkId) {
      error.value = 'Unable to create/open the digital form for this job.';
      return;
    }
    await router.push({
      path: orgPath('/admin/intake-links'),
      query: {
        editIntakeLinkId: String(linkId),
        jobDescriptionId: String(row.id),
        source: 'careers'
      }
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to open form editor';
  }
};

const copyLink = async (row) => {
  if (!row?.applicationUrl) return;
  try {
    await navigator.clipboard.writeText(row.applicationUrl);
  } catch {
    // ignore clipboard permission failures
  }
};
const addTag = (form, input) => {
  const val = String(input?.value || '').trim().replace(/,+$/, '').trim();
  if (val && !form.tags.includes(val)) form.tags.push(val);
  if (input) input.value = '';
};

const copyPublicCareersUrl = async () => {
  if (!publicCareersUrl.value) return;
  try {
    await navigator.clipboard.writeText(publicCareersUrl.value);
  } catch {
    // ignore clipboard permission failures
  }
};

watch(effectiveAgencyId, async (v) => {
  if (!v) return;
  await refresh();
});

onMounted(async () => {
  try {
    if (String(authStore.user?.role || '').toLowerCase() === 'super_admin') {
      await agencyStore.fetchAgencies();
    } else {
      await agencyStore.fetchUserAgencies();
    }
  } catch {
    // best effort
  }
  if (!selectedAgencyId.value && effectiveAgencyId.value) {
    selectedAgencyId.value = String(effectiveAgencyId.value);
  }
  await refresh();
});
</script>

<style scoped>
.careers-root { padding-top: 16px; padding-bottom: 36px; }
.header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.header-actions { display: flex; gap: 8px; align-items: flex-end; }
.subtle { color: #6b7280; font-size: 13px; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
.public-link-panel { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.form-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.input, .textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; font-size: 14px; }
.application-page-config { margin-top: 14px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f9fafb; }
.config-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.config-header h4, .display-card-editor h5 { margin: 0; }
.display-card-editor { margin-top: 12px; }
.display-card-editor h5 { font-size: 13px; color: #374151; margin-bottom: 8px; }
.display-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.display-card-grid-trust { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.display-card-draft { display: grid; gap: 8px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; }
.hero-upload-field { display: grid; gap: 8px; }
.hidden-file { display: none; }
.hero-thumb { width: 100%; max-width: 260px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fff; }
.hero-thumb img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; background: #0f172a; }
.hero-preset-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.hero-preset-card {
  display: flex; flex-direction: column; gap: 6px; align-items: stretch;
  border: 1.5px solid #e5e7eb; border-radius: 12px; padding: 8px; background: #fff; cursor: pointer; text-align: left;
}
.hero-preset-card img { width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: #0f172a; border-radius: 8px; }
.hero-preset-card span { font-size: 12px; font-weight: 600; color: #374151; }
.hero-preset-card--active { border-color: #16a34a; box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.15); }
.job-icon-picker { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.job-icon-option {
  width: 52px; height: 52px; border-radius: 50%; border: 2px solid #e5e7eb; background: #f8fafc;
  padding: 0; overflow: hidden; cursor: pointer;
}
.job-icon-option img { width: 100%; height: 100%; object-fit: cover; display: block; }
.job-icon-option--active { border-color: #16a34a; box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.18); }
.icon-thumb { width: 56px; height: 56px; border-radius: 50%; overflow: hidden; border: 1px solid #e5e7eb; }
.icon-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.checkbox-inline { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; }
.actions { margin-top: 10px; display: flex; gap: 8px; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { border-bottom: 1px solid #e5e7eb; padding: 10px; vertical-align: top; text-align: left; }
.row-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.pill { border-radius: 999px; padding: 2px 8px; font-size: 12px; }
.pill-active { background: #dcfce7; color: #166534; }
.pill-inactive { background: #fee2e2; color: #991b1b; }
.name { font-weight: 600; }
.small { font-size: 12px; }
.muted { color: #6b7280; }
.error-banner { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 10px; padding: 10px; margin-bottom: 10px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; justify-content: center; align-items: center; z-index: 90; }
.modal { width: 760px; max-width: 95vw; background: white; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #e5e7eb; }
.modal-body { padding: 12px; max-height: min(72vh, 820px); overflow: auto; }
.modal-actions { display: flex; justify-content: flex-end; padding: 12px; border-top: 1px solid #e5e7eb; }
.config-section-label { font-size: 13px; font-weight: 700; color: #374151; margin: 4px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
.color-field { display: flex; flex-direction: column; gap: 4px; }
.color-label { color: #374151; }
.color-row { display: flex; align-items: center; gap: 8px; }
.color-swatch { width: 40px; height: 38px; padding: 2px; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; flex-shrink: 0; }
.nav-items-list { display: flex; flex-direction: column; gap: 8px; }
.nav-item-row--rich { display: grid; grid-template-columns: 1.4fr 1fr 1.4fr 0.8fr 1.1fr auto; gap: 8px; align-items: center; }
@media (max-width: 900px) {
  .nav-item-row--rich { grid-template-columns: 1fr; }
}
/* Upload / icon helpers */
.upload-row { display: flex; gap: 8px; align-items: center; }
.upload-preview-label { font-size: 0.8rem; color: #16a34a; font-weight: 500; }
.field-label { display: block; font-size: 0.82rem; font-weight: 600; color: #374151; margin-bottom: 5px; }
.field-hint { font-size: 0.77rem; color: #9ca3af; font-weight: 400; }
.field-with-hint { display: flex; flex-direction: column; gap: 3px; }
.job-icon-field { display: flex; flex-direction: column; gap: 5px; grid-column: 1 / -1; }
/* Page layout diagram */
.page-diagram { display: flex; flex-direction: column; gap: 0; margin: 0 0 20px; font-size: 0.78rem; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
.page-diagram > div { padding: 7px 14px; border-bottom: 1px solid #e2e8f0; color: #374151; }
.page-diagram > div:last-child { border-bottom: 0; }
.page-diagram em { color: #6b7280; font-style: normal; }
.pd-nav { background: #1e293b; color: #f1f5f9; }
.pd-nav em { color: #94a3b8; }
.pd-hero { display: grid; grid-template-columns: 3fr 2fr; }
.pd-hero-copy { padding: 10px 14px; background: #fff; }
.pd-hero-img { background: #e2e8f0; padding: 10px 14px; color: #64748b; display: flex; align-items: center; }
.pd-filters { background: #fff; }
.pd-banner { background: #f0fdf4; color: #166534; }
.pd-jobs { background: #f8fafc; }
.tags-field { display: flex; flex-direction: column; gap: 6px; }
.tags-input-row { display: flex; flex-direction: column; gap: 6px; }
.tags-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 24px; }
.tag-chip { display: inline-flex; align-items: center; gap: 4px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; border-radius: 99px; font-size: 12px; padding: 2px 8px; }
.tag-chip button { background: none; border: none; cursor: pointer; color: inherit; font-size: 11px; padding: 0 2px; }
.tag-input { max-width: 320px; }
@media (max-width: 900px) {
  .form-grid { grid-template-columns: 1fr; }
  .display-card-grid,
  .display-card-grid-trust { grid-template-columns: 1fr; }
  .hero-preset-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .config-header { align-items: flex-start; flex-direction: column; }
  .nav-item-row { flex-wrap: wrap; }
}
</style>
