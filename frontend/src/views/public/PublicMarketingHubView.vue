<template>
  <div class="pmh-page" :class="hubRootModifierClass" :style="hubPageRootStyle">
    <!-- Superadmin: quick path to edit content (does not show to public visitors). -->
    <router-link
      v-if="isSuperAdmin"
      class="pmh-admin-pill"
      to="/admin/public-marketing-pages"
    >
      Edit hub
    </router-link>

    <div v-if="error" class="pmh-fatal">{{ error }}</div>

    <div v-else class="pmh-shell">
      <section
        v-if="skillbuildersAudienceGateVisible"
        class="pmh-splash-overlay sb-audience-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="skillbuildersJourneyCopy.gateAria"
      >
        <div class="sb-audience-card">
          <p v-if="logoUrl" class="sb-audience-logo-wrap">
            <img class="sb-audience-logo" :src="logoUrl" :alt="`${displayHeadline} logo`" />
          </p>
          <p class="sb-audience-eyebrow">Welcome</p>
          <h2 class="sb-audience-title">{{ skillbuildersJourneyCopy.subtitle }}</h2>
          <div
            class="sb-audience-actions"
            :class="{ 'sb-audience-actions--many': skillbuildersJourneyPaths.length > 2 }"
          >
            <button
              v-for="p in skillbuildersJourneyPaths"
              :key="p.id"
              type="button"
              class="sb-audience-btn"
              :class="
                p.buttonVariant === 'primary' ? 'sb-audience-btn--primary' : 'sb-audience-btn--secondary'
              "
              @click="chooseSkillbuildersAudiencePath(p.id)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="showNavigatorSplash" class="pmh-splash-overlay" role="dialog" aria-modal="true" aria-label="Choose your summer path">
        <div class="pmh-splash-card">
          <div class="pmh-splash-logos">
            <div v-if="logoUrl" class="pmh-splash-program-logo-wrap" title="Program logo">
              <img class="pmh-splash-program-logo" :src="logoUrl" :alt="`${displayHeadline} logo`" />
            </div>
            <div v-if="splashTenantLogos.length" class="pmh-splash-tenant-logos">
              <button
                v-for="p in splashTenantLogos"
                :key="`splash-tenant-${p.agencyId}`"
                type="button"
                class="pmh-splash-tenant-tile"
                :class="{ active: navigatorAgencyFilterId === p.agencyId }"
                :title="`${p.agencyName} — tap to show only this agency’s programs`"
                :aria-pressed="navigatorAgencyFilterId === p.agencyId ? 'true' : 'false'"
                :aria-label="`Filter to ${p.agencyName} only`"
                @click="toggleNavigatorAgency(p.agencyId, { openSchoolPath: true })"
              >
                <span class="pmh-splash-tenant-logo-wrap">
                  <img v-if="p.logoUrl" class="pmh-splash-tenant-logo" :src="p.logoUrl" :alt="`${p.agencyName} logo`" />
                  <span v-else class="pmh-splash-tenant-fallback">{{ agencyFooterInitials(p.agencyName) }}</span>
                </span>
                <span class="pmh-splash-tenant-name">{{ p.agencyName }}</span>
              </button>
            </div>
          </div>
          <p
            v-if="splashTenantLogos.length > 1"
            class="pmh-splash-agency-hint"
          >
            Select an agency logo to see only that agency’s open sessions and registration sites. The list below
            updates as soon as you tap one.
          </p>
          <p class="pmh-pathfinder-eyebrow">Start here</p>
          <h1 class="pmh-splash-title">D11 Summer 2026</h1>
          <p class="pmh-pathfinder-sub">Choose how you want to find the best option for your family.</p>

          <div class="pmh-pathfinder-actions">
            <button
              type="button"
              class="pmh-path-btn"
              :class="{ active: journeyPrimary === 'learn' }"
              @click="goLearnMore"
            >
              I’d like to learn more
            </button>
            <button
              type="button"
              class="pmh-path-btn"
              :class="{ active: journeyPrimary === 'school' }"
              @click="choosePrimary('school')"
            >
              I know my location / school
            </button>
            <button
              type="button"
              class="pmh-path-btn"
              :class="{ active: journeyPrimary === 'program' }"
              @click="choosePrimary('program')"
            >
              I know the D11 Summer program
            </button>
          </div>

          <div v-if="journeyPrimary === 'school'" class="pmh-pathfinder-detail">
            <p class="pmh-pathfinder-detail-title">Choose your location or school</p>
            <p class="pmh-pathfinder-detail-hint">
              Sites include schools and other program locations. Names are shown as published (not street addresses).
            </p>
            <div class="pmh-chip-row pmh-chip-row--wrap">
              <button
                v-for="loc in allNavigatorLocations"
                :key="`loc-splash-${normalizeNavigatorLocKey(loc)}`"
                type="button"
                class="pmh-chip-btn"
                :class="{ active: isNavigatorLocationActive(loc) }"
                @click="selectNavigatorLocation(loc)"
              >
                {{ loc }}
              </button>
            </div>
            <p v-if="!allNavigatorLocations.length" class="pmh-navigator-empty">
              No registration sites are listed here yet. Try another agency filter above or browse the full list below.
            </p>
            <template v-if="navigatorLocationSelected">
              <p class="pmh-pathfinder-detail-title">Choose your session</p>
              <p class="pmh-pathfinder-detail-hint">Session dates come from each program’s registration listing for this site.</p>
              <div class="pmh-chip-row pmh-chip-row--wrap">
                <button
                  v-for="(s, si) in summerSessionsForSelectedLocation"
                  :key="`sess-splash-${s.groupKey}-${si}`"
                  type="button"
                  class="pmh-chip-btn pmh-chip-btn--session"
                  :class="{ active: isNavigatorSessionActive(s) }"
                  @click="selectNavigatorSessionForLocationFlow(s)"
                >
                  <span class="pmh-chip-session-title">{{ s.displayTitle }}</span>
                  <span v-if="s.displaySubtitle" class="pmh-chip-session-sub">{{ s.displaySubtitle }}</span>
                </button>
              </div>
              <p v-if="!summerSessionsForSelectedLocation.length" class="pmh-navigator-empty">
                No sessions are open for this site right now. Pick another location or browse below.
              </p>
              <template v-if="navigatorSessionSelected && registrationsForNavigatorLocationSession.length > 1">
                <p class="pmh-pathfinder-detail-title">Open registration</p>
                <p class="pmh-pathfinder-detail-hint">More than one program uses this session label — pick the one that matches your family.</p>
                <div class="pmh-chip-row pmh-chip-row--wrap">
                  <button
                    v-for="opt in registrationsForNavigatorLocationSession"
                    :key="`reg-splash-${opt.eventId}-${opt.registrationPublicKey}`"
                    type="button"
                    class="pmh-chip-btn"
                    @click="goLocationRegistration(opt)"
                  >
                    Register{{ opt.programTitle ? ` — ${opt.programTitle}` : '' }}
                  </button>
                </div>
              </template>
              <p
                v-if="navigatorSessionSelected && !registrationsForNavigatorLocationSession.length"
                class="pmh-navigator-empty"
              >
                No registration link matched this site and session. Try another session or browse the full list below.
              </p>
            </template>
          </div>

          <div v-if="journeyPrimary === 'program'" class="pmh-pathfinder-detail">
            <p class="pmh-pathfinder-detail-title">What matters most right now?</p>
            <div class="pmh-pathfinder-actions pmh-pathfinder-actions--nested">
              <button
                type="button"
                class="pmh-path-btn"
                :class="{ active: journeyProgramMode === 'session' }"
                @click="goProgramMode('session')"
              >
                Dates first (by session)
              </button>
              <button
                type="button"
                class="pmh-path-btn"
                :class="{ active: journeyProgramMode === 'location' }"
                @click="goProgramMode('location')"
              >
                Closest to home (by location)
              </button>
            </div>
          </div>
        </div>
      </section>

      <div class="pmh-ambient" aria-hidden="true">
        <span class="pmh-blob pmh-blob--a" />
        <span class="pmh-blob pmh-blob--b" />
        <span class="pmh-blob pmh-blob--c" />
      </div>

      <header class="pmh-header">
        <div class="pmh-brand-row">
          <img
            v-if="logoUrl"
            class="pmh-logo"
            :src="logoUrl"
            :alt="`${displayHeadline} logo`"
            loading="eager"
          />
          <h1 class="pmh-headline">{{ displayHeadline }}</h1>
        </div>
        <p v-if="partnerLine" class="pmh-partner">
          <span class="pmh-partner-dot" />
          {{ partnerLine }}
        </p>
        <!-- Video + process: one cinema band (silent video + scrolling signup steps). Skips stacked hero image + separate process block. -->
        <section
          v-if="heroProcessCinemaEnabled"
          class="pmh-hero-cinema"
          :aria-label="processSectionResolved.title"
          :style="{ ...hubPageRootStyle, '--pmh-cinema-scroll-sec': `${heroCinemaScrollDurationSec}s` }"
        >
          <div class="pmh-hero-cinema-bg" aria-hidden="true">
            <iframe
              v-if="heroVideoYoutubeCinemaEmbed"
              class="pmh-hero-cinema-iframe"
              :src="heroVideoYoutubeCinemaEmbed"
              title="Decorative program video (muted)"
              tabindex="-1"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              loading="lazy"
            />
            <video
              v-else-if="heroVideoUrl"
              class="pmh-hero-cinema-video"
              :src="heroVideoUrl"
              muted
              playsinline
              loop
              autoplay
              disablepictureinpicture
              preload="metadata"
            />
            <div v-else class="pmh-hero-cinema-gradient-fallback" />
          </div>
          <div class="pmh-hero-cinema-scrim" aria-hidden="true" />
          <div class="pmh-hero-cinema-overlay">
            <div class="pmh-hero-cinema-marquee">
              <div class="pmh-hero-cinema-marquee-track">
                <div class="pmh-hero-cinema-block">
                  <h2 class="pmh-hero-cinema-title">{{ processSectionResolved.title }}</h2>
                  <div class="pmh-hero-cinema-rule" aria-hidden="true" />
                  <ol class="pmh-hero-cinema-steps">
                    <li v-for="(step, si) in processSectionResolved.steps" :key="`cs-a-${si}`" class="pmh-hero-cinema-step">
                      <span class="pmh-hero-cinema-n">Step {{ si + 1 }}</span>
                      <span class="pmh-hero-cinema-t">{{ step }}</span>
                    </li>
                  </ol>
                </div>
                <div class="pmh-hero-cinema-block" aria-hidden="true">
                  <h2 class="pmh-hero-cinema-title">{{ processSectionResolved.title }}</h2>
                  <div class="pmh-hero-cinema-rule" aria-hidden="true" />
                  <ol class="pmh-hero-cinema-steps">
                    <li v-for="(step, si) in processSectionResolved.steps" :key="`cs-b-${si}`" class="pmh-hero-cinema-step">
                      <span class="pmh-hero-cinema-n">Step {{ si + 1 }}</span>
                      <span class="pmh-hero-cinema-t">{{ step }}</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div v-else-if="heroImageUrl" class="pmh-hero-media">
          <img :src="heroImageUrl" :alt="displayHeadline" loading="lazy" />
        </div>
        <div v-if="heroVideoUrl && !heroProcessCinemaEnabled" class="pmh-hero-media pmh-hero-media--video">
          <iframe
            v-if="heroVideoYoutubeEmbed"
            class="pmh-hero-iframe"
            :src="heroVideoYoutubeEmbed"
            title="Program video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy"
          />
          <video
            v-else
            class="pmh-hero-video"
            :src="heroVideoUrl"
            muted
            playsinline
            loop
            autoplay
            controls
            preload="metadata"
          />
        </div>
        <div v-if="parentIntroResolved" class="pmh-intro-card">
          <div class="pmh-intro-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <p class="pmh-intro-text">{{ parentIntroResolved }}</p>
        </div>
      </header>

      <section v-if="eventNavigatorEnabled && !showNavigatorSplash" class="pmh-pathfinder">
        <div class="pmh-pathfinder-card">
          <p class="pmh-pathfinder-eyebrow">Find your best fit</p>
          <h2 class="pmh-pathfinder-title">How would you like to explore summer options?</h2>
          <p class="pmh-pathfinder-sub">Choose a path. You can switch anytime.</p>
          <div class="pmh-pathfinder-actions">
            <button
              type="button"
              class="pmh-path-btn"
              :class="{ active: journeyPrimary === 'learn' }"
              @click="goLearnMore"
            >
              I’d like to learn more
            </button>
            <button
              type="button"
              class="pmh-path-btn"
              :class="{ active: journeyPrimary === 'school' }"
              @click="choosePrimary('school')"
            >
              I know my location / school
            </button>
            <button
              type="button"
              class="pmh-path-btn"
              :class="{ active: journeyPrimary === 'program' }"
              @click="choosePrimary('program')"
            >
              I know the D11 Summer program
            </button>
          </div>

          <div v-if="journeyPrimary === 'school'" class="pmh-pathfinder-detail">
            <div v-if="splashTenantLogos.length > 1" class="pmh-navigator-agency-block">
              <p class="pmh-pathfinder-detail-title">Choose your agency</p>
              <p class="pmh-pathfinder-detail-hint">
                Select an agency to see only its open sessions and registration sites. The location and session lists
                below update automatically.
              </p>
              <div class="pmh-agency-logo-row">
                <button
                  v-for="p in splashTenantLogos"
                  :key="`school-agency-${p.agencyId}`"
                  type="button"
                  class="pmh-agency-filter-tile"
                  :class="{ active: navigatorAgencyFilterId === p.agencyId }"
                  :aria-pressed="navigatorAgencyFilterId === p.agencyId ? 'true' : 'false'"
                  :aria-label="`Show only ${p.agencyName}`"
                  @click="toggleNavigatorAgency(p.agencyId, { openSchoolPath: true })"
                >
                  <span class="pmh-agency-filter-tile-logo">
                    <img v-if="p.logoUrl" :src="p.logoUrl" :alt="`${p.agencyName} logo`" />
                    <span v-else class="pmh-agency-filter-tile-fallback">{{ agencyFooterInitials(p.agencyName) }}</span>
                  </span>
                  <span class="pmh-agency-filter-tile-name">{{ p.agencyName }}</span>
                </button>
              </div>
            </div>
            <p class="pmh-pathfinder-detail-title">Choose your location or school</p>
            <p class="pmh-pathfinder-detail-hint">
              Sites include schools and other program locations. Names are shown as published (not street addresses).
            </p>
            <div class="pmh-chip-row pmh-chip-row--wrap">
              <button
                v-for="loc in allNavigatorLocations"
                :key="`loc-card-${normalizeNavigatorLocKey(loc)}`"
                type="button"
                class="pmh-chip-btn"
                :class="{ active: isNavigatorLocationActive(loc) }"
                @click="selectNavigatorLocation(loc)"
              >
                {{ loc }}
              </button>
            </div>
            <p v-if="!allNavigatorLocations.length" class="pmh-navigator-empty">
              No registration sites are listed here yet. Try another agency filter above or browse the full list below.
            </p>
            <template v-if="navigatorLocationSelected">
              <p class="pmh-pathfinder-detail-title">Choose your session</p>
              <p class="pmh-pathfinder-detail-hint">Session dates come from each program’s registration listing for this site.</p>
              <div class="pmh-chip-row pmh-chip-row--wrap">
                <button
                  v-for="(s, si) in summerSessionsForSelectedLocation"
                  :key="`sess-card-${s.groupKey}-${si}`"
                  type="button"
                  class="pmh-chip-btn pmh-chip-btn--session"
                  :class="{ active: isNavigatorSessionActive(s) }"
                  @click="selectNavigatorSessionForLocationFlow(s)"
                >
                  <span class="pmh-chip-session-title">{{ s.displayTitle }}</span>
                  <span v-if="s.displaySubtitle" class="pmh-chip-session-sub">{{ s.displaySubtitle }}</span>
                </button>
              </div>
              <p v-if="!summerSessionsForSelectedLocation.length" class="pmh-navigator-empty">
                No sessions are open for this site right now. Pick another location or browse below.
              </p>
              <template v-if="navigatorSessionSelected && registrationsForNavigatorLocationSession.length > 1">
                <p class="pmh-pathfinder-detail-title">Open registration</p>
                <p class="pmh-pathfinder-detail-hint">More than one program uses this session label — pick the one that matches your family.</p>
                <div class="pmh-chip-row pmh-chip-row--wrap">
                  <button
                    v-for="opt in registrationsForNavigatorLocationSession"
                    :key="`reg-card-${opt.eventId}-${opt.registrationPublicKey}`"
                    type="button"
                    class="pmh-chip-btn"
                    @click="goLocationRegistration(opt)"
                  >
                    Register{{ opt.programTitle ? ` — ${opt.programTitle}` : '' }}
                  </button>
                </div>
              </template>
              <p
                v-if="navigatorSessionSelected && !registrationsForNavigatorLocationSession.length"
                class="pmh-navigator-empty"
              >
                No registration link matched this site and session. Try another session or browse the full list below.
              </p>
            </template>
          </div>

          <div v-if="journeyPrimary === 'program'" class="pmh-pathfinder-detail">
            <p class="pmh-pathfinder-detail-title">What matters most right now?</p>
            <div class="pmh-pathfinder-actions pmh-pathfinder-actions--nested">
              <button
                type="button"
                class="pmh-path-btn"
                :class="{ active: journeyProgramMode === 'session' }"
                @click="goProgramMode('session')"
              >
                Dates first (by session)
              </button>
              <button
                type="button"
                class="pmh-path-btn"
                :class="{ active: journeyProgramMode === 'location' }"
                @click="goProgramMode('location')"
              >
                Closest to home (by location)
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-if="whatWeOfferResolved" class="pmh-offer" aria-labelledby="pmh-offer-heading">
        <div class="pmh-offer-card">
          <p v-if="isSuperAdmin" class="pmh-placeholder-editor-hint" role="note">
            You’re signed in as super admin — image areas below are labeled
            <strong>Placeholder 1–4</strong> (this hub only). Match them to the editor under “Image placeholders.”
          </p>
          <h2 id="pmh-offer-heading" class="pmh-offer-title">{{ whatWeOfferResolved.title }}</h2>
          <p class="pmh-offer-summary">{{ whatWeOfferResolved.summary }}</p>
          <div class="pmh-offer-toggle-wrap">
            <button
              id="pmh-offer-toggle"
              type="button"
              class="pmh-offer-toggle"
              :aria-expanded="offerExpanded"
              aria-controls="pmh-offer-details"
              @click="offerExpanded = !offerExpanded"
            >
              {{ offerExpanded ? whatWeOfferResolved.collapseLabel : whatWeOfferResolved.expandLabel }}
            </button>
          </div>
          <Transition name="pmh-offer-reveal">
            <div
              v-show="offerExpanded"
              id="pmh-offer-details"
              class="pmh-offer-details"
              role="region"
              aria-labelledby="pmh-offer-heading"
            >
              <p v-if="whatWeOfferResolved.intro" class="pmh-offer-intro">{{ whatWeOfferResolved.intro }}</p>
              <div class="pmh-offer-grid">
                <article v-for="(it, oi) in whatWeOfferResolved.items" :key="`offer-${oi}`" class="pmh-offer-item">
                  <div class="pmh-offer-media">
                    <span v-if="isSuperAdmin" class="pmh-placeholder-badge" aria-hidden="true"
                      >Placeholder {{ oi + 1 }}</span
                    >
                    <img
                      v-if="it.imageUrl"
                      class="pmh-offer-img"
                      :src="it.imageUrl"
                      :alt="it.title"
                      loading="lazy"
                    />
                    <div v-else class="pmh-offer-img-ph" aria-hidden="true" />
                  </div>
                  <h3 class="pmh-offer-item-title">{{ it.title }}</h3>
                  <p class="pmh-offer-item-body">{{ it.body }}</p>
                </article>
              </div>

              <div v-if="ctaEmbedInOfferExpanded && ctaSectionResolved" class="pmh-offer-cta-wrap">
                <div class="pmh-cta-band pmh-cta-band--in-offer">
                  <p v-if="ctaSectionResolved.eyebrow" class="pmh-cta-eyebrow">{{ ctaSectionResolved.eyebrow }}</p>
                  <h2 class="pmh-cta-title">{{ ctaSectionResolved.title }}</h2>
                  <p v-if="ctaSectionResolved.subtitle" class="pmh-cta-subtitle">{{ ctaSectionResolved.subtitle }}</p>
                  <p class="pmh-cta-body">{{ ctaSectionResolved.body }}</p>
                  <p v-if="ctaSectionResolved.disclaimer" class="pmh-cta-disclaimer">{{ ctaSectionResolved.disclaimer }}</p>
                  <div class="pmh-cta-actions">
                    <div v-if="ctaSectionResolved.partnerBadgeUrl" class="pmh-cta-badge-img-wrap">
                      <img
                        class="pmh-cta-badge-img"
                        :src="ctaSectionResolved.partnerBadgeUrl"
                        alt="Partner or Medicaid program"
                        loading="lazy"
                      />
                    </div>
                    <div v-else-if="ctaSectionResolved.showPartnerPlaceholder" class="pmh-cta-partner-ph">
                      <span class="pmh-cta-partner-ph-line">Medicaid accepted</span>
                      <span class="pmh-cta-partner-ph-sub">Add ctaSection.partnerBadgeUrl in branding JSON to show your partner logo.</span>
                    </div>
                    <div class="pmh-cta-btn-wrap">
                      <component :is="ctaPrimaryTag" class="pmh-cta-primary" v-bind="ctaPrimaryBind">
                        {{ ctaSectionResolved.primaryLabel }}
                      </component>
                      <div v-if="ctaSectionResolved.showLimitedBadge" class="pmh-cta-seal" aria-hidden="true">
                        <span class="pmh-cta-seal-text">{{ ctaSectionResolved.limitedBadgeText }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="offerExpandedExternalLinks.length" class="pmh-offer-external-links">
                <h3 class="pmh-offer-external-title">More resources</h3>
                <ul class="pmh-offer-external-list">
                  <li v-for="(lnk, li) in offerExpandedExternalLinks" :key="`oel-${li}`">
                    <a class="pmh-offer-external-a" :href="lnk.href" target="_blank" rel="noopener noreferrer">{{
                      lnk.title
                    }}</a>
                  </li>
                </ul>
              </div>
            </div>
          </Transition>
        </div>
      </section>

      <section
        v-if="galleryStripUrls.length"
        class="pmh-gallery-section"
        aria-label="Photo gallery"
      >
        <div class="pmh-gallery pmh-gallery--slideshow">
          <div class="pmh-gallery-slides">
            <img
              v-for="(src, gi) in galleryStripUrls"
              :key="`g-${gi}-${src}`"
              class="pmh-gallery-slide"
              :class="{ 'pmh-gallery-slide--active': gi === gallerySlideIndex }"
              :src="src"
              :alt="`Photo ${gi + 1} of ${galleryStripUrls.length}`"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </section>

      <!-- Built-in narrative blocks (override or disable via branding JSON: ctaSection, processSection). -->
      <section v-if="ctaSectionResolved && ctaShowStandaloneBand" class="pmh-cta-band">
        <p v-if="ctaSectionResolved.eyebrow" class="pmh-cta-eyebrow">{{ ctaSectionResolved.eyebrow }}</p>
        <h2 class="pmh-cta-title">{{ ctaSectionResolved.title }}</h2>
        <p v-if="ctaSectionResolved.subtitle" class="pmh-cta-subtitle">{{ ctaSectionResolved.subtitle }}</p>
        <p class="pmh-cta-body">{{ ctaSectionResolved.body }}</p>
        <p v-if="ctaSectionResolved.disclaimer" class="pmh-cta-disclaimer">{{ ctaSectionResolved.disclaimer }}</p>
        <div class="pmh-cta-actions">
          <div v-if="ctaSectionResolved.partnerBadgeUrl" class="pmh-cta-badge-img-wrap">
            <img
              class="pmh-cta-badge-img"
              :src="ctaSectionResolved.partnerBadgeUrl"
              alt="Partner or Medicaid program"
              loading="lazy"
            />
          </div>
          <div v-else-if="ctaSectionResolved.showPartnerPlaceholder" class="pmh-cta-partner-ph">
            <span class="pmh-cta-partner-ph-line">Medicaid accepted</span>
            <span class="pmh-cta-partner-ph-sub">Add ctaSection.partnerBadgeUrl in branding JSON to show your partner logo.</span>
          </div>
          <div class="pmh-cta-btn-wrap">
            <component
              :is="ctaPrimaryTag"
              class="pmh-cta-primary"
              v-bind="ctaPrimaryBind"
            >
              {{ ctaSectionResolved.primaryLabel }}
            </component>
            <div v-if="ctaSectionResolved.showLimitedBadge" class="pmh-cta-seal" aria-hidden="true">
              <span class="pmh-cta-seal-text">{{ ctaSectionResolved.limitedBadgeText }}</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="processSectionResolved && !heroProcessCinemaEnabled" class="pmh-process">
        <div class="pmh-process-inner">
          <div class="pmh-process-head">
            <h2 class="pmh-process-title">{{ processSectionResolved.title }}</h2>
            <div class="pmh-process-rule" aria-hidden="true" />
          </div>
          <ol class="pmh-process-steps">
            <li v-for="(step, si) in processSectionResolved.steps" :key="`step-${si}`" class="pmh-process-step">
              <span class="pmh-process-n">Step {{ si + 1 }}</span>
              <span class="pmh-process-t">{{ step }}</span>
            </li>
          </ol>
        </div>
      </section>

      <div id="hub-programs" class="pmh-programs-anchor">
        <p
          v-if="skillbuildersJourneyActive && skillbuildersJourneyChoice && !skillbuildersAudienceGateVisible"
          class="sb-audience-change"
        >
          <button type="button" class="sb-audience-change-btn" @click="resetSkillbuildersAudience">
            {{ skillbuildersJourneyCopy.changeLink }}
          </button>
        </p>
        <div
          v-if="skillbuildersOfficeFilterMisconfigured && isSuperAdmin"
          class="sb-audience-warn"
          role="status"
        >
          The office / “not in program” path needs <code>skillbuildersJourney.officeSources</code> in this page’s branding JSON
          (each entry <code>{ "sourceType": "agency"|"organization", "sourceId": number }</code> matching a row under
          <strong>Sources</strong> in admin). Until that is set, no events are shown for that option.
        </div>
        <div
          v-else-if="skillbuildersOfficeFilterMisconfigured"
          class="sb-audience-notice"
          role="status"
        >
          We couldn’t load office Skill Builders listings on this page yet. Try the other option above, or check back
          later.
        </div>
        <div
          v-if="skillbuildersSessionPickerVisible"
          class="sb-skillbuilders-sessions"
          role="region"
          aria-label="Choose a program session"
        >
          <p class="sb-skillbuilders-sessions-title">Choose a session</p>
          <p class="sb-skillbuilders-sessions-hint">
            Pick a week, then every site for that session appears below. You can still enter your address to sort by
            shortest drive.
          </p>
          <div class="sb-skillbuilders-sessions-row">
            <button
              v-for="(s, si) in skillbuildersSessionRows"
              :key="`sb-sess-${s.groupKey}-${si}`"
              type="button"
              class="sb-skillbuilders-session-chip"
              :class="{ active: isSkillbuildersListingSessionActive(s) }"
              @click="selectSkillbuildersListingSession(s)"
            >
              <span class="sb-skillbuilders-session-chip-title">{{ s.displayTitle }}</span>
              <span v-if="s.displaySubtitle" class="sb-skillbuilders-session-chip-sub">{{ s.displaySubtitle }}</span>
            </button>
          </div>
        </div>
        <PublicEventsListing
          ref="eventsListingRef"
          v-if="!error"
          :page-title="displayHeadline"
          :page-subtitle="listingSubtitle"
          :events="eventsForPublicListing"
          :loading="loading"
          :error="''"
          :hub-slug="hubSlug"
          :show-hub-source-chips="true"
          :suppress-page-title="true"
          :nearest-cta-label="nearestCtaLabel"
          :nearest-modal-title="nearestModalTitle"
          :nearest-modal-hint="nearestModalHint"
          :preset-location-query="presetLocationQuery"
          :preset-session-label="presetSessionLabelForHub"
          :preset-session-date-range="presetSessionDateRangeForHub"
          :preset-hub-agency-id="eventNavigatorEnabled ? navigatorAgencyFilterId : undefined"
          :allowed-event-ids="allowedEventIdsForListing"
          :hide-nearest-cta="skillbuildersAwaitingSessionChoice"
          @hub-agency-filter-change="onListingHubAgencyFilterChange"
        />
      </div>

      <section v-if="metricsBlock" class="pmh-section pmh-metrics">
        <div class="pmh-section-inner">
          <h2 class="pmh-h2">At a glance</h2>
          <p v-if="metricsBlock.disclaimer" class="pmh-muted pmh-disclaimer">{{ metricsBlock.disclaimer }}</p>
          <dl class="pmh-metrics-grid">
            <div v-if="metricsBlock.metrics.providerCount != null" class="pmh-metric">
              <dt>Providers (approx.)</dt>
              <dd>{{ metricsBlock.metrics.providerCount }}</dd>
            </div>
            <div v-if="metricsBlock.metrics.activeClientCount != null" class="pmh-metric">
              <dt>Active clients (non-archived)</dt>
              <dd>{{ metricsBlock.metrics.activeClientCount }}</dd>
            </div>
            <div v-if="metricsBlock.metrics.mileageClaimsSubmittedLast365Days != null" class="pmh-metric">
              <dt>Mileage claims (last 365 days)</dt>
              <dd>{{ metricsBlock.metrics.mileageClaimsSubmittedLast365Days }}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>

    <footer v-if="!error" class="pmh-footer">
      <div class="pmh-footer-inner">
        <div class="pmh-footer-main">
          <nav class="pmh-footer-nav-col pmh-footer-nav" aria-label="Page links and staff login">
            <template v-for="(item, i) in primaryNav" :key="`fnav-${i}`">
              <a
                v-if="isExternalNavHref(item.href)"
                class="pmh-footer-nav-link"
                :href="String(item.href).trim()"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span class="pmh-footer-nav-link-inner">
                  <span class="pmh-footer-nav-emoji" aria-hidden="true">{{ primaryNavEmoji(item.label) }}</span>
                  <span>{{ item.label }}</span>
                </span>
              </a>
              <router-link v-else class="pmh-footer-nav-link" :to="String(item.href).trim()">
                <span class="pmh-footer-nav-link-inner">
                  <span class="pmh-footer-nav-emoji" aria-hidden="true">{{ primaryNavEmoji(item.label) }}</span>
                  <span>{{ item.label }}</span>
                </span>
              </router-link>
            </template>
            <router-link class="pmh-footer-nav-link" to="/login">
              <span class="pmh-footer-nav-link-inner">
                <span class="pmh-footer-nav-emoji" aria-hidden="true">🔐</span>
                <span>Staff login</span>
              </span>
            </router-link>
          </nav>

          <div v-if="footerPartners.length" class="pmh-footer-partners-block">
            <h2 class="pmh-footer-heading">Participating agencies</h2>
            <ul class="pmh-footer-partner-list">
              <li
                v-for="p in footerPartners"
                :key="`fp-${p.agencyId}`"
                class="pmh-footer-partner-card"
                :style="footerPartnerAccentStyle(p)"
              >
                <div class="pmh-footer-partner-logo-wrap">
                  <img
                    v-if="p.logoUrl"
                    class="pmh-footer-partner-logo"
                    :src="p.logoUrl"
                    :alt="`${p.agencyName} logo`"
                    loading="lazy"
                  />
                  <span v-else class="pmh-footer-partner-initials" aria-hidden="true">{{ agencyFooterInitials(p.agencyName) }}</span>
                </div>
                <div class="pmh-footer-partner-meta">
                  <span class="pmh-footer-partner-name">{{ p.agencyName }}</span>
                  <div class="pmh-footer-partner-links">
                    <a
                      v-if="p.websiteUrl"
                      class="pmh-footer-link"
                      :href="p.websiteUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      >Main website</a
                    >
                    <router-link v-if="p.publicAvailabilityEnabled" class="pmh-footer-link" :to="p.findProviderPath">
                      Provider availability
                    </router-link>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div class="pmh-footer-tail">
          <PoweredByFooter variant="embedded" :include-legal="false" class="pmh-footer-powered-slot" />
          <div class="pmh-footer-legal-centered">
            <PoweredByFooter
              variant="embedded"
              :include-powered-by="false"
              :legal-title="hubLegalTitle"
              :legal-links-override="hubLegalLinksOverride"
            />
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import api from '../../services/api';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import PoweredByFooter from '../../components/PoweredByFooter.vue';
import PublicEventsListing from '../../components/public/PublicEventsListing.vue';
import { hubGalleryPoolUrls, hubGalleryStripUrls } from '../../utils/publicMarketingHubGallery';

const authStore = useAuthStore();
const brandingStore = useBrandingStore();
const route = useRoute();
const hubSlug = computed(() => String(route.params.hubSlug || '').trim().toLowerCase());

/** Stable class for hub-only CSS, e.g. `.pmh-page--hub-skillbuilders { --hub-brand: … }` — other slugs get their own class but no rules by default. */
const hubRootModifierClass = computed(() => {
  const s = hubSlug.value.replace(/[^a-z0-9-]/g, '');
  return s ? `pmh-page--hub-${s}` : '';
});

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

const loading = ref(true);
const error = ref('');
const pageMeta = ref(null);
const events = ref([]);
const footerPartners = ref([]);
const metricsBlock = ref(null);
const offerExpanded = ref(false);
const eventsListingRef = ref(null);
const journeyPrimary = ref('');
const journeyProgramMode = ref('');
const selectedSchoolName = ref('');
/** Summer navigator: location/school first, then sessions (D11 path) */
const navigatorLocationName = ref('');
/** Summer navigator: filter hub events + school path by footer partner agency */
const navigatorAgencyFilterId = ref(null);
const navigatorSessionLabel = ref('');
const navigatorSessionDateRange = ref('');
const showNavigatorSplash = ref(false);
/** Path id from skillbuilders journey config, or null — only for /p/skillbuilders when journey is active */
const skillbuildersJourneyChoice = ref(null);
/** Skill Builders hub: session chips above listing → syncs to PublicEventsListing session filters */
const skillbuildersListingSessionLabel = ref('');
const skillbuildersListingSessionDateRange = ref('');

const gallerySlideIndex = ref(0);
let gallerySlideshowTimer = null;

function clearGallerySlideshowTimer() {
  if (gallerySlideshowTimer) {
    clearInterval(gallerySlideshowTimer);
    gallerySlideshowTimer = null;
  }
}

function startGallerySlideshow() {
  clearGallerySlideshowTimer();
  const urls = galleryStripUrls.value;
  if (urls.length <= 1) {
    gallerySlideIndex.value = 0;
    return;
  }
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduced) {
    gallerySlideIndex.value = 0;
    return;
  }
  gallerySlideshowTimer = setInterval(() => {
    const n = galleryStripUrls.value.length;
    if (n < 2) return;
    gallerySlideIndex.value = (gallerySlideIndex.value + 1) % n;
  }, 5000);
}

const heroTitle = computed(() => pageMeta.value?.heroTitle || '');
const heroImageUrl = computed(() => pageMeta.value?.heroImageUrl || '');
const pageTitle = computed(() => pageMeta.value?.title || 'Events');

/** Turn slug-like titles (d11summer2025) into readable headlines when admin left title = slug. */
function prettifySlugLike(s) {
  let x = String(s || '').replace(/[-_]+/g, ' ').trim();
  if (!x) return 'Summer programs';
  for (let i = 0; i < 12; i++) {
    const next = x
      .replace(/([a-z]+)([0-9]+)/gi, '$1 $2')
      .replace(/([0-9]+)([a-z]+)/gi, '$1 $2');
    if (next === x) break;
    x = next;
  }
  return x
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

const displayHeadline = computed(() => {
  const hero = String(heroTitle.value || '').trim();
  if (hero) return hero;
  const raw = String(pageTitle.value || '').trim();
  const slug = hubSlug.value;
  const slugNorm = slug.replace(/[^a-z0-9]/gi, '');
  const rawNorm = raw.replace(/[^a-z0-9]/gi, '');
  if (!raw || rawNorm === slugNorm) return prettifySlugLike(slug);
  return raw;
});

const listingSubtitle = computed(() => pageMeta.value?.heroSubtitle || '');
const eventNavigatorEnabled = computed(
  () => hubSlug.value === 'd11summer2026' || hubBranding.value.enableSummerNavigator === true
);

function startsAtToMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Hide school-path registration once the calendar date is on or after (session start + 2 days). */
function isPastSessionRegistrationCutoff(startsAt) {
  const ms = startsAtToMs(startsAt);
  if (ms == null) return false;
  const start = new Date(ms);
  const cutoff = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 2);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayStart.getTime() >= cutoff.getTime();
}

function normalizeNavigatorLoc(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Stable key for :key in v-for (avoids duplicate-normalized collisions). */
function normalizeNavigatorLocKey(s) {
  return normalizeNavigatorLoc(s).replace(/[^a-z0-9]+/g, '-');
}

function eventHasLocation(ev, locName) {
  const want = normalizeNavigatorLoc(locName);
  if (!want) return false;
  const slocs = Array.isArray(ev.sessionLocations) ? ev.sessionLocations : [];
  for (const x of slocs) {
    if (normalizeNavigatorLoc(x?.label) === want) return true;
  }
  if (normalizeNavigatorLoc(ev.title) === want) return true;
  return false;
}

function buildNavigatorSessionRowsFromEligible(eligible) {
  const byKey = new Map();
  for (const ev of eligible) {
    const k = sessionGroupKey(ev);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(ev);
  }
  const groups = [...byKey.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => (startsAtToMs(a.startsAt) || 0) - (startsAtToMs(b.startsAt) || 0));
    return { key, events: sorted, first: sorted[0] };
  });
  groups.sort((a, b) => (startsAtToMs(a.first?.startsAt) || 0) - (startsAtToMs(b.first?.startsAt) || 0));
  return groups.map((g, idx) => {
    const fe = g.first;
    const lab = String(fe.publicSessionLabel || '').trim();
    const dr = String(fe.publicSessionDateRange || '').trim();
    const displayTitle = lab || `Session ${idx + 1}`;
    let displaySubtitle = dr;
    if (!displaySubtitle && fe.startsAt) {
      try {
        const s = new Date(fe.startsAt);
        const e = fe.endsAt ? new Date(fe.endsAt) : null;
        if (!Number.isNaN(s.getTime())) {
          displaySubtitle =
            e && !Number.isNaN(e.getTime())
              ? `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
              : s.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }
      } catch {
        /* ignore */
      }
    }
    return {
      groupKey: g.key,
      publicSessionLabel: lab,
      publicSessionDateRange: dr,
      displayTitle,
      displaySubtitle: displaySubtitle || '',
      startsAt: fe.startsAt
    };
  });
}

function sessionGroupKey(ev) {
  const lab = String(ev.publicSessionLabel || '').trim();
  const dr = String(ev.publicSessionDateRange || '').trim();
  if (lab || dr) return `L:${lab}|DR:${dr}`;
  const ms = startsAtToMs(ev.startsAt);
  if (ms != null) {
    const d = new Date(ms);
    return `D:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  return `E:${ev.id}`;
}

const navigatorEventPool = computed(() => {
  const base = eventsForListing.value || [];
  const aid = navigatorAgencyFilterId.value;
  if (aid == null || !Number(aid)) return base;
  return base.filter((ev) =>
    (Array.isArray(ev.hubSourcePartners) ? ev.hubSourcePartners : []).some(
      (p) => Number(p.sourceAgencyId) === Number(aid)
    )
  );
});

/** Unique sites/locations with open registration (any session), for “location first” navigator. */
const allNavigatorLocations = computed(() => {
  if (!eventNavigatorEnabled.value) return [];
  const pool = navigatorEventPool.value || [];
  const eligible = pool.filter(
    (ev) => String(ev?.registrationPublicKey || '').trim() && !isPastSessionRegistrationCutoff(ev.startsAt)
  );
  const seen = new Set();
  const names = [];
  for (const ev of eligible) {
    const slocs = Array.isArray(ev.sessionLocations) ? ev.sessionLocations : [];
    let addedFromLocations = false;
    for (const x of slocs) {
      const lbl = String(x?.label || '').trim();
      if (!lbl) continue;
      const k = normalizeNavigatorLoc(lbl);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      names.push(lbl);
      addedFromLocations = true;
    }
    if (!addedFromLocations) {
      const title = String(ev.title || '').trim();
      if (title) {
        const k = normalizeNavigatorLoc(title);
        if (k && !seen.has(k)) {
          seen.add(k);
          names.push(title);
        }
      }
    }
  }
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return names;
});

const navigatorLocationSelected = computed(() => !!String(navigatorLocationName.value || '').trim());

const summerSessionsForSelectedLocation = computed(() => {
  if (!eventNavigatorEnabled.value) return [];
  const loc = String(navigatorLocationName.value || '').trim();
  if (!loc) return [];
  const pool = navigatorEventPool.value || [];
  const eligible = pool.filter(
    (ev) =>
      String(ev?.registrationPublicKey || '').trim() &&
      !isPastSessionRegistrationCutoff(ev.startsAt) &&
      eventHasLocation(ev, loc)
  );
  return buildNavigatorSessionRowsFromEligible(eligible);
});

const navigatorSessionSelected = computed(
  () =>
    !!(String(navigatorSessionLabel.value || '').trim() || String(navigatorSessionDateRange.value || '').trim())
);

function eventMatchesNavigatorSession(ev) {
  const l = String(navigatorSessionLabel.value || '').trim();
  const r = String(navigatorSessionDateRange.value || '').trim();
  const evL = String(ev.publicSessionLabel || '').trim();
  const evR = String(ev.publicSessionDateRange || '').trim();
  if (l && r) return evL === l && evR === r;
  if (r) return evR === r;
  if (l) return evL === l;
  return false;
}

function isNavigatorSessionActive(row) {
  const l = String(navigatorSessionLabel.value || '').trim();
  const r = String(navigatorSessionDateRange.value || '').trim();
  return l === String(row.publicSessionLabel || '').trim() && r === String(row.publicSessionDateRange || '').trim();
}

const registrationsForNavigatorLocationSession = computed(() => {
  if (!eventNavigatorEnabled.value || !navigatorSessionSelected.value) return [];
  const loc = String(navigatorLocationName.value || '').trim();
  if (!loc) return [];
  const pool = navigatorEventPool.value || [];
  const matched = pool.filter(
    (ev) =>
      eventHasLocation(ev, loc) &&
      eventMatchesNavigatorSession(ev) &&
      !isPastSessionRegistrationCutoff(ev.startsAt)
  );
  const out = [];
  const seen = new Set();
  for (const ev of matched) {
    const regKey = String(ev?.registrationPublicKey || '').trim();
    if (!regKey) continue;
    const dedupe = `${regKey}::${ev.id}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      name: loc,
      registrationPublicKey: regKey,
      eventId: ev.id,
      programTitle: String(ev.title || '').trim()
    });
  }
  out.sort((a, b) => (a.programTitle || '').localeCompare(b.programTitle || '', undefined, { sensitivity: 'base' }));
  return out;
});

function selectNavigatorSession(row) {
  navigatorSessionLabel.value = String(row?.publicSessionLabel || '').trim();
  navigatorSessionDateRange.value = String(row?.publicSessionDateRange || '').trim();
  selectedSchoolName.value = '';
}

function isNavigatorLocationActive(loc) {
  return normalizeNavigatorLoc(navigatorLocationName.value) === normalizeNavigatorLoc(loc);
}

function selectNavigatorLocation(name) {
  navigatorLocationName.value = String(name || '').trim();
  navigatorSessionLabel.value = '';
  navigatorSessionDateRange.value = '';
  selectedSchoolName.value = '';
}

async function selectNavigatorSessionForLocationFlow(row) {
  selectNavigatorSession(row);
  await nextTick();
  const opts = registrationsForNavigatorLocationSession.value;
  if (opts.length === 1) goLocationRegistration(opts[0]);
}

function toggleNavigatorAgency(agencyId, opts = {}) {
  const n = Number(agencyId);
  if (!Number.isFinite(n) || n <= 0) return;
  const prev = navigatorAgencyFilterId.value;
  const wasSame = prev === n;
  navigatorAgencyFilterId.value = wasSame ? null : n;
  navigatorLocationName.value = '';
  navigatorSessionLabel.value = '';
  navigatorSessionDateRange.value = '';
  selectedSchoolName.value = '';
  if (opts.openSchoolPath === true && navigatorAgencyFilterId.value != null) {
    choosePrimary('school');
  }
}

function onListingHubAgencyFilterChange(val) {
  navigatorAgencyFilterId.value = val == null || val === '' || Number(val) <= 0 ? null : Number(val);
  navigatorLocationName.value = '';
  navigatorSessionLabel.value = '';
  navigatorSessionDateRange.value = '';
  selectedSchoolName.value = '';
}

const presetLocationQuery = computed(() =>
  journeyPrimary.value === 'school'
    ? String(navigatorLocationName.value || selectedSchoolName.value || '').trim()
    : ''
);
const presetSessionLabelForHub = computed(() => {
  if (hubSlug.value === 'skillbuilders') return String(skillbuildersListingSessionLabel.value || '').trim();
  return String(navigatorSessionLabel.value || '').trim();
});
const presetSessionDateRangeForHub = computed(() => {
  if (hubSlug.value === 'skillbuilders') return String(skillbuildersListingSessionDateRange.value || '').trim();
  return String(navigatorSessionDateRange.value || '').trim();
});

const hubBranding = computed(() => pageMeta.value?.branding || {});

const SB_AUDIENCE_STORAGE_KEY_V2 = 'public_hub_skillbuilders_audience_v2';
const SB_AUDIENCE_STORAGE_KEY_V1 = 'public_hub_skillbuilders_audience_v1';

function readSkillbuildersAudience() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const v2 = sessionStorage.getItem(SB_AUDIENCE_STORAGE_KEY_V2);
    if (v2 && String(v2).trim()) return String(v2).trim();
    const v1 = sessionStorage.getItem(SB_AUDIENCE_STORAGE_KEY_V1);
    if (v1 === 'district' || v1 === 'office') return v1;
  } catch {
    /* ignore */
  }
  return null;
}

function writeSkillbuildersAudience(value) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(SB_AUDIENCE_STORAGE_KEY_V2, value);
    sessionStorage.removeItem(SB_AUDIENCE_STORAGE_KEY_V1);
  } catch {
    /* ignore */
  }
}

function clearSkillbuildersAudienceStorage() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(SB_AUDIENCE_STORAGE_KEY_V2);
    sessionStorage.removeItem(SB_AUDIENCE_STORAGE_KEY_V1);
  } catch {
    /* ignore */
  }
}

function partnerMatchesOfficeSourceFilter(partner, filter) {
  const st = String(filter?.sourceType || '').toLowerCase();
  const sid = Number(filter?.sourceId);
  if (!st || !Number.isFinite(sid) || sid <= 0) return false;
  const pa = Number(partner?.sourceAgencyId);
  const poRaw = partner?.sourceOrganizationId;
  const po = poRaw != null && poRaw !== '' ? Number(poRaw) : null;
  if (st === 'organization') {
    return Number.isFinite(po) && po === sid;
  }
  if (st === 'agency') {
    return Number.isFinite(pa) && pa === sid;
  }
  return false;
}

function eventMatchesAnyOfficeSource(ev, officeSources) {
  const partners = Array.isArray(ev?.hubSourcePartners) ? ev.hubSourcePartners : [];
  if (!partners.length || !officeSources.length) return false;
  for (const src of officeSources) {
    if (partners.some((p) => partnerMatchesOfficeSourceFilter(p, src))) return true;
  }
  return false;
}

/** Office journey: partner convention — put “Office” in the public event title when hub officeSources JSON is omitted. */
function eventOfficePathByEventTitle(ev) {
  return /\boffice\b/i.test(String(ev?.title || ''));
}

function normalizeSkillbuildersPathFilter(raw) {
  if (!raw || typeof raw !== 'object') return { kind: 'unknown' };
  const k = String(raw.kind || '').toLowerCase().replace(/-/g, '_');
  if (k === 'all' || k === 'all_sources') return { kind: 'all' };
  if (k === 'office_sources' || k === 'officesources') return { kind: 'officeSources' };
  if (k === 'program_title_and' || k === 'programtitleand') {
    const includes = Array.isArray(raw.includes) ? raw.includes.map((x) => String(x || '').trim()).filter(Boolean) : [];
    return { kind: 'programTitleAnd', includes };
  }
  if (k === 'district_or_office' || k === 'districtoroffice') {
    const includes = Array.isArray(raw.includes) ? raw.includes.map((x) => String(x || '').trim()).filter(Boolean) : [];
    return { kind: 'districtOrOffice', includes };
  }
  return { kind: 'unknown' };
}

function eventMatchesProgramTitleAnd(ev, includes) {
  if (!includes.length) return true;
  const name = String(ev?.programOrganizationName || '').toLowerCase();
  if (!name) return false;
  return includes.every((frag) => name.includes(String(frag || '').toLowerCase()));
}

function eventMatchesSkillbuildersPath(ev, path, officeSources) {
  const f = path?.filter;
  if (!f || f.kind === 'unknown') return false;
  if (f.kind === 'all') return true;
  if (f.kind === 'officeSources') {
    if (eventOfficePathByEventTitle(ev)) return true;
    return eventMatchesAnyOfficeSource(ev, officeSources);
  }
  if (f.kind === 'programTitleAnd') return eventMatchesProgramTitleAnd(ev, f.includes);
  if (f.kind === 'districtOrOffice') {
    if (eventMatchesProgramTitleAnd(ev, f.includes)) return true;
    if (eventOfficePathByEventTitle(ev)) return true;
    return eventMatchesAnyOfficeSource(ev, officeSources);
  }
  return false;
}

function resolveDistrictProgramTitleIncludes(c) {
  if (Array.isArray(c?.districtProgramTitleIncludes)) {
    const out = c.districtProgramTitleIncludes.map((x) => String(x || '').trim()).filter(Boolean);
    if (out.length) return out;
  }
  const single = String(c?.districtProgramTitleContains || '').trim();
  if (single) return [single];
  return ['D11 Summer ITSCO'];
}

const skillbuildersJourneyCfg = computed(() => {
  const b = hubBranding.value?.skillbuildersJourney;
  if (!b || typeof b !== 'object') return {};
  return b;
});

const skillbuildersJourneyActive = computed(() => {
  if (hubSlug.value !== 'skillbuilders') return false;
  if (skillbuildersJourneyCfg.value.enabled === false) return false;
  return true;
});

const skillbuildersOfficeSources = computed(() => {
  const raw = skillbuildersJourneyCfg.value.officeSources;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => ({
      sourceType: String(x?.sourceType || '').trim().toLowerCase(),
      sourceId: Number(x?.sourceId)
    }))
    .filter(
      (x) =>
        (x.sourceType === 'agency' || x.sourceType === 'organization') &&
        Number.isFinite(x.sourceId) &&
        x.sourceId > 0
    );
});

const skillbuildersJourneyPaths = computed(() => {
  const c = skillbuildersJourneyCfg.value;
  const rawPaths = Array.isArray(c.paths) ? c.paths : null;
  if (rawPaths && rawPaths.length) {
    const built = rawPaths
      .map((p, idx) => {
        const id = String(p?.id || '').trim() || `path_${idx}`;
        const label = String(p?.label || '').trim();
        const variantRaw = String(p?.buttonVariant || '').trim().toLowerCase();
        const variant =
          variantRaw === 'primary' || variantRaw === 'secondary'
            ? variantRaw
            : idx === 0
              ? 'primary'
              : 'secondary';
        const filter = normalizeSkillbuildersPathFilter(p?.filter);
        return { id, label, buttonVariant: variant, filter };
      })
      .filter((p) => p.label && p.filter.kind !== 'unknown');
    if (built.length) return built;
  }
  const districtIncludes = resolveDistrictProgramTitleIncludes(c);
  return [
    {
      id: 'district',
      label: String(c.districtTitle || 'My Dependent attends a D11 School').trim(),
      buttonVariant: 'primary',
      /** D11 students are eligible for D11 programs AND office Skill Builders, so the district path is inclusive. */
      filter: { kind: 'districtOrOffice', includes: districtIncludes }
    },
    {
      id: 'office',
      label: String(c.nonDistrictTitle || 'My Dependent is in another district').trim(),
      buttonVariant: 'secondary',
      /** Other-district families only see office/standalone events — exclusive of D11-specific programs. */
      filter: { kind: 'officeSources' }
    }
  ];
});

const skillbuildersValidPathIds = computed(() => new Set(skillbuildersJourneyPaths.value.map((p) => p.id)));

const skillbuildersJourneyCopy = computed(() => {
  const c = skillbuildersJourneyCfg.value;
  return {
    subtitle: String(c.subtitle || 'Choose an option so we can show the right programs.').trim(),
    gateAria: String(c.gateAriaLabel || 'Choose which Skill Builders programs apply').trim(),
    changeLink: String(c.changeSelectionLabel || 'Change my selection').trim()
  };
});

const skillbuildersAudienceGateVisible = computed(
  () => skillbuildersJourneyActive.value && !loading.value && !error.value && skillbuildersJourneyChoice.value == null
);

const skillbuildersOfficeFilterMisconfigured = computed(() => {
  if (!skillbuildersJourneyActive.value || loading.value || !skillbuildersJourneyChoice.value) return false;
  const path = skillbuildersJourneyPaths.value.find((p) => p.id === skillbuildersJourneyChoice.value);
  if (!path || path.filter.kind !== 'officeSources') return false;
  if (skillbuildersOfficeSources.value.length > 0) return false;
  const all = events.value || [];
  if (all.some((ev) => eventOfficePathByEventTitle(ev))) return false;
  return true;
});

const eventsForListing = computed(() => {
  const all = events.value || [];
  if (!skillbuildersJourneyActive.value) return all;
  if (skillbuildersJourneyChoice.value == null) return [];
  const path = skillbuildersJourneyPaths.value.find((p) => p.id === skillbuildersJourneyChoice.value);
  if (!path) return [];
  const officeSrc = skillbuildersOfficeSources.value;
  return all.filter((ev) => eventMatchesSkillbuildersPath(ev, path, officeSrc));
});

const allowedEventIdsForListing = computed(() => {
  const ids = (eventsForListing.value || [])
    .map((ev) => Number(ev?.id))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length ? ids : [];
});

const skillbuildersSessionRows = computed(() => {
  if (hubSlug.value !== 'skillbuilders') return [];
  const pool = eventsForListing.value || [];
  if (!pool.length) return [];
  return buildNavigatorSessionRowsFromEligible(pool);
});

const skillbuildersAwaitingSessionChoice = computed(() => {
  if (hubSlug.value !== 'skillbuilders') return false;
  if (!skillbuildersJourneyChoice.value) return false;
  if (skillbuildersAudienceGateVisible.value) return false;
  const rows = skillbuildersSessionRows.value;
  if (rows.length <= 1) return false;
  const has =
    String(skillbuildersListingSessionLabel.value || '').trim() ||
    String(skillbuildersListingSessionDateRange.value || '').trim();
  return !has;
});

const eventsForPublicListing = computed(() => {
  const base = eventsForListing.value || [];
  if (!skillbuildersAwaitingSessionChoice.value) return base;
  return [];
});

const skillbuildersSessionPickerVisible = computed(
  () =>
    hubSlug.value === 'skillbuilders' &&
    !!skillbuildersJourneyChoice.value &&
    !skillbuildersAudienceGateVisible.value &&
    skillbuildersSessionRows.value.length > 1
);

function isSkillbuildersListingSessionActive(row) {
  return (
    String(skillbuildersListingSessionLabel.value || '').trim() === String(row?.publicSessionLabel || '').trim() &&
    String(skillbuildersListingSessionDateRange.value || '').trim() === String(row?.publicSessionDateRange || '').trim()
  );
}

function selectSkillbuildersListingSession(row) {
  skillbuildersListingSessionLabel.value = String(row?.publicSessionLabel || '').trim();
  skillbuildersListingSessionDateRange.value = String(row?.publicSessionDateRange || '').trim();
}

const hubLegalTitle = computed(() => String(hubBranding.value.legalFooterTitle || '').trim());
const hubLegalLinksOverride = computed(() => {
  const raw = hubBranding.value.legalFooterLinks;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ label: String(r?.label || '').trim(), href: String(r?.href || r?.url || '').trim() }))
    .filter((r) => r.label && r.href)
    .slice(0, 12);
});

const partnerLine = computed(() => String(hubBranding.value.partnerLine || '').trim());

const DEFAULT_PARENT_INTRO =
  'Summer programs are offered at partner sites across the region. When sessions are listed below, use your address to find the location closest to your home.';

const parentIntroResolved = computed(() => {
  const custom = String(hubBranding.value.parentIntro || '').trim();
  return custom || DEFAULT_PARENT_INTRO;
});

/** Optional overrides from branding JSON (nearestCtaLabel, nearestModalTitle, nearestModalHint). */
const nearestCtaLabel = computed(() => String(hubBranding.value.nearestCtaLabel || '').trim());
const nearestModalTitle = computed(() => String(hubBranding.value.nearestModalTitle || '').trim());
const nearestModalHint = computed(() => String(hubBranding.value.nearestModalHint || '').trim());

const primaryNav = computed(() => {
  const raw = hubBranding.value.primaryNav;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => ({
      label: String(x?.label || '').trim(),
      href: String(x?.href || '').trim()
    }))
    .filter((x) => x.label && x.href);
});

function agencyFooterInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Decorative emoji for primary nav buttons (matches common hub labels; fallback for custom titles). */
function primaryNavEmoji(label) {
  const s = String(label || '')
    .toLowerCase()
    .replace(/f\.a\.q\.?/g, 'faq');
  if (/\bfaq\b|questions?\b/.test(s)) return '❓';
  if (/\bcrisis\b|emergency|hotline|988|suicide|lifeline/.test(s)) return '🆘';
  if (/\bresources?\b|library|guides?|learn|reading/.test(s)) return '📚';
  if (/\bcontact\b|call\b|phone|reach\s*us/.test(s)) return '📞';
  if (/\bevents?\b|calendar|schedule\b/.test(s)) return '📅';
  if (/\babout\b|our\s+story|who\s+we/.test(s)) return 'ℹ️';
  if (/\bhome\b|\bhub\b/.test(s)) return '🏠';
  return '🔗';
}

const galleryStripUrls = computed(() => hubGalleryStripUrls(hubBranding.value.gallery));

watch(
  galleryStripUrls,
  () => {
    gallerySlideIndex.value = 0;
    startGallerySlideshow();
  },
  { immediate: true }
);

watch(
  () => skillbuildersJourneyChoice.value,
  () => {
    if (hubSlug.value !== 'skillbuilders') return;
    skillbuildersListingSessionLabel.value = '';
    skillbuildersListingSessionDateRange.value = '';
  }
);

watch(
  () => [
    hubSlug.value,
    skillbuildersJourneyChoice.value,
    skillbuildersSessionRows.value,
    skillbuildersAudienceGateVisible.value
  ],
  () => {
    if (hubSlug.value !== 'skillbuilders') return;
    if (skillbuildersAudienceGateVisible.value) return;
    if (!skillbuildersJourneyChoice.value) return;
    const rows = skillbuildersSessionRows.value;
    if (rows.length !== 1) return;
    if (
      String(skillbuildersListingSessionLabel.value || '').trim() ||
      String(skillbuildersListingSessionDateRange.value || '').trim()
    ) {
      return;
    }
    const r = rows[0];
    skillbuildersListingSessionLabel.value = String(r.publicSessionLabel || '').trim();
    skillbuildersListingSessionDateRange.value = String(r.publicSessionDateRange || '').trim();
  },
  { immediate: true }
);

onUnmounted(() => {
  clearGallerySlideshowTimer();
});

const logoUrl = computed(() => String(hubBranding.value.logoUrl || '').trim());
const splashTenantLogos = computed(() => {
  const out = [];
  const seen = new Set();
  for (const p of footerPartners.value || []) {
    const id = Number(p?.agencyId || 0);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      agencyId: id,
      agencyName: String(p?.agencyName || '').trim() || `Agency ${id}`,
      logoUrl: String(p?.logoUrl || '').trim()
    });
  }
  return out;
});

const heroVideoUrl = computed(() => String(hubBranding.value.heroVideoUrl || '').trim());

function youtubeEmbedFromUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    if (s.includes('youtube.com/embed/')) {
      const href = /^https?:/i.test(s) ? s : s.startsWith('//') ? `https:${s}` : `https://${s}`;
      const u = new URL(href);
      if (!u.searchParams.has('mute')) u.searchParams.set('mute', '1');
      return u.toString();
    }
  } catch {
    /* fall through */
  }
  let id = '';
  const watchMatch = s.match(/[?&]v=([^&\s#]+)/);
  if (watchMatch) id = watchMatch[1];
  const shortMatch = s.match(/youtu\.be\/([^?\s#]+)/);
  if (shortMatch) id = shortMatch[1];
  if (!id) return '';
  return `https://www.youtube.com/embed/${id}?rel=0&mute=1`;
}

const heroVideoYoutubeEmbed = computed(() => youtubeEmbedFromUrl(heroVideoUrl.value));

/** Background-style embed: autoplay, muted, no controls (cinema hero only). */
function youtubeCinemaEmbedFromUrl(raw) {
  const base = youtubeEmbedFromUrl(raw);
  if (!base) return '';
  try {
    const u = new URL(base);
    u.searchParams.set('autoplay', '1');
    u.searchParams.set('controls', '0');
    u.searchParams.set('mute', '1');
    u.searchParams.set('playsinline', '1');
    u.searchParams.set('modestbranding', '1');
    u.searchParams.set('loop', '1');
    const after = u.pathname.split('/embed/')[1];
    const id = after ? after.split('/')[0].split('?')[0] : '';
    if (id) u.searchParams.set('playlist', id);
    return u.toString();
  } catch {
    return base;
  }
}

const heroVideoYoutubeCinemaEmbed = computed(() => youtubeCinemaEmbedFromUrl(heroVideoUrl.value));

function normalizeHubHex(v) {
  const s = String(v || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(s)) return `#${s.slice(1).toLowerCase()}`;
  if (/^#[0-9A-Fa-f]{3}$/i.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return '';
}

function hubHexToRgb(hex) {
  const h = normalizeHubHex(hex);
  if (!h) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16)
  };
}

function hubDarkenHex(hex, factor = 0.78) {
  const rgb = hubHexToRgb(hex);
  if (!rgb) return '';
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n * factor)));
  return `#${clamp(rgb.r).toString(16).padStart(2, '0')}${clamp(rgb.g).toString(16).padStart(2, '0')}${clamp(rgb.b).toString(16).padStart(2, '0')}`;
}

function hubHexToRgba(hex, alpha) {
  const rgb = hubHexToRgb(hex);
  if (!rgb) return `rgba(15,23,42,${alpha})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

/** /p/skillbuilders only: map platform (main tenant) branding colors onto hub CSS variables */
const skillbuildersPlatformThemeStyle = computed(() => {
  if (hubSlug.value !== 'skillbuilders') return {};
  const pb = brandingStore.platformBranding || {};
  const hubPrimary = String(hubBranding.value.programThemePrimary || '').trim();
  const platformPrimary = String(pb.primary_color || '').trim();
  const primary = hubPrimary || platformPrimary;
  const secondary = String(pb.secondary_color || '').trim();
  if (!primary) return {};
  const linkDark = secondary || primary;
  const out = {
    '--hub-brand': primary,
    '--hub-link': primary,
    '--hub-link-dark': linkDark,
    '--pmh-program-primary': primary
  };
  if (secondary) {
    out['--hub-eyebrow'] = secondary;
  }
  return out;
});

const skillbuildersPartnerBrandPrimaries = computed(() => {
  const out = [];
  const seen = new Set();
  for (const p of footerPartners.value || []) {
    const h = normalizeHubHex(p?.brandPrimaryHex);
    if (h && !seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  }
  return out;
});

/** Participating-agency palette for /p/skillbuilders (from booking-hints footer partners). */
const skillbuildersAgencyHubTheme = computed(() => {
  if (hubSlug.value !== 'skillbuilders') return {};
  const primaries = skillbuildersPartnerBrandPrimaries.value;
  if (!primaries.length) return {};
  const primary = primaries[0];
  const firstPartner = footerPartners.value.find((x) => normalizeHubHex(x?.brandPrimaryHex) === primary);
  const secondaryHex = normalizeHubHex(firstPartner?.brandSecondaryHex);
  const secondary = secondaryHex || primaries[1] || hubDarkenHex(primary, 0.72);
  const gradientStops =
    primaries.length > 1 ? [...primaries, primaries[0]].join(', ') : `${primary}, ${hubDarkenHex(primary, 0.52)}`;
  return {
    '--hub-brand': primary,
    '--hub-link': primary,
    '--hub-link-dark': secondary,
    '--pmh-program-primary': primary,
    '--hub-shadow-brand': `0 14px 36px ${hubHexToRgba(primary, 0.25)}`,
    '--pmh-hero-cinema-shimmer': `linear-gradient(125deg, ${gradientStops})`
  };
});

const hubPageRootStyle = computed(() => {
  const explicit = String(hubBranding.value.programThemePrimary || '').trim();
  if (hubSlug.value === 'skillbuilders') {
    const platform = skillbuildersPlatformThemeStyle.value;
    const agency = skillbuildersAgencyHubTheme.value;
    const merged = { ...platform, ...agency };
    if (explicit) {
      const pb = brandingStore.platformBranding || {};
      const platformSecondary = String(pb.secondary_color || '').trim();
      merged['--hub-brand'] = explicit;
      merged['--hub-link'] = explicit;
      merged['--hub-link-dark'] = platformSecondary || hubDarkenHex(explicit, 0.75);
      merged['--pmh-program-primary'] = explicit;
      merged['--hub-shadow-brand'] = `0 14px 36px ${hubHexToRgba(explicit, 0.25)}`;
      merged['--pmh-hero-cinema-shimmer'] = `linear-gradient(125deg, ${explicit}, ${hubDarkenHex(explicit, 0.5)})`;
    } else if (!merged['--pmh-hero-cinema-shimmer'] && merged['--hub-brand']) {
      const p = merged['--hub-brand'];
      merged['--pmh-hero-cinema-shimmer'] = `linear-gradient(125deg, ${p}, ${hubDarkenHex(p, 0.52)})`;
    }
    return merged;
  }
  const hubPrimary = String(hubBranding.value.programThemePrimary || '').trim();
  const primary = hubPrimary || '#a32623';
  return { ...skillbuildersPlatformThemeStyle.value, '--pmh-program-primary': primary };
});

function footerPartnerAccentStyle(p) {
  const accent = normalizeHubHex(p?.brandPrimaryHex);
  if (!accent) return {};
  return { '--fp-accent': accent };
}

const DEFAULT_CTA_SECTION = {
  eyebrow: 'Interested in learning more?',
  title: 'Choose your preferred program location',
  subtitle: '',
  body:
    'We believe in making mental healthcare accessible to everyone, especially those who face the most significant barriers. To uphold this commitment, we specifically reserve a portion of our program spots for clients with Medicaid. All other insurance types are grouped together for the remaining available spots. Our approach is designed to balance the need to provide care to those with the least access while serving the broader community within our resource constraints.',
  disclaimer:
    'Participation in these programs is based on eligibility. Completing registration does not guarantee enrollment.',
  primaryLabel: 'Choose your program location',
  primaryHref: '#hub-programs',
  partnerBadgeUrl: '',
  showLimitedBadge: true,
  limitedBadgeText: 'Limited space available!',
  showPartnerPlaceholder: false
};

const DEFAULT_PROCESS_STEPS = [
  'Choose your site and session.',
  'Complete the digital registration form and intake documentation through the portal in advance of your assessment or intake visit.',
  'Receive contact from a staff member to schedule an intake appointment with a licensed clinician; you may also receive a portal invitation.',
  'Participate in assessment/intake with a licensed clinician.',
  'Receive notification of eligibility for enrollment or referrals to outside organizations or community resources.',
  'If selected, complete final registration documents and any additional documentation necessary—either at an in-person sign-up date or by sending completed documents to your point of contact.',
  'Receive confirmation of attendance with final instructions!'
];

const DEFAULT_PROCESS_SECTION = {
  title: 'How do I sign up — what is the process?',
  steps: DEFAULT_PROCESS_STEPS
};

const DEFAULT_WHAT_WE_OFFER_ITEMS = [
  {
    title: 'Strategies to decrease anxiety',
    body:
      'Our staff will work with your child to develop specific skills to reduce barriers to change and decrease symptom severity to improve functioning across the lifespan.',
    imageUrl: ''
  },
  {
    title: 'Developing positive attachments',
    body:
      'We will promote positive attachments, effective caregiver and authority figure interactions, and self confidence through the development and maintenance of appropriate social relationships and attachment styles.',
    imageUrl: ''
  },
  {
    title: 'Comprehensive emotional support',
    body:
      'We are committed to enhancing and promoting therapeutic interventions to address specific needs and create an open environment designed to decrease isolation and withdrawal while promoting healthy coping strategies.',
    imageUrl: ''
  },
  {
    title: 'Skills to improve impulse control',
    body:
      'We design, implement, and practice evidenced-based skill development oriented towards increasing emotion identification and regulation while enhancing strengths and limiting poor interpersonal interactions.',
    imageUrl: ''
  }
];

const DEFAULT_WHAT_WE_OFFER = {
  title: 'What we offer',
  summary:
    'Summer and seasonal skill-development programs with therapeutic activities in small groups—focused on practical skills, emotional support, and strategies for kids, teens, and families.',
  intro:
    'Programs combine therapeutic activities and skill-building designed to reduce barriers in children’s and teens’ lives—improving social functioning, emotional regulation, and confidence in age-appropriate groups with trained staff.',
  expandLabel: 'Show more info',
  collapseLabel: 'Show less',
  items: DEFAULT_WHAT_WE_OFFER_ITEMS
};

/**
 * “What we offer” image placeholders for this hub only: per-item imageUrl, then offerBlockImages[i], then gallery order.
 */
function offerItemsWithGalleryFallback(items, galleryUrls, offerBlockImages) {
  const blocks = Array.isArray(offerBlockImages)
    ? offerBlockImages.map((s) => String(s || '').trim())
    : [];
  let g = 0;
  return items.map((it, idx) => {
    const explicit = String(it.imageUrl || '').trim();
    if (explicit) return { ...it, imageUrl: explicit };
    const fromSlot = blocks[idx];
    if (fromSlot) return { ...it, imageUrl: fromSlot };
    const url = galleryUrls[g] || '';
    if (url) g += 1;
    return { ...it, imageUrl: url };
  });
}

const whatWeOfferResolved = computed(() => {
  const b = hubBranding.value;
  if (b.whatWeOfferSection === false) return null;
  const o = typeof b.whatWeOfferSection === 'object' && b.whatWeOfferSection ? b.whatWeOfferSection : {};
  const rawItems = Array.isArray(o.items) ? o.items : null;
  let items = DEFAULT_WHAT_WE_OFFER_ITEMS;
  if (rawItems) {
    const mapped = rawItems
      .map((x) => ({
        title: String(x?.title || '').trim(),
        body: String(x?.body || '').trim(),
        imageUrl: String(x?.imageUrl || '').trim()
      }))
      .filter((x) => x.title && x.body);
    if (mapped.length) items = mapped;
  }
  const galleryUrls = hubGalleryPoolUrls(Array.isArray(b.gallery) ? b.gallery : []);
  const blockImages = Array.isArray(o.offerBlockImages) ? o.offerBlockImages : [];
  const itemsResolved = offerItemsWithGalleryFallback(items, galleryUrls, blockImages);
  return { ...DEFAULT_WHAT_WE_OFFER, ...o, items: itemsResolved };
});

const ctaSectionResolved = computed(() => {
  const b = hubBranding.value;
  if (b.ctaSection === false) return null;
  const o = typeof b.ctaSection === 'object' && b.ctaSection ? b.ctaSection : {};
  return { ...DEFAULT_CTA_SECTION, ...o };
});

/** Eligibility / Medicaid CTA inside expanded “What we offer” (default on when that section exists). */
const ctaEmbedInOfferExpanded = computed(() => {
  if (!ctaSectionResolved.value || !whatWeOfferResolved.value) return false;
  const o = hubBranding.value.ctaSection;
  if (o && typeof o === 'object' && 'embedInOfferExpanded' in o) {
    return o.embedInOfferExpanded !== false;
  }
  return true;
});

/** Separate CTA band on the page (default off when “What we offer” exists, to avoid duplicate). */
const ctaShowStandaloneBand = computed(() => {
  if (!ctaSectionResolved.value) return false;
  if (!whatWeOfferResolved.value) return true;
  const o = hubBranding.value.ctaSection;
  if (o && typeof o === 'object' && 'hideStandaloneCtaBand' in o) {
    return o.hideStandaloneCtaBand !== true;
  }
  return false;
});

/** Title + URL rows from admin; links always open in a new tab. */
const offerExpandedExternalLinks = computed(() => {
  const raw = hubBranding.value.offerExpandedExternalLinks;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => ({
      title: String(x?.title || '').trim(),
      href: String(x?.href || '').trim()
    }))
    .filter((x) => x.title && x.href);
});

const processSectionResolved = computed(() => {
  const b = hubBranding.value;
  if (b.processSection === false) return null;
  const o = typeof b.processSection === 'object' && b.processSection ? b.processSection : {};
  const rawSteps = Array.isArray(o.steps) ? o.steps : null;
  const steps =
    rawSteps && rawSteps.length
      ? rawSteps.map((s) => String(s).trim()).filter(Boolean)
      : DEFAULT_PROCESS_STEPS;
  return { ...DEFAULT_PROCESS_SECTION, ...o, steps };
});

/** Hero video + process steps merged into one silent video backdrop with scrolling copy (no stacked image + video + process). */
const heroProcessCinemaEnabled = computed(() => {
  const p = processSectionResolved.value;
  if (!p || !Array.isArray(p.steps) || !p.steps.length) return false;
  if (heroVideoUrl.value) return true;
  return hubSlug.value === 'skillbuilders';
});

const heroCinemaScrollDurationSec = computed(() => {
  const n = processSectionResolved.value?.steps?.length || 0;
  return Math.min(60, Math.max(14, 10 + n * 3));
});

const ctaPrimaryTag = computed(() => {
  if (!ctaSectionResolved.value) return 'a';
  const href = String(ctaSectionResolved.value.primaryHref || '#hub-programs').trim();
  if (
    /^https?:\/\//i.test(href) ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  ) {
    return 'a';
  }
  return 'router-link';
});

const ctaPrimaryBind = computed(() => {
  if (!ctaSectionResolved.value) return {};
  const href = String(ctaSectionResolved.value.primaryHref || '#hub-programs').trim();
  if (
    /^https?:\/\//i.test(href) ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  ) {
    return { href };
  }
  return { to: href };
});

function isExternalNavHref(href) {
  const h = String(href || '').trim();
  return /^https?:\/\//i.test(h) || h.startsWith('mailto:') || h.startsWith('tel:');
}

function choosePrimary(mode) {
  journeyPrimary.value = mode;
  if (mode === 'school') {
    journeyProgramMode.value = '';
    navigatorLocationName.value = '';
    navigatorSessionLabel.value = '';
    navigatorSessionDateRange.value = '';
    selectedSchoolName.value = '';
  } else if (mode === 'program') {
    selectedSchoolName.value = '';
    navigatorLocationName.value = '';
    navigatorSessionLabel.value = '';
    navigatorSessionDateRange.value = '';
  } else {
    journeyProgramMode.value = '';
    selectedSchoolName.value = '';
    navigatorLocationName.value = '';
    navigatorSessionLabel.value = '';
    navigatorSessionDateRange.value = '';
  }
}

async function goLearnMore() {
  choosePrimary('learn');
  showNavigatorSplash.value = false;
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    // ignore
  }
}

function goLocationRegistration(option) {
  choosePrimary('school');
  const name = String(option?.name || '').trim();
  if (name) selectedSchoolName.value = name;
  const key = String(option?.registrationPublicKey || '').trim();
  if (key) {
    const url = buildPublicIntakeUrl(key);
    if (url) {
      showNavigatorSplash.value = false;
      window.location.assign(url);
      return;
    }
  }
  showNavigatorSplash.value = false;
}

async function goProgramMode(mode) {
  choosePrimary('program');
  await chooseProgramMode(mode, true);
}

async function chooseProgramMode(mode, autoProceed = false) {
  journeyProgramMode.value = mode;
  if (!autoProceed) return;
  showNavigatorSplash.value = false;
  await nextTick();
  try {
    document.getElementById('hub-programs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    // ignore
  }
  if (mode === 'location') {
    try {
      if (eventsListingRef.value?.focusNearestInput) {
        await eventsListingRef.value.focusNearestInput();
      }
    } catch {
      // ignore
    }
  }
}

function chooseSkillbuildersAudiencePath(pathId) {
  const id = String(pathId || '').trim();
  if (!id || !skillbuildersValidPathIds.value.has(id)) return;
  skillbuildersJourneyChoice.value = id;
  writeSkillbuildersAudience(id);
  nextTick(() => {
    try {
      document.getElementById('hub-programs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      /* ignore */
    }
  });
}

function resetSkillbuildersAudience() {
  skillbuildersJourneyChoice.value = null;
  skillbuildersListingSessionLabel.value = '';
  skillbuildersListingSessionDateRange.value = '';
  clearSkillbuildersAudienceStorage();
}

async function loadAll() {
  const slug = hubSlug.value;
  if (!slug) {
    error.value = 'Invalid page.';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  metricsBlock.value = null;
  navigatorAgencyFilterId.value = null;
  navigatorSessionLabel.value = '';
  navigatorSessionDateRange.value = '';
  selectedSchoolName.value = '';
  skillbuildersListingSessionLabel.value = '';
  skillbuildersListingSessionDateRange.value = '';
  try {
    const [pageRes, evRes, bookRes] = await Promise.all([
      api.get(`/public/marketing-pages/${encodeURIComponent(slug)}`, { skipGlobalLoading: true, skipAuthRedirect: true }),
      api.get(`/public/marketing-pages/${encodeURIComponent(slug)}/events`, { skipGlobalLoading: true, skipAuthRedirect: true }),
      api.get(`/public/marketing-pages/${encodeURIComponent(slug)}/booking-hints`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      })
    ]);
    await brandingStore.fetchPlatformBranding();
    pageMeta.value = pageRes.data?.page || null;
    events.value = Array.isArray(evRes.data?.events) ? evRes.data.events : [];
    footerPartners.value = Array.isArray(bookRes.data?.footerPartners) ? bookRes.data.footerPartners : [];

    if (pageMeta.value?.metricsEnabled) {
      try {
        const mRes = await api.get(`/public/marketing-pages/${encodeURIComponent(slug)}/metrics`, {
          skipGlobalLoading: true,
          skipAuthRedirect: true
        });
        if (mRes.data?.ok && mRes.data?.metrics) {
          metricsBlock.value = { metrics: mRes.data.metrics, disclaimer: mRes.data.disclaimer || '' };
        }
      } catch {
        metricsBlock.value = null;
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load page.';
    pageMeta.value = null;
    events.value = [];
    footerPartners.value = [];
  } finally {
    loading.value = false;
    if (slug === 'skillbuilders' && skillbuildersJourneyActive.value) {
      const stored = readSkillbuildersAudience();
      skillbuildersJourneyChoice.value =
        stored && skillbuildersValidPathIds.value.has(stored) ? stored : null;
    } else {
      skillbuildersJourneyChoice.value = null;
    }
  }
}

onMounted(loadAll);
watch(eventNavigatorEnabled, (enabled) => {
  showNavigatorSplash.value = !!enabled;
  if (!enabled) return;
  journeyPrimary.value = '';
  journeyProgramMode.value = '';
  selectedSchoolName.value = '';
  navigatorAgencyFilterId.value = null;
  navigatorSessionLabel.value = '';
  navigatorSessionDateRange.value = '';
}, { immediate: true });

watch(
  () => showNavigatorSplash.value || skillbuildersAudienceGateVisible.value,
  (open) => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = open ? 'hidden' : '';
  }
);

watch(hubSlug, () => {
  offerExpanded.value = false;
  journeyPrimary.value = '';
  journeyProgramMode.value = '';
  selectedSchoolName.value = '';
  navigatorAgencyFilterId.value = null;
  navigatorSessionLabel.value = '';
  navigatorSessionDateRange.value = '';
  skillbuildersJourneyChoice.value = null;
  showNavigatorSplash.value = !!eventNavigatorEnabled.value;
  loadAll();
});
</script>

<style scoped>
/*
 * Per-hub look (optional): root also has `pmh-page--hub-<slug>` from the URL (e.g. skillbuilders → pmh-page--hub-skillbuilders).
 * Uncomment / adjust to restyle only https://…/p/skillbuilders without affecting other hubs:
 *
 * .pmh-page.pmh-page--hub-skillbuilders {
 *   --hub-brand: #0c4a6e;
 *   --hub-link: #0369a1;
 *   --hub-link-dark: #0c4a6e;
 * }
 */

.pmh-page {
  /* Hub design system — inherited by embedded PublicEventsListing */
  --hub-font-display: 'Plus Jakarta Sans', Inter, system-ui, sans-serif;
  --hub-font-body: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --hub-text: #111827;
  --hub-text-muted: #4b5563;
  --hub-text-soft: #64748b;
  /* Slate eyebrows — no green/teal */
  --hub-eyebrow: #64748b;
  /* Brick red system only (links, icons, pills) */
  --hub-link: #a32623;
  --hub-link-dark: #7a1f1d;
  --hub-brand: #a32623;
  --hub-surface: #ffffff;
  --hub-border: rgba(15, 23, 42, 0.06);
  --hub-radius-lg: 20px;
  --hub-radius-md: 14px;
  --hub-radius-sm: 10px;
  --hub-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.07), 0 8px 10px -6px rgba(15, 23, 42, 0.045);
  --hub-shadow-brand: 0 14px 36px rgba(163, 38, 35, 0.22);
  --pmh-surface: var(--hub-surface);
  --pmh-text: var(--hub-text);
  --pmh-muted: var(--hub-text-muted);
  --pmh-accent: var(--hub-brand);
  --pmh-shadow-soft: var(--hub-shadow);
  --pmh-radius-lg: var(--hub-radius-lg);
  min-height: 100vh;
  min-height: 100dvh;
  font-family: var(--hub-font-body);
  color: var(--hub-text);
  position: relative;
  padding-bottom: env(safe-area-inset-bottom, 0);
  isolation: isolate;
  background:
    radial-gradient(110% 55% at 50% -8%, rgba(163, 38, 35, 0.06) 0%, transparent 52%),
    radial-gradient(70% 45% at 95% 12%, rgba(120, 113, 108, 0.05) 0%, transparent 48%),
    linear-gradient(180deg, #f6f4f2 0%, #f3f1ef 45%, #eeebe8 100%);
}

.pmh-page--hub-skillbuilders {
  background:
    radial-gradient(110% 55% at 50% -8%, color-mix(in srgb, var(--hub-brand, #94a3b8) 14%, transparent) 0%, transparent 52%),
    radial-gradient(70% 45% at 95% 12%, rgba(120, 113, 108, 0.05) 0%, transparent 48%),
    linear-gradient(180deg, #f6f4f2 0%, #f3f1ef 45%, #eeebe8 100%);
}

.pmh-page--hub-skillbuilders .pmh-path-btn {
  border-color: color-mix(in srgb, var(--hub-brand, #64748b) 30%, #ffffff);
  color: var(--hub-link-dark, #334155);
}

.pmh-page--hub-skillbuilders .pmh-path-btn.active {
  background: color-mix(in srgb, var(--hub-brand, #64748b) 11%, #ffffff);
  border-color: color-mix(in srgb, var(--hub-brand, #64748b) 52%, #ffffff);
  color: var(--hub-link-dark, #1e293b);
}

.pmh-page--hub-skillbuilders .pmh-chip-btn.active {
  border-color: color-mix(in srgb, var(--hub-brand, #64748b) 48%, #ffffff);
  background: color-mix(in srgb, var(--hub-brand, #64748b) 9%, #f8fafc);
  color: var(--hub-link-dark, #334155);
}

.pmh-page::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.35;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Ccircle fill='%2394a3b8' fill-opacity='0.09' cx='1.5' cy='1.5' r='1'/%3E%3C/svg%3E");
}

.pmh-ambient {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.pmh-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(56px);
  opacity: 0.55;
}

.pmh-blob--a {
  width: min(100vw, 420px);
  height: min(100vw, 420px);
  top: -120px;
  right: -80px;
  background: radial-gradient(circle at 30% 30%, rgba(163, 38, 35, 0.2), rgba(163, 38, 35, 0.04));
}

.pmh-blob--b {
  width: min(90vw, 320px);
  height: min(90vw, 320px);
  top: 40%;
  left: -100px;
  background: radial-gradient(circle at 50% 50%, rgba(180, 83, 9, 0.1), transparent);
}

.pmh-blob--c {
  width: 240px;
  height: 240px;
  bottom: 10%;
  right: -40px;
  background: radial-gradient(circle at 50% 50%, rgba(120, 53, 45, 0.14), transparent);
}

.pmh-admin-pill {
  position: fixed;
  top: max(12px, env(safe-area-inset-top, 12px));
  right: max(12px, env(safe-area-inset-right, 12px));
  z-index: 50;
  display: inline-flex;
  align-items: center;
  padding: 10px 16px;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #fff;
  background: linear-gradient(135deg, #b03a37 0%, #7a1f1d 100%);
  border-radius: 999px;
  text-decoration: none;
  box-shadow: 0 8px 28px rgba(122, 31, 29, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.pmh-admin-pill:active {
  transform: scale(0.98);
}

.pmh-shell {
  position: relative;
  z-index: 1;
  max-width: 42rem;
  margin: 0 auto;
  padding-bottom: 8px;
}

.pmh-header {
  padding: max(16px, env(safe-area-inset-top, 16px)) 18px 0;
}

.pmh-brand-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 14px 16px;
  margin-bottom: 14px;
  flex-wrap: wrap;
  text-align: center;
}

.pmh-logo {
  flex-shrink: 0;
  max-height: 52px;
  max-width: min(42vw, 200px);
  width: auto;
  height: auto;
  object-fit: contain;
}

.pmh-headline {
  margin: 0;
  flex: 1 1 12rem;
  min-width: 0;
  font-size: clamp(1.35rem, 4.8vw, 1.85rem);
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.035em;
  line-height: 1.15;
  color: var(--hub-text);
  text-align: center;
}

.pmh-partner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin: 0 0 16px;
  padding: 8px 14px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-family: var(--hub-font-display);
  color: var(--hub-link-dark);
  text-align: center;
  line-height: 1.35;
  background: var(--hub-surface);
  border: 1px solid rgba(163, 38, 35, 0.2);
  border-radius: 999px;
  box-shadow: var(--hub-shadow);
  backdrop-filter: blur(10px);
}

.pmh-partner-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(135deg, #c43532, #a32623);
  box-shadow: 0 0 0 3px rgba(163, 38, 35, 0.22);
  flex-shrink: 0;
}

.pmh-hero-media {
  margin: 0 0 16px;
  border-radius: var(--hub-radius-lg);
  overflow: hidden;
  box-shadow: var(--hub-shadow);
  border: 1px solid var(--hub-border);
}

.pmh-hero-media img {
  width: 100%;
  max-height: min(40vh, 280px);
  object-fit: cover;
  /* Anchor toward top so group photos keep heads in frame */
  object-position: center 8%;
  display: block;
}

.pmh-hero-media + .pmh-hero-media--video {
  margin-top: 12px;
}

.pmh-hero-video {
  width: 100%;
  max-height: min(48vh, 320px);
  display: block;
  background: #0f172a;
}

.pmh-hero-iframe {
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: min(52vh, 360px);
  border: 0;
  display: block;
  background: #0f172a;
}

/* Silent video + scrolling process steps (replaces stacked hero image + video + duplicate process section) */
.pmh-hero-cinema {
  position: relative;
  margin: 0 0 16px;
  min-height: min(52vh, 400px);
  border-radius: var(--hub-radius-lg);
  overflow: hidden;
  box-shadow: var(--hub-shadow);
  border: 1px solid var(--hub-border);
  isolation: isolate;
}

.pmh-hero-cinema-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: #0f172a;
}

.pmh-hero-cinema-gradient-fallback {
  position: absolute;
  inset: 0;
  background: var(
    --pmh-hero-cinema-shimmer,
    linear-gradient(125deg, #0f766e 0%, #0369a1 42%, #0f172a 100%)
  );
  background-size: 240% 240%;
  animation: pmh-cinema-bg-drift 22s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .pmh-hero-cinema-gradient-fallback {
    animation: none;
    background-size: 100% 100%;
  }
}

@keyframes pmh-cinema-bg-drift {
  0%,
  100% {
    background-position: 0% 35%;
  }
  50% {
    background-position: 100% 65%;
  }
}

.pmh-hero-cinema-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.pmh-hero-cinema-iframe {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100vw;
  height: 56.25vw;
  min-width: 100%;
  min-height: max(100%, 56.25vw);
  transform: translate(-50%, -50%);
  border: 0;
  pointer-events: none;
}

.pmh-hero-cinema-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    180deg,
    rgba(15, 23, 42, 0.5) 0%,
    rgba(15, 23, 42, 0.62) 45%,
    rgba(15, 23, 42, 0.72) 100%
  );
}

.pmh-hero-cinema-overlay {
  position: relative;
  z-index: 2;
  min-height: min(52vh, 400px);
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 20px 18px 22px;
}

.pmh-hero-cinema-marquee {
  flex: 1;
  max-width: 32rem;
  margin: 0 auto;
  width: 100%;
  max-height: min(48vh, 360px);
  overflow: hidden;
  mask-image: linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%);
}

.pmh-hero-cinema-marquee-track {
  display: flex;
  flex-direction: column;
  animation: pmh-cinema-scroll var(--pmh-cinema-scroll-sec, 48s) linear infinite;
  will-change: transform;
}

.pmh-hero-cinema-block {
  flex-shrink: 0;
  padding: 8px 0 28px;
}

.pmh-hero-cinema-title {
  margin: 0 0 12px;
  font-size: clamp(1rem, 3.2vw, 1.25rem);
  font-weight: 900;
  font-family: var(--hub-font-display);
  line-height: 1.2;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #fff;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.45);
}

.pmh-hero-cinema-rule {
  height: 2px;
  margin-bottom: 14px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.2) 100%);
  border-radius: 2px;
  position: relative;
}

.pmh-hero-cinema-rule::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 10px solid rgba(255, 255, 255, 0.88);
}

.pmh-hero-cinema-steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pmh-hero-cinema-step {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.pmh-hero-cinema-step:last-child {
  border-bottom: none;
}

.pmh-hero-cinema-n {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(254, 243, 199, 0.95);
}

.pmh-hero-cinema-t {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.55;
  color: #fff;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.35);
}

@media (prefers-reduced-motion: reduce) {
  .pmh-hero-cinema-marquee-track {
    animation: none;
  }
}

@keyframes pmh-cinema-scroll {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-50%);
  }
}

.pmh-intro-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  flex-direction: column;
  text-align: center;
  padding: 18px 20px;
  margin-bottom: 4px;
  background: var(--hub-surface);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow);
  backdrop-filter: blur(12px);
}

.pmh-intro-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--hub-radius-sm);
  color: var(--hub-brand);
  background: linear-gradient(145deg, rgba(163, 38, 35, 0.12), rgba(163, 38, 35, 0.04));
  border: 1px solid rgba(163, 38, 35, 0.22);
  align-self: center;
}

.pmh-intro-icon svg {
  display: block;
}

.pmh-intro-text {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--hub-text-muted);
  font-weight: 500;
  text-align: center;
}

.pmh-fatal {
  padding: 48px 20px;
  text-align: center;
  color: #991b1b;
  background: #fef2f2;
  font-size: 1rem;
  line-height: 1.5;
}

.pmh-footer {
  position: relative;
  z-index: 1;
  margin-top: 24px;
  width: 100%;
  padding: 0 16px 28px;
}

.pmh-footer-inner {
  max-width: 40rem;
  margin: 0 auto;
  padding: 22px 20px 20px;
  background: var(--hub-surface);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow);
  display: flex;
  flex-direction: column;
  gap: 0;
}

.pmh-footer-main {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}

.pmh-footer-main .pmh-footer-partners-block {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--hub-border);
}

.pmh-footer-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: center;
}

.pmh-footer-nav-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 14px 0 12px;
  font-size: 0.9375rem;
  font-weight: 700;
  font-family: var(--hub-font-display);
  color: var(--hub-link-dark);
  background: #f8fafc;
  border: 1px solid rgba(163, 38, 35, 0.22);
  border-radius: var(--hub-radius-md);
  text-decoration: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.pmh-footer-nav-link-inner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.pmh-footer-nav-emoji {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  font-size: 1.05rem;
  line-height: 1;
  border-radius: var(--hub-radius-sm);
  background: linear-gradient(145deg, rgba(163, 38, 35, 0.14), rgba(163, 38, 35, 0.05));
  border: 1px solid rgba(163, 38, 35, 0.2);
}

.pmh-footer-nav-link:hover {
  background: #fff;
  box-shadow: 0 8px 20px rgba(163, 38, 35, 0.1);
  transform: translateY(-1px);
}

.pmh-footer-heading {
  margin: 0 0 12px;
  font-size: 1.125rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  color: var(--hub-text);
  text-align: center;
  letter-spacing: -0.02em;
}

.pmh-footer-partner-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pmh-footer-partner-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 16px;
  background: #f8fafc;
  border: 1px solid var(--hub-border);
  border-left: 3px solid var(--fp-accent, var(--hub-border));
  border-radius: var(--hub-radius-md);
}

.pmh-footer-partner-logo-wrap {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--hub-radius-sm);
  background: #fff;
  border: 1px solid var(--hub-border);
  overflow: hidden;
}

.pmh-footer-partner-logo {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.pmh-footer-partner-initials {
  font-size: 0.75rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  color: var(--hub-link-dark);
}

.pmh-footer-partner-meta {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pmh-footer-partner-name {
  font-weight: 800;
  font-family: var(--hub-font-display);
  font-size: 0.9375rem;
  color: var(--hub-text);
  line-height: 1.3;
}

.pmh-footer-partner-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.pmh-footer-link {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--hub-link);
  text-decoration: none;
}
.pmh-footer-link:hover {
  text-decoration: underline;
}

.pmh-footer-tail {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--hub-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.pmh-footer-powered-slot {
  width: 100%;
}

.pmh-footer-tail :deep(.powered-by-footer--embedded) {
  margin: 0;
  padding: 0;
  color: var(--hub-text-muted);
}

.pmh-footer-tail :deep(.powered-by-content) {
  justify-content: center;
}

.pmh-footer-tail :deep(.powered-by-text),
.pmh-footer-tail :deep(.powered-by-name),
.pmh-footer-tail :deep(.legal-link) {
  color: var(--hub-text-muted);
}

.pmh-footer-legal-centered {
  width: 100%;
  display: flex;
  justify-content: center;
}

.pmh-footer-legal-centered :deep(.powered-by-footer--embedded) {
  margin: 0;
  padding: 0;
}

.pmh-footer-legal-centered :deep(.legal-links) {
  margin-top: 0;
  text-align: center;
}

.pmh-gallery-section {
  padding: 4px 16px 16px;
}

.pmh-gallery--slideshow {
  max-width: min(960px, 100%);
  margin: 0 auto;
}

.pmh-gallery-slides {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: var(--hub-radius-md);
  overflow: hidden;
  border: 1px solid var(--hub-border);
  background: var(--hub-surface);
  box-shadow: var(--hub-shadow);
}

.pmh-gallery-slide {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 1.1s ease-in-out;
  pointer-events: none;
}

.pmh-gallery-slide--active {
  opacity: 1;
  z-index: 1;
}

@media (prefers-reduced-motion: reduce) {
  .pmh-gallery-slide {
    transition: none;
  }
}

.pmh-offer {
  margin: 16px 16px 0;
}

.pmh-placeholder-editor-hint {
  margin: 0 0 14px;
  padding: 10px 12px;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--hub-text-muted, #4b5563);
  background: #f8fafc;
  border: 1px solid var(--hub-border, rgba(15, 23, 42, 0.08));
  border-left: 4px solid var(--hub-brand, #94a3b8);
  border-radius: var(--hub-radius-sm);
}

.pmh-placeholder-badge {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 8px 14px;
  font-size: 0.6875rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: var(--hub-font-display);
  color: #fff;
  background: color-mix(in srgb, var(--hub-brand, #64748b) 92%, #000);
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
  pointer-events: none;
  max-width: calc(100% - 20px);
  text-align: center;
  line-height: 1.2;
}

.pmh-offer-card {
  padding: 22px 20px 20px;
  background: var(--hub-surface);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow);
}

.pmh-offer-title {
  margin: 0 0 12px;
  font-size: 1.35rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.03em;
  color: var(--hub-text);
  line-height: 1.2;
  text-align: center;
}

.pmh-offer-summary {
  margin: 0 0 16px;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--hub-text-muted);
  text-align: center;
}

.pmh-offer-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 18px;
  font-size: 0.9375rem;
  font-weight: 700;
  font-family: var(--hub-font-display);
  color: var(--hub-link);
  background: transparent;
  border: 1px solid rgba(163, 38, 35, 0.35);
  border-radius: var(--hub-radius-md);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.pmh-offer-toggle-wrap {
  display: flex;
  justify-content: center;
  width: 100%;
}

.pmh-offer-toggle:hover {
  background: rgba(163, 38, 35, 0.06);
  border-color: rgba(163, 38, 35, 0.5);
}

.pmh-offer-toggle:focus-visible {
  outline: 2px solid rgba(163, 38, 35, 0.45);
  outline-offset: 2px;
}

.pmh-offer-details {
  margin-top: 20px;
  padding-top: 4px;
  border-top: 1px solid var(--hub-border);
}

.pmh-offer-cta-wrap {
  margin-top: 28px;
  padding-top: 8px;
}

.pmh-cta-band--in-offer {
  margin: 0;
  text-align: center;
  border-top: 4px solid var(--pmh-program-primary, var(--hub-brand));
}

.pmh-offer-external-links {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--hub-border);
}

.pmh-offer-external-title {
  margin: 0 0 12px;
  font-size: 1rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  color: var(--hub-text);
  text-align: center;
  letter-spacing: -0.02em;
}

.pmh-offer-external-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.pmh-offer-external-a {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--hub-link);
  text-decoration: none;
}
.pmh-offer-external-a:hover {
  text-decoration: underline;
}

.pmh-offer-intro {
  margin: 16px 0 22px;
  font-size: 0.875rem;
  line-height: 1.65;
  color: var(--hub-text-muted);
  text-align: center;
}

.pmh-offer-grid {
  display: grid;
  gap: 22px;
  grid-template-columns: 1fr;
}

@media (min-width: 520px) {
  .pmh-offer-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 900px) {
  .pmh-offer-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }
}

.pmh-offer-item {
  margin: 0;
}

.pmh-offer-media {
  position: relative;
  margin-bottom: 12px;
  border-radius: var(--hub-radius-sm);
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.85);
}

.pmh-offer-img {
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  display: block;
}

.pmh-offer-img-ph {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: linear-gradient(160deg, #f4f0ee 0%, #ebe5e2 45%, #e2d9d6 100%);
}

.pmh-offer-item-title {
  margin: 0 0 8px;
  font-size: 0.9375rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.02em;
  color: var(--hub-text);
  line-height: 1.3;
}

.pmh-offer-item-body {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--hub-text-muted);
}

.pmh-offer-reveal-enter-active,
.pmh-offer-reveal-leave-active {
  transition: opacity 0.22s ease;
}

.pmh-offer-reveal-enter-from,
.pmh-offer-reveal-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .pmh-offer-reveal-enter-active,
  .pmh-offer-reveal-leave-active {
    transition: none;
  }
}

.pmh-programs-anchor {
  scroll-margin-top: 1rem;
  margin-top: 8px;
  padding: 8px 0 0;
}

.pmh-pathfinder {
  margin: 16px 16px 0;
}

.pmh-splash-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(6, 10, 20, 0.74);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.pmh-splash-card {
  width: min(860px, 96vw);
  max-height: 92vh;
  overflow: auto;
  padding: 26px 22px;
  border-radius: 20px;
  background: #fff;
  border: 1px solid var(--hub-border);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}

.pmh-splash-logos {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.pmh-splash-agency-hint {
  margin: 0 0 14px;
  padding: 12px 14px;
  font-size: 0.9rem;
  line-height: 1.45;
  color: #475569;
  background: #f8fafc;
  border: 1px solid var(--hub-border);
  border-radius: 14px;
}

.pmh-splash-program-logo-wrap {
  width: 168px;
  height: 168px;
  min-width: 168px;
  max-width: 168px;
  flex-shrink: 0;
  box-sizing: border-box;
  border: 1px solid var(--hub-border);
  border-radius: 14px;
  background: #fff;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.09);
}

.pmh-splash-program-logo {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}

.pmh-splash-tenant-logos {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 18px;
  flex-wrap: wrap;
  margin-left: auto;
}

.pmh-splash-tenant-tile {
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 200px;
  text-align: center;
}

.pmh-splash-tenant-tile:focus-visible {
  outline: 2px solid var(--hub-link);
  outline-offset: 3px;
  border-radius: 12px;
}

.pmh-splash-tenant-tile.active .pmh-splash-tenant-logo-wrap {
  border-color: #a32623;
  box-shadow: 0 0 0 2px rgba(163, 38, 35, 0.28);
}

.pmh-splash-tenant-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
  line-height: 1.25;
  max-width: 160px;
}

.pmh-splash-tenant-logo-wrap {
  width: 168px;
  height: 168px;
  border: 1px solid var(--hub-border);
  border-radius: 14px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.09);
  padding: 12px;
}

.pmh-splash-tenant-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pmh-splash-tenant-fallback {
  font-size: 0.86rem;
  font-weight: 800;
  color: var(--hub-link-dark);
}

.pmh-splash-title {
  margin: 0;
  font-size: clamp(1.5rem, 4.2vw, 2rem);
  font-family: var(--hub-font-display);
  letter-spacing: -0.02em;
  color: #0f172a;
}

.pmh-splash-actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-start;
}

.pmh-splash-card .pmh-pathfinder-eyebrow,
.pmh-splash-card .pmh-pathfinder-title,
.pmh-splash-card .pmh-pathfinder-sub,
.pmh-splash-card .pmh-pathfinder-detail-title {
  text-align: left;
}

.pmh-splash-card .pmh-pathfinder-sub {
  color: #475569;
}

.pmh-splash-card .pmh-pathfinder-actions,
.pmh-splash-card .pmh-chip-row {
  justify-content: flex-start;
}

.pmh-splash-card .pmh-path-btn {
  background: #fff;
  border: 1px solid #d9a5a3;
  color: #7a1f1d;
}

.pmh-splash-card .pmh-path-btn.active {
  background: #fff7f6;
  border-color: #a32623;
  color: #a32623;
}

.pmh-splash-card .pmh-cta-primary {
  min-width: 180px;
}

@media (max-width: 760px) {
  .pmh-splash-program-logo-wrap {
    width: 132px;
    height: 132px;
    min-width: 132px;
    max-width: 132px;
    padding: 10px;
  }
  .pmh-splash-tenant-logos {
    width: 100%;
    justify-content: flex-start;
  }
  .pmh-splash-tenant-logo-wrap {
    width: 132px;
    height: 132px;
    padding: 10px;
  }
}

.pmh-pathfinder-card {
  padding: 20px;
  background: var(--hub-surface);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow);
}

.pmh-pathfinder-eyebrow {
  margin: 0 0 8px;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 800;
  color: var(--hub-eyebrow);
}

.pmh-pathfinder-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
}

.pmh-pathfinder-sub {
  margin: 8px 0 14px;
  color: var(--hub-text-muted);
}

.pmh-pathfinder-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.pmh-path-btn {
  border: 1px solid rgba(163, 38, 35, 0.35);
  background: #fff;
  color: var(--hub-link-dark);
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  font-family: var(--hub-font-display);
  cursor: pointer;
}

.pmh-path-btn.active {
  background: rgba(163, 38, 35, 0.1);
  border-color: rgba(163, 38, 35, 0.6);
}

.pmh-pathfinder-detail {
  margin-top: 14px;
}

.pmh-pathfinder-detail-title {
  margin: 0 0 8px;
  font-weight: 700;
  color: var(--hub-text-muted);
}

.pmh-pathfinder-detail-title:not(:first-child) {
  margin-top: 16px;
}

.pmh-pathfinder-detail-hint {
  margin: 0 0 10px;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--hub-text-soft);
}

.pmh-navigator-empty {
  margin: 0 0 10px;
  font-size: 0.84rem;
  color: var(--hub-text-soft);
}

.pmh-navigator-agency-block {
  margin-bottom: 8px;
}

.pmh-agency-logo-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: stretch;
  justify-content: center;
}

.pmh-agency-filter-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 212px;
  max-width: min(212px, 100%);
  padding: 14px 12px 16px;
  border-radius: 18px;
  border: 1px solid var(--hub-border);
  background: #fff;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.pmh-agency-filter-tile:focus-visible {
  outline: 2px solid var(--hub-link);
  outline-offset: 2px;
}

.pmh-agency-filter-tile.active {
  border-color: rgba(163, 38, 35, 0.55);
  background: rgba(163, 38, 35, 0.06);
}

.pmh-agency-filter-tile-logo {
  width: 176px;
  height: 176px;
  max-width: 100%;
  aspect-ratio: 1;
  border-radius: 16px;
  border: 1px solid var(--hub-border);
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 14px;
  box-sizing: border-box;
}

.pmh-agency-filter-tile-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pmh-agency-filter-tile-fallback {
  font-size: 1rem;
  font-weight: 800;
  color: var(--hub-link-dark);
}

.pmh-agency-filter-tile-name {
  font-size: 0.82rem;
  font-weight: 700;
  text-align: center;
  line-height: 1.25;
  color: var(--hub-text-muted);
}

@media (max-width: 520px) {
  .pmh-agency-filter-tile {
    width: 168px;
    padding: 12px 10px 14px;
  }
  .pmh-agency-filter-tile-logo {
    width: 140px;
    height: 140px;
    padding: 12px;
  }
}

.pmh-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pmh-chip-btn {
  border: 1px solid var(--hub-border);
  background: #f8fafc;
  color: var(--hub-text);
  border-radius: 999px;
  padding: 7px 12px;
  cursor: pointer;
}

.pmh-chip-btn.active {
  border-color: rgba(163, 38, 35, 0.5);
  background: rgba(163, 38, 35, 0.08);
  color: var(--hub-link-dark);
}

.pmh-chip-row--wrap {
  justify-content: flex-start;
}

.pmh-chip-btn--session {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border-radius: 14px;
  padding: 10px 14px;
  text-align: left;
}

.pmh-chip-session-title {
  font-weight: 800;
  font-size: 0.9rem;
}

.pmh-chip-session-sub {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--hub-text-soft);
}

.pmh-cta-band {
  margin: 16px 16px 0;
  padding: 22px 20px 24px;
  text-align: center;
  background: var(--hub-surface);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  border-top: 4px solid var(--pmh-program-primary, var(--hub-brand));
  box-shadow: var(--hub-shadow);
}

.pmh-cta-eyebrow {
  margin: 0 0 8px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-family: var(--hub-font-display);
  color: var(--hub-eyebrow);
}

.pmh-cta-title {
  margin: 0 0 12px;
  font-size: 1.25rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.02em;
  color: var(--hub-text);
  line-height: 1.25;
}

.pmh-cta-subtitle {
  margin: -4px 0 12px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--hub-text-muted);
}

.pmh-cta-body {
  margin: 0 0 14px;
  font-size: 0.875rem;
  line-height: 1.65;
  color: var(--hub-text-muted);
  text-align: left;
}

.pmh-cta-disclaimer {
  margin: 0 0 20px;
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1.5;
  color: var(--pmh-program-primary, var(--hub-brand));
  text-align: left;
}

.pmh-cta-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 16px 20px;
}

.pmh-cta-badge-img-wrap {
  flex: 0 0 auto;
  max-width: 200px;
}

.pmh-cta-badge-img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #f1f5f9;
}

.pmh-cta-partner-ph {
  flex: 0 1 180px;
  padding: 10px 12px;
  text-align: left;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
}

.pmh-cta-partner-ph-line {
  display: block;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #334155;
}

.pmh-cta-partner-ph-sub {
  display: block;
  margin-top: 6px;
  font-size: 0.6875rem;
  line-height: 1.4;
  color: #94a3b8;
}

.pmh-cta-btn-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.pmh-cta-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 0 28px;
  font-size: 1rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  letter-spacing: -0.01em;
  color: #fff;
  text-decoration: none;
  background: var(--pmh-program-primary, var(--hub-brand));
  border: none;
  border-radius: var(--hub-radius-md);
  box-shadow: var(--hub-shadow-brand);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.pmh-cta-primary:hover {
  box-shadow: 0 16px 40px color-mix(in srgb, var(--pmh-program-primary, var(--hub-brand, #64748b)) 32%, transparent);
  transform: translateY(-1px);
}

.pmh-cta-seal {
  width: 5.25rem;
  height: 5.25rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  text-align: center;
  background: linear-gradient(145deg, #fbbf24 0%, #d97706 100%);
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  transform: rotate(8deg);
  filter: drop-shadow(0 4px 8px rgba(180, 83, 9, 0.35));
}

.pmh-cta-seal-text {
  display: block;
  max-width: 7em;
  font-size: 0.5625rem;
  font-weight: 900;
  line-height: 1.25;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #1c1917;
  transform: rotate(-8deg);
}

.pmh-process {
  margin: 16px 16px 0;
  padding: 24px 20px 28px;
  color: #fff;
  background: var(--pmh-program-primary, var(--hub-brand));
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow-brand);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.pmh-process-inner {
  display: grid;
  gap: 20px;
  align-items: start;
}

@media (min-width: 768px) {
  .pmh-process-inner {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
    gap: 28px;
  }
}

.pmh-process-head {
  position: relative;
}

.pmh-process-title {
  margin: 0;
  font-size: clamp(1.125rem, 3.5vw, 1.35rem);
  font-weight: 900;
  font-family: var(--hub-font-display);
  line-height: 1.2;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #fff;
}

.pmh-process-rule {
  margin-top: 14px;
  height: 2px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.2) 100%);
  border-radius: 2px;
  position: relative;
}

.pmh-process-rule::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 10px solid rgba(255, 255, 255, 0.85);
}

@media (min-width: 768px) {
  .pmh-process-rule {
    margin-top: 18px;
  }
}

.pmh-process-steps {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: pmh-step;
}

.pmh-process-step {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
}

.pmh-process-step:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.pmh-process-n {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(254, 243, 199, 0.95);
}

.pmh-process-t {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.55;
  color: #fff;
}

.pmh-section {
  background: var(--hub-surface);
  color: var(--hub-text);
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-lg);
  box-shadow: var(--hub-shadow);
  padding: 24px 20px 28px;
  margin: 16px 16px 0;
}

.pmh-section-inner {
  max-width: 40rem;
  margin: 0 auto;
}

.pmh-h2 {
  margin: 0 0 12px;
  font-size: 1.125rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  color: var(--hub-text);
  letter-spacing: -0.02em;
}

.pmh-muted {
  margin: 0 0 12px;
  color: var(--hub-text-muted);
  font-size: 0.875rem;
  line-height: 1.55;
}

.pmh-muted code {
  font-size: 0.8em;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--hub-text);
}

.pmh-disclaimer {
  font-size: 0.8125rem;
  opacity: 0.95;
}

.pmh-metrics-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  margin: 0;
}

.pmh-metric {
  background: #f8fafc;
  border: 1px solid var(--hub-border);
  border-radius: var(--hub-radius-sm);
  padding: 12px 14px;
}

.pmh-metric dt {
  margin: 0;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--hub-text-soft);
}

.pmh-metric dd {
  margin: 6px 0 0;
  font-size: 1.25rem;
  font-weight: 800;
  font-family: var(--hub-font-display);
  color: var(--hub-text);
}

@media (min-width: 640px) {
  .pmh-shell {
    max-width: 48rem;
  }
}

/* Full-width footer bar on large screens: main row + centered tail; phone stays stacked. */
@media (min-width: 960px) {
  .pmh-footer {
    padding: 0 0 max(28px, env(safe-area-inset-bottom));
    margin-top: 32px;
  }

  .pmh-footer-inner {
    max-width: none;
    width: 100%;
    margin: 0;
    padding: 28px max(40px, env(safe-area-inset-left)) 24px max(40px, env(safe-area-inset-right));
    border-radius: var(--hub-radius-lg) var(--hub-radius-lg) 0 0;
    border-bottom: none;
    box-shadow: 0 -8px 32px rgba(15, 23, 42, 0.06);
  }

  .pmh-footer-main {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 40px;
  }

  .pmh-footer-main .pmh-footer-partners-block {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
    border-left: 1px solid var(--hub-border);
    padding-left: 40px;
    flex: 1 1 0;
    min-width: 0;
  }

  .pmh-footer-nav {
    flex: 0 1 auto;
    max-width: min(100%, 26rem);
    justify-content: flex-start;
  }

  .pmh-footer-heading {
    text-align: left;
  }

  .pmh-footer-partner-list {
    align-items: stretch;
  }

  .pmh-footer-tail {
    margin-top: 24px;
    padding-top: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pmh-footer-nav-link:hover {
    transform: none;
  }
}

.sb-audience-overlay {
  z-index: 125;
}

.sb-audience-card {
  width: min(520px, 94vw);
  padding: 28px 22px 26px;
  border-radius: 20px;
  background: #fff;
  border: 1px solid var(--hub-border);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  text-align: center;
}

.sb-audience-logo-wrap {
  margin: 0 0 16px;
}

.sb-audience-logo {
  max-height: min(140px, 28vw);
  max-width: min(420px, 92vw);
  width: auto;
  height: auto;
  object-fit: contain;
}

.sb-audience-eyebrow {
  margin: 0 0 6px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hub-eyebrow, #64748b);
}

.sb-audience-title {
  margin: 0 0 22px;
  font-size: clamp(1.15rem, 3.6vw, 1.45rem);
  font-weight: 800;
  line-height: 1.35;
  color: var(--hub-text);
}

.sb-audience-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sb-audience-actions--many {
  flex-direction: column;
}

@media (min-width: 560px) {
  .sb-audience-actions:not(.sb-audience-actions--many) {
    flex-direction: row;
    justify-content: center;
    flex-wrap: wrap;
  }
}

.sb-audience-btn {
  flex: 1 1 200px;
  border-radius: 14px;
  padding: 14px 16px;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.35;
  border: 2px solid var(--hub-border);
  background: #fff;
  color: var(--hub-text);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}

.sb-audience-btn:hover {
  border-color: var(--hub-brand);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.1);
}

.sb-audience-btn--primary {
  background: var(--hub-brand);
  border-color: var(--hub-brand);
  color: #fff;
}

.sb-audience-btn--primary:hover {
  filter: brightness(1.05);
  border-color: var(--hub-brand);
}

.sb-audience-btn--secondary {
  background: #f8fafc;
}

.sb-audience-change {
  margin: 0 16px 10px;
  text-align: right;
}

.sb-audience-change-btn {
  border: none;
  background: none;
  color: var(--hub-link);
  font-weight: 600;
  font-size: 0.875rem;
  text-decoration: underline;
  cursor: pointer;
  padding: 4px 0;
}

.sb-audience-warn {
  margin: 0 16px 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  color: #92400e;
  font-size: 0.875rem;
  line-height: 1.45;
}

.sb-audience-warn code {
  font-size: 0.8em;
  background: rgba(255, 255, 255, 0.7);
  padding: 1px 5px;
  border-radius: 4px;
}

.sb-audience-notice {
  margin: 0 16px 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #334155;
  font-size: 0.875rem;
  line-height: 1.45;
}

.sb-skillbuilders-sessions {
  margin: 0 16px 14px;
  padding: 14px 16px 16px;
  border-radius: 16px;
  border: 1px solid var(--hub-border, #e2e8f0);
  background: color-mix(in srgb, var(--hub-surface, #fff) 94%, var(--hub-brand, #6a9c5c) 6%);
}

.sb-skillbuilders-sessions-title {
  margin: 0 0 6px;
  font-weight: 800;
  font-size: 1rem;
  color: var(--hub-text, #0f172a);
  font-family: var(--hub-font-display, inherit);
}

.sb-skillbuilders-sessions-hint {
  margin: 0 0 12px;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--hub-text-muted, #475569);
}

.sb-skillbuilders-sessions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sb-skillbuilders-session-chip {
  border: 1px solid rgba(163, 38, 35, 0.35);
  background: #fff;
  color: var(--hub-link-dark, #7a1f1d);
  border-radius: 14px;
  padding: 10px 14px;
  cursor: pointer;
  text-align: left;
  min-width: min(200px, 100%);
  font-family: var(--hub-font-display, inherit);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.sb-skillbuilders-session-chip:hover {
  border-color: rgba(163, 38, 35, 0.55);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}

.sb-skillbuilders-session-chip.active {
  border-color: #a32623;
  background: #fff7f6;
  box-shadow: 0 0 0 2px rgba(163, 38, 35, 0.2);
}

.sb-skillbuilders-session-chip-title {
  display: block;
  font-weight: 800;
  font-size: 0.95rem;
}

.sb-skillbuilders-session-chip-sub {
  display: block;
  margin-top: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--hub-text-muted, #64748b);
}
</style>
