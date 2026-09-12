<template>
  <div class="pmp-admin container" style="max-width: 960px; margin: 0 auto; padding: 24px 16px 64px">
    <header class="pmp-head">
      <h1>Public marketing pages</h1>
      <p class="muted">
        Custom public pages at <code>/p/:slug</code>. Each slug is its own record—creating or editing one page does not
        change any other slug (for example your <code>d11summer2026</code> page stays untouched unless you open Edit on
        that row). Use <strong>New page</strong> for another URL. For event-style hubs, per-page <strong>sources</strong>
        control which agencies feed the listing; eligibility follows the same public-event rules as single-agency
        listings when those sources are used.
      </p>
    </header>

    <div v-if="loadError" class="error-banner">{{ loadError }}</div>

    <div class="pmp-actions">
      <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="startCreate">New page</button>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="loadPages">Reload</button>
    </div>

    <div v-if="loading" class="muted">Loading…</div>
    <ul v-else class="pmp-list">
      <li v-for="p in pages" :key="p.id" class="pmp-row">
        <div>
          <strong>/p/{{ p.slug }}</strong>
          <span v-if="!p.isActive" class="badge badge-warning">inactive</span>
          <div class="muted small">{{ p.title }}</div>
        </div>
        <div class="pmp-row-actions">
          <a class="linkish" :href="`/p/${p.slug}`" target="_blank" rel="noopener noreferrer">Open</a>
          <button type="button" class="btn btn-secondary btn-sm" @click="edit(p)">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" @click="removePage(p)">Delete</button>
        </div>
      </li>
    </ul>

    <div v-if="editorOpen" class="pmp-editor card">
      <h2>{{ editingId ? `Edit page #${editingId}` : 'New page' }}</h2>

      <MarketingDesignWorkspace v-if="showMarketingLandingEditor || showPtcoEditor" :key="editingId || 'new'" :page="designPreviewPage" :reference-url="designReferenceUrl" @asset="applyDesignAsset" @reference="designReferenceUrl = $event" @busy="designBusy = $event" />
      <label class="field">
        <span>Slug (URL: /p/slug)</span>
        <input v-model="form.slug" type="text" placeholder="d11-summer-2025" :disabled="!!editingId" />
      </label>
      <label class="field">
        <span>Title</span>
        <input v-model="form.title" type="text" />
      </label>
      <label class="field inline">
        <input v-model="form.isActive" type="checkbox" />
        <span>Published (visible to everyone). Uncheck and save to hide this public page.</span>
      </label>
      <label class="field">
        <span>Page type</span>
        <select v-model="form.pageType">
          <option value="event_hub">event_hub</option>
          <option value="provider_booking">provider_booking</option>
          <option value="marketing_landing">marketing_landing</option>
          <option value="marketing_hub">Company website</option>
        </select>
      </label>
      <label class="field">
        <span>Hero title (optional)</span>
        <input v-model="form.heroTitle" type="text" />
      </label>
      <label class="field">
        <span>Hero subtitle</span>
        <textarea v-model="form.heroSubtitle" rows="2" />
      </label>
      <label class="field">
        <span>Partner line (optional)</span>
        <input
          v-model="form.partnerLine"
          type="text"
          placeholder="e.g. In partnership with Colorado Springs School District 11"
        />
        <span class="muted small">Small uppercase line above the hero — sets community context.</span>
      </label>
      <label class="field">
        <span>Parent intro (optional)</span>
        <textarea
          v-model="form.parentIntro"
          rows="3"
          placeholder="Short mobile-first message: locations, how to find closest site, what to expect."
        />
        <span class="muted small">Shown in the green highlight card. If empty, a sensible default is used.</span>
      </label>
      <div class="field pmp-assets">
        <span>Logo</span>
        <p class="muted small">Shown in the hub header (theme). Upload or paste a URL.</p>
        <div class="pmp-upload-row">
          <input v-model="form.logoUrl" type="text" placeholder="/uploads/… or https://…" class="flex-grow" />
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="!!saving || !!uploadingTarget"
            @click="triggerLogoUpload"
          >
            {{ uploadingTarget === 'logo' ? '…' : 'Upload' }}
          </button>
          <input
            ref="logoFileInput"
            type="file"
            accept="image/*"
            class="pmp-hidden-file"
            tabindex="-1"
            aria-hidden="true"
            @change="onUploadLogo"
          />
        </div>
        <div v-if="form.logoUrl" class="pmp-thumb"><img :src="form.logoUrl" alt="Logo preview" /></div>
      </div>

      <div class="field pmp-assets">
        <span>Hero image</span>
        <p class="muted small">Banner at the top of <code>/p/{{ form.slug || 'slug' }}</code>.</p>
        <div class="pmp-upload-row">
          <input v-model="form.heroImageUrl" type="text" placeholder="https://… or upload" class="flex-grow" />
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="!!saving || !!uploadingTarget"
            @click="triggerHeroUpload"
          >
            {{ uploadingTarget === 'hero' ? '…' : 'Upload' }}
          </button>
          <input
            ref="heroFileInput"
            type="file"
            accept="image/*"
            class="pmp-hidden-file"
            tabindex="-1"
            aria-hidden="true"
            @change="onUploadHero"
          />
        </div>
        <div v-if="form.heroImageUrl" class="pmp-thumb pmp-thumb-wide"><img :src="form.heroImageUrl" alt="Hero preview" /></div>
      </div>

      <div v-if="showMarketingLandingEditor" class="field pmp-tisi-editor">
        <span>Marketing landing content</span>
        <p class="muted small">
          Shown for <code>marketing_landing</code> pages (e.g. <code>/p/tisi</code>). Every section below maps to the public page —
          upload images, change copy, pick icons, or paste an icon image URL. Subpages still use the Subpages list further down.
        </p>

        <div class="pmp-tisi-grid">
          <label class="pmp-inline">Site name <input v-model="landingForm.siteName" type="text" /></label>
          <label class="pmp-inline">Tagline <input v-model="landingForm.tagline" type="text" /></label>
          <label class="pmp-inline">Desktop hero focal position <input v-model="landingForm.heroPosition" type="text" placeholder="50% 35%" /></label>
          <label class="pmp-inline">Mobile hero focal position <input v-model="landingForm.heroMobilePosition" type="text" placeholder="65% 35%" /></label>
          <label class="pmp-inline">Banner focal position <input v-model="landingForm.ctaPosition" type="text" placeholder="50% 50%" /></label>
          <label class="pmp-inline">Hero eyebrow <input v-model="landingForm.heroEyebrow" type="text" /></label>
          <label class="pmp-inline">Hero script (use line breaks) <textarea v-model="landingForm.heroScript" rows="2" /></label>
          <label class="pmp-inline">Pillars bar <input v-model="landingForm.pillarsText" type="text" placeholder="HEAL | GROW | …" /></label>
          <label class="pmp-inline">Header / hero CTA label <input v-model="landingForm.ctaButtonLabel" type="text" /></label>
          <label class="pmp-inline">CTA href <input v-model="landingForm.ctaHref" type="text" class="mono" /></label>
          <label class="pmp-inline">Learn more href <input v-model="landingForm.learnMoreHref" type="text" class="mono" /></label>
        </div>

        <div class="field pmp-assets" style="margin-top: 12px">
          <span>Final CTA band image</span>
          <div class="pmp-upload-row">
            <input v-model="landingForm.ctaImageUrl" type="text" placeholder="/uploads/… or https://…" class="flex-grow" />
            <button type="button" class="btn btn-secondary btn-sm" :disabled="!!saving || !!uploadingTarget" @click="triggerCtaImageUpload">
              {{ uploadingTarget === 'ctaImage' ? '…' : 'Upload' }}
            </button>
            <input
              ref="ctaImageFileInput"
              type="file"
              accept="image/*"
              class="pmp-hidden-file"
              tabindex="-1"
              aria-hidden="true"
              @change="onUploadCtaImage"
            />
          </div>
          <div v-if="landingForm.ctaImageUrl" class="pmp-thumb pmp-thumb-wide"><img :src="landingForm.ctaImageUrl" alt="CTA preview" /></div>
        </div>

        <h3 class="pmp-tisi-h3">Who we support</h3>
        <div class="pmp-tisi-grid">
          <label class="pmp-inline">Kicker <input v-model="landingForm.supportKicker" type="text" /></label>
          <label class="pmp-inline">Title <input v-model="landingForm.supportTitle" type="text" /></label>
          <label class="pmp-inline full">Body <textarea v-model="landingForm.supportBody" rows="2" /></label>
        </div>
        <div v-for="(card, i) in landingForm.supportCards" :key="`sc-${i}`" class="pmp-subpage-card">
          <div class="pmp-tisi-grid">
            <label class="pmp-inline">Title <input v-model="card.title" type="text" /></label>
            <label class="pmp-inline">Slug <input v-model="card.slug" type="text" class="mono" /></label>
            <label class="pmp-inline">Link href <input v-model="card.href" type="text" class="mono" /></label>
            <label class="pmp-inline"
              >Icon
              <select v-model="card.iconKey">
                <option v-for="opt in iconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>
            <label class="pmp-inline">Custom icon URL <input v-model="card.iconUrl" type="text" class="mono" placeholder="optional image" /></label>
            <label class="pmp-inline full">Body <textarea v-model="card.body" rows="2" /></label>
          </div>
          <button type="button" class="btn btn-danger btn-sm" @click="landingForm.supportCards.splice(i, 1)">Remove card</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="addSupportCard">Add audience card</button>

        <h3 class="pmp-tisi-h3">Services</h3>
        <div class="pmp-tisi-grid">
          <label class="pmp-inline">Section title <input v-model="landingForm.servicesTitle" type="text" /></label>
          <label class="pmp-inline">View-all label <input v-model="landingForm.servicesViewAllLabel" type="text" /></label>
          <label class="pmp-inline">View-all href <input v-model="landingForm.servicesViewAllHref" type="text" class="mono" /></label>
        </div>
        <div v-for="(svc, i) in landingForm.services" :key="`sv-${i}`" class="pmp-subpage-card">
          <div class="pmp-tisi-grid">
            <label class="pmp-inline">Title <input v-model="svc.title" type="text" /></label>
            <label class="pmp-inline">Slug <input v-model="svc.slug" type="text" class="mono" /></label>
            <label class="pmp-inline">Link href <input v-model="svc.href" type="text" class="mono" /></label>
            <label class="pmp-inline"
              >Icon
              <select v-model="svc.iconKey">
                <option v-for="opt in iconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>
            <label class="pmp-inline">Custom icon URL <input v-model="svc.iconUrl" type="text" class="mono" /></label>
            <label class="pmp-inline full">Body <textarea v-model="svc.body" rows="2" /></label>
          </div>
          <button type="button" class="btn btn-danger btn-sm" @click="landingForm.services.splice(i, 1)">Remove service</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="addServiceCard">Add service</button>

        <h3 class="pmp-tisi-h3">Why choose us</h3>
        <label class="pmp-inline full">Section title <input v-model="landingForm.whyTitle" type="text" /></label>
        <div v-for="(item, i) in landingForm.whyItems" :key="`why-${i}`" class="pmp-subpage-card">
          <div class="pmp-tisi-grid">
            <label class="pmp-inline">Title <input v-model="item.title" type="text" /></label>
            <label class="pmp-inline"
              >Icon
              <select v-model="item.iconKey">
                <option v-for="opt in iconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>
            <label class="pmp-inline">Custom icon URL <input v-model="item.iconUrl" type="text" class="mono" /></label>
            <label class="pmp-inline full">Body <textarea v-model="item.body" rows="2" /></label>
          </div>
          <button type="button" class="btn btn-danger btn-sm" @click="landingForm.whyItems.splice(i, 1)">Remove</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="addWhyItem">Add reason</button>

        <h3 class="pmp-tisi-h3">How it works</h3>
        <div class="pmp-tisi-grid">
          <label class="pmp-inline">Kicker <input v-model="landingForm.processKicker" type="text" /></label>
          <label class="pmp-inline">Title <input v-model="landingForm.processTitle" type="text" /></label>
        </div>
        <div v-for="(step, i) in landingForm.processSteps" :key="`st-${i}`" class="pmp-subpage-card">
          <div class="pmp-tisi-grid">
            <label class="pmp-inline">Title <input v-model="step.title" type="text" /></label>
            <label class="pmp-inline">Optional link <input v-model="step.href" type="text" class="mono" /></label>
            <label class="pmp-inline full">Body <textarea v-model="step.body" rows="2" /></label>
          </div>
          <button type="button" class="btn btn-danger btn-sm" @click="landingForm.processSteps.splice(i, 1)">Remove step</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="addProcessStep">Add step</button>

        <h3 class="pmp-tisi-h3">Testimonials</h3>
        <label class="pmp-inline full">Section title <input v-model="landingForm.testimonialsTitle" type="text" /></label>
        <div v-for="(q, i) in landingForm.testimonials" :key="`q-${i}`" class="pmp-subpage-card">
          <label class="pmp-inline full">Quote <textarea v-model="q.text" rows="3" /></label>
          <label class="pmp-inline">Attribution <input v-model="q.attribution" type="text" /></label>
          <label><input v-model="q.verified" type="checkbox" /> This quote is authentic and approved for public use</label>
          <button type="button" class="btn btn-danger btn-sm" @click="landingForm.testimonials.splice(i, 1)">Remove</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="addTestimonial">Add testimonial</button>

        <h3 class="pmp-tisi-h3">Final CTA + contact + social</h3>
        <div class="pmp-tisi-grid">
          <label class="pmp-inline">CTA title <input v-model="landingForm.ctaTitle" type="text" /></label>
          <label class="pmp-inline">CTA button label <input v-model="landingForm.ctaFinalButtonLabel" type="text" /></label>
          <label class="pmp-inline full">CTA body <textarea v-model="landingForm.ctaBody" rows="2" /></label>
          <label class="pmp-inline">CTA note <input v-model="landingForm.ctaNote" type="text" /></label>
          <label class="pmp-inline">Phone <input v-model="landingForm.contactPhone" type="text" /></label>
          <label class="pmp-inline">Email <input v-model="landingForm.contactEmail" type="text" /></label>
          <label class="pmp-inline full">Address <input v-model="landingForm.contactAddress" type="text" /></label>
        </div>
        <div v-for="(s, i) in landingForm.socialLinks" :key="`soc-${i}`" class="pmp-row-grid">
          <input v-model="s.label" type="text" placeholder="Label" />
          <input v-model="s.short" type="text" placeholder="Short" />
          <input v-model="s.href" type="text" placeholder="URL / path" class="mono" />
          <button type="button" class="btn btn-danger btn-sm" @click="landingForm.socialLinks.splice(i, 1)">×</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="landingForm.socialLinks.push({ label: '', short: '', href: '' })">
          Add social link
        </button>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-left: 8px" @click="resetLandingFormToDefaults">
          Reset landing fields to defaults
        </button>
      </div>

      <div class="field pmp-assets">
        <span>Hero video (optional)</span>
        <p class="muted small">
          Plays below the hero image. <strong>Upload</strong> a short MP4, WebM, or MOV (about 20MB max), or paste a direct file URL / YouTube link.
        </p>
        <div class="pmp-upload-row">
          <input
            v-model="form.heroVideoUrl"
            type="text"
            placeholder="https://… or upload"
            class="flex-grow"
          />
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="!!saving || !!uploadingTarget"
            @click="triggerHeroVideoUpload"
          >
            {{ uploadingTarget === 'heroVideo' ? '…' : 'Upload video' }}
          </button>
          <input
            ref="heroVideoFileInput"
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
            class="pmp-hidden-file"
            tabindex="-1"
            aria-hidden="true"
            @change="onUploadHeroVideo"
          />
        </div>
        <video
          v-if="isLikelyDirectVideoUrl(form.heroVideoUrl)"
          class="pmp-video-preview"
          :src="form.heroVideoUrl"
          controls
          muted
          playsinline
          preload="metadata"
        />
      </div>

      <div class="field">
        <span>Photo library (this marketing page only)</span>
        <p class="muted small">
          Upload or paste URLs here for <strong>this hub</strong> only. These files are the pool you attach to each
          <strong>image placeholder</strong> below and the optional <strong>public photo gallery</strong> (fading slideshow).
          Uncheck <strong>Show in public photo gallery</strong> to keep an image only for placeholders / auto-fill. For
          <strong>Auto</strong> placeholders, images fill in upload order when a card has no explicit image.
        </p>
        <p class="muted small pmp-pattern-note">
          Pattern: whenever we add image placeholders to a template, they appear as assignable slots next to the uploader (like
          Placeholder 1–4 here).
        </p>
        <div class="pmp-upload-row">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="!!saving || !!uploadingTarget" @click="triggerGalleryUpload">
            {{ uploadingTarget === 'gallery' ? '…' : 'Upload images' }}
          </button>
          <input
            ref="galleryFileInput"
            type="file"
            accept="image/*"
            multiple
            class="pmp-hidden-file"
            tabindex="-1"
            aria-hidden="true"
            @change="onUploadGallery"
          />
        </div>
        <ul class="pmp-gallery-list">
          <li v-for="(entry, gi) in galleryEntries" :key="`g-${gi}`" class="pmp-gallery-item">
            <button
              v-if="galleryRowHasImage(gi)"
              type="button"
              class="pmp-gallery-thumb"
              :title="'View larger'"
              @click="openGalleryPreview(gi)"
            >
              <img :src="resolvedGalleryImageSrc(entry.url)" alt="" loading="lazy" />
            </button>
            <div v-else class="pmp-gallery-thumb pmp-gallery-thumb--empty" aria-hidden="true" />
            <input v-model="entry.url" type="text" class="mono" placeholder="Image URL" />
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="!galleryRowHasImage(gi)"
              @click="openGalleryPreview(gi)"
            >
              View
            </button>
            <button type="button" class="btn btn-danger btn-sm" @click="removeGallery(gi)">Remove</button>
            <label class="pmp-gallery-strip-label">
              <input v-model="entry.showInGallery" type="checkbox" />
              <span>Show in public photo gallery</span>
            </label>
            <div v-if="placeholdersUsingGalleryRow(gi).length" class="pmp-gallery-ph-badges">
              <span
                v-for="n in placeholdersUsingGalleryRow(gi)"
                :key="`phuse-${gi}-${n}`"
                class="pmp-ph-chip"
                :title="`Assigned to Placeholder ${n} on this page`"
                >Placeholder {{ n }}</span
              >
            </div>
          </li>
        </ul>
        <button type="button" class="btn btn-secondary btn-sm" @click="addGalleryRow">Add URL row</button>
      </div>

      <div class="field">
        <span>Image placeholders — “What we offer” cards (this page only)</span>
        <p class="muted small">
          These four slots match <strong>Placeholder 1–4</strong> on the public hub (visible while you’re logged in as super
          admin). Each dropdown picks one row from the photo library above.
        </p>
        <div v-for="bi in [1, 2, 3, 4]" :key="`ob-${bi}`" class="pmp-offer-block-row">
          <label class="pmp-offer-block-label">
            <span>Placeholder {{ bi }}</span>
            <select v-model="offerBlockImages[bi - 1]" class="filters-input pmp-offer-block-select">
              <option value="">— Auto (use next library image in order) —</option>
              <option
                v-for="(entry, gi) in galleryEntries"
                :key="`obopt-${bi}-${gi}`"
                :value="String(entry.url || '').trim()"
                :disabled="!String(entry.url || '').trim()"
              >
                Library {{ gi + 1 }} — {{ shortGalleryLabel(entry.url) }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div class="field">
        <span>Primary navigation</span>
        <p class="muted small">
          Top links on the hub. Use internal paths like <code>/p/{{ form.slug || 'your-slug' }}/faq</code> for subpages, or
          <code>https://…</code> for external sites.
        </p>
        <div v-for="(row, ni) in navRows" :key="`nav-${ni}`" class="pmp-row-grid">
          <input v-model="row.label" type="text" placeholder="Label" />
          <input v-model="row.href" type="text" placeholder="URL or path" class="mono" />
          <button type="button" class="btn btn-danger btn-sm" @click="removeNav(ni)">×</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="navRows.push({ label: '', href: '' })">Add link</button>
      </div>

      <div class="field">
        <span>Footer legal links (public page override)</span>
        <p class="muted small">
          Leave blank to use platform docs by default. When set, this page uses your custom title and links at the bottom.
        </p>
        <input v-model="form.footerLegalTitle" type="text" placeholder="Program legal documents" />
        <div v-for="(row, li) in legalFooterLinkRows" :key="`ll-${li}`" class="pmp-row-grid">
          <input v-model="row.label" type="text" placeholder="Label (e.g. Program Privacy Policy)" />
          <input v-model="row.href" type="text" placeholder="https://… or /privacypolicy" class="mono" />
          <button type="button" class="btn btn-danger btn-sm" @click="removeLegalFooterLink(li)">×</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="legalFooterLinkRows.push({ label: '', href: '' })">
          Add legal link
        </button>
      </div>

      <div class="field">
        <span>Eligibility / “school site” block (Medicaid messaging)</span>
        <p class="muted small">
          The red-accent card (“Interested in learning more?”, “Choose your school site”, etc.). Override copy in Advanced branding
          JSON under <code>ctaSection</code>, or set <code>ctaSection: false</code> to remove it entirely.
        </p>
        <label class="pmp-check-row">
          <input v-model="ctaEmbedInOfferExpanded" type="checkbox" />
          <span>Show at the bottom of «Show more info» (under the four offer cards)</span>
        </label>
        <label class="pmp-check-row">
          <input v-model="ctaHideStandaloneBand" type="checkbox" />
          <span>Hide the duplicate stand-alone section on the page</span>
        </label>
        <p class="muted small">
          Recommended: keep both boxes checked so visitors see this block only after expanding Show more info. Uncheck “Hide the
          duplicate…” if you disabled “What we offer” or want the card visible without expanding.
        </p>
      </div>

      <div class="field">
        <span>Extra links inside «Show more info» (new tab)</span>
        <p class="muted small">
          For legacy site pages: each row is a title and full URL; links open in a new window and appear below the eligibility block
          when Show more info is expanded.
        </p>
        <div v-for="(row, ei) in offerExpandedLinkRows" :key="`oel-${ei}`" class="pmp-row-grid">
          <input v-model="row.title" type="text" placeholder="Title" />
          <input v-model="row.href" type="text" placeholder="https://…" class="mono" />
          <button type="button" class="btn btn-danger btn-sm" @click="removeOfferExpandedLink(ei)">×</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="offerExpandedLinkRows.push({ title: '', href: '' })">
          Add link
        </button>
      </div>

      <div class="field">
        <span>Subpages (markdown)</span>
        <p class="muted small">
          Each entry becomes <code>/p/{{ form.slug || 'slug' }}/:slug</code> with the body rendered as Markdown (great for FAQ,
          policies, extra info).
        </p>
        <div v-for="(pg, pi) in contentPages" :key="`cp-${pi}`" class="pmp-subpage-card">
          <div class="pmp-subpage-meta">
            <label class="pmp-inline"
              >URL slug <input v-model="pg.slug" type="text" placeholder="faq" class="mono"
            /></label>
            <label class="pmp-inline"
              >Page title <input v-model="pg.title" type="text" placeholder="Frequently asked questions"
            /></label>
          </div>
          <template v-if="form.slug === 'tisi' && ['men', 'boys', 'athletes', 'mens-services', 'boys-services', 'athlete-services'].includes(pg.slug)">
            <label class="pmp-inline full">Hero heading <input v-model="pg.heroTitle" placeholder="Use the designed page default" /></label>
            <label class="pmp-inline full">Hero description <textarea v-model="pg.heroSubtitle" rows="3" /></label>
            <label v-for="field in ['heroImageUrl', 'portraitImageUrl', 'bannerImageUrl']" :key="field" class="pmp-inline full">{{ field }} <input v-model="pg[field]" placeholder="/assets/tisi/boys-hero.webp" /></label>
            <label class="pmp-inline full">Desktop image position <input v-model="pg.heroPosition" placeholder="50% 50%" /></label>
            <label class="pmp-inline full">Mobile image position <input v-model="pg.heroMobilePosition" placeholder="60% 50%" /></label>
            <a :href="`/p/tisi/${pg.slug}`" target="_blank" rel="noopener">Open published page</a>
          </template>
          <label class="pmp-inline full"
            >Body (Markdown)
            <textarea v-model="pg.body" rows="6" class="mono" placeholder="## Heading&#10;&#10;Your content…" />
          </label>
          <button type="button" class="btn btn-danger btn-sm" @click="removeContentPage(pi)">Remove page</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="contentPages.push({ slug: '', title: '', body: '' })">
          Add subpage
        </button>
      </div>

      <label class="field">
        <span>Metrics profile (optional, public)</span>
        <input v-model="form.metricsProfile" type="text" placeholder="hub_sources_summary or plottwistco_summary" />
      </label>
      <label class="field">
        <span>Advanced branding (JSON)</span>
        <p class="muted small">
          Merged with logo / gallery / nav / subpages above on save. Optional hub blocks:
          <code>programThemePrimary</code> (hex accent),
          <code>ctaSection</code> (object to override copy, or <code>false</code> to hide the Medicaid / eligibility band),
          <code>processSection</code> (object with <code>title</code> / <code>steps</code> array, or <code>false</code> to hide),
          <code>whatWeOfferSection</code> (collapsible block: <code>title</code>, <code>summary</code>, <code>intro</code>, <code>items</code>,
          <code>offerBlockImages</code> (this page’s Placeholder 1–4 image paths; or use pickers above); or <code>false</code> to hide),
          <code>offerExpandedExternalLinks</code> (array of <code>{ title, href }</code>; use the form above—opens in new tab),
          <code>ctaSection.embedInOfferExpanded</code> / <code>hideStandaloneCtaBand</code> (use checkboxes above),
          <code>heroVideoUrl</code> (use the Hero video field above; it merges here on save).
          For slug <code>skillbuilders</code> only: optional <code>skillbuildersJourney</code> with
          <code>officeSources</code> (same shape as Sources; used for paths whose filter is <code>officeSources</code>),
          <code>districtProgramTitleContains</code> or <code>districtProgramTitleIncludes</code> (substring match, case-insensitive,
          against each event’s program organization name; default includes <code>D11 Summer ITSCO</code>),
          optional <code>paths</code> array of <code>{ "id", "label", "buttonVariant": "primary"|"secondary", "filter" }</code>
          where <code>filter</code> is <code>{ "kind": "programTitleAnd", "includes": ["D11 Summer ITSCO"] }</code>,
          <code>{ "kind": "officeSources" }</code>, <code>{ "kind": "districtOrOffice", "includes": ["D11 Summer ITSCO"] }</code>
          (district events plus office fallback — used by the default “attends a D11 school” path),
          or <code>{ "kind": "all" }</code> (add e.g. a D12 button with its own <code>programTitleAnd</code> row). Optional <code>subtitle</code>, <code>districtTitle</code>, <code>nonDistrictTitle</code>,
          <code>changeSelectionLabel</code>, <code>gateAriaLabel</code>, <code>enabled: false</code>. If <code>paths</code> is omitted, default
          buttons are “My Dependent attends a D11 School” (inclusive <code>districtOrOffice</code> — D11 plus office fallback) and
          “My Dependent is in another district” (exclusive <code>officeSources</code>).
          Tenant colors use platform
          branding unless <code>programThemePrimary</code> overrides the accent stripe.
        </p>
        <textarea v-model="form.brandingJsonText" rows="6" class="mono" placeholder='{"programThemePrimary":"#a32623"}' />
      </label>

      <div class="field">
        <span>Sources (agencies or program organizations with registration-eligible events)</span>
        <div class="pmp-source-pick">
          <select v-model="pickSourceType" class="filters-input">
            <option value="agency">Agency (all affiliated program events under that agency)</option>
            <option value="organization">Program organization id (merge all events with that organization_id)</option>
          </select>
          <select v-model="pickAgencyId" class="filters-input">
            <option :value="null">Select…</option>
            <option v-for="a in agencyOptions" :key="a.id" :value="a.id">{{ a.name }} ({{ a.id }})</option>
          </select>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="!pickAgencyId" @click="addSource">Add</button>
        </div>
        <ul class="pmp-sources">
          <li v-for="(s, idx) in form.sources" :key="`${s.sourceId}-${idx}`">
            {{ sourceLabel(s) }}
            <button type="button" class="linkish" @click="removeSource(idx)">Remove</button>
          </li>
        </ul>
      </div>

      <div v-if="showMarketingLandingEditor" class="pmp-quality" aria-live="polite">
        <h3>Page readiness</h3>
        <p v-if="!designIssues.length">Content and destination checks passed. Use the preview to inspect desktop and mobile layouts and test external destinations.</p>
        <template v-else><p>{{ designIssues.length }} items need attention before publishing. Saving as unpublished hides this public URL while you complete it.</p>
          <ul><li v-for="(issue, i) in designIssues" :key="i"><strong>{{ issue.field }}:</strong> {{ issue.message }}</li></ul>
        </template>
      </div>
      <p v-if="saveError" class="error-banner" role="alert">{{ saveError }}</p>
      <div class="pmp-save-row">
        <button type="button" class="btn btn-primary" :disabled="saving || designBusy || !!uploadingTarget" @click="save">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button type="button" class="btn btn-secondary" :disabled="saving || designBusy || !!uploadingTarget" @click="cancelEdit">Cancel</button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="galleryPreviewIndex !== null"
        class="pmp-gallery-lightbox"
        role="presentation"
        @click.self="closeGalleryPreview"
      >
        <div class="pmp-gallery-lightbox-panel" role="dialog" aria-modal="true" aria-label="Gallery photo">
          <button type="button" class="pmp-gallery-lightbox-close" aria-label="Close" @click="closeGalleryPreview">
            ×
          </button>
          <div class="pmp-gallery-lightbox-img-wrap">
            <img
              v-if="galleryPreviewIndex !== null && galleryRowHasImage(galleryPreviewIndex)"
              :src="resolvedGalleryImageSrc(galleryEntries[galleryPreviewIndex]?.url)"
              alt="Gallery image"
            />
          </div>
          <div class="pmp-gallery-lightbox-actions">
            <button type="button" class="btn btn-danger btn-sm" @click="deleteFromGalleryPreview">
              Remove from gallery
            </button>
            <button type="button" class="btn btn-secondary btn-sm" @click="closeGalleryPreview">Close</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useRoute } from 'vue-router';
import MarketingDesignWorkspace from '../../components/marketing/MarketingDesignWorkspace.vue';
import { marketingPageIssues } from '../../utils/marketingPageQuality';
const route = useRoute();
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { parseHubGalleryFromBranding } from '../../utils/publicMarketingHubGallery';
import {
  TISI_LANDING_ICON_OPTIONS,
  adminFormToTisiLandingBranding,
  defaultTisiLandingConfig,
  resolveTisiLandingConfig,
  tisiLandingToAdminForm
} from '../../constants/tisiMarketingLanding';

const pages = ref([]);
const agencyOptions = ref([]);
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const saveError = ref('');
const editorOpen = ref(false);
const editingId = ref(null);
const pickAgencyId = ref(null);
const pickSourceType = ref('agency');

const uploadingTarget = ref('');
const logoFileInput = ref(null);
const heroFileInput = ref(null);
const galleryFileInput = ref(null);
const heroVideoFileInput = ref(null);
const ctaImageFileInput = ref(null);
const iconOptions = TISI_LANDING_ICON_OPTIONS;

const landingForm = ref(tisiLandingToAdminForm(defaultTisiLandingConfig()));

const showPtcoEditor = computed(() => String(form.value.slug || '').trim().toLowerCase() === 'ptco');
const showMarketingLandingEditor = computed(
  () =>
    (!showPtcoEditor.value && String(form.value.pageType || '') === 'marketing_landing') ||
    String(form.value.slug || '').trim().toLowerCase() === 'tisi'
);

const designBusy = ref(false);
const designReferenceUrl = ref('');
const originalLanding = ref({});
const designPreviewPage = computed(() => ({
  slug: form.value.slug || 'preview', title: form.value.title, pageType: form.value.pageType,
  heroTitle: form.value.heroTitle, heroSubtitle: form.value.heroSubtitle, heroImageUrl: form.value.heroImageUrl,
  branding: mergeBrandingPayload()
}));
const designIssues = computed(() => marketingPageIssues(resolveTisiLandingConfig({ pageMeta: designPreviewPage.value, branding: designPreviewPage.value.branding }), { slug: form.value.slug, contentPages: contentPages.value }));
function applyDesignAsset({ target, url }) {
  if (target === 'hero') form.value.heroImageUrl = url;
  else if (target === 'logo') form.value.logoUrl = url;
  else if (target === 'cta') landingForm.value.ctaImageUrl = url;
}

function triggerLogoUpload() {
  logoFileInput.value?.click();
}

function triggerHeroUpload() {
  heroFileInput.value?.click();
}

function triggerHeroVideoUpload() {
  heroVideoFileInput.value?.click();
}

function triggerCtaImageUpload() {
  ctaImageFileInput.value?.click();
}

function resetLandingFormToDefaults() {
  landingForm.value = tisiLandingToAdminForm(defaultTisiLandingConfig());
}

function addSupportCard() {
  landingForm.value.supportCards.push({
    slug: '',
    title: '',
    body: '',
    iconKey: 'person',
    iconUrl: '',
    href: ''
  });
}

function addServiceCard() {
  landingForm.value.services.push({
    slug: '',
    title: '',
    body: '',
    iconKey: 'chat',
    iconUrl: '',
    href: ''
  });
}

function addWhyItem() {
  landingForm.value.whyItems.push({ title: '', body: '', iconKey: 'shield', iconUrl: '' });
}

function addProcessStep() {
  landingForm.value.processSteps.push({ title: '', body: '', href: '' });
}

function addTestimonial() {
  landingForm.value.testimonials.push({ text: '', attribution: '' });
}

function isLikelyDirectVideoUrl(u) {
  const s = String(u || '').trim().toLowerCase();
  if (!s) return false;
  if (/youtube\.com|youtu\.be/.test(s)) return false;
  return s.endsWith('.mp4') || s.endsWith('.webm') || s.endsWith('.mov') || s.includes('/uploads/');
}

/** Structured hub branding (merged into brandingJson on save). */
const form = ref({
  slug: '',
  title: '',
  isActive: true,
  pageType: 'event_hub',
  heroTitle: '',
  heroSubtitle: '',
  heroImageUrl: '',
  heroVideoUrl: '',
  logoUrl: '',
  partnerLine: '',
  parentIntro: '',
  footerLegalTitle: '',
  metricsProfile: '',
  brandingJsonText: '{}',
  sources: []
});

const galleryEntries = ref([{ url: '', showInGallery: true }]);
/** Hub “What we offer” cards 1–4: gallery URL per slot, or '' for auto-order fallback. */
const offerBlockImages = ref(['', '', '', '']);
const galleryPreviewIndex = ref(null);

function shortGalleryLabel(url) {
  const s = String(url || '').trim();
  if (!s) return '—';
  const tail = s.split('/').pop() || s;
  return tail.length > 40 ? `${tail.slice(0, 37)}…` : tail;
}

/** Which placeholder slots (1-based) use this library row’s URL on this page. */
function placeholdersUsingGalleryRow(gi) {
  const url = String(galleryEntries.value[gi]?.url || '').trim();
  if (!url) return [];
  const nums = [];
  for (let i = 0; i < offerBlockImages.value.length; i++) {
    if (String(offerBlockImages.value[i] || '').trim() === url) nums.push(i + 1);
  }
  return nums;
}
const navRows = ref([{ label: '', href: '' }]);
const legalFooterLinkRows = ref([{ label: '', href: '' }]);
const contentPages = ref([{ slug: '', title: '', body: '' }]);
/** CTA (Medicaid / school site) placement — merged into branding.ctaSection on save. */
const ctaEmbedInOfferExpanded = ref(true);
const ctaHideStandaloneBand = ref(true);
/** Shown at bottom of expanded “What we offer”; each link opens in a new tab. */
const offerExpandedLinkRows = ref([{ title: '', href: '' }]);

function resolvedGalleryImageSrc(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return toUploadsUrl(s) || s;
}

function galleryRowHasImage(gi) {
  return Boolean(String(galleryEntries.value[gi]?.url || '').trim());
}

function addGalleryRow() {
  galleryEntries.value.push({ url: '', showInGallery: true });
}

function openGalleryPreview(gi) {
  if (!galleryRowHasImage(gi)) return;
  galleryPreviewIndex.value = gi;
}

function closeGalleryPreview() {
  galleryPreviewIndex.value = null;
}

function onGalleryLightboxKeydown(e) {
  if (e.key === 'Escape') closeGalleryPreview();
}

watch(galleryPreviewIndex, (v) => {
  if (v !== null) {
    document.addEventListener('keydown', onGalleryLightboxKeydown);
  } else {
    document.removeEventListener('keydown', onGalleryLightboxKeydown);
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', onGalleryLightboxKeydown);
});

function slugifySegment(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function mergeBrandingPayload() {
  let advanced = {};
  try {
    advanced = JSON.parse(form.value.brandingJsonText || '{}');
    if (!advanced || typeof advanced !== 'object' || Array.isArray(advanced)) advanced = {};
  } catch {
    advanced = {};
  }
  const out = { ...advanced };
  const logo = String(form.value.logoUrl || '').trim();
  if (logo) out.logoUrl = logo;
  else delete out.logoUrl;

  const rows = galleryEntries.value
    .map((e) => ({
      url: String(e.url || '').trim(),
      showInGallery: e.showInGallery !== false
    }))
    .filter((e) => e.url);
  if (rows.length) {
    out.gallery = rows.map((r) => (r.showInGallery === false ? { url: r.url, showInGallery: false } : r.url));
  } else delete out.gallery;

  const nav = navRows.value
    .map((r) => ({ label: String(r.label || '').trim(), href: String(r.href || '').trim() }))
    .filter((r) => r.label && r.href);
  if (nav.length) out.primaryNav = nav;
  else delete out.primaryNav;

  const subs = contentPages.value
    .map((p) => ({
      slug: slugifySegment(p.slug),
      title: String(p.title || '').trim(),
      body: String(p.body || ''),
      ...Object.fromEntries(['heroTitle', 'heroSubtitle', 'heroImageUrl', 'portraitImageUrl', 'bannerImageUrl', 'heroPosition', 'heroMobilePosition'].map(key => [key, String(p[key] || '')]))
    }))
    .filter((p) => p.slug && p.title);
  if (subs.length) out.contentPages = subs;
  else delete out.contentPages;

  const legalTitle = String(form.value.footerLegalTitle || '').trim();
  if (legalTitle) out.legalFooterTitle = legalTitle;
  else delete out.legalFooterTitle;

  const legalLinks = legalFooterLinkRows.value
    .map((r) => ({ label: String(r.label || '').trim(), href: String(r.href || '').trim() }))
    .filter((r) => r.label && r.href);
  if (legalLinks.length) out.legalFooterLinks = legalLinks;
  else delete out.legalFooterLinks;

  const pl = String(form.value.partnerLine || '').trim();
  if (pl) out.partnerLine = pl;
  else delete out.partnerLine;

  const pint = String(form.value.parentIntro || '').trim();
  if (pint) out.parentIntro = pint;
  else delete out.parentIntro;

  const hv = String(form.value.heroVideoUrl || '').trim();
  if (hv) out.heroVideoUrl = hv;
  else delete out.heroVideoUrl;

  // Page-scoped image placeholders (this hub template). New templates can add keys + picker rows + optional superadmin labels on the public view.
  const picks = offerBlockImages.value.map((u) => String(u || '').trim());
  if (picks.some(Boolean) && out.whatWeOfferSection !== false) {
    const prev = out.whatWeOfferSection;
    const base = typeof prev === 'object' && prev && !Array.isArray(prev) ? { ...prev } : {};
    out.whatWeOfferSection = { ...base, offerBlockImages: picks };
  } else if (out.whatWeOfferSection && typeof out.whatWeOfferSection === 'object' && !Array.isArray(out.whatWeOfferSection)) {
    const next = { ...out.whatWeOfferSection };
    delete next.offerBlockImages;
    if (Object.keys(next).length) out.whatWeOfferSection = next;
    else delete out.whatWeOfferSection;
  }

  const extLinks = offerExpandedLinkRows.value
    .map((r) => ({ title: String(r.title || '').trim(), href: String(r.href || '').trim() }))
    .filter((r) => r.title && r.href);
  if (extLinks.length) out.offerExpandedExternalLinks = extLinks;
  else delete out.offerExpandedExternalLinks;

  if (out.ctaSection === false) {
    /* explicit hide — do not inject placement flags */
  } else {
    const prev =
      typeof out.ctaSection === 'object' && out.ctaSection && !Array.isArray(out.ctaSection) ? { ...out.ctaSection } : {};
    out.ctaSection = {
      ...prev,
      embedInOfferExpanded: ctaEmbedInOfferExpanded.value !== false,
      hideStandaloneCtaBand: ctaHideStandaloneBand.value === true
    };
  }

  if (showMarketingLandingEditor.value) {
    const lf = {
      ...landingForm.value,
      heroTitle: String(form.value.heroTitle || '').trim(),
      heroSubtitle: String(form.value.heroSubtitle || '').trim()
    };
    const packed = adminFormToTisiLandingBranding(lf);
    Object.assign(out, packed);
    out.landing = { ...originalLanding.value, ...packed.landing };
    out.logoUrl = logo;
    out.primaryNav = nav;
    out.legalFooterLinks = legalLinks;
    out.designReferenceUrl = designReferenceUrl.value;
    // Avoid event-hub defaults leaking onto marketing landings.
    out.whatWeOfferSection = false;
    out.ctaSection = false;
    out.processSection = false;
  }

  if (showPtcoEditor.value) { out.landingTemplate = 'ptco'; out.designReferenceUrl = designReferenceUrl.value; }
  return out;
}

function hydrateStructuredFromBranding(b) {
  designReferenceUrl.value = b?.designReferenceUrl || "";
  originalLanding.value = b?.landing || {};
  const branding = b && typeof b === 'object' ? b : {};
  form.value.partnerLine = String(branding.partnerLine || '').trim();
  form.value.parentIntro = String(branding.parentIntro || '').trim();
  form.value.logoUrl = String(branding.logoUrl || '').trim();
  form.value.heroVideoUrl = String(branding.heroVideoUrl || '').trim();
  form.value.footerLegalTitle = String(branding.legalFooterTitle || '').trim();
  const parsed = parseHubGalleryFromBranding(branding.gallery);
  galleryEntries.value = parsed.length
    ? parsed.map((e) => ({ url: e.url, showInGallery: e.showInGallery !== false }))
    : [{ url: '', showInGallery: true }];

  const nav = Array.isArray(branding.primaryNav) ? branding.primaryNav : [];
  navRows.value = nav.length
    ? nav.map((r) => ({ label: String(r.label || ''), href: String(r.href || '') }))
    : [{ label: '', href: '' }];

  const legal = Array.isArray(branding.legalFooterLinks) ? branding.legalFooterLinks : [];
  legalFooterLinkRows.value = legal.length
    ? legal.map((r) => ({ label: String(r.label || ''), href: String(r.href || '') }))
    : [{ label: '', href: '' }];

  const cp = Array.isArray(branding.contentPages) ? branding.contentPages : [];
  contentPages.value = cp.length
    ? cp.map((p) => ({ slug: String(p.slug || ''), title: String(p.title || ''), body: String(p.body || ''), ...Object.fromEntries(['heroTitle', 'heroSubtitle', 'heroImageUrl', 'portraitImageUrl', 'bannerImageUrl', 'heroPosition', 'heroMobilePosition'].map(key => [key, String(p[key] || '')])) }))
    : [{ slug: '', title: '', body: '' }];

  const oe = Array.isArray(branding.offerExpandedExternalLinks) ? branding.offerExpandedExternalLinks : [];
  offerExpandedLinkRows.value = oe.length
    ? oe.map((r) => ({ title: String(r.title || ''), href: String(r.href || '') }))
    : [{ title: '', href: '' }];

  const resolved = resolveTisiLandingConfig({
    pageMeta: {
      title: form.value.title,
      heroTitle: form.value.heroTitle,
      heroSubtitle: form.value.heroSubtitle,
      heroImageUrl: form.value.heroImageUrl
    },
    branding
  });
  landingForm.value = tisiLandingToAdminForm(resolved);
}

async function postMarketingUpload(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.post('/platform/public-marketing-pages/upload', fd, { skipGlobalLoading: true });
  const url = res.data?.url;
  if (!url) throw new Error('Upload did not return a URL');
  return String(url).trim();
}

async function postMarketingVideoUpload(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.post('/platform/public-marketing-pages/upload-video', fd, { skipGlobalLoading: true });
  const url = res.data?.url;
  if (!url) throw new Error('Upload did not return a URL');
  return String(url).trim();
}

async function onUploadLogo(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  uploadingTarget.value = 'logo';
  try {
    form.value.logoUrl = await postMarketingUpload(f);
  } catch (err) {
    saveError.value = err.response?.data?.error?.message || err.message || 'Upload failed';
  } finally {
    uploadingTarget.value = '';
  }
}

async function onUploadHero(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  uploadingTarget.value = 'hero';
  try {
    form.value.heroImageUrl = await postMarketingUpload(f);
  } catch (err) {
    saveError.value = err.response?.data?.error?.message || err.message || 'Upload failed';
  } finally {
    uploadingTarget.value = '';
  }
}

async function onUploadHeroVideo(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  uploadingTarget.value = 'heroVideo';
  try {
    form.value.heroVideoUrl = await postMarketingVideoUpload(f);
  } catch (err) {
    saveError.value = err.response?.data?.error?.message || err.message || 'Video upload failed';
  } finally {
    uploadingTarget.value = '';
  }
}

async function onUploadCtaImage(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  uploadingTarget.value = 'ctaImage';
  try {
    landingForm.value.ctaImageUrl = await postMarketingUpload(f);
  } catch (err) {
    saveError.value = err.response?.data?.error?.message || err.message || 'Upload failed';
  } finally {
    uploadingTarget.value = '';
  }
}

function triggerGalleryUpload() {
  galleryFileInput.value?.click();
}

async function onUploadGallery(e) {
  const input = e.target;
  const files = input.files ? Array.from(input.files) : [];
  input.value = '';
  if (!files.length) return;
  uploadingTarget.value = 'gallery';
  const kept = galleryEntries.value.filter((ent) => String(ent.url || '').trim());
  try {
    for (const f of files) {
      const url = await postMarketingUpload(f);
      kept.push({ url, showInGallery: true });
    }
    galleryEntries.value = kept.length ? kept : [{ url: '', showInGallery: true }];
  } catch (err) {
    saveError.value = err.response?.data?.error?.message || err.message || 'Upload failed';
  } finally {
    uploadingTarget.value = '';
  }
}

function removeGallery(idx) {
  galleryEntries.value.splice(idx, 1);
  if (!galleryEntries.value.length) galleryEntries.value = [{ url: '', showInGallery: true }];
}

function deleteFromGalleryPreview() {
  const i = galleryPreviewIndex.value;
  if (i === null || i < 0) return;
  closeGalleryPreview();
  removeGallery(i);
}

function removeNav(idx) {
  navRows.value.splice(idx, 1);
  if (!navRows.value.length) navRows.value = [{ label: '', href: '' }];
}

function removeLegalFooterLink(idx) {
  legalFooterLinkRows.value.splice(idx, 1);
  if (!legalFooterLinkRows.value.length) legalFooterLinkRows.value = [{ label: '', href: '' }];
}

function removeOfferExpandedLink(idx) {
  offerExpandedLinkRows.value.splice(idx, 1);
  if (!offerExpandedLinkRows.value.length) offerExpandedLinkRows.value = [{ title: '', href: '' }];
}

function removeContentPage(idx) {
  contentPages.value.splice(idx, 1);
  if (!contentPages.value.length) contentPages.value = [{ slug: '', title: '', body: '' }];
}

function resetForm() {
  form.value = {
    slug: '',
    title: '',
    isActive: true,
    pageType: 'event_hub',
    heroTitle: '',
    heroSubtitle: '',
    heroImageUrl: '',
    heroVideoUrl: '',
    logoUrl: '',
    partnerLine: '',
    parentIntro: '',
    footerLegalTitle: '',
    metricsProfile: '',
    brandingJsonText: '{}',
    sources: []
  };
  galleryEntries.value = [{ url: '', showInGallery: true }];
  offerBlockImages.value = ['', '', '', ''];
  navRows.value = [{ label: '', href: '' }];
  legalFooterLinkRows.value = [{ label: '', href: '' }];
  contentPages.value = [{ slug: '', title: '', body: '' }];
  ctaEmbedInOfferExpanded.value = true;
  ctaHideStandaloneBand.value = true;
  offerExpandedLinkRows.value = [{ title: '', href: '' }];
  landingForm.value = tisiLandingToAdminForm(defaultTisiLandingConfig());
  pickAgencyId.value = null;
  pickSourceType.value = 'agency';
}

async function loadAgencies() {
  try {
    const res = await api.get('/agencies', { skipGlobalLoading: true });
    const raw = Array.isArray(res.data) ? res.data : res.data?.agencies || [];
    agencyOptions.value = raw
      .map((a) => ({
        id: Number(a.id),
        name: `${String(a.name || '').trim() || `Org ${a.id}`} (${String(a.organization_type || 'agency')})`
      }))
      .filter((a) => a.id > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    agencyOptions.value = [];
  }
}

async function loadPages() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get('/platform/public-marketing-pages', { skipGlobalLoading: true });
    pages.value = Array.isArray(res.data?.pages) ? res.data.pages : [];
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    pages.value = [];
  } finally {
    loading.value = false;
  }
}

function startCreate() {
  designReferenceUrl.value = '';
  originalLanding.value = {};
  editingId.value = null;
  resetForm();
  editorOpen.value = true;
  saveError.value = '';
}

function edit(p) {
  editingId.value = p.id;
  const b = p.brandingJson || {};
  const advanced = { ...b };
  delete advanced.logoUrl;
  delete advanced.gallery;
  delete advanced.primaryNav;
  delete advanced.contentPages;
  delete advanced.legalFooterTitle;
  delete advanced.legalFooterLinks;
  delete advanced.partnerLine;
  delete advanced.parentIntro;
  delete advanced.heroVideoUrl;
  delete advanced.offerExpandedExternalLinks;
  delete advanced.landing;
  if (p.slug !== 'ptco') delete advanced.landingTemplate;
  delete advanced.siteName;
  delete advanced.tagline;
  delete advanced.ctaHref;
  delete advanced.ctaImageUrl;
  delete advanced.contactPhone;
  delete advanced.contactEmail;
  delete advanced.contactAddress;

  if (advanced.ctaSection === false) {
    ctaEmbedInOfferExpanded.value = true;
    ctaHideStandaloneBand.value = true;
  } else if (advanced.ctaSection && typeof advanced.ctaSection === 'object' && !Array.isArray(advanced.ctaSection)) {
    const cta0 = advanced.ctaSection;
    ctaEmbedInOfferExpanded.value = cta0.embedInOfferExpanded !== false;
    ctaHideStandaloneBand.value = cta0.hideStandaloneCtaBand === true;
    const { embedInOfferExpanded: _e, hideStandaloneCtaBand: _h, ...ctaRest } = cta0;
    if (Object.keys(ctaRest).length) advanced.ctaSection = ctaRest;
    else delete advanced.ctaSection;
  } else {
    ctaEmbedInOfferExpanded.value = true;
    ctaHideStandaloneBand.value = true;
  }

  const w0 = advanced.whatWeOfferSection;
  if (w0 && typeof w0 === 'object' && !Array.isArray(w0)) {
    const obi = Array.isArray(w0.offerBlockImages) ? w0.offerBlockImages.map((x) => String(x || '').trim()) : [];
    offerBlockImages.value = [0, 1, 2, 3].map((i) => obi[i] || '');
    const { offerBlockImages: _drop, ...wRest } = w0;
    if (Object.keys(wRest).length) advanced.whatWeOfferSection = wRest;
    else delete advanced.whatWeOfferSection;
  } else {
    offerBlockImages.value = ['', '', '', ''];
  }
  form.value = {
    slug: p.slug,
    title: p.title || '',
    isActive: !!p.isActive,
    pageType: p.pageType || 'event_hub',
    heroTitle: p.heroTitle || '',
    heroSubtitle: p.heroSubtitle || '',
    heroImageUrl: p.heroImageUrl || '',
    heroVideoUrl: '',
    logoUrl: '',
    partnerLine: '',
    parentIntro: '',
    footerLegalTitle: '',
    metricsProfile: p.metricsProfile || '',
    brandingJsonText: JSON.stringify(advanced, null, 2),
    sources: (p.sources || []).map((s) => ({
      sourceType: s.sourceType || 'agency',
      sourceId: Number(s.sourceId),
      sortOrder: Number(s.sortOrder) || 0,
      isActive: s.isActive !== false
    }))
  };
  hydrateStructuredFromBranding(b);
  editorOpen.value = true;
  saveError.value = '';
}

function cancelEdit() {
  editorOpen.value = false;
  editingId.value = null;
  saveError.value = '';
}

function addSource() {
  const id = Number(pickAgencyId.value);
  if (!id) return;
  const st = pickSourceType.value === 'organization' ? 'organization' : 'agency';
  if (form.value.sources.some((s) => s.sourceType === st && Number(s.sourceId) === id)) return;
  form.value.sources.push({ sourceType: st, sourceId: id, sortOrder: form.value.sources.length, isActive: true });
  pickAgencyId.value = null;
}

function removeSource(idx) {
  form.value.sources.splice(idx, 1);
}

function sourceLabel(s) {
  const id = Number(s.sourceId);
  const a = agencyOptions.value.find((x) => x.id === id);
  return `${s.sourceType} ${id}${a ? ` — ${a.name}` : ''}`;
}

async function save() {
  saveError.value = '';
  try {
    const parsed = JSON.parse(form.value.brandingJsonText || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
  } catch { saveError.value = 'Advanced branding must be a valid JSON object. Your edits have been preserved.'; return; }
  if (uploadingTarget.value || designBusy.value) { saveError.value = 'Wait for the image upload to finish.'; return; }
  if (showMarketingLandingEditor.value && form.value.isActive && designIssues.value.length) {
    saveError.value = 'Resolve the page readiness items, or uncheck Published to save and hide this public page.'; return;
  }
  const brandingJson = mergeBrandingPayload();

  const payload = {
    slug: form.value.slug.trim().toLowerCase(),
    title: form.value.title.trim(),
    isActive: form.value.isActive,
    pageType: form.value.pageType,
    heroTitle: form.value.heroTitle || null,
    heroSubtitle: form.value.heroSubtitle || null,
    heroImageUrl: form.value.heroImageUrl || null,
    metricsProfile: form.value.metricsProfile?.trim() || null,
    brandingJson,
    sources: form.value.sources
  };
  saving.value = true;
  try {
    if (editingId.value) {
      await api.put(`/platform/public-marketing-pages/${editingId.value}`, payload, { skipGlobalLoading: true });
    } else {
      await api.post('/platform/public-marketing-pages', payload, { skipGlobalLoading: true });
    }
    editorOpen.value = false;
    editingId.value = null;
    await loadPages();
  } catch (e) {
    saveError.value = e.response?.data?.error?.message || e.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function removePage(p) {
  if (!window.confirm(`Delete public page /p/${p.slug}?`)) return;
  try {
    await api.delete(`/platform/public-marketing-pages/${p.id}`, { skipGlobalLoading: true });
    await loadPages();
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || e.message || 'Delete failed';
  }
}

onMounted(async () => {
  await Promise.all([loadAgencies(), loadPages()]);
  const requested = pages.value.find(p => p.slug === route.query.page);
  if (requested) edit(requested);
});
</script>

<style scoped>
.pmp-check-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 8px 0;
  font-size: 0.9375rem;
  line-height: 1.45;
}
.pmp-check-row input {
  margin-top: 3px;
  flex-shrink: 0;
}

.pmp-head h1 {
  margin: 0 0 8px;
}
.muted {
  color: #64748b;
}
.small {
  font-size: 0.85rem;
}
.pmp-actions {
  display: flex;
  gap: 8px;
  margin: 16px 0;
}
.pmp-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
}
.pmp-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #e2e8f0;
}
.pmp-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.pmp-editor {
  padding: 20px;
  margin-top: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.field.inline {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}
.pmp-source-pick {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.pmp-sources {
  margin: 8px 0 0;
  padding-left: 1.2rem;
}
.pmp-quality { padding: 18px; background: #f3f7f9; border: 1px solid #cbdbe3; border-radius: 8px; margin: 20px 0; }
.pmp-quality li { margin: 6px 0; font-size: 13px; }
.pmp-save-row {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.error-banner {
  background: #fef2f2;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 8px 0;
}
.linkish {
  background: none;
  border: none;
  padding: 0;
  color: #4f46e5;
  cursor: pointer;
  text-decoration: underline;
  font: inherit;
}
.card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.sr-only {
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
.pmp-assets .pmp-upload-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.pmp-assets .flex-grow {
  flex: 1;
  min-width: 180px;
}
/* Hidden but in DOM — not display:none so programmatic .click() opens the file picker reliably. */
.pmp-hidden-file {
  position: fixed;
  left: 0;
  top: 0;
  width: 0.01px;
  height: 0.01px;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}
.pmp-thumb {
  margin-top: 10px;
  max-width: 160px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  background: #f8fafc;
}
.pmp-thumb-wide {
  max-width: 420px;
}
.pmp-thumb img {
  width: 100%;
  display: block;
  vertical-align: middle;
}

.pmp-video-preview {
  display: block;
  width: 100%;
  max-width: 420px;
  max-height: 220px;
  margin-top: 10px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #0f172a;
}
.pmp-gallery-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
}
.pmp-gallery-item {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.pmp-gallery-strip-label {
  flex: 1 1 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 0 64px;
  font-size: 0.8125rem;
  color: #475569;
  cursor: pointer;
  user-select: none;
}
.pmp-gallery-strip-label input {
  flex: 0 0 auto;
  width: auto;
  min-width: auto;
}
.pmp-gallery-ph-badges {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 2px 0 4px;
  margin-left: 64px;
}
.pmp-ph-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #7f1d1d;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 6px;
}
.pmp-pattern-note {
  margin-top: 4px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
}
@media (max-width: 520px) {
  .pmp-gallery-ph-badges {
    margin-left: 0;
  }
  .pmp-gallery-strip-label {
    margin-left: 0;
  }
}
.pmp-gallery-item input {
  flex: 1;
  min-width: 0;
}
.pmp-gallery-thumb {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #f1f5f9;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pmp-gallery-thumb:hover {
  border-color: #94a3b8;
}
.pmp-gallery-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pmp-gallery-thumb--empty {
  pointer-events: none;
  cursor: default;
  background: repeating-linear-gradient(-45deg, #f1f5f9, #f1f5f9 6px, #e2e8f0 6px, #e2e8f0 7px);
}
.pmp-gallery-lightbox {
  position: fixed;
  inset: 0;
  z-index: 10050;
  background: rgba(15, 23, 42, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}
.pmp-gallery-lightbox-panel {
  position: relative;
  max-width: min(920px, 100%);
  max-height: min(92vh, 100%);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pmp-gallery-lightbox-close {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: #f1f5f9;
  color: #334155;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
}
.pmp-gallery-lightbox-close:hover {
  background: #e2e8f0;
}
.pmp-gallery-lightbox-img-wrap {
  margin-top: 28px;
  max-height: min(72vh, 640px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  border-radius: 8px;
  overflow: hidden;
}
.pmp-gallery-lightbox-img-wrap img {
  max-width: 100%;
  max-height: min(72vh, 640px);
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}
.pmp-gallery-lightbox-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.pmp-row-grid {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.pmp-subpage-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}
.pmp-inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
}
.pmp-inline.full {
  grid-column: 1 / -1;
}
.pmp-span-2 {
  grid-column: span 2;
}
.pmp-subpage-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
  background: #f8fafc;
}
.pmp-offer-block-row {
  margin-bottom: 10px;
}
.pmp-offer-block-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
}
.pmp-offer-block-label span:first-child {
  min-width: 4.5rem;
}
.pmp-offer-block-select {
  max-width: 100%;
  width: 100%;
}

.pmp-tisi-editor {
  border: 1px solid #c7d7e8;
  border-radius: 12px;
  padding: 16px;
  background: #f4f8fc;
}
.pmp-tisi-h3 {
  margin: 20px 0 10px;
  font-size: 1rem;
  color: #0b1f3a;
}
.pmp-tisi-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  margin-bottom: 10px;
}
@media (max-width: 720px) {
  .pmp-tisi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
