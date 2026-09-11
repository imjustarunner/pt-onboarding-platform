<template>
  <div class="tisi-site" :class="{ 'tisi-site--editing': editing }">
    <div v-if="isSuperAdmin" class="tisi-editor-bar" :class="{ 'tisi-editor-bar--active': editing }">
      <template v-if="!editing">
        <button type="button" class="tisi-ed-btn tisi-ed-btn--primary" @click="startEdit">Edit page</button>
        <router-link class="tisi-ed-link" :to="`/admin/public-marketing-pages?page=${hubSlug}`">Full editor</router-link>
      </template>
      <template v-else>
        <span class="tisi-ed-hint">Unsaved changes</span>
        <button type="button" class="tisi-ed-btn" :disabled="saving || uploading" @click="pickFile('logo')">Change logo</button>
        <button type="button" class="tisi-ed-btn" :disabled="saving || uploading" @click="pickFile('hero')">Change hero photo</button>
        <button type="button" class="tisi-ed-btn" :disabled="saving || uploading" @click="pickFile('cta')">Change CTA photo</button>
        <button type="button" class="tisi-ed-btn tisi-ed-btn--primary" :disabled="saving || uploading" @click="saveEdit">
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
        <button type="button" class="tisi-ed-btn" :disabled="saving || uploading" @click="cancelEdit">Cancel</button>
        <router-link class="tisi-ed-link" :to="`/admin/public-marketing-pages?page=${hubSlug}`">Full editor</router-link>
      </template>
      <p v-if="editError" class="tisi-ed-error" role="alert">{{ editError }}</p>
      <p v-if="editSavedFlash" class="tisi-ed-ok">Saved</p>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="tisi-file-hidden"
        @change="onFilePicked"
      />
    </div>

    <div v-if="error" class="tisi-fatal">{{ error }}</div>
    <div v-else-if="loading" class="tisi-fatal tisi-muted">Loading…</div>

    <template v-else-if="v">
      <header class="tisi-header">
        <div class="tisi-header-inner">
          <div class="tisi-brand">
            <button
              v-if="editing"
              type="button"
              class="tisi-brand-mark-btn"
              title="Change logo"
              @click="pickFile('logo')"
            >
              <img v-if="v.logoUrl" class="tisi-brand-mark" :src="v.logoUrl" alt="" />
            </button>
            <router-link v-else class="tisi-brand-link" :to="`/p/${hubSlug}`" aria-label="Home">
              <img v-if="v.logoUrl" class="tisi-brand-mark" :src="v.logoUrl" alt="" />
            </router-link>
            <span class="tisi-brand-text">
              <template v-if="editing">
                <input v-model="v.siteName" class="tisi-inline tisi-inline--name" type="text" aria-label="Site name" />
                <input v-model="v.tagline" class="tisi-inline tisi-inline--tag" type="text" aria-label="Tagline" />
              </template>
              <template v-else>
                <span class="tisi-brand-name">{{ v.siteName }}</span>
                <span class="tisi-brand-tag">{{ v.tagline }}</span>
              </template>
            </span>
          </div>

          <button
            type="button"
            class="tisi-nav-toggle"
            :aria-expanded="mobileNavOpen ? 'true' : 'false'"
            aria-label="Menu" aria-controls="tisi-primary-nav" @keydown.esc="mobileNavOpen = false"
            @click="mobileNavOpen = !mobileNavOpen"
          >
            <span /><span /><span />
          </button>

          <nav id="tisi-primary-nav" class="tisi-nav" @keydown.esc="mobileNavOpen = false" :class="{ 'tisi-nav--open': mobileNavOpen }" aria-label="Primary">
            <template v-if="editing">
              <div v-for="(item, i) in v.primaryNav" :key="`nav-${i}`" class="tisi-nav-edit">
                <input v-model="item.label" class="tisi-inline tisi-inline--nav" type="text" :aria-label="`Nav label ${i + 1}`" />
                <input v-model="item.href" class="tisi-inline tisi-inline--href" type="text" :aria-label="`Nav href ${i + 1}`" />
                <button type="button" class="tisi-mini-x" @click="v.primaryNav.splice(i, 1)">×</button>
              </div>
              <button type="button" class="tisi-mini-add" @click="v.primaryNav.push({ label: 'Link', href: '/p/tisi' })">+ Nav</button>
            </template>
            <template v-else>
              <component
                :is="navTag(item.href)"
                v-for="item in v.primaryNav"
                :key="item.href + item.label"
                class="tisi-nav-link"
                :class="{ 'tisi-nav-link--active': isNavActive(item.href) }"
                :aria-current="isNavActive(item.href) ? 'page' : undefined"
                v-bind="navBind(item.href)"
                @click="mobileNavOpen = false"
              >
                {{ item.label }}
              </component>
            </template>
          </nav>

          <template v-if="editing">
            <div class="tisi-header-cta-edit">
              <input v-model="v.ctaButtonLabel" class="tisi-inline" type="text" aria-label="CTA label" />
              <input v-model="v.ctaHref" class="tisi-inline tisi-inline--href" type="text" aria-label="CTA href" />
            </div>
          </template>
          <component
            v-else-if="landingDestination(v.ctaHref, destinationContext)"
            :is="navTag(v.ctaHref)"
            class="tisi-btn tisi-btn--primary tisi-header-cta"
            v-bind="navBind(v.ctaHref)"
            @click="mobileNavOpen = false"
          >
            {{ v.ctaButtonLabel }} <span aria-hidden="true">→</span>
          </component>
        </div>
      </header>

      <a class="tisi-skip" href="#main">Skip to content</a>
      <main id="main" tabindex="-1">
        <section class="tisi-hero" :style="{ backgroundImage: `url(${JSON.stringify(v.heroImageUrl)})`, '--hero-position': v.heroPosition, '--hero-mobile-position': v.heroMobilePosition }">
          <div class="tisi-hero-scrim" />
          <button
            v-if="editing"
            type="button"
            class="tisi-photo-fab"
            @click="pickFile('hero')"
          >
            Change hero photo
          </button>
          <div class="tisi-hero-inner">
            <template v-if="editing">
              <input v-model="v.heroEyebrow" class="tisi-inline tisi-inline--on-dark" type="text" aria-label="Hero eyebrow" />
              <textarea v-model="v.heroTitle" class="tisi-inline tisi-inline--on-dark tisi-inline--hero-title" rows="2" aria-label="Hero title" />
              <textarea v-model="v.heroSubtitle" class="tisi-inline tisi-inline--on-dark tisi-inline--area" rows="3" aria-label="Hero subtitle" />
              <div class="tisi-hero-actions tisi-hero-actions--edit">
                <input v-model="v.ctaButtonLabel" class="tisi-inline tisi-inline--on-dark" type="text" placeholder="Primary button" />
                <input v-model="v.learnMoreHref" class="tisi-inline tisi-inline--on-dark" type="text" placeholder="Learn more href" />
              </div>
              <input v-model="v.pillarsText" class="tisi-inline tisi-inline--on-dark" type="text" aria-label="Pillars" />
              <textarea v-model="v.heroScript" class="tisi-inline tisi-inline--on-dark tisi-inline--script" rows="2" aria-label="Script overlay" />
            </template>
            <template v-else>
              <p class="tisi-hero-eyebrow">{{ v.heroEyebrow }}</p>
              <h1 class="tisi-hero-title">{{ heroHeading.start }}<span v-if="heroHeading.accent">{{ heroHeading.accent }}</span></h1>
              <p class="tisi-hero-sub">{{ v.heroSubtitle }}</p>
              <div class="tisi-hero-actions">
                <component v-if="landingDestination(v.ctaHref, destinationContext)" :is="navTag(v.ctaHref)" class="tisi-btn tisi-btn--primary" v-bind="navBind(v.ctaHref)">
                  {{ v.ctaButtonLabel }} <span aria-hidden="true">→</span>
                </component>
                <component
                  v-if="landingDestination(v.learnMoreHref, destinationContext)" :is="navTag(v.learnMoreHref)"
                  class="tisi-btn tisi-btn--ghost"
                  v-bind="navBind(v.learnMoreHref)"
                >
                  Learn More
                </component>
              </div>
              <p class="tisi-hero-pillars">{{ v.pillarsText }}</p>
            </template>
          </div>
          <p v-if="!editing" class="tisi-hero-script" aria-hidden="true">{{ v.heroScript }}</p>
        </section>

        <section id="who-we-support" class="tisi-section tisi-support">
          <div class="tisi-section-inner tisi-support-grid">
            <div class="tisi-support-intro">
              <template v-if="editing">
                <input v-model="v.supportKicker" class="tisi-inline" type="text" aria-label="Support kicker" />
                <input v-model="v.supportTitle" class="tisi-inline tisi-inline--h2" type="text" aria-label="Support title" />
                <textarea v-model="v.supportBody" class="tisi-inline tisi-inline--area" rows="4" aria-label="Support body" />
              </template>
              <template v-else>
                <p class="tisi-kicker">{{ v.supportKicker }}</p>
                <h2 class="tisi-h2">{{ v.supportTitle }}</h2>
                <p class="tisi-lead">{{ v.supportBody }}</p>
              </template>
            </div>
            <div class="tisi-card-row">
              <div
                v-for="(card, i) in v.supportCards"
                :key="card.slug || card.title || i"
                class="tisi-audience-card"
                :class="{ 'tisi-card--editing': editing }"
              >
                <template v-if="editing">
                  <select v-model="card.iconKey" class="tisi-inline" aria-label="Icon">
                    <option v-for="opt in iconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <input v-model="card.iconUrl" class="tisi-inline tisi-inline--href" type="text" placeholder="Optional icon image URL" />
                  <input v-model="card.title" class="tisi-inline" type="text" placeholder="Title" />
                  <textarea v-model="card.body" class="tisi-inline tisi-inline--area" rows="3" placeholder="Body" />
                  <input v-model="card.href" class="tisi-inline tisi-inline--href" type="text" placeholder="Link" />
                  <button type="button" class="tisi-mini-x" @click="v.supportCards.splice(i, 1)">Remove</button>
                </template>
                <component v-else :is="navTag(card.href)" class="tisi-card-hit" v-bind="navBind(card.href)">
                  <span class="tisi-audience-ico" aria-hidden="true">
                    <img v-if="card.iconUrl" :src="card.iconUrl" alt="" />
                    <span v-else v-html="iconSvg(card.iconKey)" />
                  </span>
                  <span class="tisi-audience-title">{{ card.title }}</span>
                  <span class="tisi-audience-body">{{ card.body }} <span v-if="landingDestination(card.href, destinationContext)" class="tisi-arrow" aria-hidden="true">→</span></span>
                </component>
              </div>
              <button v-if="editing" type="button" class="tisi-mini-add tisi-mini-add--card" @click="addSupportCard">+ Audience card</button>
            </div>
          </div>
        </section>

        <section id="services" class="tisi-section tisi-services">
          <div class="tisi-section-inner">
            <div class="tisi-section-head">
              <template v-if="editing">
                <input v-model="v.servicesTitle" class="tisi-inline tisi-inline--h2" type="text" />
                <div class="tisi-section-head-edit">
                  <input v-model="v.servicesViewAllLabel" class="tisi-inline" type="text" />
                  <input v-model="v.servicesViewAllHref" class="tisi-inline tisi-inline--href" type="text" />
                </div>
              </template>
              <template v-else>
                <div><p class="tisi-kicker">Comprehensive, personalized care</p><h2 class="tisi-h2">{{ v.servicesTitle }}</h2></div>
                <component
                  v-if="landingDestination(v.servicesViewAllHref, destinationContext)" :is="navTag(v.servicesViewAllHref)"
                  class="tisi-text-link"
                  v-bind="navBind(v.servicesViewAllHref)"
                >
                  {{ v.servicesViewAllLabel }}
                </component>
              </template>
            </div>
            <div class="tisi-services-grid">
              <div
                v-for="(svc, i) in v.services"
                :key="svc.slug || svc.title || i"
                class="tisi-service-card"
                :class="{ 'tisi-card--editing': editing }"
              >
                <template v-if="editing">
                  <select v-model="svc.iconKey" class="tisi-inline">
                    <option v-for="opt in iconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <input v-model="svc.iconUrl" class="tisi-inline tisi-inline--href" type="text" placeholder="Optional icon URL" />
                  <input v-model="svc.title" class="tisi-inline" type="text" />
                  <textarea v-model="svc.body" class="tisi-inline tisi-inline--area" rows="3" />
                  <input v-model="svc.href" class="tisi-inline tisi-inline--href" type="text" />
                  <button type="button" class="tisi-mini-x" @click="v.services.splice(i, 1)">Remove</button>
                </template>
                <component v-else :is="navTag(svc.href)" class="tisi-card-hit" v-bind="navBind(svc.href)">
                  <span class="tisi-service-ico" aria-hidden="true">
                    <img v-if="svc.iconUrl" :src="svc.iconUrl" alt="" />
                    <span v-else v-html="iconSvg(svc.iconKey)" />
                  </span>
                  <span class="tisi-service-title">{{ svc.title }}</span>
                  <span class="tisi-service-body">{{ svc.body }}</span>
                  <span v-if="landingDestination(svc.href, destinationContext)" class="tisi-service-go" aria-hidden="true">→</span>
                </component>
              </div>
              <button v-if="editing" type="button" class="tisi-mini-add tisi-mini-add--card" @click="addService">+ Service</button>
            </div>
          </div>
        </section>

        <section class="tisi-why">
          <div class="tisi-section-inner">
            <template v-if="editing">
              <input v-model="v.whyTitle" class="tisi-inline tisi-inline--on-dark tisi-inline--h2" type="text" />
            </template>
            <h2 v-else class="tisi-h2 tisi-h2--light">{{ v.whyTitle }}</h2>
            <div class="tisi-why-grid">
              <div v-for="(item, i) in v.whyItems" :key="item.title || i" class="tisi-why-item" :class="{ 'tisi-card--editing': editing }">
                <template v-if="editing">
                  <select v-model="item.iconKey" class="tisi-inline tisi-inline--on-dark">
                    <option v-for="opt in iconOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <input v-model="item.iconUrl" class="tisi-inline tisi-inline--on-dark" type="text" placeholder="Icon URL" />
                  <input v-model="item.title" class="tisi-inline tisi-inline--on-dark" type="text" />
                  <textarea v-model="item.body" class="tisi-inline tisi-inline--on-dark tisi-inline--area" rows="3" />
                  <button type="button" class="tisi-mini-x" @click="v.whyItems.splice(i, 1)">Remove</button>
                </template>
                <template v-else>
                  <span class="tisi-why-ico" aria-hidden="true">
                    <img v-if="item.iconUrl" :src="item.iconUrl" alt="" />
                    <span v-else v-html="iconSvg(item.iconKey)" />
                  </span>
                  <h3 class="tisi-why-title">{{ item.title }}</h3>
                  <p class="tisi-why-body">{{ item.body }}</p>
                </template>
              </div>
              <button v-if="editing" type="button" class="tisi-mini-add" @click="addWhy">+ Reason</button>
            </div>
          </div>
        </section>

        <section id="how-it-works" class="tisi-section">
          <div class="tisi-section-inner">
            <template v-if="editing">
              <input v-model="v.processKicker" class="tisi-inline tisi-inline--center" type="text" />
              <input v-model="v.processTitle" class="tisi-inline tisi-inline--h2 tisi-inline--center" type="text" />
            </template>
            <template v-else>
              <p class="tisi-kicker tisi-kicker--center">{{ v.processKicker }}</p>
              <h2 class="tisi-h2 tisi-h2--center">{{ v.processTitle }}</h2>
            </template>
            <ol class="tisi-steps">
              <li v-for="(step, i) in v.processSteps" :key="step.title || i" class="tisi-step" :class="{ 'tisi-card--editing': editing }">
                <span class="tisi-step-num">{{ i + 1 }}</span>
                <div class="tisi-step-body-wrap">
                  <template v-if="editing">
                    <input v-model="step.title" class="tisi-inline" type="text" />
                    <textarea v-model="step.body" class="tisi-inline tisi-inline--area" rows="2" />
                    <input v-model="step.href" class="tisi-inline tisi-inline--href" type="text" placeholder="Optional link" />
                    <button type="button" class="tisi-mini-x" @click="v.processSteps.splice(i, 1)">Remove</button>
                  </template>
                  <template v-else>
                    <h3 class="tisi-step-title">{{ step.title }}</h3>
                    <p class="tisi-step-body">
                      {{ step.body }}
                      <component
                        v-if="landingDestination(step.href, destinationContext)"
                        :is="navTag(step.href)"
                        class="tisi-inline-arrow"
                        v-bind="navBind(step.href)" :aria-label="step.title"
                      >→</component>
                    </p>
                  </template>
                </div>
              </li>
              <button v-if="editing" type="button" class="tisi-mini-add" @click="addStep">+ Step</button>
            </ol>
          </div>
        </section>

        <section v-if="editing || v.testimonials.length" class="tisi-section tisi-quotes">
          <div class="tisi-section-inner">
            <input v-if="editing" v-model="v.testimonialsTitle" class="tisi-inline tisi-inline--h2 tisi-inline--center" type="text" />
            <h2 v-else class="tisi-h2 tisi-h2--center">{{ v.testimonialsTitle }}</h2>
            <div class="tisi-quotes-grid">
              <blockquote
                v-for="(q, i) in v.testimonials"
                :key="i"
                class="tisi-quote"
                :class="{ 'tisi-card--editing': editing }"
              >
                <template v-if="editing">
                  <textarea v-model="q.text" class="tisi-inline tisi-inline--area" rows="4" />
                  <label><input v-model="q.verified" type="checkbox" /> Authentic quote approved for publication</label>
                  <input v-model="q.attribution" class="tisi-inline" type="text" placeholder="Attribution" />
                  <button type="button" class="tisi-mini-x" @click="v.testimonials.splice(i, 1)">Remove</button>
                </template>
                <template v-else>
                  <p class="tisi-quote-text">“{{ q.text }}”</p>

                  <footer class="tisi-quote-attr">— {{ q.attribution }}</footer>
                </template>
              </blockquote>
              <button v-if="editing" type="button" class="tisi-mini-add tisi-mini-add--card" @click="addQuote">+ Testimonial</button>
            </div>
          </div>
        </section>

        <section class="tisi-cta" :style="{ backgroundImage: `url(${JSON.stringify(v.ctaImageUrl)})`, backgroundPosition: v.ctaPosition }">
          <div class="tisi-cta-scrim" />
          <button v-if="editing" type="button" class="tisi-photo-fab" @click="pickFile('cta')">Change CTA photo</button>
          <div class="tisi-cta-inner">
            <template v-if="editing">
              <input v-model="v.ctaTitle" class="tisi-inline tisi-inline--on-dark tisi-inline--h2" type="text" />
              <textarea v-model="v.ctaBody" class="tisi-inline tisi-inline--on-dark tisi-inline--area" rows="3" />
              <input v-model="v.ctaFinalButtonLabel" class="tisi-inline tisi-inline--on-dark" type="text" />
              <input v-model="v.ctaHref" class="tisi-inline tisi-inline--on-dark" type="text" placeholder="Button href" />
              <input v-model="v.ctaNote" class="tisi-inline tisi-inline--on-dark" type="text" />
            </template>
            <template v-else>
              <h2 class="tisi-cta-title">{{ v.ctaTitle }}</h2>
              <p class="tisi-cta-sub">{{ v.ctaBody }}</p>
              <component
                v-if="landingDestination(v.ctaHref, destinationContext)" :is="navTag(v.ctaHref)"
                class="tisi-btn tisi-btn--primary tisi-btn--lg"
                v-bind="navBind(v.ctaHref)"
              >
                {{ v.ctaFinalButtonLabel }} <span aria-hidden="true">→</span>
              </component>
              <p class="tisi-cta-note">{{ v.ctaNote }}</p>
            </template>
          </div>
        </section>
      </main>

      <footer id="contact" class="tisi-footer">
        <div class="tisi-footer-inner">
          <div class="tisi-footer-brand">
            <img v-if="v.logoUrl" class="tisi-footer-mark" :src="v.logoUrl" alt="" />
            <p class="tisi-footer-name">{{ v.siteName }}</p>
            <p class="tisi-footer-tag">{{ v.tagline }}</p>
            <template v-if="editing">
              <input v-model="v.contactPhone" class="tisi-inline tisi-inline--on-dark" type="text" placeholder="Phone" />
              <input v-model="v.contactEmail" class="tisi-inline tisi-inline--on-dark" type="text" placeholder="Email" />
              <input v-model="v.contactAddress" class="tisi-inline tisi-inline--on-dark" type="text" placeholder="Address" />
            </template>
          </div>

          <div class="tisi-footer-col">
            <h3 class="tisi-footer-heading">Quick Links</h3>
            <template v-if="!editing">
              <component
                :is="navTag(item.href)"
                v-for="item in v.primaryNav"
                :key="`f-${item.href}`"
                class="tisi-footer-link"
                v-bind="navBind(item.href)"
              >
                {{ item.label }}
              </component>
            </template>
            <p v-else class="tisi-footer-meta">Edit nav links in the header while editing.</p>
          </div>

          <div class="tisi-footer-col">
            <h3 class="tisi-footer-heading">Contact</h3>
            <component v-if="!editing && landingDestination(v.ctaHref, destinationContext)" :is="navTag(v.ctaHref)" class="tisi-footer-link" v-bind="navBind(v.ctaHref)">{{ v.ctaButtonLabel }} →</component>
            <template v-if="!editing">
              <a v-if="v.contactPhone" class="tisi-footer-link" :href="`tel:${v.contactPhone.replace(/[^+\d]/g, '')}`">{{ v.contactPhone }}</a>
              <a v-if="v.contactEmail" class="tisi-footer-link" :href="`mailto:${v.contactEmail}`">{{ v.contactEmail }}</a>
              <p v-if="v.contactAddress" class="tisi-footer-meta">{{ v.contactAddress }}</p>
            </template>
            <div class="tisi-social" aria-label="Social links">
              <template v-if="editing">
                <div v-for="(s, i) in v.socialLinks" :key="i" class="tisi-social-edit">
                  <input v-model="s.label" class="tisi-inline tisi-inline--on-dark" type="text" placeholder="Label" />
                  <input v-model="s.short" class="tisi-inline tisi-inline--on-dark" type="text" placeholder="Short" />
                  <input v-model="s.href" class="tisi-inline tisi-inline--on-dark" type="text" placeholder="Href" />
                  <button type="button" class="tisi-mini-x" @click="v.socialLinks.splice(i, 1)">×</button>
                </div>
                <button type="button" class="tisi-mini-add" @click="v.socialLinks.push({ label: '', short: '', href: '' })">+ Social</button>
              </template>
              <component
                v-else
                :is="navTag(s.href)"
                v-for="s in v.socialLinks"
                :key="s.label"
                class="tisi-social-link"
                v-bind="navBind(s.href)"
                :aria-label="s.label"
              >
                {{ s.short }}
              </component>
            </div>
          </div>

          <p class="tisi-footer-vertical" aria-hidden="true">STRONGER PEOPLE<br />BRIGHTER TOMORROWS</p>
        </div>

        <div class="tisi-footer-bar">
          <p class="tisi-copy">© {{ year }} {{ v.siteName }}. All rights reserved.</p>
          <div class="tisi-legal">
            <template v-if="editing">
              <div v-for="(l, i) in v.legalFooterLinks" :key="i" class="tisi-legal-edit">
                <input v-model="l.label" class="tisi-inline tisi-inline--on-dark" type="text" />
                <input v-model="l.href" class="tisi-inline tisi-inline--on-dark" type="text" />
                <button type="button" class="tisi-mini-x" @click="v.legalFooterLinks.splice(i, 1)">×</button>
              </div>
              <button type="button" class="tisi-mini-add" @click="v.legalFooterLinks.push({ label: '', href: '' })">+ Legal</button>
            </template>
            <component
              v-else
              :is="navTag(l.href)"
              v-for="l in v.legalFooterLinks"
              :key="l.href"
              v-bind="navBind(l.href)"
            >{{ l.label }}</component>
          </div>
          <router-link class="tisi-staff" to="/login">Staff login</router-link>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import api from '../../services/api';
import { landingDestination, isPlaceholderCopy, safeMarketingHref, marketingPageIssues } from '../../utils/marketingPageQuality';
import {
  TISI_LANDING_ICON_OPTIONS,
  adminFormToTisiLandingBranding,
  resolveTisiLandingConfig,
  tisiIconSvg
} from '../../constants/tisiMarketingLanding';

const props = defineProps({ previewPage: { type: Object, default: null } });
const route = useRoute();
const hubSlug = computed(() => props.previewPage?.slug || route.params.hubSlug || 'tisi');
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const loading = ref(true);
const error = ref('');
const pageMeta = ref(null);
const pageRecord = ref(null);
const mobileNavOpen = ref(false);

const editing = ref(false);
const editDraft = ref(null);
const saving = ref(false);
const uploading = ref(false);
const editError = ref('');
const editSavedFlash = ref(false);
const fileInput = ref(null);
const pendingUploadKind = ref('');
const iconOptions = TISI_LANDING_ICON_OPTIONS;

const isSuperAdmin = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return !props.previewPage && (role === 'super_admin' || role === 'superadmin');
});

const cfg = computed(() => {
  const page = props.previewPage || pageMeta.value;
  if (!page) return null;
  return resolveTisiLandingConfig({ pageMeta: page, branding: page.branding || {} });
});

/** Live view model: draft while editing, otherwise resolved config. */
const destinationContext = computed(() => ({ slug: hubSlug.value, contentPages: (props.previewPage || pageMeta.value)?.branding?.contentPages || [] }));
const v = computed(() => {
  if (editing.value && editDraft.value) return editDraft.value;
  if (!cfg.value) return null;
  const result = { ...cfg.value };
  result.testimonials = result.testimonials.filter(q => q.verified === true && q.text);
  result.primaryNav = result.primaryNav.filter(l => landingDestination(l.href, destinationContext.value));
  result.legalFooterLinks = result.legalFooterLinks.filter(l => landingDestination(l.href, destinationContext.value));
  result.socialLinks = result.socialLinks.filter(l => /^https?:\/\//i.test(safeMarketingHref(l.href)));
  for (const field of ['contactPhone', 'contactEmail', 'contactAddress']) if (isPlaceholderCopy(result[field])) result[field] = '';
  return result;
});
const heroHeading = computed(() => {
  const title = String(v.value?.heroTitle || '');
  const match = title.match(/^(.*) (Strength)$/i);
  return match ? { start: match[1], accent: match[2] } : { start: title, accent: '' };
});

const year = computed(() => new Date().getFullYear());

function iconSvg(key) {
  return tisiIconSvg(key);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isExternal(href) {
  return /^https?:\/\//i.test(String(href || ''));
}

function isHash(href) {
  return String(href || '').startsWith('#');
}

function navTag(href) {
  const h = landingDestination(href, destinationContext.value);
  if (!h) return 'span';
  return h.startsWith('/') ? 'router-link' : 'a';
}
function navBind(href) {
  const h = landingDestination(href, destinationContext.value);
  if (!h) return {};
  if (isExternal(h)) return { href: h, target: '_blank', rel: 'noopener noreferrer' };
  return h.startsWith('/') ? { to: h } : { href: h };
}

function isNavActive(href) {
  const path = String(route.path || '').replace(/\/$/, '') || '/';
  const target = String(href || '').replace(/\/$/, '') || '/';
  if (isExternal(target) || isHash(target)) return false;
  if (target === '/p/tisi') return path === '/p/tisi';
  return path === target || path.startsWith(`${target}/`);
}

function addSupportCard() {
  editDraft.value.supportCards.push({
    slug: '',
    title: 'New audience',
    body: '',
    iconKey: 'person',
    iconUrl: '',
    href: '/p/tisi'
  });
}

function addService() {
  editDraft.value.services.push({
    slug: '',
    title: 'New service',
    body: '',
    iconKey: 'chat',
    iconUrl: '',
    href: '/p/tisi/services'
  });
}

function addWhy() {
  editDraft.value.whyItems.push({ title: 'New reason', body: '', iconKey: 'shield', iconUrl: '' });
}

function addStep() {
  editDraft.value.processSteps.push({ title: 'Next step', body: '', href: '' });
}

function addQuote() {
  editDraft.value.testimonials.push({ text: '', attribution: '' });
}

async function ensurePageRecord() {
  if (pageRecord.value?.id) return pageRecord.value;
  const res = await api.get('/platform/public-marketing-pages', { skipGlobalLoading: true });
  const pages = Array.isArray(res.data?.pages) ? res.data.pages : [];
  const match = pages.find((p) => String(p.slug || '').toLowerCase() === hubSlug.value);
  if (!match) throw new Error('Could not find the tisi marketing page record to save.');
  pageRecord.value = match;
  return match;
}

function startEdit() {
  if (!cfg.value) return;
  editError.value = '';
  editSavedFlash.value = false;
  editDraft.value = deepClone(cfg.value);
  editing.value = true;
  ensurePageRecord().catch((e) => {
    editError.value = e.response?.data?.error?.message || e.message || 'Could not load page for editing.';
  });
}

function cancelEdit() {
  editing.value = false;
  editDraft.value = null;
  editError.value = '';
  pendingUploadKind.value = '';
}

function pickFile(kind) {
  if (saving.value || uploading.value) return;
  pendingUploadKind.value = kind;
  fileInput.value?.click();
}

async function onFilePicked(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  const kind = pendingUploadKind.value;
  pendingUploadKind.value = '';
  if (!f || !editDraft.value) return;
  editError.value = '';
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', f);
    const res = await api.post('/platform/public-marketing-pages/upload', fd, { skipGlobalLoading: true });
    const url = String(res.data?.url || '').trim();
    if (!url) throw new Error('Upload did not return a URL');
    if (kind === 'logo') editDraft.value.logoUrl = url;
    else if (kind === 'hero') editDraft.value.heroImageUrl = url;
    else if (kind === 'cta') editDraft.value.ctaImageUrl = url;
  } catch (err) {
    editError.value = err.response?.data?.error?.message || err.message || 'Upload failed';
  } finally { uploading.value = false; }
}

async function saveEdit() {
  if (!editDraft.value || uploading.value) return;
  const issues = marketingPageIssues(editDraft.value, destinationContext.value);
  if (issues.length) { editError.value = issues.map(i => `${i.field}: ${i.message}`).join(' '); return; }
  saving.value = true;
  editError.value = '';
  editSavedFlash.value = false;
  try {
    const record = await ensurePageRecord();
    const existing =
      record.brandingJson && typeof record.brandingJson === 'object' ? { ...record.brandingJson } : {};
    const packed = adminFormToTisiLandingBranding(editDraft.value);
    const brandingJson = {
      ...existing,
      ...packed,
      landing: { ...existing.landing, ...packed.landing },
      logoUrl: editDraft.value.logoUrl,
      primaryNav: (editDraft.value.primaryNav || [])
        .map((r) => ({ label: String(r.label || '').trim(), href: String(r.href || '').trim() }))
        .filter((r) => r.label && r.href),
      legalFooterLinks: (editDraft.value.legalFooterLinks || [])
        .map((r) => ({ label: String(r.label || '').trim(), href: String(r.href || '').trim() }))
        .filter((r) => r.label && r.href),
      whatWeOfferSection: false,
      ctaSection: false,
      processSection: false
    };
    // Keep coming-soon subpages unless the full editor changed them.
    if (Array.isArray(existing.contentPages) && existing.contentPages.length) {
      brandingJson.contentPages = existing.contentPages;
    }

    await api.put(
      `/platform/public-marketing-pages/${record.id}`,
      {
        title: editDraft.value.siteName || record.title,
        heroTitle: editDraft.value.heroTitle,
        heroSubtitle: editDraft.value.heroSubtitle,
        heroImageUrl: editDraft.value.heroImageUrl,
        brandingJson,
        pageType: 'marketing_landing'
      },
      { skipGlobalLoading: true }
    );

    editing.value = false;
    editDraft.value = null;
    pageRecord.value = null;
    await loadPage();
    editSavedFlash.value = true;
    setTimeout(() => {
      editSavedFlash.value = false;
    }, 2500);
  } catch (err) {
    editError.value = err.response?.data?.error?.message || err.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function loadPage() {
  loading.value = true;
  error.value = '';
  try {
    const [res] = await Promise.all([
      api.get(`/public/marketing-pages/${hubSlug.value}`, {
        skipGlobalLoading: true,
        skipAuthRedirect: true
      }),
      brandingStore.fetchPlatformBranding()
    ]);
    pageMeta.value = res.data?.page || null;
    if (!pageMeta.value) error.value = 'This page is not available.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load page.';
    pageMeta.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => props.previewPage, (page) => { if (page) loading.value = false; }, { immediate: true });
onMounted(() => { if (!props.previewPage) loadPage(); });
watch(() => route.params.hubSlug, () => { if (!props.previewPage) { cancelEdit(); pageRecord.value = null; loadPage(); } });
</script>

<style scoped>
.tisi-site {
  --tisi-navy: #0b1f3a;
  --tisi-navy-deep: #071628;
  --tisi-green: #2f6b3a;
  --tisi-green-hover: #25582f;
  --tisi-ink: #12233a;
  --tisi-muted: #5b6b7c;
  --tisi-line: rgba(11, 31, 58, 0.1);
  --tisi-paper: #f7f8fa;
  --tisi-font: 'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif;
  --tisi-script: 'Caveat', cursive;
  min-height: 100vh;
  background: #fff;
  color: var(--tisi-ink);
  font-family: var(--tisi-font);
  line-height: 1.5;
}
.tisi-site--editing { padding-bottom: 120px; }

.tisi-editor-bar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 80;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 10px 16px;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 14px;
  box-shadow: 0 16px 40px -18px rgba(15, 23, 42, 0.65);
}
.tisi-editor-bar--active { background: #14532d; }
.tisi-ed-hint {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tisi-ed-btn {
  border: 1px solid rgba(248, 250, 252, 0.35);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}
.tisi-ed-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.tisi-ed-btn--primary { background: #fff; color: #0f172a; border-color: #fff; }
.tisi-editor-bar--active .tisi-ed-btn--primary {
  background: #bbf7d0;
  color: #14532d;
  border-color: #bbf7d0;
}
.tisi-ed-link {
  color: #cbd5e1;
  font-size: 0.82rem;
  font-weight: 600;
  margin-left: auto;
  text-decoration: none;
}
.tisi-ed-error { flex-basis: 100%; margin: 0; color: #fecaca; font-size: 0.82rem; }
.tisi-ed-ok { flex-basis: 100%; margin: 0; color: #bbf7d0; font-size: 0.82rem; }
.tisi-file-hidden {
  position: fixed;
  width: 0.01px;
  height: 0.01px;
  opacity: 0;
  pointer-events: none;
}

.tisi-fatal { padding: 48px 20px; text-align: center; color: #991b1b; }
.tisi-muted { color: #64748b; }

.tisi-inline {
  width: 100%;
  box-sizing: border-box;
  border: 1px dashed rgba(47, 107, 58, 0.55);
  border-radius: 8px;
  padding: 6px 8px;
  font: inherit;
  background: rgba(255, 255, 255, 0.92);
  color: inherit;
  margin-bottom: 6px;
}
.tisi-inline:focus {
  outline: 2px solid rgba(47, 107, 58, 0.45);
  border-style: solid;
}
.tisi-inline--on-dark {
  background: rgba(7, 22, 40, 0.55);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.45);
}
.tisi-inline--name {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.tisi-inline--tag { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; }
.tisi-inline--nav { min-width: 88px; max-width: 140px; width: auto; font-size: 13px; font-weight: 600; }
.tisi-inline--href { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.tisi-inline--h2 { font-size: 1.4rem; font-weight: 800; }
.tisi-inline--hero-title { font-size: clamp(1.6rem, 4vw, 2.6rem); font-weight: 800; line-height: 1.1; }
.tisi-inline--area { resize: vertical; line-height: 1.45; }
.tisi-inline--script { font-family: var(--tisi-script); font-size: 1.4rem; max-width: 280px; }
.tisi-inline--center { text-align: center; display: block; margin-left: auto; margin-right: auto; max-width: 32rem; }

.tisi-mini-x,
.tisi-mini-add {
  border: 1px solid rgba(11, 31, 58, 0.2);
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: var(--tisi-navy);
}
.tisi-mini-add--card { margin-top: 8px; }
.tisi-card--editing { border-style: dashed !important; }

.tisi-header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--tisi-line);
}
.tisi-header-inner {
  max-width: 1160px;
  margin: 0 auto;
  padding: 14px 20px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
}
.tisi-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tisi-brand-link { display: flex; text-decoration: none; }
.tisi-brand-mark-btn {
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.tisi-brand-mark { width: 44px; height: 44px; object-fit: contain; display: block; }
.tisi-brand-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.tisi-brand-name {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--tisi-navy);
  line-height: 1.15;
}
.tisi-brand-tag {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tisi-muted);
}

.tisi-nav { display: flex; justify-content: center; gap: 4px 18px; flex-wrap: wrap; align-items: center; }
.tisi-nav-edit { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.tisi-nav-link {
  color: var(--tisi-ink);
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  padding: 6px 2px;
  border-bottom: 2px solid transparent;
}
.tisi-nav-link--active { color: var(--tisi-green); border-bottom-color: var(--tisi-green); }
.tisi-nav-toggle {
  display: none;
  width: 42px;
  height: 42px;
  border: 1px solid var(--tisi-line);
  border-radius: 10px;
  background: #fff;
  padding: 10px;
  flex-direction: column;
  justify-content: space-between;
}
.tisi-nav-toggle span { display: block; height: 2px; background: var(--tisi-navy); border-radius: 2px; }

.tisi-header-cta-edit { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }

.tisi-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 14px;
  text-decoration: none;
  padding: 11px 18px;
}
.tisi-btn--primary { background: var(--tisi-green); color: #fff; border: 1px solid var(--tisi-green); }
.tisi-btn--primary:hover { background: var(--tisi-green-hover); }
.tisi-btn--ghost {
  background: transparent;
  color: #fff;
  border: 1.5px solid rgba(255, 255, 255, 0.85);
}
.tisi-btn--lg { padding: 14px 24px; font-size: 15px; }
.tisi-header-cta { white-space: nowrap; }

.tisi-hero {
  position: relative;
  min-height: min(78vh, 720px);
  background-size: cover;
  background-position: center 30%;
  color: #fff;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}
.tisi-hero-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(7, 22, 40, 0.82) 0%, rgba(7, 22, 40, 0.55) 42%, rgba(7, 22, 40, 0.2) 100%),
    linear-gradient(180deg, rgba(7, 22, 40, 0.15) 0%, rgba(7, 22, 40, 0.55) 100%);
}
.tisi-photo-fab {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.92);
  color: var(--tisi-navy);
}
.tisi-hero-inner {
  position: relative;
  z-index: 1;
  max-width: 1160px;
  width: 100%;
  margin: 0 auto;
  padding: 72px 20px 56px;
}
.tisi-hero-eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.92;
}
.tisi-hero-title {
  margin: 0 0 14px;
  font-size: clamp(2.4rem, 5vw, 3.75rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
  max-width: 12ch;
}
.tisi-hero-sub {
  margin: 0 0 24px;
  max-width: 34rem;
  font-size: 1.05rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.92);
}
.tisi-hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 28px; }
.tisi-hero-actions--edit { flex-direction: column; max-width: 28rem; }
.tisi-hero-pillars {
  margin: 0;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(7, 22, 40, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.18);
}
.tisi-hero-script {
  position: absolute;
  right: max(24px, calc((100% - 1160px) / 2));
  bottom: 18%;
  z-index: 1;
  margin: 0;
  font-family: var(--tisi-script);
  font-size: clamp(1.8rem, 3.5vw, 2.8rem);
  line-height: 1.15;
  white-space: pre-line;
  text-align: right;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.tisi-section { padding: 72px 20px; }
.tisi-section-inner { max-width: 1160px; margin: 0 auto; }
.tisi-kicker {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--tisi-green);
}
.tisi-kicker--center,
.tisi-h2--center { text-align: center; }
.tisi-h2 {
  margin: 0 0 12px;
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--tisi-navy);
}
.tisi-h2--light { color: #fff; text-align: center; margin-bottom: 36px; }
.tisi-lead { margin: 0; color: var(--tisi-muted); max-width: 28rem; font-size: 1.02rem; }

.tisi-support-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr);
  gap: 36px;
  align-items: start;
}
.tisi-card-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.tisi-audience-card,
.tisi-service-card {
  background: #fff;
  border: 1px solid var(--tisi-line);
  border-radius: 16px;
  padding: 20px 18px;
}
.tisi-card-hit {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-decoration: none;
  color: inherit;
  height: 100%;
}
.tisi-audience-ico,
.tisi-service-ico,
.tisi-why-ico {
  width: 36px;
  height: 36px;
  color: var(--tisi-navy);
  display: block;
}
.tisi-audience-ico img,
.tisi-service-ico img,
.tisi-why-ico img { width: 100%; height: 100%; object-fit: contain; }
.tisi-audience-ico :deep(svg),
.tisi-service-ico :deep(svg),
.tisi-why-ico :deep(svg) { width: 100%; height: 100%; }
.tisi-audience-title,
.tisi-service-title,
.tisi-why-title,
.tisi-step-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--tisi-navy);
}
.tisi-audience-body,
.tisi-service-body,
.tisi-why-body,
.tisi-step-body { margin: 0; color: var(--tisi-muted); font-size: 0.95rem; }
.tisi-arrow,
.tisi-inline-arrow,
.tisi-service-go { color: var(--tisi-green); font-weight: 700; text-decoration: none; }

.tisi-section-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  margin-bottom: 24px;
}
.tisi-section-head-edit { display: flex; flex-direction: column; gap: 4px; min-width: 200px; }
.tisi-text-link { color: var(--tisi-green); font-weight: 700; text-decoration: none; white-space: nowrap; }

.tisi-services { background: var(--tisi-paper); }
.tisi-services-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.tisi-service-card { position: relative; min-height: 150px; }
.tisi-service-go { position: absolute; right: 16px; bottom: 16px; }

.tisi-why { background: var(--tisi-navy); padding: 72px 20px; color: #fff; }
.tisi-why-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 22px;
}
.tisi-why-ico { color: #9fd0a8; margin-bottom: 8px; }
.tisi-why-title { color: #fff; margin: 0 0 8px; }
.tisi-why-body { color: rgba(255, 255, 255, 0.78); }

.tisi-steps {
  list-style: none;
  margin: 36px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
.tisi-step { display: flex; gap: 14px; align-items: flex-start; padding: 8px; }
.tisi-step-num {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(47, 107, 58, 0.12);
  color: var(--tisi-green);
  font-weight: 800;
}
.tisi-step-body-wrap { flex: 1; min-width: 0; }

.tisi-quotes { background: var(--tisi-paper); }
.tisi-quotes-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 28px;
}
.tisi-quote {
  margin: 0;
  background: #fff;
  border: 1px solid var(--tisi-line);
  border-radius: 16px;
  padding: 24px 22px;
}
.tisi-quote-text {
  margin: 0 0 14px;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.05rem;
  line-height: 1.55;
}
.tisi-quote-stars { margin: 0 0 8px; color: var(--tisi-green); letter-spacing: 2px; font-size: 14px; }
.tisi-quote-attr { color: var(--tisi-muted); font-size: 0.92rem; font-weight: 600; }

.tisi-cta {
  position: relative;
  min-height: 360px;
  background-size: cover;
  background-position: center;
  color: #fff;
  display: grid;
  place-items: center;
  text-align: center;
}
.tisi-cta-scrim { position: absolute; inset: 0; background: rgba(7, 22, 40, 0.62); }
.tisi-cta-inner { position: relative; z-index: 1; padding: 64px 20px; max-width: 640px; width: 100%; }
.tisi-cta-title { margin: 0 0 12px; font-size: clamp(1.8rem, 3vw, 2.4rem); font-weight: 800; }
.tisi-cta-sub { margin: 0 0 22px; color: rgba(255, 255, 255, 0.9); }
.tisi-cta-note { margin: 14px 0 0; font-size: 0.92rem; opacity: 0.85; }

.tisi-footer {
  background: var(--tisi-navy-deep);
  color: rgba(255, 255, 255, 0.88);
  padding: 56px 20px 24px;
}
.tisi-footer-inner {
  max-width: 1160px;
  margin: 0 auto 28px;
  display: grid;
  grid-template-columns: 1.3fr 1fr 1.2fr auto;
  gap: 28px;
}
.tisi-footer-mark {
  width: 48px;
  height: 48px;
  object-fit: contain;
  filter: brightness(0) invert(1);
  margin-bottom: 10px;
}
.tisi-footer-name {
  margin: 0 0 4px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 13px;
}
.tisi-footer-tag { margin: 0; font-size: 12px; opacity: 0.75; }
.tisi-footer-heading {
  margin: 0 0 12px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}
.tisi-footer-col { display: flex; flex-direction: column; gap: 8px; }
.tisi-footer-link,
.tisi-legal a,
.tisi-staff {
  color: rgba(255, 255, 255, 0.88);
  text-decoration: none;
  font-size: 0.95rem;
}
.tisi-footer-meta { margin: 0; font-size: 0.95rem; color: rgba(255, 255, 255, 0.75); }
.tisi-social { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.tisi-social-edit { display: flex; flex-wrap: wrap; gap: 4px; width: 100%; }
.tisi-social-link {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  display: grid;
  place-items: center;
  color: #fff;
  text-decoration: none;
  font-size: 11px;
  font-weight: 700;
}
.tisi-footer-vertical {
  margin: 0;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  letter-spacing: 0.18em;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.35);
}
.tisi-footer-bar {
  max-width: 1160px;
  margin: 0 auto;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
}
.tisi-copy { margin: 0; opacity: 0.7; }
.tisi-legal { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
.tisi-legal-edit { display: flex; gap: 4px; flex-wrap: wrap; }

/* Match the reference's compact horizontal bands; keep content-driven heights. */
.tisi-site { --tisi-navy: #12364b; --tisi-navy-deep: #0b2636; --tisi-ink: #112433; --tisi-paper: #f5f9fb; }
.tisi-site :is(a, button, input, textarea, select):focus-visible { outline: 3px solid #72bce6; outline-offset: 4px; }
.tisi-site :is(section, footer, main)[id] { scroll-margin-top: 110px; }
.tisi-site :is(p, h1, h2, h3, span, a) { overflow-wrap: anywhere; }
.tisi-skip { position: fixed; top: -100px; left: 20px; z-index: 100; padding: 12px; background: white; color: #12364b; }
.tisi-skip:focus { top: 10px; }
.tisi-header-inner, .tisi-section-inner, .tisi-hero-inner, .tisi-footer-inner, .tisi-footer-bar { max-width: 1260px; }
.tisi-header-inner { min-height: 94px; box-sizing: border-box; }
.tisi-brand-mark { width: 72px; height: 72px; }
.tisi-brand-name { max-width: 255px; font-size: 20px; letter-spacing: .16em; text-align: center; }
.tisi-brand-tag { font-size: 8px; margin-top: 5px; }
.tisi-btn { border-radius: 5px; padding: 11px 28px; min-height: 44px; box-sizing: border-box; }
.tisi-btn--primary { background: linear-gradient(130deg, #3e8548, #245d3d); box-shadow: inset 0 1px 2px #ffffff55, 0 3px 12px #12364b18; }
.tisi-hero { min-height: 395px; align-items: center; background-color: #12364b; background-position: var(--hero-position, 50% 35%); }
.tisi-hero-inner { padding: 32px 20px 18px; box-sizing: border-box; }
.tisi-hero-title { color: #fff; font-size: clamp(42px, 5vw, 68px); max-width: 10ch; margin-bottom: 16px; }
.tisi-hero-title span { display: block; color: #86d1f2; }
.tisi-hero-title::after { content: ''; display: block; width: 66px; height: 4px; background: #9bd487; margin-top: 12px; }
.tisi-hero-sub { max-width: 410px; font-size: 19px; line-height: 1.3; margin-bottom: 18px; }
.tisi-hero-eyebrow { font-size: 10px; letter-spacing: .2em; }
.tisi-hero-actions { margin-bottom: 12px; }
.tisi-hero-pillars { border: 0; background: transparent; padding: 0; font-size: 10px; letter-spacing: .23em; }
.tisi-hero-script { max-width: 155px; font-size: 30px; bottom: 20%; }
.tisi-section { padding: 24px 24px; }
.tisi-h2 { line-height: 1.1; margin-bottom: 10px; }
.tisi-kicker { color: #4b5c6d; font-size: 10px; letter-spacing: .14em; }
.tisi-support { background: #f5f9fb; }
.tisi-support-grid { grid-template-columns: minmax(0, .9fr) minmax(0, 2fr); gap: 24px; align-items: center; }
.tisi-lead { font-size: 15px; line-height: 1.4; }
.tisi-audience-card, .tisi-service-card { border-radius: 6px; padding: 16px 18px; box-shadow: 0 3px 18px #153d5c08; }
.tisi-audience-card:has(a:hover), .tisi-service-card:has(a:hover) { border-color: #2f6b3a; box-shadow: 0 6px 20px #153d5c18; }
.tisi-card-hit { gap: 5px; }
.tisi-card-hit:focus-visible { outline-offset: 8px; }
.tisi-audience-ico, .tisi-service-ico { width: 43px; height: 43px; margin-bottom: 5px; }
.tisi-audience-body, .tisi-service-body { font-size: 14px; line-height: 1.35; }
.tisi-services { background: #fff; }
.tisi-services-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.tisi-service-title { font-size: 15px; line-height: 1.25; }
.tisi-service-card { min-height: 165px; padding-bottom: 30px; }
.tisi-section-head { margin-bottom: 12px; }
.tisi-why { padding: 32px 24px; background: linear-gradient(110deg, #0b293c, #1c4158); }
.tisi-why > .tisi-section-inner { display: grid; grid-template-columns: .9fr 2fr; gap: 24px; align-items: center; }
.tisi-h2--light { text-align: left; font-size: 29px; margin: 0; }
.tisi-why-grid { gap: 0; }
.tisi-why-item { text-align: center; padding: 0 18px; border-left: 1px solid #ffffff20; }
.tisi-why-ico { margin: 0 auto 8px; color: #a4d887; }
.tisi-why-title { font-size: 14px; margin-bottom: 5px; }
.tisi-why-body { font-size: 13px; line-height: 1.35; }
#how-it-works { background: #f5f9fb; }
#how-it-works > .tisi-section-inner { display: grid; grid-template-columns: .7fr 2fr; column-gap: 24px; align-items: center; }
#how-it-works .tisi-kicker { grid-column: 1; text-align: left; align-self: end; }
#how-it-works .tisi-h2 { grid-column: 1; text-align: left; align-self: start; }
.tisi-steps { grid-column: 2; grid-row: 1 / 3; margin: 0; gap: 16px; }
.tisi-step { border-left: 1px solid #12364b15; }
.tisi-step-num { background: #e2eef5; color: #12364b; width: 42px; height: 42px; }
.tisi-step-title { margin: 0 0 4px; }
.tisi-step-body { font-size: 13px; }
.tisi-quotes > .tisi-section-inner { display: grid; grid-template-columns: .7fr 2fr; gap: 24px; }
.tisi-quotes .tisi-h2 { text-align: left; font-size: 28px; }
.tisi-quotes-grid { margin: 0; }
.tisi-quote { border-radius: 6px; padding: 16px; }
.tisi-quote-text { font: inherit; font-size: 14px; }
.tisi-cta { min-height: 130px; text-align: left; background-color: #12364b; }
.tisi-cta-inner { max-width: 1260px; padding: 24px 20px; box-sizing: border-box; display: grid; grid-template-columns: 1fr auto; column-gap: 35px; }
.tisi-cta-title { color: #fff; font-size: 32px; margin: 0 0 5px; grid-column: 1; }
.tisi-cta-sub { grid-column: 1; margin: 0; }
.tisi-cta .tisi-btn { grid-column: 2; grid-row: 1; }
.tisi-cta-note { grid-column: 2; grid-row: 2; text-align: center; font-size: 12px; margin: 6px 0 0; }
.tisi-footer { padding: 28px 24px 20px; }
.tisi-footer-inner { grid-template-columns: 1.2fr .8fr 1.5fr .6fr; }
.tisi-footer-col { border-left: 1px solid #ffffff15; padding-left: 30px; gap: 3px; }
.tisi-footer-brand { text-align: center; }
.tisi-footer-heading { color: #d1dfe8; text-transform: none; letter-spacing: 0; margin-bottom: 8px; }
.tisi-footer-link, .tisi-footer-meta, .tisi-legal a, .tisi-staff { font-size: 13px; }
.tisi-footer-link:hover, .tisi-legal a:hover { text-decoration: underline; }
.tisi-footer-vertical { writing-mode: horizontal-tb; transform: none; max-width: 140px; line-height: 2; letter-spacing: .3em; align-self: center; }
@media (max-width: 1100px) {
  .tisi-brand-name { font-size: 15px; max-width: 200px; }
  .tisi-brand-mark { width: 54px; height: 54px; }
  .tisi-nav { gap: 10px; }
  .tisi-btn { padding-inline: 18px; }
  .tisi-services-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tisi-why > .tisi-section-inner { grid-template-columns: 1fr; }
}
@media (max-width: 800px) {
  .tisi-header-inner { grid-template-columns: 1fr auto; min-height: 80px; padding: 10px 20px; }
  .tisi-nav-toggle { display: flex; }
  .tisi-header-cta, .tisi-header-cta-edit { display: none; }
  .tisi-nav { display: none; grid-column: 1 / -1; flex-direction: column; align-items: stretch; padding: 8px 0; }
  .tisi-nav--open { display: flex; }
  .tisi-nav-link { padding: 12px; }
  .tisi-hero { background-position: var(--hero-mobile-position, 65% 35%); }
  .tisi-hero-scrim { background: linear-gradient(90deg, #071e30ee, #071e3077); }
  .tisi-hero-inner { padding: 40px 24px 30px; }
  .tisi-hero-sub { max-width: 370px; font-size: 17px; }
  .tisi-hero-script, .tisi-footer-vertical { display: none; }
  .tisi-support-grid { grid-template-columns: 1fr; }
  .tisi-why-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 0; }
  #how-it-works > .tisi-section-inner, .tisi-quotes > .tisi-section-inner { display: block; }
  .tisi-steps { margin-top: 20px; }
  .tisi-footer-inner { grid-template-columns: 1fr 1fr; }
  .tisi-footer-col { padding-left: 15px; }
  .tisi-cta-inner { display: block; padding: 28px 24px; }
  .tisi-cta-sub { margin-bottom: 18px; }
  .tisi-cta-note { text-align: left; }
}
@media (max-width: 540px) {
  .tisi-section { padding: 28px 20px; }
  .tisi-card-row, .tisi-services-grid { grid-template-columns: 1fr; }
  .tisi-service-card { min-height: 0; }
  .tisi-audience-card .tisi-card-hit, .tisi-service-card .tisi-card-hit { display: grid; grid-template-columns: 46px 1fr; column-gap: 14px; }
  .tisi-audience-ico, .tisi-service-ico { grid-row: 1 / 3; }
  .tisi-audience-body, .tisi-service-body { grid-column: 2; }
  .tisi-steps, .tisi-quotes-grid, .tisi-footer-inner { grid-template-columns: 1fr; }
  .tisi-footer-col { border-left: 0; padding-left: 0; }
  .tisi-section-head { align-items: start; flex-direction: column; }
  .tisi-brand-tag { font-size: 7px; letter-spacing: .025em; }
  .tisi-brand-name { font-size: 14px; }
}
</style>
