<template>
  <div class="qv" :class="{ 'qv-signed-in': session, 'qv-mobile':isMobile, 'qv-mobile-messages':isMobile && ['home','thread','chat'].includes(tab) }" :style="brandStyle" @click.capture="handleMobileLink" @keydown.esc="closeMore" @keydown.tab="trapDialogFocus">
    <a v-if="session" class="qv-skip" href="#qv-workspace">Skip to workspace</a>
    <header class="qv-top">
      <button v-if="session" class="qv-brand-row qv-brand-menu" type="button" aria-label="All workspace options" :aria-expanded="moreOpen" aria-controls="qv-more-tools" @click="navigateTo('more')"><AuricWellBrand :context="agencyName || 'Quick View'" /></button><div v-else class="qv-brand-row"><AuricWellBrand :context="agencyName || 'Quick View'" /></div>
      <div class="qv-organization">
        <img v-if="agencyLogoUrl" :src="agencyLogoUrl" alt="" class="qv-logo" />
        <span>{{ agencyName || 'Your workspace' }}</span>
      </div>
      <div v-if="session" class="qv-top-actions"><button v-if="isMobile" type="button" class="qv-icon-button" aria-label="Notifications" @click="emit('notifications')"><Bell :size="18"/><span v-if="notificationUnread>0" class="qv-notification-dot" aria-label="Unread notifications"/></button><button v-if="isMobile" type="button" class="qv-icon-button" aria-label="My Account" @click="emit('account')"><UserRound :size="18"/></button>
        <span class="qv-session-status"><span aria-hidden="true" />{{ isMobile && mobileSession.profile?.appLock?.method==='none'?'Refreshes at':'Locks at' }} {{ formatExpiry(expiresAt) }}</span>
        <button type="button" class="qv-icon-button qv-extend" :disabled="extendBusy" aria-label="Extend session by 10 minutes" @click="extendSession">
          <Clock3 :size="17" aria-hidden="true" /><span>{{ extendBusy ? 'Extending…' : '+10 min' }}</span><small v-if="isMobile" class="qv-countdown">{{ mobileSession.profile?.appLock?.method==='none'?'Refresh':'Lock' }} {{ lockCountdown }}</small>
        </button>
        <button type="button" class="qv-icon-button" :aria-label="isMobile && mobileSession.profile?.appLock?.method==='none'?'Hide workspace':'Lock Quick View'" @click="logout"><LockKeyhole :size="18" aria-hidden="true" /><span class="qv-lock-label">{{ isMobile && mobileSession.profile?.appLock?.method==='none'?'Hide':'Lock' }}</span></button>
      </div>
    </header>

    <nav v-if="session" class="qv-tabs" aria-label="Primary navigation">
      <span class="qv-nav-caption">WORKSPACE</span>
      <button v-for="item in primaryNavigation" :key="item.id" type="button" :class="{ on: activeDestination === item.id, 'qv-fixed-shortcut':isMobile && item.id===(workspacePreferences.lockedNavigation || 'calendar') }" :aria-current="activeDestination === item.id ? 'page' : undefined" :aria-expanded="item.id === 'more' ? moreOpen : undefined" :aria-controls="item.id === 'more' ? 'qv-more-tools' : undefined" @click="navigateTo(item.id)">
        <component :is="item.icon" :size="21" :stroke-width="1.8" aria-hidden="true" /><span>{{ item.label }}</span><span v-if="isMobile && ['home','mywork','tasks'].includes(item.id) && navigationBadge(item.id)!==0" class="qv-nav-badge" :aria-label="navigationBadge(item.id)==null ? item.label+' count loading' : undefined">{{ navigationBadge(item.id) ?? '…' }}</span>
      </button>
      <div class="qv-nav-footer">
        <div class="qv-nav-note"><LockKeyhole :size="16" aria-hidden="true" /><span>Your workspace locks<br />when you're away.</span></div>
        <a v-if="loginUrl" :href="loginUrl" class="qv-workspace-link">Open full workspace<ArrowUpRight :size="16" aria-hidden="true" /></a>
      </div>
    </nav>

    <main id="qv-workspace" class="qv-workspace" tabindex="-1">
    <div v-if="homeScreenTip && showBrowserInstallTip && !session" class="qv-homescreen">
      <strong>Your workspace, one tap away</strong>
      <p>
        In Safari, tap Share, then Add to Home Screen. Keep Open as Web App on to return directly to Quick View.
      </p>
      <button type="button" class="qv-btn ghost sm" @click="dismissHomeTip">Got it</button>
    </div>

    <div v-if="error" class="qv-err" role="alert">
      <span>{{ error }}</span>
      <button v-if="session" type="button" class="qv-btn ghost sm" @click="retryCurrentView">Try again</button>
    </div>
    <div v-if="loading && !session" class="qv-loading" role="status"><span class="qv-spinner" aria-hidden="true" />Opening your workspace…</div>

    <section v-else-if="!session && !loading" class="qv-gate">
      <div class="qv-gate-icon"><LockKeyhole :size="25" aria-hidden="true" /></div>
      <p class="qv-eyebrow">{{ agencyName || 'AuricWell Quick View' }}</p>
      <h1>{{ isLocked ? 'Let’s get you back in.' : 'Welcome back.' }}</h1>
      <template v-if="isLocked">
        <p>Quick View is locked after 3 incorrect passcode attempts.</p>
        <p class="qv-hint">
          Sign in to the portal and reset your 6-digit passcode under My Dashboard → Settings → Privacy &amp; Quick View.
        </p>
        <a v-if="loginUrl" class="qv-btn primary" :href="loginUrl">Sign in to reset</a>
      </template>
      <template v-else>
        <p v-if="tokenInfo">{{ tokenInfo.firstName ? `${tokenInfo.firstName}, enter` : 'Enter' }} your 6-digit passcode to open your workspace.</p>
        <a v-else class="qv-btn primary" href="/qv">Continue to sign in</a>
        <form v-if="tokenInfo" class="qv-form" autocomplete="on" @submit.prevent="unlock">
          <label>Account email <span class="qv-field-hint">Optional · helps your password manager find your sign-in</span><input v-model="credentialEmail" name="username" type="email" autocomplete="username" placeholder="you@yourpractice.com" /></label>
          <label for="quick-view-passcode">Quick View passcode</label>
          <input
            v-model="passcode"
            class="qv-pin"
            type="password"
            inputmode="numeric"
            maxlength="6"
            pattern="\d{6}"
            id="quick-view-passcode"
            name="password"
            autocomplete="current-password"
            placeholder="••••••"
            aria-label="6-digit Quick View passcode"
          />
          <button type="submit" class="qv-btn primary" :disabled="unlocking || passcode.length !== 6">
            {{ unlocking ? 'Opening your workspace…' : 'Open workspace' }}<ChevronRight v-if="!unlocking" :size="18" aria-hidden="true" />
          </button>
        </form>
        <p class="qv-hint">
          Passcodes are never emailed. Reset yours from My Dashboard → Settings → Privacy &amp; Quick View.
        </p>
      </template>
      <a v-if="loginUrl" class="qv-gate-link" :href="loginUrl">Open full workspace<ArrowUpRight :size="15" aria-hidden="true" /></a>
    </section>

    <template v-if="session">
      <div v-if="!isMobile || !['home','thread','chat','clinical','client','session'].includes(tab)" class="qv-page-heading" :class="{'qv-work-heading':isMobile && tab==='mywork'}">
        <div><p class="qv-eyebrow">{{ workspaceDate }}</p><h1>{{ currentHeading.title }}</h1><p class="qv-page-description">{{ currentHeading.description }}</p></div>
        <span class="qv-workspace-tag">QUICK VIEW</span>
      </div>
      <div v-if="sendNotice" class="qv-notice" role="status">{{ sendNotice }} <button v-if="undoSend" type="button" class="qv-btn ghost sm" @click="undoEmail">Undo send</button></div>
      <div v-if="remainingSeconds<=120 && (!isMobile || mobileSession.profile?.appLock?.method!=='none')" class="qv-lock-warning" role="status"><Clock3 :size="18" aria-hidden="true" /><span>Quick View locks in {{ remainingSeconds }} seconds.</span><button class="qv-btn primary sm" :disabled="extendBusy" @click="extendSession">Keep me signed in</button></div>
      <section id="qv-more-tools" v-show="moreOpen" class="qv-more-panel" role="region" aria-label="More tools">
        <div class="qv-tool-grid">
          <button v-for="item in secondaryNavigation" :key="item.id" type="button" class="qv-tool-card" :aria-label="item.label" @click="navigateTo(item.id)"><span class="qv-tool-icon"><component :is="item.icon" :size="23" aria-hidden="true" /></span><span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span><ChevronRight :size="18" aria-hidden="true" /></button>
        </div>
        <button v-if="isMobile" type="button" class="qv-btn ghost" @click="showMobileSettings=true">Mobile layout &amp; swipe settings</button><button v-if="isMobile" type="button" class="qv-btn ghost" @click="emit('account')">My Account</button><div class="qv-more-account"><div><h2>Workspace access</h2><p>Manage your session or continue in the full workspace.</p></div><div class="qv-more-actions"><a v-if="loginUrl" class="qv-btn ghost" :href="loginUrl">Full workspace<ArrowUpRight :size="16" aria-hidden="true" /></a><button type="button" class="qv-btn ghost" @click="logout"><LockKeyhole :size="16" aria-hidden="true" />Lock Quick View</button></div></div>
        <QuickViewMusicDock inline :scoped-playback="isMobile" :api-base="apiBase" :auth-headers="authHeaders" :visible="!!session" />
      </section>
      <div v-show="!moreOpen" class="qv-content" :aria-busy="navigationBusy || undefined">
      <QuickViewPresence v-if="tab==='presence'" :http="presenceHttp" />
      <MobileMessages v-if="isMobile" v-show="tab==='home' || tab==='chat'" ref="mobileMessages" :api-base="apiBase" :session-token="session" :user-id="sessionUserId" :visible="!overlayOpen && !moreOpen && (tab==='home' || tab==='chat')" :preferences="workspacePreferences" @open-email="openMobileConversation" @access-denied="clearCachedEmailAccess" @compose-email="openMobileEmailDraft" @counts="mobileCounts=$event" @settings="showMobileSettings=true"/>
      <MobilePreferences v-if="isMobile && showMobileSettings" :api-base="apiBase" :session-token="session" :preferences="workspacePreferences" @close="showMobileSettings=false" @saved="workspacePreferences=$event"/>
      <MobileClients v-if="isMobile && clientsVisited" v-show="tab==='clients'" :visible="tab==='clients' && !overlayOpen && !moreOpen" :api-base="apiBase" :session-token="session" @open="openMobileClient" @open-main="emit('open-main',$event)" />
      <MobileCalendar v-if="isMobile && calendarVisited" v-show="tab==='calendar'" :visible="tab==='calendar' && !overlayOpen && !moreOpen" :api-base="apiBase" :session-token="session" :user-id="sessionUserId" :agency-id="sessionAgencyId" @open="openMobileCalendarItem" @message="provider=>messageUser(provider.id || provider.providerId || provider,provider.name)" @open-full="emit('open-main',$event)" />
      <MobileClinicalWorkspace v-if="isMobile && tab==='clinical'" :api-base="apiBase" :session-token="session" :user-id="sessionUserId" @signed="sendNotice='Note signed and saved to the chart.'" />
      <MobileClientSummary v-if="isMobile && tab==='client'" :api-base="apiBase" :session-token="session" :client-id="route.query.clientId" :agency-id="route.query.agencyId || sessionAgencyId" @open-main="emit('open-main',$event)" @back="returnInApp({view:'clients'})" @contact="openMobileClinicalContact" />
      <MobileClinicalSession v-if="isMobile && tab==='session'" :api-base="apiBase" :session-token="session" />
      <MobileMyWork v-if="isMobile && myWorkVisited" v-show="tab==='mywork'" :visible="tab==='mywork' && !overlayOpen && !moreOpen" :api-base="apiBase" :session-token="session" @draft="prepareWorkDraft" @tasks="navigateTo('tasks')" @counts="workspaceBadges={...workspaceBadges,...$event}"/>
      <div v-if="!isMobile && tab === 'home'" class="qv-pane conversa-surface">
        <div class="qv-messages-heading"><ConversaBrand compact /><span>YOUR CONVERSATIONS</span></div>
        <div class="qv-suite">
          <a class="qv-btn ghost sm" :href="secureMessagesUrl">Secure messages ↗</a>
          <button type="button" :class="{ on: msgSuite === 'email' }" @click="switchMsgSuite('email')">Email</button>
          <button type="button" :class="{ on: msgSuite === 'direct' }" @click="switchMsgSuite('direct')">Direct</button>
          <button type="button" :class="{ on: msgSuite === 'channels' }" @click="switchMsgSuite('channels')">Channels</button>
          <button type="button" :class="{ on: msgSuite === 'threads' }" @click="switchMsgSuite('threads')">Threads</button>
          <button type="button" :class="{ on: msgSuite === 'mentions' }" @click="switchMsgSuite('mentions')">Mentions</button>
          <button type="button" :class="{ on: msgSuite === 'files' }" @click="switchMsgSuite('files')">Files</button>
          <button type="button" :class="{ on: msgSuite === 'sms' }" @click="switchMsgSuite('sms')">SMS</button>
        </div>

        <template v-if="msgSuite === 'email' || msgSuite === 'sms'">
          <div class="qv-toolbar">
            <div class="qv-sorters">
              <button type="button" :class="{ on: sort === 'all' }" @click="changeEmailFolder('all')">All</button>
              <button type="button" :class="{ on: sort === 'unread' }" @click="changeEmailFolder('unread')">Unread</button>

            </div>
            <button type="button" class="qv-btn ghost sm" @click="loadHome(msgSuite)"><RefreshCw :size="14" aria-hidden="true" />Refresh</button>
            <button v-if="msgSuite === 'email'" type="button" class="qv-btn ghost sm" :aria-pressed="sort === 'unknown'" @click="changeEmailFolder('unknown')">Unknown senders</button>
            <button v-if="msgSuite === 'email'" type="button" class="qv-btn ghost sm" :aria-pressed="sort === 'drafts'" @click="changeEmailFolder('drafts')">Drafts</button>
            <button v-if="msgSuite === 'email'" type="button" class="qv-btn primary sm" @click="openDetachedEmail('new')">New email</button>
          </div>
          <p v-if="msgSuite === 'email' && mailboxEmail" class="qv-pad muted">{{ mailboxEmail }}</p>
          <p v-if="msgSuite === 'sms'" class="qv-pad muted">Texts use your assigned care number. Existing phone conversations appear here; availability depends on your organization’s texting setup.</p>
          <p v-if="msgLoading" class="qv-pad muted" role="status">Loading conversations…</p>
          <button
            v-for="c in filteredConversations"
            :key="c.id"
            type="button"
            class="qv-row"
            :class="{ unread: c.is_unread }" :title="`${c.subject || ''}\n\n${emailPreviewText(c.last_message_preview || '')}`"
            @mouseenter="previewQuickEmail(c, $event)" @mouseleave="hideQuickPreview" @focus="previewQuickEmail(c, $event)" @blur="hideQuickPreview"
            @click="openConversation(c)"
          >
            <span class="ch"><component :is="channelIcon(c.channel)" :size="19" :stroke-width="1.6" aria-hidden="true" /></span>
            <div class="meta">
              <strong>{{ c.subject || '(no subject)' }}</strong>
              <small>{{ emailPreviewText(c.last_message_preview || '') }}</small><small>{{ formatTime(c.last_message_at) }}</small>
            </div>
            <span v-if="c.has_auto_reply" class="badge">Auto</span>
          </button>
          <div v-if="!msgLoading && !error && !filteredConversations.length" class="qv-pad muted">
            {{ sort === 'unread' ? 'You’re caught up — no unread conversations.' : (msgSuite === 'sms' ? 'No text conversations yet.' : 'No conversations match this view.') }}
          </div>
        </template>

        <template v-else-if="msgSuite === 'direct' || msgSuite === 'channels'">
          <div class="qv-toolbar">
            <div class="qv-pad muted" style="padding:8px 0;margin:0;">
              {{ msgSuite === 'direct' ? 'Direct messages' : 'Team channels' }}
            </div>
          </div>
          <button
            v-for="t in chatList"
            :key="t.thread_id || t.id"
            type="button"
            class="qv-row"
            :class="{ unread: Number(t.unread_count) > 0 }"
            @click="openChatThread(t)"
          >
            <span class="ch"><MessageSquare :size="19" :stroke-width="1.6" aria-hidden="true" /></span>
            <div class="meta">
              <strong>{{ chatTitle(t) }}</strong>
              <small>{{ t.last_message?.body || t.last_message_body || t.lastMessage?.body || t.description || '' }}</small>
            </div>
            <span v-if="Number(t.unread_count) > 0" class="badge">{{ t.unread_count }}</span>
          </button>
          <div v-if="!chatList.length && !msgLoading" class="qv-pad muted">Nothing here yet.</div>
          <div v-if="msgLoading" class="qv-pad muted">Loading…</div>
        </template>

        <template v-else>
          <button
            v-for="item in inboxItems"
            :key="itemKey(item)"
            type="button"
            class="qv-row"
            @click="openInboxItem(item)"
          >
            <span class="ch"><component :is="msgSuite === 'files' ? Paperclip : msgSuite === 'mentions' ? AtSign : MessageSquare" :size="19" :stroke-width="1.6" aria-hidden="true" /></span>
            <div class="meta">
              <strong>{{ inboxTitle(item) }}</strong>
              <small>{{ inboxPreview(item) }}</small>
            </div>
          </button>
          <div v-if="!inboxItems.length && !msgLoading" class="qv-pad muted">Nothing here yet.</div>
          <div v-if="msgLoading" class="qv-pad muted">Loading…</div>
        </template>
        <button v-if="['email','sms'].includes(msgSuite) && homeCursor" type="button" class="qv-btn ghost" :disabled="homeOlderLoading" @click="loadOlderConversations">{{ homeOlderLoading ? 'Loading…' : 'Load older conversations' }}</button>
      </div>

      <div v-else-if="tab === 'thread'" class="qv-pane thread">
        <button type="button" class="qv-btn ghost qv-message-back" :aria-label="isMobile?'Back':undefined" @click="closeConversation">← {{ isMobile?'Back':'Conversations' }}</button>
        <h2 v-if="activeConv?.channel !== 'email'">{{ activeConv?.subject || 'Conversation' }}</h2>
        <p v-if="threadLoading" role="status">Loading conversation…</p>
        <EmailThreadReader v-if="activeConv?.channel === 'email' && !threadLoading" :conversation="activeConv" :messages="threadMessages" :mobile="isMobile" :current-user-photo="mobileSession?.profile?.user?.profilePhotoPath" :has-older="!!nextBeforeId" :loading-older="olderLoading"
          @compose="openDetachedEmail" @unread="keepEmailUnread" @older="loadOlderEmail" @attachment="downloadEmailFile" @like="likeEmail" />
        <template v-else>        <button v-if="nextBeforeId" type="button" class="qv-btn ghost" :disabled="olderLoading" @click="loadOlderEmail">{{ olderLoading ? 'Loading…' : 'Load older messages' }}</button>
        <div v-for="m in threadMessages" :key="m.id" class="qv-bubble" :class="m.direction">
          <div class="when"><strong>{{ m.from?.name || m.from?.email || (m.direction === 'outbound' ? 'You' : 'Sender') }}</strong> · {{ formatTime(m.sent_at || m.scheduled_send_at || m.created_at) }}
            <span v-if="m.is_auto_reply" class="badge">Auto-reply</span>
            <span v-if="m.send_status && m.send_status !== 'sent'" class="badge">{{ m.send_status === 'scheduled' ? 'Queued' : m.send_status }}</span>
          </div>
          <p v-if="m.to?.length" class="when">To: {{ m.to.map((a) => a.email || a).join(', ') }}<template v-if="m.cc?.length"> · CC: {{ m.cc.map((a) => a.email || a).join(', ') }}</template></p>
          <div class="body">{{ m.body_text || stripHtml(m.body_html) }}</div>
          <button v-for="a in m.attachments || []" :key="a.id" type="button" class="qv-btn ghost sm" @click="downloadEmailFile(a)">📎 {{ a.filename }}</button>
          <button v-if="activeConv?.channel === 'email' && !m.is_internal_note && (!m.send_status || m.send_status === 'sent')" type="button" class="qv-btn ghost sm" :aria-pressed="m.reactions?.some((r) => r.emoji === '❤️' && r.reactedByMe) || false" @click="likeEmail(m)">♥ {{ m.reactions?.find((r) => r.emoji === '❤️')?.count || '' }} Like</button>
        </div>
        </template>
        <Teleport to="body" :disabled="!mobileEmailReply">
        <div v-if="!threadLoading && threadMessages.length && !activeConv?.support_ticket_id && (!mobileEmailReply || showMobileReply)" :class="{'qv-modal':mobileEmailReply,'qv-mobile-reply':mobileEmailReply}" :style="mobileEmailReply?brandStyle:undefined" @click.self="closeMobileReply">
        <form :class="['qv-reply',{'qv-sheet':mobileEmailReply}]" :role="mobileEmailReply?'dialog':undefined" :aria-modal="mobileEmailReply?'true':undefined" :aria-label="mobileEmailReply?'Email reply':undefined" @submit.prevent="sendQuickReply" @keydown.tab="trapDialogFocus" @keydown.esc.prevent="closeMobileReply">
          <div v-if="mobileEmailReply" class="qv-reply-heading"><h2>{{ replyMode==='forward'?'Forward email':'Reply to email' }}</h2><button type="button" class="qv-btn ghost" aria-label="Close reply" @click="closeMobileReply">Close</button></div>
          <template v-if="activeConv?.channel === 'email'">
            <div class="qv-suite">
              <button v-for="action in [{ id: 'reply', label: 'Reply' }, { id: 'reply_all', label: 'Reply all' }, { id: 'forward', label: 'Forward' }]" :key="action.id" type="button" :class="{ on: replyMode === action.id }" @click="chooseReplyMode(action.id)">{{ action.label }}</button>
            </div>
            <p class="muted">From: {{ activeConv?.inbox_from_email || mailboxEmail }}</p>
            <label>To <input v-model="replyTo" type="text" inputmode="email" required /></label>
            <button v-if="mobileEmailReply && !showReplyCopies && !replyCc && !replyBcc" type="button" class="qv-btn ghost sm" @click="showReplyCopies=true">Add CC / BCC</button>
            <label v-if="!mobileEmailReply || showReplyCopies || replyCc || replyBcc">CC <input v-model="replyCc" type="text" inputmode="email" /></label>
            <label v-if="!mobileEmailReply || showReplyCopies || replyCc || replyBcc">BCC <input v-model="replyBcc" type="text" inputmode="email" /></label>
          </template>
          <textarea v-model="replyText" rows="4" placeholder="Write your reply…" aria-label="Reply message" />
          <template v-if="activeConv?.channel === 'email'">
            <label>Attachments <input type="file" multiple @change="selectEmailFiles($event)" /></label>
            <p v-if="replyAttachments.length">{{ replyAttachments.map((a) => a.filename).join(', ') }} <button type="button" class="qv-btn ghost sm" @click="replyAttachments = []">Remove</button></p>
          </template>
          <EmailDeliveryChoice :info="replyAvailability" :busy="replyBusy" @choose="sendQuickReply({deliveryChoice:$event})" @cancel="replyAvailability=null" />
          <button type="submit" class="qv-btn primary" :disabled="replyBusy || (!replyText.trim() && !replyAttachments.length)">{{ replyBusy ? 'Sending…' : (replyMode === 'forward' ? 'Forward' : 'Send reply') }}</button>
        </form>
        </div>
        </Teleport>
      </div>

      <div v-else-if="tab === 'chat'" class="qv-pane thread">
        <button type="button" class="qv-btn ghost" @click="closeChat">← Back</button>
        <h2>{{ activeChatTitle }}</h2>
        <button v-if="chatParentId" type="button" class="qv-btn ghost" @click="openChatReplies()">← All messages</button>
        <p v-if="chatLoading" role="status">Loading messages…</p>
        <button v-if="chatOlderId" type="button" class="qv-btn ghost" :disabled="chatLoading" @click="loadChatMessages({ older: true })">Load older messages</button>
        <div v-for="m in chatMessages" :key="m.id" class="qv-bubble" :class="chatBubbleClass(m)">
          <div class="when">{{ formatTime(m.created_at) }} · {{ m.sender_first_name || m.sender_name || '' }}</div>
          <div class="body">{{ m.body || '' }}</div>
          <a v-for="a in m.attachments || []" :key="a.id" :href="a.file_url" target="_blank" rel="noopener noreferrer">📎 {{ a.original_filename || 'Attachment' }}</a>
          <button type="button" class="qv-btn ghost sm" :aria-pressed="(m.reactions || []).some((r) => r.code === '❤️' && r.mineActive)" @click="likeChat(m)">❤️ {{ (m.reactions || []).find((r) => r.code === '❤️')?.count || '' }}</button>
          <button v-if="!chatParentId" type="button" class="qv-btn ghost sm" @click="openChatReplies(m.id)">{{ m.reply_count ? `${m.reply_count} replies` : 'Reply in thread' }}</button>
        </div>
        <form class="qv-reply" @submit.prevent="sendChatMessage">
          <textarea v-model="chatReply" rows="3" :placeholder="chatParentId ? 'Reply to this thread…' : 'New message…'" aria-label="Chat message" />
          <label>Photo or video <input type="file" accept="image/gif,image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" :disabled="chatUploadBusy" @change="uploadChatFile" /></label>
          <p v-if="chatUploadBusy">Uploading…</p>
          <p v-if="chatAttachments.length">{{ chatAttachments.map((a) => a.originalFilename).join(', ') }} <button type="button" class="qv-btn ghost sm" @click="chatAttachments = []">Remove</button></p>
          <button type="submit" class="qv-btn primary" :disabled="chatBusy || chatUploadBusy || (!chatReply.trim() && !chatAttachments.length)">
            {{ chatBusy ? 'Sending…' : 'Send' }}
          </button>
        </form>
      </div>

      <div v-else-if="tab === 'tasks'" class="qv-pane">
        <div class="qv-suite">
          <button type="button" :class="{ on: taskSuite === 'assigned' }" @click="loadTasks('assigned')">Assigned <span class="qv-task-count">{{ taskCounts.assigned ?? '—' }}</span></button>
          <button type="button" :class="{ on: taskSuite === 'mine' }" @click="loadTasks('mine')">My tasks <span class="qv-task-count">{{ taskCounts.mine ?? '—' }}</span></button>
          <button type="button" :class="{ on: taskSuite === 'lists' }" @click="loadSharedLists">Shared lists <span class="qv-task-count">{{ taskCounts.lists ?? '—' }}</span></button>
          <button type="button" :class="{ on: taskSuite === 'projects' }" @click="loadProjects">Projects <span class="qv-task-count">{{ taskCounts.projects ?? '—' }}</span></button>
        </div>
        <div v-if="taskSuite === 'assigned' || taskSuite === 'mine'" class="qv-toolbar">
          <div class="qv-pad muted" style="padding:8px 0;margin:0;">Tap a task for details</div>
          <button type="button" class="qv-btn primary sm" @click="showNewTask = true">Add</button>
        </div>
        <template v-if="taskSuite === 'assigned' || taskSuite === 'mine'">
          <MobileTaskRow v-if="isMobile" v-for="t in tasks" :key="`mobile:${t.id}`" :task="t" :due-label="t.due_at ? formatTime(t.due_at) : ''" @open="openTaskDetail" @preview="t=>openTaskAction(t,'preview')" @complete="t=>openTaskAction(t,'complete')" @due="t=>openTaskAction(t,'due')" />
          <button v-else
            v-for="t in tasks"
            :key="t.id"
            type="button"
            class="qv-row"
            @click="openTaskDetail(t)"
          >
            <div class="meta">
              <strong>{{ t.title }}</strong>
              <small>{{ t.status }} · {{ t.due_at ? formatTime(t.due_at) : 'No due date' }}</small>
            </div>
          </button>
          <div v-if="navigationBusy" class="qv-pad muted" role="status">Loading your tasks…</div>
          <div v-if="!navigationBusy && !error && !tasks.length" class="qv-pad muted">No open tasks.</div>
        </template>
        <template v-else-if="taskSuite === 'lists'">
          <button
            v-for="l in taskLists"
            :key="l.id"
            type="button"
            class="qv-row"
            @click="openSharedList(l)"
          >
            <div class="meta">
              <strong>{{ l.name }}</strong>
              <small>{{ l.role || 'member' }}</small>
            </div>
          </button>
          <div v-if="!error && !taskLists.length" class="qv-pad muted">No shared lists.</div>
        </template>
        <template v-else-if="taskSuite === 'projects'">
          <button
            v-for="p in taskProjects"
            :key="p.id"
            type="button"
            class="qv-row"
            @click="openProject(p)"
          >
            <div class="meta">
              <strong>{{ p.name }}</strong>
              <small>{{ p.status || 'active' }} · {{ p.open_task_count != null ? `${p.open_task_count} open` : '' }}</small>
            </div>
          </button>
          <div v-if="!error && !taskProjects.length" class="qv-pad muted">No projects.</div>
        </template>
        <template v-else-if="taskSuite === 'listDetail' || taskSuite === 'projectDetail'">
          <button type="button" class="qv-btn ghost" @click="taskSuite === 'listDetail' ? loadSharedLists() : loadProjects()">← Back</button>
          <h2 class="qv-section-title">{{ suiteDetailTitle }}</h2>
          <div v-if="suiteStats" class="qv-pad muted" style="padding-top:0;">
            {{ suiteStats.open }} open · {{ suiteStats.completed }} done
            <span v-if="suiteStats.progress != null"> · {{ suiteStats.progress }}%</span>
          </div>
          <div v-if="suiteMembers.length" class="qv-office-section">
            <h3 class="qv-section-title" style="font-size:0.95rem;">Members</h3>
            <div v-for="m in suiteMembers" :key="m.user_id" class="qv-row">
              <div class="meta">
                <strong>{{ m.name }}</strong>
                <small>{{ m.role || 'member' }}{{ m.title ? ` · ${m.title}` : '' }}</small>
              </div>
            </div>
          </div>
          <div v-if="suiteLists.length" class="qv-office-section">
            <h3 class="qv-section-title" style="font-size:0.95rem;">Lists in project</h3>
            <button
              v-for="l in suiteLists"
              :key="l.id || l.task_list_id"
              type="button"
              class="qv-row"
              @click="openSharedList({ id: l.task_list_id || l.id, name: l.name })"
            >
              <div class="meta"><strong>{{ l.name }}</strong></div>
            </button>
          </div>
          <h3 class="qv-section-title" style="font-size:0.95rem;">Tasks</h3>
          <MobileTaskRow v-if="isMobile" v-for="t in suiteTasks" :key="`mobile:${t.id}`" :task="t" :due-label="t.due_at ? formatTime(t.due_at) : ''" @open="openTaskDetail" @preview="t=>openTaskAction(t,'preview')" @complete="t=>openTaskAction(t,'complete')" @due="t=>openTaskAction(t,'due')" />
          <button v-else
            v-for="t in suiteTasks"
            :key="t.id"
            type="button"
            class="qv-row"
            @click="openTaskDetail(t)"
          >
            <div class="meta">
              <strong>{{ t.title }}</strong>
              <small>{{ t.status }} · {{ t.assignee || '' }} · {{ t.due_at ? formatTime(t.due_at) : 'No due' }}</small>
            </div>
          </button>
          <div v-if="!error && !suiteTasks.length" class="qv-pad muted">No tasks in this view.</div>
        </template>
      </div>

      <div v-else-if="tab === 'noteaid'" class="qv-pane">
        <div class="qv-pad" style="padding-bottom:8px;">
          <p class="muted" style="margin:0 0 10px;">
            Prepare a documentation draft here. Final chart attachment and signing are available in the full clinical workspace.
          </p>
          <div class="qv-na-row">
            <div class="qv-na-field">
              <label class="muted" for="qv-na-dos">Date of service</label>
              <input
                id="qv-na-dos"
                v-model="noteAidDos"
                type="date"
                class="qv-date"
              />
            </div>
            <div class="qv-na-field">
              <label class="muted" for="qv-na-initials">Initials</label>
              <input
                id="qv-na-initials"
                v-model="noteAidInitials"
                type="text"
                maxlength="12"
                placeholder="J.S."
                class="qv-date qv-na-initials"
              />
            </div>
          </div>
          <label class="muted">Tool</label>
          <select v-model="noteAidToolId" class="qv-date" style="width:100%;margin:6px 0 10px;">
            <option disabled value="">Select a Note Workspace tool</option>
            <option v-for="t in noteAidTools" :key="t.id" :value="t.id">{{ t.name || t.label || t.id }}</option>
          </select>
          <div class="qv-suite" style="padding:0 0 8px;">
            <button type="button" :class="{ on: noteAidMode === 'type' }" @click="noteAidMode = 'type'; stopNoteAidSpeak()">Type</button>
            <button
              type="button"
              :class="{ on: noteAidMode === 'speak' }"
              :disabled="!speechSupported"
              @click="toggleNoteAidSpeak"
            >{{ noteAidSpeaking ? 'Stop' : 'Speak' }}</button>
          </div>
          <textarea
            v-model="noteAidInput"
            aria-label="Note input"
            rows="5"
            class="qv-date"
            :placeholder="noteAidMode === 'speak' ? 'Speak your note…' : 'Type or paste session notes…'"
            style="width:100%;"
          />
          <div class="qv-sheet-actions" style="margin-top:8px;">
            <button
              type="button"
              class="qv-btn primary"
              :disabled="noteAidBusy || !noteAidToolId || !canRunNoteAid"
              @click="runNoteAid"
            >
              {{ noteAidBusy ? 'Generating…' : 'Generate' }}
            </button>
          </div>
          <p v-if="!canRunNoteAid" class="qv-note-readiness" role="status">Add the date of service, client initials, and session notes to enable Generate.</p>
          <p v-if="!noteAidTools.length" class="qv-note-readiness">Draft tools are unavailable for this workspace. <button type="button" class="qv-btn ghost sm" @click="switchNoteAid">Retry tools</button></p>
          <div v-if="noteAidOutput || noteAidSections.length" class="qv-note-block">
            <div class="qv-note-toolbar">
              <div>
                <strong>AI Generated Note</strong>
                <span class="qv-ready-badge">Ready to Copy</span>
              </div>
              <button type="button" class="qv-btn ghost sm" @click="copyNoteAidFull">
                {{ noteAidCopied === 'full' ? 'Copied' : 'Copy Full Note' }}
              </button>
            </div>
            <div class="qv-note-meta muted">
              <span>Client <strong>{{ noteAidInitials || '—' }}</strong></span>
              <span class="qv-note-meta-sep" aria-hidden="true">·</span>
              <span>DOS <strong>{{ formatNoteAidDos(noteAidDos) }}</strong></span>
            </div>
            <div v-for="panel in noteAidSections" :key="panel.id" class="qv-note-section">
              <div class="qv-note-section-head">
                <span class="qv-note-section-title">
                  <span v-if="panel.letter" class="qv-soap-letter">{{ panel.letter }}</span>
                  {{ panel.title }}
                </span>
                <button type="button" class="qv-btn ghost sm" @click="copyNoteAidSection(panel)">
                  {{ noteAidCopied === panel.id ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="qv-note-section-body">{{ panel.text }}</pre>
            </div>
            <div v-if="!noteAidSections.length && noteAidOutput" class="qv-note-section">
              <div class="qv-note-section-head">
                <span class="qv-note-section-title">Note</span>
                <button type="button" class="qv-btn ghost sm" @click="copyNoteAidFull">
                  {{ noteAidCopied === 'full' ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="qv-note-section-body">{{ noteAidOutput }}</pre>
            </div>
            <div class="qv-save-new">
              <p class="muted" style="margin:0 0 8px;font-size:12px;">Save to drawer, then start another note:</p>
              <button type="button" class="qv-btn qv-save-same-client sm" @click="saveAndNewSameClient">
                Save &amp; new · same client
              </button>
              <button type="button" class="qv-btn qv-save-same-dos sm" @click="saveAndNewSameDos">
                Save &amp; new · same date
              </button>
              <button type="button" class="qv-btn qv-save-fresh sm" @click="saveAndNewFresh">
                Save &amp; new · fresh
              </button>
            </div>
          </div>
          <div class="qv-office-section" style="margin-top:16px;">
            <h3 class="qv-section-title" style="font-size:0.95rem;">Drawer · today’s notes</h3>
            <p class="muted" style="margin:0 12px 8px;font-size:12px;">
              Generated notes land here so you can reopen them during the session.
            </p>
            <button
              v-for="item in noteAidDrawer"
              :key="item.id"
              type="button"
              class="qv-row"
              @click="openNoteAidDrawerItem(item)"
            >
              <div class="meta">
                <strong>{{ item.initials || 'Note' }} · {{ item.toolName || item.toolId }}</strong>
                <small>{{ item.dos || 'No DOS' }} · {{ formatClock(item.at) }}</small>
              </div>
            </button>
            <div v-if="!noteAidDrawer.length" class="qv-pad muted">No notes in the drawer yet.</div>
          </div>
        </div>
      </div>

      <div v-else-if="!isMobile && tab === 'calendar'" class="qv-pane">
        <div class="qv-day-nav">
          <button type="button" class="qv-btn ghost" @click="shiftDay(-1)">‹</button>
          <button type="button" class="qv-btn ghost" @click="day = localDay(); loadCalendar()">Today</button>
          <input v-model="day" type="date" class="qv-date" aria-label="Calendar date" @change="loadCalendar" />
          <button type="button" class="qv-btn ghost" @click="shiftDay(1)">›</button>
          <button type="button" class="qv-btn ghost" :class="{ on: showOffice }" @click="toggleOffice">
            {{ showOffice ? 'My day' : 'Office' }}
          </button>
        </div>
        <p class="qv-selected-day" aria-live="polite">{{ selectedCalendarDayLabel }}</p>
        <div v-if="isMobile && !showOffice" class="qv-calendar-modes"><button type="button" :aria-pressed="calendarMode==='agenda'" @click="calendarMode='agenda'">Agenda</button><button type="button" :aria-pressed="calendarMode==='day'" @click="calendarMode='day'">Day</button></div>
        <div v-if="isMobile && !showOffice && calendarMode==='day'" class="qv-day-grid" aria-label="Day schedule"><div v-for="hour in calendarHours" :key="hour" class="qv-hour-row"><time class="qv-hour-label">{{ hour===0?'12 AM':hour<12?`${hour} AM`:hour===12?'12 PM':`${hour-12} PM` }}</time><div class="qv-hour-lane"><button v-for="item in itemsAtHour(hour)" :key="item.id" type="button" class="qv-cal-block" @click="openCalEvent(item)"><strong>{{ calendarTitle(item) }}</strong><small>{{ item.allDay?'All day':`${formatClock(item.startAt)}–${formatClock(item.endAt)}` }}</small></button></div></div></div>
        <template v-if="!showOffice && (!isMobile || calendarMode==='agenda')">
          <p class="qv-pad muted">Times shown in {{ calendarTimeZone }}.</p>
          <p v-if="calendarLoading" class="qv-pad muted" role="status">Loading your schedule…</p>
          <div v-for="item in dayItems" :key="item.id" class="qv-agenda-item" role="button" tabindex="0" @click="openCalEvent(item)" @keydown.enter.self="openCalEvent(item)" @keydown.space.self.prevent="openCalEvent(item)">
            <div><strong>{{ item.title }}</strong><p>{{ item.allDay ? 'All day' : `${formatClock(item.startAt)}–${formatClock(item.endAt)}` }}<template v-if="item.location"> · {{ item.location }}</template></p><small v-if="item.status === 'CANCELLED'">Cancelled</small></div>
            <a v-if="item.canJoin" class="qv-btn primary sm" :href="joinHref(item)" target="_blank" rel="noopener noreferrer" @click.stop="extendForMeeting(item)">Join meeting ↗</a>
          </div>
          <div v-if="!calendarLoading && !error && !dayItems.length" class="qv-pad muted">Nothing scheduled this day.</div>
        </template>
        <template v-else-if="showOffice">
          <div class="qv-suite">
            <button type="button" :class="{ on: officeFilterId === null }" @click="setOfficeFilter(null)">All offices</button>
            <button
              v-for="loc in officeLocations"
              :key="loc.id"
              type="button"
              :class="{ on: officeFilterId === loc.id }"
              @click="setOfficeFilter(loc.id)"
            >{{ loc.name }}</button>
          </div>
          <div v-if="myOfficeSlots.length" class="qv-office-section">
            <h3 class="qv-section-title">My office today</h3>
            <div v-for="s in myOfficeSlots" :key="s.id" class="qv-row">
              <div class="meta">
                <strong>{{ s.office_name || 'Office' }}</strong>
                <small>
                  {{ formatClock(s.start_at) }} – {{ formatClock(s.end_at) }}
                  · {{ humanizeOfficeUi(s.status, s.slot_state) }}
                </small>
              </div>
            </div>
          </div>
          <div class="qv-office-section">
            <h3 class="qv-section-title">Who’s in today</h3>
            <div v-for="office in filteredOffices" :key="office.id" class="qv-office-card">
              <div class="qv-office-head">
                <strong>{{ office.name }}</strong>
                <small>{{ office.people.length }} booked · {{ office.slotCount }} slots</small>
              </div>
              <div v-if="!office.people.length" class="qv-pad muted">No one booked here yet.</div>
              <div v-for="p in office.people" :key="`${office.id}-${p.providerId}`" class="qv-row">
                <div class="meta">
                  <strong>{{ p.name }}</strong>
                  <small>
                    {{ formatClock(p.firstStart) }} – {{ formatClock(p.lastEnd) }}
                    <span v-if="p.rooms?.length"> · {{ p.rooms.join(', ') }}</span>
                  </small>
                </div>
                <button
                  v-if="p.providerId !== sessionUserId"
                  type="button"
                  class="qv-btn primary sm"
                  :disabled="dmBusyId === p.providerId"
                  @click="messageUser(p.providerId, p.name)"
                >Message</button>
              </div>
            </div>
            <div v-if="!filteredOffices.length" class="qv-pad muted">No office bookings for this day.</div>
          </div>
        </template>
      </div>

      <div v-else-if="tab === 'contacts'" class="qv-pane">
        <div class="qv-suite">
          <button type="button" :class="{ on: contactSuite === 'providers' }" @click="loadDirectory('providers')">Providers</button>
          <button type="button" :class="{ on: contactSuite === 'school' }" @click="loadDirectory('school')">School staff</button>
          <button type="button" :class="{ on: contactSuite === 'saved' }" @click="loadSavedContacts">Saved</button>
          <button type="button" class="qv-directory-search-toggle" :aria-expanded="directorySearchOpen" @click="directorySearchOpen=!directorySearchOpen">⌕ Search</button>
        </div>
        <div v-if="directorySearchOpen" class="qv-directory-search">
          <label>Find a person<input v-model="directorySearch" type="search" placeholder="Name, credentials, school or email" aria-label="Search your people" /></label>
          <label v-if="contactSuite!=='saved'">Agency<select v-model="directoryAgency" aria-label="Filter people by agency"><option value="all">All agencies</option><option v-for="agency in directoryAgencies" :key="agency.id" :value="String(agency.id)">{{ agency.name }}</option></select></label>
        </div>
        <template v-if="contactSuite === 'providers' || contactSuite === 'school'">
          <div v-for="p in directoryPeople" :key="`${p.agencyId || sessionAgencyId}:${p.id}:${p.schoolId || 0}`" class="qv-row qv-contact-row">
            <MobileIdentityAvatar v-if="isMobile" :photo="p.profilePhotoUrl" :agency-icon="p.agencyLogoUrl" :name="p.displayName"/><img v-else-if="p.profilePhotoUrl" :src="p.profilePhotoUrl" alt="" class="qv-avatar" />
            <div v-else class="qv-avatar qv-avatar-fallback">{{ contactInitials(p) }}</div>
            <div class="meta">
              <strong>{{ p.displayName }}<template v-if="p.credential"> {{ p.credential }}</template><span v-if="p.isSchoolAdmin" class="qv-school-admin"> · SCHOOL ADMIN</span> <a v-if="p.workPhoneExtension && directoryDial(p)" :href="directoryDial(p)" :aria-label="`Call ${p.displayName}, extension ${p.workPhoneExtension}`" class="qv-extension">Ext. {{ p.workPhoneExtension }}</a></strong>
              <small v-if="!isMobile">{{ formatRole(p.role) }}<span v-if="p.hcbsCategory"> · {{ p.hcbsCategoryLabel }}</span></small>
              <small v-if="p.workEmail || p.email">{{ p.workEmail || p.email }}</small>
              <small v-if="p.schoolName || p.agencyName">{{ contactSuite==='school' ? p.schoolName || 'School not listed' : p.agencyName }}</small>
              <small v-if="!isMobile && p.workPhone">Work {{ p.workPhone }}</small>
            </div>
            <button
              type="button"
              class="qv-btn primary sm"
              :disabled="dmBusyId === p.id"
              @click="messageUser(p.id, p.displayName, p.agencyId)"
            >Message</button>
          </div>
          <div v-if="!directoryPeople.length" class="qv-pad muted">
            {{ contactSuite === 'school' ? 'No school staff found.' : 'No providers found.' }}
          </div>
        </template>
        <template v-else>
          <div class="qv-toolbar">
            <div class="qv-pad muted" style="padding: 8px 0; margin: 0;">Saved email contacts</div>
            <button type="button" class="qv-btn primary sm" @click="showNewContact = true">Add</button>
          </div>
          <div v-for="c in directorySavedContacts" :key="c.id" class="qv-row">
            <div class="meta">
              <strong>{{ c.display_name || c.email }}</strong>
              <small>{{ c.email }} · {{ c.trust_status }}</small>
            </div>
            <button type="button" class="qv-btn ghost sm" @click="composeTo(c)">Email</button>
          </div>
          <div v-if="!contacts.length" class="qv-pad muted">No saved contacts yet.</div>
        </template>
      </div>

      </div>
    </template>
    </main>

    <div v-if="session && showCompose && !isMobile" class="qv-modal" role="dialog" aria-modal="true" aria-label="New email" @click.self="showCompose = false" @keydown.esc.stop="showCompose = false">
      <form class="qv-sheet" @submit.prevent="sendCompose">
        <h3>New email</h3>
        <p class="muted">From: {{ mailboxEmail || 'Your work mailbox' }}</p>
        <label>To</label>
        <input v-model="composeToEmail" type="email" multiple required placeholder="email@example.com, colleague@example.com" />
        <label>CC</label><input v-model="composeCc" type="text" inputmode="email" />
        <label>BCC</label><input v-model="composeBcc" type="text" inputmode="email" />
        <label>Subject</label>
        <input v-model="composeSubject" type="text" placeholder="Subject" />
        <label>Message</label>
        <textarea v-model="composeText" rows="4" placeholder="Write your message…" />
        <label>Attachments <input type="file" multiple @change="selectEmailFiles($event, true)" /></label>
        <p v-if="composeAttachments.length">{{ composeAttachments.map((a) => a.filename).join(', ') }} <button type="button" @click="composeAttachments = []">Remove</button></p>
        <EmailDeliveryChoice :info="composeAvailability" :busy="composeBusy" @choose="sendCompose({deliveryChoice:$event})" @cancel="composeAvailability=null" />
        <div class="qv-sheet-actions">
          <button type="button" class="qv-btn ghost" @click="showCompose = false">Cancel</button>
          <button type="submit" class="qv-btn primary" :disabled="composeBusy">{{ composeBusy ? 'Sending…' : 'Send' }}</button>
        </div>
      </form>
    </div>

    <div v-if="session && showCompose && isMobile" class="qv-modal qv-mobile-composer" role="dialog" aria-modal="true" aria-label="Email draft"><EmailComposerView :compose-context="mobileEmailContext" @close="showCompose=false;mobileMessages?.refresh()" /></div>

    <div v-if="session && showNewTask" class="qv-modal" role="dialog" aria-modal="true" aria-label="Add task" @click.self="showNewTask = false" @keydown.esc.stop="showNewTask = false">
      <form class="qv-sheet" @submit.prevent="createTask">
        <h3>Add task</h3>
        <label>Title</label>
        <input v-model="newTaskTitle" type="text" required placeholder="What needs doing?" />
        <label>Due (optional)</label>
        <input v-model="newTaskDue" type="date" />
        <div class="qv-sheet-actions">
          <button type="button" class="qv-btn ghost" @click="showNewTask = false">Cancel</button>
          <button type="submit" class="qv-btn primary" :disabled="taskBusy">{{ taskBusy ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>

    <div v-if="session && showNewContact" class="qv-modal" role="dialog" aria-modal="true" aria-label="Add contact" @click.self="showNewContact = false" @keydown.esc.stop="showNewContact = false">
      <form class="qv-sheet" @submit.prevent="createContact">
        <h3>Add contact</h3>
        <label>Name</label>
        <input v-model="newContactName" type="text" placeholder="Display name" />
        <label>Email</label>
        <input v-model="newContactEmail" type="email" required placeholder="email@example.com" />
        <label>Phone (optional)</label>
        <input v-model="newContactPhone" type="tel" placeholder="Phone" />
        <div class="qv-sheet-actions">
          <button type="button" class="qv-btn ghost" @click="showNewContact = false">Cancel</button>
          <button type="submit" class="qv-btn primary" :disabled="contactBusy">{{ contactBusy ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>

    <div v-if="session && taskOpening" class="qv-modal" role="dialog" aria-modal="true" aria-label="Opening task" @click.self="closeTaskDetail" @keydown.esc.stop="closeTaskDetail"><section class="qv-sheet"><button class="qv-btn ghost" @click="closeTaskDetail">Close</button><h3>{{ taskOpening.title }}</h3><p role="status">Loading task details…</p></section></div>
    <div v-if="session && taskAction" class="qv-modal" role="dialog" aria-modal="true" :aria-label="taskAction.mode==='preview'?'Task preview':taskAction.mode==='complete'?'Confirm task completion':'Change task due date'" @click.self="!taskActionBusy && closeTaskAction()" @keydown.esc.stop="!taskActionBusy && closeTaskAction()"><section class="qv-sheet qv-task-action">
     <button class="qv-btn ghost" :disabled="taskActionBusy" @click="closeTaskAction">Cancel</button><h3>{{ taskAction.task.title }}</h3><p class="qv-detail-meta">{{ taskAction.task.status }} · {{ taskAction.task.due_at ? formatTime(taskAction.task.due_at) : 'No due date' }}</p>
     <p v-if="taskAction.loading" role="status">Loading task preview…</p><p v-if="taskAction.error" role="alert">{{ taskAction.error }}</p>
     <template v-if="taskAction.detail">
      <p v-if="taskAction.mode==='preview'">{{ taskAction.task.description_locked ? 'Description is protected — open the full app to view.' : taskAction.task.description || 'No description has been added.' }}</p>
      <p v-if="taskAction.mode==='complete'">Mark this task as done?</p>
      <label v-if="taskAction.mode==='due'" class="qv-task-due">Due date (your local time)<input v-model="taskDueValue" type="datetime-local"/><small>Leave blank to remove the due date.</small></label>
      <p v-if="taskAction.mode==='complete' && (taskAction.task.completion_managed || taskAction.task.can_change_status===false)">Complete this task through its linked workflow or ask the assignee.</p>
      <div class="qv-task-action-buttons"><template v-if="taskAction.mode==='preview'"><button class="qv-btn primary" @click="openTaskDetail(taskAction.task);closeTaskAction()">Open task</button><button class="qv-btn ghost" @click="taskAction.mode='due'">Change due date</button><button v-if="!isDone(taskAction.task) && !taskAction.task.completion_managed && taskAction.task.can_change_status!==false" class="qv-btn ghost" @click="taskAction.mode='complete'">Mark done</button></template><button v-else class="qv-btn primary" :disabled="taskActionBusy || (taskAction.mode==='complete' && (taskAction.task.completion_managed || taskAction.task.can_change_status===false))" @click="saveTaskAction">{{ taskActionBusy?'Saving…':taskAction.mode==='complete'?'Mark done':'Save due date' }}</button></div>
     </template>
    </section></div>
    <div v-if="session && taskDetail" class="qv-modal" role="dialog" aria-modal="true" aria-label="Task details" @click.self="closeTaskDetail" @keydown.esc.stop="closeTaskDetail">
      <div class="qv-sheet qv-task-detail">
        <button type="button" class="qv-btn ghost sm" @click="closeTaskDetail">Close</button>
        <h3>{{ taskDetail.task.title }}</h3>
        <p class="qv-detail-meta">
          {{ taskDetail.task.status }}
          · {{ taskDetail.task.urgency || 'medium' }}
          · {{ taskDetail.task.due_at ? formatTime(taskDetail.task.due_at) : 'No due date' }}
        </p>
        <p v-if="taskDetail.task.project_name || taskDetail.task.task_list_name" class="qv-detail-meta">
          {{ [taskDetail.task.project_name, taskDetail.task.task_list_name].filter(Boolean).join(' · ') }}
        </p>
        <p v-if="taskDetail.task.assignee && !taskDetail.assignees?.length" class="qv-detail-meta">
          Assigned: {{ taskDetail.task.assignee.name }}
        </p>
        <div class="qv-detail-body">
          <template v-if="taskDetail.task.description_locked">Description is protected — open the full app to view.</template>
          <template v-else>{{ taskDetail.task.description || 'No description has been added to this task.' }}</template>
        </div>
        <QuickTaskExtras :detail="taskDetail" :api-base="apiBase" :session-token="session" :full-task-url="fullTaskUrl" @updated="reloadTaskDetail"/>
        <h4>Assign</h4>
        <select v-model="taskAssignId" class="qv-date" style="width:100%;margin-bottom:8px;" @change="saveTaskAssign">
          <option :value="null">Unassigned</option>
          <option v-if="taskAssignId && !taskAssigneeOptions.some(person=>Number(person.id)===Number(taskAssignId))" :value="taskAssignId">{{ taskDetail.task.assignee?.name || 'Current assignee' }}</option><option v-for="p in taskAssigneeOptions" :key="p.id" :value="p.id">{{ p.displayName }}</option>
        </select>
        <h4>Shared list</h4>
        <select v-model="taskListPickId" class="qv-date" style="width:100%;margin-bottom:8px;" @change="saveTaskList">
          <option :value="null">No shared list</option>
          <option v-for="l in (taskDetail.availableLists || [])" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
        <div v-if="taskDetail.attachments?.length" class="qv-links">
          <h4>Attachments</h4>
          <a v-for="a in taskDetail.attachments" :key="a.id" :href="a.url" target="_blank" rel="noopener">{{ a.filename }}</a>
        </div>
        <div v-if="taskDetail.collaborators?.length" class="qv-office-section">
          <h4>Collaborators</h4>
          <div v-for="c in taskDetail.collaborators" :key="c.user_id" class="qv-detail-meta">{{ c.name }}</div>
        </div>
        <div v-if="taskDetail.links?.length" class="qv-links">
          <h4>Links</h4>
          <a v-for="l in taskDetail.links" :key="l.id" :href="l.url" target="_blank" rel="noopener">{{ l.label || l.url }}</a>
        </div>
        <div class="qv-sheet-actions">
          <button type="button" class="qv-btn ghost" :disabled="taskDetail.task.completion_managed || taskDetail.task.can_change_status===false" @click="markTaskStatus(taskDetail.task)">
            {{ isDone(taskDetail.task) ? 'Reopen' : 'Mark done' }}
          </button>
          <button
            v-if="taskDetail.task.project_id"
            type="button"
            class="qv-btn primary"
            @click="openProjectFromTask"
          >Open project</button>
        </div>
        <h4>Comments</h4>
        <div v-for="c in taskDetail.comments" :key="c.id" class="qv-comment">
          <strong>{{ c.author }}</strong>
          <small>{{ formatTime(c.created_at) }}</small>
          <p>{{ c.body }}</p>
        </div>
        <div v-if="!taskDetail.comments?.length && !taskDetail.unavailable?.includes('Comments')" class="muted">No comments yet.</div>
        <form class="qv-reply" @submit.prevent="postTaskComment">
          <textarea v-model="taskComment" rows="2" placeholder="Add a comment…" />
          <button type="submit" class="qv-btn primary" :disabled="taskCommentBusy || !taskComment.trim()">
            {{ taskCommentBusy ? 'Posting…' : 'Comment' }}
          </button>
        </form>
      </div>
    </div>

    <div v-if="session && calEvent" class="qv-modal" role="dialog" aria-modal="true" aria-label="Event details" @click.self="calEvent = null" @keydown.esc.stop="calEvent = null">
      <div class="qv-sheet">
        <button type="button" class="qv-btn ghost sm" @click="calEvent = null">Close</button>
        <h3>{{ calendarTitle(calEvent) }}</h3>
        <p class="qv-detail-meta">{{ calEvent.kind }} · {{ formatClock(calEvent.startAt) }} – {{ formatClock(calEvent.endAt) }}</p>
        <template v-if="String(calEvent.kind || '').toUpperCase() === 'OFFICE'">
          <p class="qv-detail-meta"><strong>Office:</strong> {{ calEvent.officeName || calEvent.location || '—' }}</p>
          <p class="qv-detail-meta"><strong>Status:</strong> {{ calEvent.availability || calEvent.status || '—' }}</p>
          <p v-if="calEvent.room" class="qv-detail-meta"><strong>Room:</strong> {{ calEvent.room }}</p>
          <p v-if="calEvent.slotState" class="qv-detail-meta muted">Slot: {{ formatSlotState(calEvent.slotState) }}</p>
        </template>
        <template v-else>
          <p v-if="calEvent.location" class="qv-detail-meta">{{ calEvent.location }}</p>
          <p v-if="calEvent.hasClient" class="qv-detail-meta">
            <button v-if="isMobile && calEvent.clientId" type="button" class="qv-btn ghost sm" @click="mobileNavigate({view:'client',clientId:String(calEvent.clientId)});calEvent=null">{{ calEvent.clientMaskedName || calEvent.maskedName || 'Client' }}<template v-if="calEvent.clientAge != null"> · Age {{ calEvent.clientAge }}</template> ›</button>
            <template v-else>Client: {{ calEvent.clientInitials || 'initials unavailable' }}</template>
          </p>
          <div v-if="calEvent.attendees?.length">
            <h4 style="margin:12px 0 6px;font-size:13px;color:var(--qv-muted);">Who’s coming</h4>
            <div v-for="a in calEvent.attendees" :key="a.userId" class="qv-detail-meta">
              {{ a.name || a.initials }}
            </div>
          </div>
        </template>
        <div class="qv-sheet-actions" style="margin-top:12px;">
          <a
            v-if="calEvent.canJoin"
            class="qv-btn primary"
            :href="joinHref(calEvent)"
            target="_blank" rel="noopener noreferrer"
            @click="extendForMeeting(calEvent)"
          >Join</a>
          <p v-else class="muted" style="margin:0;font-size:13px;">
            {{ calEvent.hasClient ? 'Client session details stay limited in Quick View.' : (String(calEvent.kind||'').toUpperCase()==='OFFICE' ? 'Open the full app to change office bookings.' : 'Open the full app to edit this event.') }}
          </p>
        </div>
      </div>
    </div>
  </div>
  <Teleport to="body"><aside v-if="quickPreview" class="qv-email-preview" role="region" aria-label="Email preview" :style="{top:quickPreview.top+'px',left:quickPreview.left+'px'}" @mouseenter="clearTimeout(quickPreviewHideTimer)" @mouseleave="hideQuickPreview">
    <button type="button" class="qv-preview-close" aria-label="Close email preview" @click="dismissQuickPreview">Close</button>
    <strong>{{ quickPreview.subject || '(No subject)' }}</strong><pre>{{ quickPreview.body || 'Loading message…' }}</pre>
  </aside></Teleport>
</template>

<script setup>
import {backInMobile,trackMobileNavigation} from '../mobile/mobileNavigation.js';
import {mobileLinkTarget} from '../mobile/mobileLinks.js';
const EmailComposerView=defineAsyncComponent(()=>import('./EmailComposerView.vue'));
import MobileIdentityAvatar from '../mobile/MobileIdentityAvatar.vue';
import MobileMessages from '../mobile/MobileMessages.vue';
import QuickTaskExtras from '../components/quickView/QuickTaskExtras.vue';
import MobilePreferences from '../mobile/MobilePreferences.vue';
import MobileMyWork from '../mobile/MobileMyWork.vue';
import MobileClients from '../mobile/MobileClients.vue';
import MobileCalendar from '../mobile/MobileCalendar.vue';
import MobileTaskRow from '../mobile/MobileTaskRow.vue';
import MobileClinicalWorkspace from '../mobile/MobileClinicalWorkspace.vue';
import MobileClientSummary from '../mobile/MobileClientSummary.vue';
import MobileClinicalSession from '../mobile/MobileClinicalSession.vue';
import AuricWellBrand from '../components/auricwell/AuricWellBrand.vue';
import { AURICWELL_PREVIEW_URL } from '../constants/auricwellBrand';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Bell, CalendarDays, MessageSquare, ListTodo, Ellipsis, LockKeyhole, Clock3, NotebookPen, Users, Radio, ArrowUpRight, ChevronRight, Mail, Smartphone, Phone, RefreshCw, Paperclip, AtSign, UserRound, ChevronDown, BriefcaseBusiness } from '@lucide/vue';
import ConversaBrand from '../components/conversa/ConversaBrand.vue';
import { privateSpeechRecognition } from '../utils/privateSpeechRecognition.js';
import { quickViewDeepLink } from '../utils/quickViewDeepLink';
import QuickViewPresence from '../components/quickView/QuickViewPresence.vue';
import { provide, defineAsyncComponent, computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { emailReplyRecipients } from '../utils/messageThreads';
import EmailThreadReader from '../components/messages/EmailThreadReader.vue';
import EmailDeliveryChoice from '../components/messages/EmailDeliveryChoice.vue';
import { openEmailComposer } from '../utils/emailComposerWindow';
import { emailPreviewText } from '../utils/emailReading';
import { encodeEmailFiles } from '../utils/communicationAttachments';
import QuickViewMusicDock from '../components/quickView/QuickViewMusicDock.vue';
import { buildDisplaySections, extractSections, formatFullNoteCopy } from '../utils/noteAidUiHelpers.js';

const props=defineProps({ mobileSession:Object,notificationUnread:{type:Number,default:0},overlayOpen:Boolean });
const emit=defineEmits(['locked','account','notifications','open-workspace-item','preferences','refresh-session','open-main']);
const isMobile=computed(()=>!!props.mobileSession);

const BOOKMARK_KEY = 'plottwist.quickViewBookmark';
const TOKEN_KEY = 'plottwist.quickViewToken';
const HOME_TIP_KEY = 'plottwist.quickViewHomeTipDismissed';
const LOGIN_URL_KEY = 'plottwist.quickViewLoginUrl';
const showBrowserInstallTip = !Capacitor.isNativePlatform() && /iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone;

const route = useRoute();
const router = useRouter();
async function openDetachedEmail(mode='new') { if(isMobile.value){dismissQuickPreview();if(mode==='new')openMobileEmailDraft();else{changeReplyMode(mode);showMobileReply.value=true;await mobileNavigate({...route.query,compose:mode});await nextTick();document.querySelector('[aria-label=\"Email reply\"] textarea')?.focus();}return;} openEmailComposer(router,{quickView:true,session:session.value,mode,conversationId:mode==='new'?undefined:activeConv.value?.id}); }
function changeEmailFolder(folder){sort.value=folder;loadHome(msgSuite.value);}
async function keepEmailUnread(){
  try{await axios.patch(`${apiBase}/conversations/${activeConv.value.id}`,{markUnread:true},{headers:authHeaders(),withCredentials:true});sort.value='unread';await loadHome('email');}catch(e){error.value=e.response?.data?.error?.message || 'Could not mark unread';}
}

const apiBase = Capacitor.isNativePlatform() ? 'https://auricwell.com/api/quick-view' : '/api/quick-view';
provide('emailAttachmentTransport',({conversationId,file})=>axios.get(`${apiBase}/conversations/${conversationId}/attachments/${file.id}`,{headers:authHeaders(),withCredentials:true,responseType:'blob'}));
const presenceHttp={get:path=>axios.get(apiBase+path,{headers:authHeaders(),withCredentials:true}),post:(path,body)=>axios.post(apiBase+path,body,{headers:authHeaders(),withCredentials:true})};
const quickPreview = ref(null);
const showMobileReply=ref(false),showReplyCopies=ref(false);
const mobileEmailReply=computed(()=>isMobile.value && activeConv.value?.channel==='email');
function dismissQuickPreview(){clearTimeout(quickPreviewTimer);clearTimeout(quickPreviewHideTimer);quickPreview.value=null;}
function outsidePreview(event){if(!event.target?.closest?.('.qv-row,.qv-email-preview'))dismissQuickPreview();}
let quickPreviewTimer=null,quickPreviewHideTimer=null;
function hideQuickPreview(){clearTimeout(quickPreviewTimer);quickPreviewHideTimer=setTimeout(()=>quickPreview.value=null,200);}
function previewQuickEmail(c,event){
  clearTimeout(quickPreviewTimer);clearTimeout(quickPreviewHideTimer);if(!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches || event.pointerType==='touch' || c.channel!=='email'||c.draftId || tab.value!=='home')return;
  const rect=event.currentTarget.getBoundingClientRect();const activeSession=session.value;
  quickPreviewTimer=setTimeout(async()=>{
    if(tab.value!=='home' || session.value!==activeSession)return;
    const preview={id:c.id,subject:c.subject,body:emailPreviewText(c.last_message_preview),top:Math.max(8,Math.min(rect.bottom+8,innerHeight-330)),left:Math.max(8,Math.min(rect.left,innerWidth-430))};quickPreview.value=preview;
    try{const {data}=await axios.get(`${apiBase}/conversations/${c.id}`,{params:{markRead:'0'},headers:authHeaders(),withCredentials:true});if(session.value===activeSession&&quickPreview.value?.id===c.id){const m=(data.messages||[]).filter(m=>!m.is_internal_note).at(-1);quickPreview.value={...preview,subject:m?.subject||data.conversation?.subject||c.subject,body:emailPreviewText(m?.body_text||m?.body_html)||'(Empty message)'};}}catch{/* Retain available preview on a temporary failure. */}
  },350);
}


const loading = ref(true);
const error = ref('');
const tokenInfo = ref(null);
const passcode = ref('');
const credentialEmail = ref('');
const unlocking = ref(false);
const session = ref(null);
const sessionUserId = ref(null);
const expiresAt = ref(null);
const clockNow=ref(Date.now());
const lockCountdown=computed(()=>Number.isFinite(remainingSeconds.value)?`${Math.floor(remainingSeconds.value/60)}:${String(remainingSeconds.value%60).padStart(2,'0')}`:'—');
watch(()=>props.mobileSession?.expiresAt,value=>{if(isMobile.value && value)expiresAt.value=value;});
const remainingSeconds=computed(()=>Math.max(0,Math.ceil((new Date(expiresAt.value).getTime()-clockNow.value)/1000)));
let deadlineTimer,lastActivitySent=0,activityPending=false;
const agencyName = ref('');
const agencyLogoUrl = ref('');
const agencyPrimaryColor = ref('');
const colorPalette = ref({});
const loginUrl = ref('');
const secureMessagesUrl = computed(() => {
  const url = new URL(loginUrl.value || '/login', window.location.origin);
  url.pathname = url.pathname.replace(/\/login\/?$/, '/messages');
  url.search = '?channel=secure';if(isMobile.value && /^[1-9]\d*$/.test(String(route.query.threadId || '')))url.searchParams.set('threadId',route.query.threadId);url.hash = '';
  return url.href;
});
const isLocked = ref(false);
const tab = ref('home');
const moreOpen = ref(false);
const navigationBusy = ref(false);
const allNavigation = [
  { id:'calendar',label:'Today',icon:CalendarDays,description:'Your schedule and appointments.' },
  { id:'home',label:'Messages',icon:MessageSquare,description:'All your conversations.' },
  { id:'tasks',label:'Tasks',icon:ListTodo,description:'Assigned tasks and shared lists.' },
  { id:'mywork',label:'My Work',icon:BriefcaseBusiness,description:'Your documentation queue.' },
  { id:'noteaid',label:'Note Workspace',icon:NotebookPen,description:'Prepare your documentation.' },
  { id:'presence',label:'Presence',icon:Radio,description:'See who’s available and set your status.' },
  { id:'contacts',label:'Contacts',icon:Users,description:'Find and message your team.' },
  { id:'notifications',label:'Notifications',icon:Bell,description:'Updates across your agencies.' },
  { id:'clients',label:'My Clients',icon:Users,description:'Your clients across affiliated agencies.' }
];
const workspacePreferences=ref({swipeLeft:'archive',swipeRight:'read',navigationMode:'pinned',navigationSlots:4,pinnedNavigation:['calendar','mywork','tasks','home'],usage:{},lockedNavigation:'calendar'});
const viewportWidth=ref(window.innerWidth),showMobileSettings=ref(false),mobileMessages=ref(null),mobileCounts=ref({});
const messageBadge=ref(null),myWorkVisited=ref(false),calendarVisited=ref(false),clientsVisited=ref(false);let messageBadgeRequest=0,lastMessageBadgeRefresh=0;
watch(tab,value=>{if(value==='mywork')myWorkVisited.value=true;if(value==='calendar')calendarVisited.value=true;if(value==='clients')clientsVisited.value=true;},{immediate:true});
const mobileUnreadCount=computed(()=>mobileCounts.value.all?.unread ?? messageBadge.value);
const workspaceBadges=ref({mywork:null,tasks:null});let badgeRequest=0,lastBadgeRefresh=0;
const navigationBadge=id=>id==='home'?mobileUnreadCount.value:workspaceBadges.value[id];
async function loadWorkspaceBadges(force=false){
 if(!isMobile.value || !session.value || (!force && Date.now()-lastBadgeRefresh<60000))return;
 const request=++badgeRequest,token=session.value;lastBadgeRefresh=Date.now();
 try{const {data}=await axios.get(`${apiBase}/workspace-counts`,{headers:authHeaders(),withCredentials:true});if(request===badgeRequest && token===session.value)workspaceBadges.value={mywork:data.mywork??null,tasks:data.tasks??null};}
 catch{if(request===badgeRequest && token===session.value)workspaceBadges.value={mywork:null,tasks:null};}
}
async function loadMessageBadge(force=false){
 if(!isMobile.value || !session.value || document.hidden || (!force && Date.now()-lastMessageBadgeRefresh<30000))return;
 const current=++messageBadgeRequest,token=session.value;lastMessageBadgeRefresh=Date.now();
 try{const {data}=await axios.get(`${apiBase}/messages/inbox`,{headers:authHeaders(),withCredentials:true,params:{countsOnly:'1',suite:'all',filter:'all',includeArchived:'0'}});if(current!==messageBadgeRequest || token!==session.value)return;const count=data.counts?.all?.unread;if(typeof count==='number'){messageBadge.value=count;mobileCounts.value={...mobileCounts.value,all:{...mobileCounts.value.all,unread:count}};}}
 catch{/* Retain the last known badge, or its loading indicator, instead of showing a false zero. */}
}
function refreshVisibleBadges(){if(!document.hidden){loadWorkspaceBadges();loadMessageBadge();}}
let preferenceTimer;
const primaryNavigation=computed(()=>{
  if(!isMobile.value)return [...allNavigation.slice(0,3),{id:'more',label:'More',icon:Ellipsis}];
  const requested=Number(workspacePreferences.value.navigationSlots);
  const slots=[2,3,4].includes(requested)?requested:4;
  const ids=workspacePreferences.value.pinnedNavigation || ['calendar','mywork','tasks','home'];
  const fixed=workspacePreferences.value.lockedNavigation || 'calendar';const ordered=fixed==='none'?ids:[fixed,...ids.filter(id=>id!==fixed)];
  return [...ordered.slice(0,slots).map(id=>allNavigation.find(item=>item.id===id)).filter(Boolean),{id:'more',label:'More',icon:ChevronDown}];
});
const secondaryNavigation=computed(()=>allNavigation.filter(item=>isMobile.value || !['notifications','clients'].includes(item.id)));
watch(workspacePreferences,value=>{if(isMobile.value)emit('preferences',value);},{deep:true,immediate:true});
function resizeMobile(){viewportWidth.value=window.innerWidth;}
async function loadWorkspacePreferences(){try{const {data}=await axios.get(`${apiBase}/messages/preferences`,{headers:authHeaders(),withCredentials:true});workspacePreferences.value=data.preferences || workspacePreferences.value;}catch{/* Defaults remain usable if preferences are temporarily unavailable. */}}
// Shortcut order changes only when the user saves their preferences.
function countNavigation(){}
function handleMobileLink(event){if(!isMobile.value || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;const anchor=event.target.closest?.('a[href]');if(!anchor || anchor.classList.contains('qv-workspace-link') || anchor.classList.contains('qv-gate-link') || anchor.hasAttribute('download'))return;const target=mobileLinkTarget(anchor.href,{workspaceLoginUrl:loginUrl.value,currentOrigin:window.location.origin});if(target){event.preventDefault();router.push(target);}}
function openMobilePreferences(){showMobileSettings.value=true;}
async function openMobileClient({clientId,agencyId}){await mobileNavigate({view:'client',clientId:String(clientId),agencyId:String(agencyId)});}
function openMobileCalendarItem(item){
  if(item.hasClient && (item.clinicalSessionId || item.officeEventId))return prepareWorkDraft({...item,id:null});
  if(item.client_id || item.clientId)return openMobileClient({clientId:item.client_id || item.clientId,agencyId:item.agency_id || item.agencyId || sessionAgencyId.value});
  openCalEvent(item);
}
async function openMobileConversation(item){msgSuite.value=String(route.query.suite || 'all');await openConversation(item);}
async function prepareWorkDraft(item){
  // Pending amendments use the full version-review workflow, never the original note signer.
  if(item.clinicalRevisionId)return;
  const query={view:'clinical'};
  for(const [key,value] of Object.entries({workId:item.id || item.serverId,clientId:item.clientId || item.client_id,clinicalSessionId:item.clinicalSessionId || item.clinical_session_id,officeEventId:item.officeEventId || item.office_event_id,draftId:item.draftId || item.draft_id,noteId:item.clinicalNoteId || item.clinical_note_id}))if(value)query[key]=String(value);
  if(item.quickSignRequested)query.quickSign='1';
  if(String(item.id || '').startsWith('cosign_'))delete query.workId;
  if(item.agencyId && Number(item.agencyId)!==Number(sessionAgencyId.value)){emit('open-workspace-item',{agencyId:Number(item.agencyId),query});return;}
  await mobileNavigate(query);
}
async function openMobileClinicalContact(target){
  if(target.threadId){await mobileNavigate({view:'home',suite:'secure',threadId:String(target.threadId),secure:'1'});return;}
  if(target.conversationId){await mobileNavigate({view:'home',suite:target.channel==='sms'?'sms':'email',conversationId:String(target.conversationId)});return;}
  if(target.channel==='email' && target.to)openMobileEmailDraft({to:target.to});
}
function calendarTitle(item){return isMobile.value && item.hasClient?`${item.clientMaskedName || item.maskedName || 'Client session'}${item.clientAge != null ? ` · Age ${item.clientAge}` : ''}`:item.title;}

const activeDestination = computed(() => {
  if (moreOpen.value) return 'more';
  if (['home', 'thread', 'chat'].includes(tab.value)) return 'home';
  if (primaryNavigation.value.some(item=>item.id===tab.value)) return tab.value;
  return 'more';
});
const workspaceDate = computed(() => new Date(clockNow.value).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
const currentHeading = computed(() => {
  if (moreOpen.value) return { title: 'Your workspace', description: 'The tools and people that keep your day moving.' };
  return {
    home: { title: 'Messages', description: 'Stay connected to your team and your work.' },
    thread: { title: 'Conversation', description: 'Keep the conversation moving.' },
    chat: { title: 'Team conversation', description: 'Direct messages and team discussions.' },
    calendar: { title: 'Your day, in view.', description: 'Appointments, meetings, and where you need to be.' },
    mywork:{title:'My Work',description:''},
    clients:{title:'My Clients',description:'Your clients across affiliated agencies.'},
    tasks: { title: 'Tasks', description: 'Your tasks, shared lists, and next steps.' },
    noteaid: { title: 'Note Workspace', description: 'A focused space for your documentation.' },
    presence: { title: 'Team presence', description: 'Find the right moment to connect.' },
    contacts: { title: 'Your people', description: 'Find a colleague and start a conversation.' }
  }[tab.value] || { title: 'Quick View', description: 'Your daily workspace.' };
});

async function navigateTo(destination,{fromRoute=false}={}) {
  if(destination==='notifications' && isMobile.value){moreOpen.value=false;countNavigation(destination);emit('notifications');return;}
  if(isMobile.value && destination==='noteaid')destination='mywork';
  if (destination === 'more') { moreOpen.value = !moreOpen.value; return; }
  if(isMobile.value && !fromRoute){countNavigation(destination);const query=destination==='home'?{view:'home',...(route.query.suite?{suite:route.query.suite}:{}),...(route.query.filter?{filter:route.query.filter}:{}),...(route.query.archived?{archived:route.query.archived}:{})}:{view:destination};if(router.resolve({path:'/mobile/workspace',query}).fullPath!==route.fullPath){moreOpen.value=false;await mobileNavigate(query);return;}}
  moreOpen.value = false;
  error.value = '';
  navigationBusy.value = true;
  try {
    if (destination === 'home') {if(isMobile.value)tab.value='home';else await switchMsgSuite(msgSuite.value);}
    else if (destination === 'calendar') { if(isMobile.value){tab.value='calendar';return;} if (showOffice.value) { tab.value = 'calendar'; await loadOffice(); } else await loadCalendar(); }
    else if (destination === 'tasks') await loadTasks(taskView.value);
    else if (['mywork','clinical','client','clients','session'].includes(destination) && isMobile.value)tab.value=destination;
    else if (destination === 'noteaid') await switchNoteAid();
    else if (destination === 'contacts') await loadContacts();
    else if (destination === 'presence') tab.value = 'presence';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || `Could not load ${destination === 'tasks' ? 'your tasks' : 'this view'}. Try again.`;
  } finally {
    navigationBusy.value = false;
    if (session.value && secondaryNavigation.value.some(item => item.id === destination)) {
      await nextTick();
      document.getElementById('qv-workspace')?.focus();
    }
  }
}

function closeMore() {
  dismissQuickPreview();if(showMobileReply.value){closeMobileReply();return;}
  if (!moreOpen.value) return;
  moreOpen.value = false;
  document.querySelector('.qv-tabs button[aria-controls="qv-more-tools"]')?.focus();
}

async function retryCurrentView() {
  if (tab.value === 'thread' && activeConv.value?.id) { error.value = ''; await openConversation(activeConv.value); }
  else if (tab.value === 'chat' && activeChatId.value) { error.value = ''; await loadChatMessages(); }
  else if (tab.value === 'tasks' && taskSuite.value === 'lists') {
    try { error.value = ''; await loadSharedLists(); } catch { error.value = 'Could not load shared lists. Try again.'; }
  } else if (tab.value === 'tasks' && taskSuite.value === 'projects') {
    try { error.value = ''; await loadProjects(); } catch { error.value = 'Could not load projects. Try again.'; }
  } else await navigateTo(tab.value);
}
const sort = ref('all');
const msgSuite = ref('email');
const conversations = ref([]);
const activeConv = ref(null);
const threadMessages = ref([]);
const chatList = ref([]);
const inboxItems = ref([]);
const msgLoading = ref(false);
const activeChatId = ref(null);
const activeChatTitle = ref('');
const chatMessages = ref([]);
const chatReply = ref('');
const chatBusy = ref(false);
const tasks = ref([]);
const taskView = ref('assigned');
const taskSuite = ref('assigned');
const taskCounts=ref({assigned:null,mine:null,lists:null,projects:null});let taskCountRequest=0;
async function loadTaskCounts(){if(!session.value)return;const request=++taskCountRequest,token=session.value;try{const {data}=await axios.get(`${apiBase}/task-counts`,{headers:authHeaders(),withCredentials:true});if(request===taskCountRequest && token===session.value)taskCounts.value=data.counts || {assigned:null,mine:null,lists:null,projects:null};}catch{if(request===taskCountRequest && token===session.value)taskCounts.value={assigned:null,mine:null,lists:null,projects:null};}}
const taskLists = ref([]);
const taskProjects = ref([]);
const suiteTasks = ref([]);
const suiteDetailTitle = ref('');
const suiteMembers = ref([]);
const suiteLists = ref([]);
const suiteStats = ref(null);
const taskDetail = ref(null),taskOpening=ref(null),taskAction=ref(null),taskDueValue=ref(''),taskActionBusy=ref(false);let taskActionRequest=0;
const suiteDetailId=ref(null);
const taskAssigneeOptions=computed(()=>[...new Map([...directoryProviders.value,...directorySchool.value].filter(person=>!person.agencyId || Number(person.agencyId)===Number(sessionAgencyId.value)).map(person=>[Number(person.id),person])).values()]);
const fullTaskUrl=computed(()=>{if(!loginUrl.value || !taskDetail.value)return '';try{const target=new URL(loginUrl.value,window.location.origin);target.pathname=target.pathname.replace(/\/(?:login|dashboard)\/?$/,'')+'/tasks';target.search='';return target.href;}catch{return '';}});
async function reloadTaskDetail(){if(!taskDetail.value)return;await openTaskDetail(taskDetail.value.task);await loadTasks(taskView.value);}

let taskDetailRequest = 0;
const taskComment = ref('');
const taskCommentBusy = ref(false);
const taskAssignId = ref(null);
const taskListPickId = ref(null);
const calEvent = ref(null);
const extendBusy = ref(false);
const noteAidTools = ref([]);
const noteAidToolId = ref('');
const noteAidInput = ref('');
const noteAidOutput = ref('');
const noteAidBusy = ref(false);
const noteAidDos = ref(new Date().toISOString().slice(0, 10));
const noteAidInitials = ref('');
const noteAidMode = ref('type');
const noteAidSpeaking = ref(false);
const noteAidCopied = ref('');
const noteAidDrawer = ref([]);
const noteAidSections = ref([]);
let noteAidRecognition = null;
let noteAidSpeakTimer = null;
let noteAidRequest = 0;

const speechSupported = computed(() => {
  try {
    return !!(privateSpeechRecognition());
  } catch {
    return false;
  }
});
const canRunNoteAid = computed(() =>
  !!(noteAidDos.value && noteAidInitials.value.trim() && noteAidInput.value.trim())
);
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const day = ref(localDay());
const selectedCalendarDayLabel=computed(()=>/^\d{4}-\d{2}-\d{2}$/.test(day.value)?new Date(day.value+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}):'Choose a date');
const calendarLoading = ref(false);
const calendarTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver';
const dayItems = ref([]);
const calendarMode=ref('agenda'),calendarHours=Array.from({length:24},(_,hour)=>hour);
function itemsAtHour(hour){return dayItems.value.filter(item=>item.allDay?hour===0:Number(new Intl.DateTimeFormat('en-US',{timeZone:calendarTimeZone,hour:'numeric',hourCycle:'h23'}).format(new Date(item.startAt)))===hour);}
const showOffice = ref(false);
const officeSlots = ref([]);
const officeLocations = ref([]);
const officeRoster = ref([]);
const officeFilterId = ref(null);
const contacts = ref([]);
const contactSuite = ref('providers');
const directoryProviders = ref([]);
const directorySchool = ref([]);
const dmBusyId = ref(null);
const sessionAgencyId = ref(null);
const homeScreenTip = ref(false);
let heartbeatTimer = null;
let refreshTimer = null;
let undoTimer = null;

const showCompose = ref(false);
const mobileEmailContext=ref(null);
function openMobileEmailDraft(context={}){mobileEmailContext.value={quickView:true,session:session.value,apiBase,agencyId:sessionAgencyId.value,mode:'new',...context};showCompose.value=true;}
const composeToEmail = ref('');
const composeSubject = ref('');
const composeText = ref('');
const composeBusy = ref(false);
const composeAvailability = ref(null);
const replyAvailability = ref(null);
const showNewTask = ref(false);
const newTaskTitle = ref('');
const newTaskDue = ref('');
const taskBusy = ref(false);
const showNewContact = ref(false);
const newContactName = ref('');
const newContactEmail = ref('');
const newContactPhone = ref('');
const contactBusy = ref(false);
const mailboxEmail = ref('');
const modalOpen = computed(() => !!session.value && !!(taskOpening.value || taskAction.value || showCompose.value || showNewTask.value || showNewContact.value || taskDetail.value || calEvent.value || showMobileReply.value));
let modalReturnFocus = null;

function trapDialogFocus(event) {
  if (!modalOpen.value) return;
  const modal = event.currentTarget.closest('.qv-modal') || event.currentTarget.querySelector('.qv-modal');
  const controls = Array.from(modal?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(element => element.getClientRects().length);
  if (!controls.length) return;
  const first = controls[0]; const last = controls.at(-1);
  if (!modal.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

watch(modalOpen, async (open) => {
  if (open) modalReturnFocus = document.activeElement;
  await nextTick();
  if (open && modalOpen.value) document.querySelector('.qv-modal button, .qv-modal input, .qv-modal textarea, .qv-modal a[href]')?.focus();
  else if (!open) {
    if (session.value && modalReturnFocus?.isConnected) modalReturnFocus.focus();
    else document.getElementById('quick-view-passcode')?.focus();
    modalReturnFocus = null;
  }
});
const homeCursor = ref(null);
const homeOlderLoading = ref(false);
const replyMode = ref('reply');
const replyTo = ref('');
const replyCc = ref('');
const replyBcc = ref('');
const replyAttachments = ref([]);
const composeCc = ref('');
const composeBcc = ref('');
const composeAttachments = ref([]);
const threadLoading = ref(false);
const nextBeforeId = ref(null);
const olderLoading = ref(false);
const sendNotice = ref('');
const undoSend = ref(null);
const emailDrafts = new Map(),emailDetailCache=new Map();let emailCacheEpoch=0;
function clearCachedEmailAccess(){++emailCacheEpoch;++conversationRequest;emailDetailCache.clear();threadMessages.value=[];activeConv.value=null;threadLoading.value=false;error.value='Conversation access changed. Return to Messages and refresh.';}
const chatDrafts = new Map();
const chatAttachments = ref([]);
const chatParentId = ref(null);
const chatLoading = ref(false);
const chatOlderId = ref(null);
const chatUploadBusy = ref(false);
const chatDraftKey = () => `${activeChatId.value}:${chatParentId.value || 'root'}`;
function rememberChatDraft() { if (activeChatId.value) chatDrafts.set(chatDraftKey(), { body: chatReply.value, attachments: chatAttachments.value }); }
function restoreChatDraft() { const draft = chatDrafts.get(chatDraftKey()); chatReply.value = draft?.body || ''; chatAttachments.value = draft?.attachments || []; }

let conversationRequest = 0;
let homeRequest = 0;
let chatRequest = 0;
let calendarRequest = 0;
function rememberReply() {
  if (activeConv.value?.id) emailDrafts.set(activeConv.value.id, { text: replyText.value, mode: replyMode.value, to: replyTo.value, cc: replyCc.value, bcc: replyBcc.value, attachments: replyAttachments.value });
}
function changeReplyMode(mode) {
  replyMode.value = mode;
  const addresses = emailReplyRecipients(threadMessages.value, { mode, inboxEmail: activeConv.value?.inbox_from_email || mailboxEmail.value });
  replyTo.value = addresses.to.join(', '); replyCc.value = addresses.cc.join(', '); replyBcc.value = '';
}
function chooseReplyMode(mode){changeReplyMode(mode);if(mobileEmailReply.value && showMobileReply.value)mobileNavigate({...route.query,compose:mode},{replace:true});}
async function selectEmailFiles(event, composer = false) {
  try { const files = await encodeEmailFiles(event.target.files || []); if (composer) composeAttachments.value = files; else replyAttachments.value = files; }
  catch (e) { error.value = e.message; }
}
async function downloadEmailFile(a) {
  try {
    const { data } = await axios.get(`${apiBase}/conversations/${activeConv.value.id}/attachments/${a.id}`, { headers: authHeaders(), withCredentials: true, responseType: 'blob' });
    if(isMobile.value && Capacitor.isNativePlatform()){const bytes=new Uint8Array(await data.arrayBuffer());let binary='';for(let start=0;start<bytes.length;start+=32768)binary+=String.fromCharCode(...bytes.subarray(start,start+32768));await registerPlugin('AuricwellDevice').shareFile({data:btoa(binary),filename:a.filename || 'attachment'});return;}
    const url = URL.createObjectURL(data); const link = document.createElement('a'); link.href = url; link.download = a.filename || 'attachment'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { error.value = 'Could not download attachment'; }
}
async function likeEmail(m) {
  const id = activeConv.value?.id;
  try {
    const active = !(m.reactions || []).some((r) => r.emoji === '❤️' && r.reactedByMe);
    const { data } = await axios.post(`${apiBase}/conversations/${id}/messages/${m.id}/reaction`, { active }, { headers: authHeaders(), withCredentials: true });
    if (activeConv.value?.id === id) m.reactions = data.reactions || [];
  } catch { error.value = 'Could not update like'; }
}
function offerUndo(conversationId, messageId, draft) {
  clearTimeout(undoTimer);
  undoSend.value = { conversationId, messageId, draft };
  undoTimer = setTimeout(() => { undoSend.value = null; sendNotice.value = 'Email queued for delivery. Check the conversation for delivery status.'; }, 20000);
}
async function undoEmail() {
  const target = undoSend.value;
  if (!target) return;
  try {
    const { data } = await axios.post(`${apiBase}/conversations/${target.conversationId}/messages/${target.messageId}/undo`, {}, { headers: authHeaders(), withCredentials: true });
    rememberReply();
    const draft = target.draft || { text: data.body || '', mode: 'reply', attachments: [] };
    if (draft.mode === 'forward') { draft.mode = 'reply'; draft.text = data.body || draft.text; }
    if (data.attachments?.length) draft.attachments = data.attachments;
    emailDrafts.set(target.conversationId, draft);
    undoSend.value = null; sendNotice.value = 'Send cancelled. Your message is available to edit.';
    await openConversation({ id: target.conversationId }, { preserveCurrent: false });
    if (data.attachmentRestoreFailed) error.value = 'Send cancelled. Some attachments could not be restored; reattach them before sending.';
  } catch (e) { error.value = e?.response?.data?.error?.message || 'The undo window has ended'; }
}
const replyText = ref('');
const replyBusy = ref(false);

const DAY_START = 0;
const DAY_END = 24;
const dayHours = computed(() => {
  const hours = [];
  for (let h = DAY_START; h < DAY_END; h += 1) hours.push(h);
  return hours;
});

const brandStyle = computed(() => {
  return {
    '--qv-primary': '#2563eb',
    '--qv-secondary': '#1d4ed8',
    '--qv-accent': '#2563eb',
    '--qv-primary-soft': '#eef4ff',
    '--qv-bg': '#f4f7fb',
    '--qv-surface': '#ffffff',
    '--qv-border': '#e3eaf3',
    '--qv-text': '#172b4d',
    '--qv-muted': '#62748e',
    '--qv-tab-ink': '#62748e',
    '--text-primary': '#172b4d',
    '--text-secondary': '#62748e',
    '--text-muted': '#62748e',
    color: '#172b4d'
  };
});

const filteredConversations = computed(() => {
  let list = conversations.value || [];
  if (sort.value === 'unknown') list = list.filter(c=>c.is_unknown_sender);
  if (sort.value === 'unread') list = list.filter((c) => c.is_unread);
  if (sort.value === 'needs') list = list.filter((c) => ['new', 'needs_reply'].includes(c.status));
  if (sort.value === 'secure') list = list.filter((c) => String(c.channel || '').toLowerCase() === 'secure');
  return list;
});

const myOfficeSlots = computed(() => officeSlots.value || []);
const filteredOffices = computed(() => {
  const list = officeRoster.value || [];
  if (!officeFilterId.value) return list;
  return list.filter((o) => Number(o.id) === Number(officeFilterId.value));
});
const directorySearchOpen=ref(false),directorySearch=ref(''),directoryAgency=ref('all'),directoryAgencies=ref([]);
const matchesDirectory=person=>!directorySearch.value.trim() || [person.displayName,person.credential,person.schoolName,person.agencyName,person.workEmail,person.email,person.display_name].filter(Boolean).join(' ').toLowerCase().includes(directorySearch.value.trim().toLowerCase());
const directoryPeople=computed(()=>(contactSuite.value==='school'?directorySchool.value:directoryProviders.value).filter(p=>(directoryAgency.value==='all'||String(p.agencyId || sessionAgencyId.value)===directoryAgency.value)&&matchesDirectory(p)));
const directorySavedContacts=computed(()=>contacts.value.filter(matchesDirectory));
function directoryDial(person){const phone=String(person.workPhone || '').replace(/[^+0-9]/g,''),extension=String(person.workPhoneExtension || '').replace(/\D/g,'');return phone ? `tel:${phone}${extension?`;ext=${extension}`:''}` : null;}

function applyBranding(data = {}) {
  if (data.agencyName) agencyName.value = data.agencyName;
  if (data.agencyLogoUrl != null) agencyLogoUrl.value = data.agencyLogoUrl || '';
  if (data.agencyPrimaryColor) agencyPrimaryColor.value = data.agencyPrimaryColor;
  if (data.colorPalette) colorPalette.value = data.colorPalette;
  else if (data.agencyPrimaryColor) {
    colorPalette.value = {
      ...(colorPalette.value || {}),
      primary: data.agencyPrimaryColor
    };
  }
  if (data.loginUrl) loginUrl.value = data.loginUrl;
  if (data.agencyId) sessionAgencyId.value = data.agencyId;
}

function authHeaders() {
  const h = {};
  const tok = session.value;
  if (tok && tok !== 'cookie') h['X-Quick-View-Session'] = tok;
  return h;
}

const isDelivery = computed(() =>
  route.name === 'QuickViewDeliveryAccess'
  || route.name === 'QuickViewDeliveryShort'
  || route.meta?.quickViewDelivery === true
);

const sessionOnly = computed(() => route.meta?.quickViewSessionOnly === true);

async function resumeSession() {
  if(isMobile.value){session.value=props.mobileSession.sessionToken;expiresAt.value=props.mobileSession.expiresAt;sessionUserId.value=props.mobileSession.userId;sessionAgencyId.value=props.mobileSession.agencyId;agencyName.value=props.mobileSession.profile?.workspace?.name || '';loginUrl.value=props.mobileSession.profile?.workspace?.loginUrl || '';loading.value=false;startHeartbeat();await loadWorkspacePreferences();void loadWorkspaceBadges();void loadMessageBadge();await openDeepLink();if(route.query.view && route.query.view!=='home')await navigateTo(String(route.query.view),{fromRoute:true});return;}
  loading.value = true;
  error.value = '';
  try {
    let stored = '';
    try {
      stored = String(sessionStorage.getItem('plottwist.quickViewSession') || '').trim();
    } catch { /* ignore */ }
    if (stored) session.value = stored;
    else session.value = 'cookie';

    const { data } = await axios.post(
      `${apiBase}/session/heartbeat`,
      {},
      { headers: authHeaders(), withCredentials: true }
    );
    expiresAt.value = data.expiresAt;
    if (data.userId) sessionUserId.value = data.userId;
    if (data.agencyId) sessionAgencyId.value = data.agencyId;
    if (stored) session.value = stored;
    startHeartbeat();
    // Branding from tenant endpoint when possible
    try {
      const host = window.location.hostname;
      const tenant = await axios.get(`${apiBase}/tenant`, {
        params: { host: host.replace(/^qv\./, '') },
        withCredentials: true
      });
      applyBranding(tenant.data);
      installQuickViewManifest();
    } catch { /* ignore */ }
    await loadHome();
    await openDeepLink();
  } catch {
    clearSession();
    try { sessionStorage.removeItem('plottwist.quickViewSession'); } catch { /* ignore */ }
    // Back to PIN launcher
    window.location.replace(`/qv?${new URLSearchParams(quickViewDeepLink(route.query))}`);
  } finally {
    loading.value = false;
  }
}

function rememberBookmark() {
  const token = String(route.params.token || '').trim();
  if (!token) return;
  const path = isDelivery.value
    ? `/quick-view/d/${token}`
    : (route.name === 'QuickViewTokenShort' || isQvHostPath() ? `/t/${token}` : `/quick-view/${token}`);
  try {
    localStorage.setItem(BOOKMARK_KEY, path);
    localStorage.setItem(TOKEN_KEY, token);
  } catch { /* ignore */ }
}

function isQvHostPath() {
  try {
    return String(window.location.hostname || '').toLowerCase().startsWith('qv');
  } catch {
    return false;
  }
}

function installQuickViewManifest() {
  if (typeof document === 'undefined') return;
  const origin = window.location.origin;
  const schoolQuickView = window.location.hostname === 'qv.app.schoolcarebridge.org';
  const productName = schoolQuickView ? 'Quick View' : 'AuricWell';
  const name = agencyName.value ? `${agencyName.value} · ${productName}` : productName;
  const iconSrc = agencyLogoUrl.value || (schoolQuickView ? '/assets/ptco/logo-flat.png' : AURICWELL_PREVIEW_URL);
  const theme = agencyPrimaryColor.value || colorPalette.value?.primary || '#2563eb';
  // Server-served manifest so iOS "Open as Web App" uses this origin's root — not plottwisthq /
  const href =
    `${apiBase}/pwa-manifest?` +
    new URLSearchParams({
      origin,
      name,
      theme,
      icon: iconSrc
    }).toString();
  try {
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);
    const apple = document.getElementById('app-apple-touch-icon');
    if (apple && agencyLogoUrl.value) apple.setAttribute('href', agencyLogoUrl.value);
    document.title = name;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', theme);
  } catch { /* ignore */ }
}

function dismissHomeTip() {
  homeScreenTip.value = false;
  try {
    localStorage.setItem(HOME_TIP_KEY, '1');
  } catch { /* ignore */ }
}

async function loadTokenInfo() {
  loading.value = true;
  error.value = '';
  rememberBookmark();
  try {
    const token = String(route.params.token || '');
    const path = isDelivery.value ? `/d/${encodeURIComponent(token)}` : `/t/${encodeURIComponent(token)}`;
    const { data } = await axios.get(`${apiBase}${path}`, {
      params: { join: route.query.join, id: route.query.id },
      withCredentials: true
    });
    tokenInfo.value = data;
    applyBranding(data);
    isLocked.value = !!data.isLocked || !!data.requiresReset;
    if (loginUrl.value) {
      try { localStorage.setItem(LOGIN_URL_KEY, loginUrl.value); } catch { /* ignore */ }
    }
    installQuickViewManifest();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Invalid Quick View link';
  } finally {
    loading.value = false;
  }
}

async function unlock() {
  unlocking.value = true;
  error.value = '';
  try {
    const token = String(route.params.token || '');
    const body = {
      passcode: passcode.value,
      email: credentialEmail.value.trim() || undefined,
      agencyId: tokenInfo.value?.agencyId || null
    };
    if (route.query.join && route.query.id) {
      body.meetingEventType = String(route.query.join);
      body.meetingEventId = Number(route.query.id);
    }
    const path = isDelivery.value
      ? `/d/${encodeURIComponent(token)}/unlock`
      : `/t/${encodeURIComponent(token)}/unlock`;
    const { data } = await axios.post(`${apiBase}${path}`, body, { withCredentials: true });
    session.value = data.sessionToken;
    if (data.deepLinkPath) tokenInfo.value = { ...(tokenInfo.value || {}), deepLinkPath: data.deepLinkPath };
    expiresAt.value = data.expiresAt;
    if (data.userId) sessionUserId.value = data.userId;
    if (data.agencyId) sessionAgencyId.value = data.agencyId;
    else if (tokenInfo.value?.agencyId) sessionAgencyId.value = tokenInfo.value.agencyId;
    rememberBookmark();
    startHeartbeat();
    await loadHome();
    await openDeepLink();
  } catch (e) {
    const err = e?.response?.data?.error || {};
    error.value = err.message || 'Unlock failed';
    if (err.requiresReset || err.code === 'locked') {
      isLocked.value = true;
      if (err.loginUrl) loginUrl.value = err.loginUrl;
    }
  } finally {
    unlocking.value = false;
  }
}

function checkDeadline(){
  clockNow.value=Date.now();
  if(session.value && expiresAt.value && remainingSeconds.value<=0){if(isMobile.value && props.mobileSession.profile?.appLock?.method==='none'){emit('refresh-session');return;}clearSession();if(isMobile.value)return;error.value='Quick View timed out. Use your saved six-digit code to reopen it.';if(!tokenInfo.value)window.location.replace(`/qv?${new URLSearchParams(quickViewDeepLink(route.query))}`);}
}
async function recordActivity(event){
  if(!event.isTrusted || document.hidden)return;
  checkDeadline();
  if(isMobile.value && props.mobileSession.profile?.appLock?.method==='none' && remainingSeconds.value<=0)return;
  if(!session.value || activityPending || Date.now()-lastActivitySent<30000)return;
  const activeSession=session.value;activityPending=true;lastActivitySent=Date.now();
  try{const {data}=await axios.post(`${apiBase}/session/heartbeat`,{activity:true},{headers:authHeaders(),withCredentials:true});if(session.value===activeSession)expiresAt.value=data.expiresAt;}
  catch(e){if(session.value===activeSession && e.response?.status===401){if(isMobile.value && props.mobileSession.profile?.appLock?.method==='none'){emit('refresh-session');return;}clearSession();error.value='Quick View timed out. Reopen it with your code.';}}
  finally{activityPending=false;}
}
function startHeartbeat() {
  stopHeartbeat();
  deadlineTimer=setInterval(checkDeadline,1000);
  refreshTimer = setInterval(() => {refreshMessages();void loadWorkspaceBadges();void loadMessageBadge();}, 15000);
  heartbeatTimer = setInterval(async () => {
    const activeSession=session.value;
    try {
      const { data } = await axios.post(
        `${apiBase}/session/heartbeat`,
        {},
        { headers: authHeaders(), withCredentials: true }
      );
      if(session.value===activeSession)expiresAt.value = data.expiresAt;
    } catch(e) {
      if(session.value===activeSession && e.response?.status===401){if(isMobile.value && props.mobileSession.profile?.appLock?.method==='none'){emit('refresh-session');return;}clearSession();error.value='Quick View timed out. Reopen it with your code.';}
    }
  }, 60000);
}
function stopHeartbeat() {
  clearInterval(deadlineTimer);deadlineTimer=null;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

async function refreshMessages() {
  if(isMobile.value && ['home','chat'].includes(tab.value))return;
  if (!session.value || props.overlayOpen || document.visibilityState === 'hidden' || threadLoading.value || replyBusy.value || chatBusy.value) return;
  try {
    if (tab.value === 'chat') { await loadChatMessages({ quiet: true }); return; }
    if (tab.value === 'thread' && activeConv.value?.id) {
      const id = activeConv.value.id; const request = conversationRequest;
      const { data } = await axios.get(`${apiBase}/conversations/${id}`, { headers: authHeaders(), withCredentials: true });
      if (request !== conversationRequest || tab.value !== 'thread' || activeConv.value?.id !== id) return;
      const merged = new Map(threadMessages.value.map((m) => [m.id, m])); (data.messages || []).forEach((m) => merged.set(m.id, m));
      threadMessages.value = [...merged.values()].sort((a, b) => new Date(a.sent_at || a.created_at) - new Date(b.sent_at || b.created_at) || Number(a.id) - Number(b.id));
      if(isMobile.value)emailDetailCache.set(String(id),{data:{...data,messages:threadMessages.value},at:Date.now()});
    } else if (tab.value === 'home' && ['email', 'sms'].includes(msgSuite.value) && sort.value !== 'drafts') {
      const request = homeRequest; const channel = msgSuite.value;
    const { data } = await axios.get(`${apiBase}/home`, { params: { channel, filter:sort.value }, headers: authHeaders(), withCredentials: true });
      if (request === homeRequest && tab.value === 'home' && channel === msgSuite.value) {
        const merged = new Map(conversations.value.map((c) => [c.id, c])); (data.conversations || []).forEach((c) => merged.set(c.id, c));
        conversations.value = sort.value === 'unread' ? (data.conversations || []) : [...merged.values()].sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
      }
    }
  } catch(e) { if(isMobile.value && [401,403].includes(e.response?.status))clearCachedEmailAccess(); /* Temporary network failures retain the current view. */ }
}

async function loadHome(channel = 'email') {
  const request = ++homeRequest;
  error.value = ''; msgLoading.value = true;
  msgSuite.value = channel; tab.value = 'home';
  try {
      if(sort.value === 'drafts' && channel === 'email') {
      const {data}=await axios.get(`${apiBase}/drafts`,{headers:authHeaders(),withCredentials:true});
      if(request!==homeRequest)return;
      conversations.value=(data.drafts||[]).map(d=>({id:d.id,draftId:d.id,channel:'email',subject:d.subject||'Draft',last_message_preview:d.preview,last_message_at:d.updated_at}));homeCursor.value=null;return;
    }
    const { data } = await axios.get(`${apiBase}/home`, { params: { channel, filter:sort.value }, headers: authHeaders(), withCredentials: true });
    if (request !== homeRequest || msgSuite.value !== channel) return;
    conversations.value = data.conversations || [];
    homeCursor.value = data.nextCursor || null;
    mailboxEmail.value = data.mailboxEmail || '';
  } catch (e) {
    if (request === homeRequest) error.value = e?.response?.data?.error?.message || 'Could not load messages';
  } finally { if (request === homeRequest) msgLoading.value = false; }
}

async function loadOlderConversations() {
  if (!homeCursor.value || homeOlderLoading.value) return;
  const channel = msgSuite.value; const request = homeRequest;
  homeOlderLoading.value = true;
  try {
    const { data } = await axios.get(`${apiBase}/home`, { params: { channel, filter:sort.value, ...homeCursor.value }, headers: authHeaders(), withCredentials: true });
    if (request !== homeRequest) return;
    const merged = new Map(conversations.value.map((c) => [c.id, c])); (data.conversations || []).forEach((c) => merged.set(c.id, c));
    conversations.value = [...merged.values()]; homeCursor.value = data.nextCursor || null;
  } catch { error.value = 'Could not load older conversations'; }
  finally { homeOlderLoading.value = false; }
}

async function retryHome() {
  await loadHome();
}

async function switchMsgSuite(suite) {
  msgSuite.value = suite;
  tab.value = 'home';
  chatList.value = [];
  inboxItems.value = [];
  const request = ++homeRequest;
  if (suite === 'email') {
    await loadHome();
    return;
  }
  if (suite === 'sms') { await loadHome('sms'); return; }
  msgLoading.value = true;
  error.value = '';
  try {
    if (suite === 'direct') {
      const { data } = await axios.get(`${apiBase}/chat/threads`, {
        headers: authHeaders(),
        withCredentials: true,
        params: { agencyId: 'all' }
      });
      if (request !== homeRequest) return;
      const rows = Array.isArray(data) ? data : (data.threads || []);
      chatList.value = rows.filter((t) => String(t.thread_type || 'direct').toLowerCase() === 'direct' && t.message_channel !== 'secure');
    } else if (suite === 'channels') {
      const { data } = await axios.get(`${apiBase}/chat/channels`, {
        headers: authHeaders(),
        withCredentials: true
      });
      if (request !== homeRequest) return;
      chatList.value = data.channels || [];
    } else if (suite === 'threads') {
      const { data } = await axios.get(`${apiBase}/chat/inbox/threads`, {
        headers: authHeaders(),
        withCredentials: true
      });
      if (request !== homeRequest) return;
      inboxItems.value = data.items || [];
    } else if (suite === 'mentions') {
      const { data } = await axios.get(`${apiBase}/chat/inbox/mentions`, {
        headers: authHeaders(),
        withCredentials: true
      });
      if (request !== homeRequest) return;
      inboxItems.value = data.items || [];
    } else if (suite === 'files') {
      const { data } = await axios.get(`${apiBase}/chat/inbox/files`, {
        headers: authHeaders(),
        withCredentials: true
      });
      if (request !== homeRequest) return;
      inboxItems.value = data.files || data.items || [];
    }
  } catch (e) {
    if (request === homeRequest) error.value = e?.response?.data?.error?.message || 'Could not load messages';
  } finally {
    if (request === homeRequest) msgLoading.value = false;
  }
}

function chatTitle(t) {
  if (t.thread_label) return t.thread_label;
  if (t.name || t.channel_name) return t.name || t.channel_name;
  const other = t.other_participant || t.participants?.[0];
  if (other) {
    const name = `${other.first_name || ''} ${other.last_name || ''}`.trim();
    if (name) return name;
  }
  const fn = t.other_first_name || '';
  const ln = t.other_last_name || '';
  const name = `${fn} ${ln}`.trim();
  return name || t.title || `Thread ${t.thread_id || t.id}`;
}

function itemKey(item) {
  return item.id || item.message_id || item.file_id || `${item.thread_id}-${item.created_at}`;
}
function inboxTitle(item) {
  if (msgSuite.value === 'files') return item.file_name || item.original_name || item.name || item.body?.slice?.(0, 40) || 'File';
  if (msgSuite.value === 'mentions') return item.channel_name || item.thread_title || 'Mention';
  return item.channel_name || item.root_body?.slice?.(0, 48) || item.thread_title || 'Open thread';
}
function inboxPreview(item) {
  if (msgSuite.value === 'threads') {
    return item.latest_reply?.body || item.root_body || `${item.reply_count || 0} replies`;
  }
  if (msgSuite.value === 'mentions') return item.body || item.message_body || '';
  return item.body || item.preview || item.file_name || item.sender_name || '';
}

async function openChatThread(t) {
  let threadId = Number(t.thread_id || t.id);
  if (msgSuite.value === 'channels' && !t.is_member && !t.isMember) {
    try {
      await axios.post(
        `${apiBase}/chat/channels/${threadId}/open`,
        {},
        { headers: authHeaders(), withCredentials: true }
      );
    } catch (e) {
      error.value = e?.response?.data?.error?.message || 'Could not open channel';
      return;
    }
  }
  rememberChatDraft();
  activeChatId.value = threadId; chatParentId.value = null; restoreChatDraft();
  activeChatTitle.value = chatTitle(t);
  tab.value = 'chat';
  if(isMobile.value && String(route.query.threadId || '')!==String(threadId))await mobileNavigate({view:'home',suite:msgSuite.value,threadId:String(threadId)});
  await loadChatMessages();
}

async function openInboxItem(item) {
  const threadId = Number(item.thread_id || item.threadId);
  if (!threadId) return;
  rememberChatDraft();
  activeChatId.value = threadId; chatParentId.value = Number(item.root_message_id || item.parent_message_id) || null; restoreChatDraft();
  activeChatTitle.value = inboxTitle(item);
  tab.value = 'chat';
  await loadChatMessages();
}

async function loadChatMessages({ older = false, quiet = false } = {}) {
  const id = activeChatId.value; const parentId = chatParentId.value;
  if (!id) return;
  const request = ++chatRequest;
  const cursor = older ? chatOlderId.value : null;
  if (!quiet && !older) chatMessages.value = [];
  chatLoading.value = !quiet;
  try {
    const { data } = await axios.get(`${apiBase}/chat/threads/${id}/messages`, { headers: authHeaders(), withCredentials: true, params: { parentMessageId: parentId || undefined, beforeId: cursor || undefined } });
    if (request !== chatRequest || activeChatId.value !== id || chatParentId.value !== parentId) return;
    const messages = Array.isArray(data) ? data : (data.messages || []);
    if (quiet) {
      const merged = new Map(chatMessages.value.map((m) => [m.id, m])); messages.forEach((m) => merged.set(m.id, m));
      chatMessages.value = [...merged.values()].sort((a, b) => a.id - b.id);
    } else { chatMessages.value = older ? [...messages, ...chatMessages.value] : messages; chatOlderId.value = messages.length === 60 ? messages[0].id : null; }
    const lastId = messages.at(-1)?.id;
    if (lastId && !older && !parentId) axios.post(`${apiBase}/chat/threads/${id}/read`, { lastReadMessageId: lastId }, { headers: authHeaders(), withCredentials: true }).catch(() => {});
  } catch (e) { if (request === chatRequest && !quiet) error.value = e?.response?.data?.error?.message || 'Could not load chat'; }
  finally { if (request === chatRequest) chatLoading.value = false; }
}
function closeChat() {
  rememberChatDraft(); ++chatRequest;
  tab.value = 'home'; activeChatId.value = null; chatMessages.value = [];
}
async function openChatReplies(messageId = null) {
  rememberChatDraft(); chatParentId.value = messageId; restoreChatDraft();
  await loadChatMessages();
}
async function likeChat(m) {
  const id = activeChatId.value; const parentId = chatParentId.value;
  try {
    const base = `${apiBase}/chat/messages/${m.id}/reactions`;
    const config = { headers: authHeaders(), withCredentials: true };
    if ((m.reactions || []).some((r) => r.code === '❤️' && r.mineActive)) await axios.delete(`${base}/${encodeURIComponent('❤️')}`, config);
    else await axios.post(base, { code: '❤️' }, config);
    if (id === activeChatId.value && parentId === chatParentId.value) await loadChatMessages({ quiet: true });
  } catch { error.value = 'Could not update like'; }
}
async function uploadChatFile(event) {
  const file = event.target.files?.[0]; if (!file) return;
  if (file.size > 15 * 1024 * 1024) { error.value = 'Attachments must be 15 MB or smaller'; return; }
  const id = activeChatId.value; const key = chatDraftKey();
  chatUploadBusy.value = true;
  try {
    const form = new FormData(); form.append('file', file);
    const { data } = await axios.post(`${apiBase}/chat/threads/${id}/attachments`, form, { headers: authHeaders(), withCredentials: true });
    if (!session.value) return;
    if (key === chatDraftKey()) chatAttachments.value.push(data);
    else { const draft = chatDrafts.get(key) || { body: '', attachments: [] }; draft.attachments.push(data); chatDrafts.set(key, draft); }
  } catch { error.value = 'Could not upload attachment'; }
  finally { chatUploadBusy.value = false; event.target.value = ''; }
}

function chatBubbleClass(m) {
  if (sessionUserId.value && Number(m.sender_user_id) === Number(sessionUserId.value)) return 'outbound';
  return m.direction || 'inbound';
}

async function sendChatMessage() {
  const id = activeChatId.value; const parentId = chatParentId.value; const key = chatDraftKey();
  if (!id || chatBusy.value || chatUploadBusy.value || (!chatReply.value.trim() && !chatAttachments.value.length)) return;
  chatBusy.value = true;
  const sessionAtSend = session.value;
  try {
    await axios.post(`${apiBase}/chat/threads/${id}/messages`, { body: chatReply.value.trim(), parentMessageId: parentId, attachments: chatAttachments.value }, { headers: authHeaders(), withCredentials: true });
    if (session.value !== sessionAtSend) return;
    chatDrafts.delete(key);
    if (key === chatDraftKey()) { chatReply.value = ''; chatAttachments.value = []; await loadChatMessages({ quiet: true }); }
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Send failed'; }
  finally { chatBusy.value = false; }
}

async function openConversation(c, { refresh = false, preserveCurrent = true } = {}) {
  if(c.draftId)return openEmailComposer(router,{quickView:true,session:session.value,draftId:c.draftId});
  dismissQuickPreview();if(!refresh){showMobileReply.value=false;showReplyCopies.value=false;}
  if (preserveCurrent) rememberReply();
  const request = ++conversationRequest,activeToken=session.value,cacheEpoch=emailCacheEpoch;
  const cached=isMobile.value && !refresh?emailDetailCache.get(String(c.id)):null;
  const fresh=cached && Date.now()-cached.at<60000;
  activeConv.value = fresh?cached.data.conversation:c; threadMessages.value = fresh?cached.data.messages || []:[]; threadLoading.value = !fresh; tab.value = 'thread';
  if(isMobile.value)void mobileMessages.value?.markConversationRead(c);
  if(isMobile.value && String(route.query.conversationId || '')!==String(c.id))await mobileNavigate({...route.query,view:'home',suite:msgSuite.value,conversationId:String(c.id),threadId:undefined,parentId:undefined,secure:undefined,compose:undefined});
  if(isMobile.value){await nextTick();if(request!==conversationRequest || activeConv.value?.id!==c.id)return;document.getElementById('qv-workspace')?.scrollTo?.({top:0});}
  error.value = ''; nextBeforeId.value = null;
  replyText.value = ''; replyAttachments.value = [];
  try {
    const { data } = fresh?{data:cached.data}:await axios.get(`${apiBase}/conversations/${c.id}`, { headers: authHeaders(), withCredentials: true });
    if(session.value!==activeToken || cacheEpoch!==emailCacheEpoch)return;
    if(isMobile.value){emailDetailCache.set(String(c.id),{data,at:fresh?cached.at:Date.now()});if(emailDetailCache.size>12)emailDetailCache.delete(emailDetailCache.keys().next().value);}
    if (request !== conversationRequest || activeConv.value?.id !== c.id) return;
    activeConv.value = data.conversation || c;
    threadMessages.value = data.messages || []; nextBeforeId.value = data.nextBeforeId || null;
    changeReplyMode('reply');
    const draft = emailDrafts.get(c.id);
    if (draft && !refresh) { replyText.value = draft.text || ''; replyMode.value = draft.mode || 'reply'; replyTo.value = draft.to ?? replyTo.value; replyCc.value = draft.cc || ''; replyBcc.value = draft.bcc || ''; replyAttachments.value = draft.attachments || []; }
    c.is_unread = 0;
  } catch (e) { if (request === conversationRequest){if([401,403].includes(e.response?.status))clearCachedEmailAccess();error.value = e?.response?.data?.error?.message || 'Could not open conversation';} }
  finally { if (request === conversationRequest) threadLoading.value = false; }
}
async function loadOlderEmail() {
  const id = activeConv.value?.id; const cursor = nextBeforeId.value;
  if (!id || !cursor) return;
  olderLoading.value = true;
  try {
    const { data } = await axios.get(`${apiBase}/conversations/${id}`, { params: { beforeId: cursor }, headers: authHeaders(), withCredentials: true });
    if (activeConv.value?.id !== id) return;
    threadMessages.value = [...(data.messages || []), ...threadMessages.value]; nextBeforeId.value = data.nextBeforeId || null;
  } catch { error.value = 'Could not load older messages'; }
  finally { olderLoading.value = false; }
}

async function loadTasks(view = 'assigned') {
  taskView.value = view;
  taskSuite.value = view;
  tab.value = 'tasks';void loadTaskCounts();
  const { data } = await axios.get(`${apiBase}/tasks`, {
    headers: authHeaders(),
    withCredentials: true,
    params: { view }
  });
  tasks.value = data.tasks || [];
  void loadWorkspaceBadges(true);
}
function switchTasks() { loadTasks(taskView.value); }

async function loadSharedLists() {
  tab.value = 'tasks';
  taskSuite.value = 'lists';void loadTaskCounts();
  const { data } = await axios.get(`${apiBase}/task-lists`, {
    headers: authHeaders(),
    withCredentials: true
  });
  taskLists.value = data.lists || [];
}

async function loadProjects() {
  tab.value = 'tasks';
  taskSuite.value = 'projects';void loadTaskCounts();
  const { data } = await axios.get(`${apiBase}/task-projects`, {
    headers: authHeaders(),
    withCredentials: true
  });
  taskProjects.value = data.projects || [];
}

async function openSharedList(l) {
  suiteDetailId.value=l.id;
  suiteDetailTitle.value = l.name;
  taskSuite.value = 'listDetail';
  suiteMembers.value = [];
  suiteLists.value = [];
  suiteStats.value = null;
  const { data } = await axios.get(`${apiBase}/task-lists/${l.id}/tasks`, {
    headers: authHeaders(),
    withCredentials: true
  });
  suiteTasks.value = data.tasks || [];
  suiteMembers.value = data.members || [];
}

async function openProject(p) {
  suiteDetailId.value=p.id;
  suiteDetailTitle.value = p.name;
  taskSuite.value = 'projectDetail';
  suiteMembers.value = [];
  suiteLists.value = [];
  suiteStats.value = null;
  const { data } = await axios.get(`${apiBase}/task-projects/${p.id}`, {
    headers: authHeaders(),
    withCredentials: true
  });
  suiteTasks.value = data.tasks || [];
  suiteMembers.value = data.members || [];
  suiteLists.value = data.lists || [];
  suiteStats.value = data.stats || null;
}

function closeTaskDetail(){++taskDetailRequest;taskOpening.value=null;taskDetail.value=null;}
function closeTaskAction(){++taskActionRequest;taskAction.value=null;taskActionBusy.value=false;}
function localTaskDue(value){if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
async function openTaskAction(task,mode='preview'){
 const request=++taskActionRequest,token=session.value;taskAction.value={task,mode,loading:true,error:'',detail:null};taskDueValue.value=localTaskDue(task.due_at);
 try{const {data}=await axios.get(`${apiBase}/tasks/${task.id}`,{headers:authHeaders(),withCredentials:true});if(request!==taskActionRequest || token!==session.value)return;taskAction.value={task:data.task,mode,loading:false,error:'',detail:data};taskDueValue.value=localTaskDue(data.task.due_at);}
 catch(e){if(request===taskActionRequest && token===session.value)taskAction.value={task,mode,loading:false,error:e.response?.data?.error?.message || 'Could not load this task. Try again.',detail:null};}
}
async function refreshTaskSuite(){const kind=taskSuite.value,id=suiteDetailId.value,title=suiteDetailTitle.value;if(kind==='listDetail')await openSharedList({id,name:title});else if(kind==='projectDetail')await openProject({id,name:title});else if(kind==='lists')await loadSharedLists();else if(kind==='projects')await loadProjects();else await loadTasks(taskView.value);void loadTaskCounts();void loadWorkspaceBadges(true);}
async function saveTaskAction(){
 const action=taskAction.value;if(!action?.detail || taskActionBusy.value)return;
 if(action.mode==='due' && taskDueValue.value && !Number.isFinite(new Date(taskDueValue.value).getTime())){action.error='Choose a valid due date.';return;}
 const token=session.value;taskActionBusy.value=true;action.error='';
 try{await axios.patch(`${apiBase}/tasks/${action.task.id}${action.mode==='complete'?'/status':''}`,action.mode==='complete'?{status:'completed'}:{dueDate:taskDueValue.value?new Date(taskDueValue.value).toISOString():null},{headers:authHeaders(),withCredentials:true});if(token!==session.value)return;closeTaskAction();await refreshTaskSuite();}
 catch(e){if(token===session.value && taskAction.value===action)action.error=e.response?.data?.error?.message || 'The change could not be saved. Try again.';}
 finally{if(token===session.value)taskActionBusy.value=false;}
}
async function openTaskDetail(t) {
  if (!session.value) return;
  const request = ++taskDetailRequest;
  const activeSession = session.value;
  try {
    taskOpening.value=t;taskDetail.value=null;
    const detailRequest=axios.get(`${apiBase}/tasks/${t.id}`, {
      headers: authHeaders(),
      withCredentials: true
    });
    void loadDirectory('providers', { activate: false }).catch(() => {});
    const {data}=await detailRequest;
    if (request !== taskDetailRequest || session.value !== activeSession) return;
    taskDetail.value = data;taskOpening.value=null;
    taskComment.value = '';
    taskAssignId.value = data.task?.assigned_to_user_id || null;
    taskListPickId.value = data.task?.task_list_id || null;
  } catch (e) {
    if (request === taskDetailRequest && session.value === activeSession){taskOpening.value=null;error.value = e?.response?.data?.error?.message || 'Could not open task';}
  }
}

async function saveTaskAssign() {
  if (!taskDetail.value?.task?.id) return;
  try {
    await axios.patch(
      `${apiBase}/tasks/${taskDetail.value.task.id}`,
      { assignedToUserId: taskAssignId.value },
      { headers: authHeaders(), withCredentials: true }
    );
    await openTaskDetail(taskDetail.value.task);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not assign';
  }
}

async function saveTaskList() {
  if (!taskDetail.value?.task?.id) return;
  try {
    await axios.patch(
      `${apiBase}/tasks/${taskDetail.value.task.id}`,
      { taskListId: taskListPickId.value },
      { headers: authHeaders(), withCredentials: true }
    );
    await openTaskDetail(taskDetail.value.task);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not update list';
  }
}

function openProjectFromTask() {
  const pid = taskDetail.value?.task?.project_id;
  const pname = taskDetail.value?.task?.project_name || 'Project';
  taskDetail.value = null;
  if (pid) openProject({ id: pid, name: pname });
}

function openCalEvent(item) {
  if(isMobile.value && item.hasClient && (item.clinicalSessionId || item.officeEventId)){prepareWorkDraft({...item,id:null});return;}
  calEvent.value = item;
}

async function extendSession() {
  extendBusy.value = true;
  try {
    const { data } = await axios.post(
      `${apiBase}/session/extend`,
      { minutes: 10 },
      { headers: authHeaders(), withCredentials: true }
    );
    expiresAt.value = data.expiresAt;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not extend session';
  } finally {
    extendBusy.value = false;
  }
}

async function switchNoteAid() {
  tab.value = 'noteaid';
  noteAidCopied.value = '';
  loadNoteAidDrawer();
  try {
    const { data } = await axios.get(`${apiBase}/note-aid/tools`, {
      headers: authHeaders(),
      withCredentials: true,
      params: { agencyId: sessionAgencyId.value || undefined }
    });
    noteAidTools.value = data.tools || [];
    if (!noteAidToolId.value && noteAidTools.value[0]) {
      noteAidToolId.value = noteAidTools.value[0].id;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Note Workspace unavailable';
    noteAidTools.value = [];
  }
}

function noteAidDrawerKey() {
  const uid = sessionUserId.value || 'anon';
  const dayKey = new Date().toISOString().slice(0, 10);
  return `qvNoteAidDrawer:${uid}:${dayKey}`;
}

function loadNoteAidDrawer() {
  if(isMobile.value)return;
  try {
    const raw = localStorage.getItem(noteAidDrawerKey());
    noteAidDrawer.value = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(noteAidDrawer.value)) noteAidDrawer.value = [];
  } catch {
    noteAidDrawer.value = [];
  }
}

function persistNoteAidDrawer() {
  if(isMobile.value)return;
  try {
    localStorage.setItem(noteAidDrawerKey(), JSON.stringify(noteAidDrawer.value.slice(0, 40)));
  } catch { /* ignore */ }
}

function stopNoteAidSpeak() {
  if (noteAidSpeakTimer) {
    clearTimeout(noteAidSpeakTimer);
    noteAidSpeakTimer = null;
  }
  const rec = noteAidRecognition;
  noteAidRecognition = null;
  if (rec) {
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      if (typeof rec.abort === 'function') rec.abort();
      else rec.stop?.();
    } catch { /* ignore */ }
  }
  noteAidSpeaking.value = false;
  if (noteAidMode.value === 'speak') noteAidMode.value = 'type';
}

function toggleNoteAidSpeak() {
  if (!speechSupported.value) return;
  if (noteAidSpeaking.value) {
    stopNoteAidSpeak();
    return;
  }
  stopNoteAidSpeak();
  noteAidMode.value = 'speak';
  const SR = privateSpeechRecognition();
  const rec = new SR();
  noteAidRecognition = rec;
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (event) => {
    try {
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        if (r?.isFinal) finalChunk += r[0]?.transcript || '';
      }
      const t = String(finalChunk || '').trim();
      if (t) {
        const prev = String(noteAidInput.value || '');
        noteAidInput.value = prev ? `${prev} ${t}` : t;
      }
    } catch { /* ignore */ }
  };
  rec.onerror = () => {
    noteAidSpeaking.value = false;
    noteAidRecognition = null;
  };
  rec.onend = () => {
    noteAidSpeaking.value = false;
    if (noteAidRecognition === rec) noteAidRecognition = null;
  };
  try {
    rec.start();
    noteAidSpeaking.value = true;
    // Safety: auto-stop after 90s so UI never stays stuck
    noteAidSpeakTimer = setTimeout(() => stopNoteAidSpeak(), 90000);
  } catch {
    noteAidSpeaking.value = false;
    noteAidRecognition = null;
  }
}

function buildNoteAidPayloadText() {
  const dos = noteAidDos.value || '';
  const initials = noteAidInitials.value.trim().toUpperCase();
  const body = noteAidInput.value.trim();
  return [
    `Date of service: ${dos}`,
    `Client initials: ${initials}`,
    '',
    body
  ].join('\n');
}

function parseNoteAidSections(output) {
  const text = String(output || '').trim();
  if (!text) {
    noteAidSections.value = [];
    return;
  }
  // Same pipeline as ClinicalNoteGeneratorView: Output blob → extractSections → buildDisplaySections
  const sections = extractSections({ sections: { Output: text } });
  const panels = buildDisplaySections(sections);
  noteAidSections.value = (panels || []).filter((p) => String(p.text || '').trim());
  if (!noteAidSections.value.length) {
    noteAidSections.value = [{ id: 'full', title: 'Note', text, isSoap: false, letter: '' }];
  }
}

function formatNoteAidDos(raw) {
  const s = String(raw || '').trim();
  if (!s) return '—';
  try {
    const d = new Date(`${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return s;
  }
}

function pushNoteAidToDrawer() {
  if (!noteAidOutput.value) return;
  const tool = noteAidTools.value.find((t) => t.id === noteAidToolId.value);
  const item = {
    id: `na_${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    dos: noteAidDos.value,
    initials: noteAidInitials.value.trim().toUpperCase(),
    toolId: noteAidToolId.value,
    toolName: tool?.name || noteAidToolId.value,
    input: noteAidInput.value.trim(),
    output: noteAidOutput.value,
    sections: noteAidSections.value
  };
  const top = noteAidDrawer.value[0];
  if (
    top
    && top.output === item.output
    && top.dos === item.dos
    && top.initials === item.initials
    && top.toolId === item.toolId
  ) {
    noteAidDrawer.value = [{ ...top, sections: item.sections, input: item.input, at: item.at }, ...noteAidDrawer.value.slice(1)];
  } else {
    noteAidDrawer.value = [item, ...noteAidDrawer.value];
  }
  persistNoteAidDrawer();
}

async function runNoteAid() {
  if (!session.value || noteAidBusy.value || !noteAidToolId.value || !canRunNoteAid.value) return;
  const request = ++noteAidRequest;
  const activeSession = session.value;
  stopNoteAidSpeak();
  noteAidBusy.value = true;
  noteAidOutput.value = '';
  noteAidSections.value = [];
  noteAidCopied.value = '';
  try {
    const { data } = await axios.post(
      `${apiBase}/note-aid/execute`,
      {
        agencyId: sessionAgencyId.value,
        toolId: noteAidToolId.value,
        inputText: buildNoteAidPayloadText()
      },
      { headers: authHeaders(), withCredentials: true }
    );
    if (request !== noteAidRequest || session.value !== activeSession) return;
    const output = data.outputText || data.text || data.output || '';
    noteAidOutput.value = output;
    parseNoteAidSections(output);
    pushNoteAidToDrawer();
  } catch (e) {
    if (request === noteAidRequest && session.value === activeSession) error.value = e?.response?.data?.error?.message || 'Note Workspace failed';
  } finally {
    if (request === noteAidRequest) noteAidBusy.value = false;
  }
}

async function copyTextSafe(text, key) {
  const value = String(text || '').trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    noteAidCopied.value = key;
    setTimeout(() => {
      if (noteAidCopied.value === key) noteAidCopied.value = '';
    }, 1800);
  } catch {
    error.value = 'Could not copy — long-press the text and copy manually';
  }
}

async function copyNoteAidSection(panel) {
  // Match full Note Workspace: copy section body only (not the S/O/I/P title)
  await copyTextSafe(panel?.text, panel?.id || 'section');
}

async function copyNoteAidFull() {
  const tool = noteAidTools.value.find((t) => t.id === noteAidToolId.value);
  const sections = Object.fromEntries(
    (noteAidSections.value || []).map((p) => [p.id, String(p.text || '').trim()])
  );
  const text = Object.keys(sections).length
    ? formatFullNoteCopy({
      sections,
      initials: noteAidInitials.value.trim().toUpperCase(),
      dateOfService: noteAidDos.value,
      dateWritten: new Date().toISOString().slice(0, 10),
      noteTypeLabel: tool?.name || tool?.label || 'Progress Note'
    })
    : noteAidOutput.value;
  await copyTextSafe(text, 'full');
}

function saveAndNewSameClient() {
  pushNoteAidToDrawer();
  noteAidOutput.value = '';
  noteAidSections.value = [];
  noteAidInput.value = '';
  noteAidCopied.value = '';
  // Keep initials; open DOS picker
  try {
    document.getElementById('qv-na-dos')?.focus?.();
    document.getElementById('qv-na-dos')?.showPicker?.();
  } catch { /* ignore */ }
}

function saveAndNewSameDos() {
  pushNoteAidToDrawer();
  noteAidOutput.value = '';
  noteAidSections.value = [];
  noteAidInput.value = '';
  noteAidInitials.value = '';
  noteAidCopied.value = '';
  try {
    document.getElementById('qv-na-initials')?.focus?.();
  } catch { /* ignore */ }
}

function saveAndNewFresh() {
  pushNoteAidToDrawer();
  noteAidOutput.value = '';
  noteAidSections.value = [];
  noteAidInput.value = '';
  noteAidInitials.value = '';
  noteAidDos.value = new Date().toISOString().slice(0, 10);
  noteAidCopied.value = '';
  try {
    document.getElementById('qv-na-initials')?.focus?.();
  } catch { /* ignore */ }
}

function openNoteAidDrawerItem(item) {
  noteAidDos.value = item.dos || noteAidDos.value;
  noteAidInitials.value = item.initials || '';
  noteAidToolId.value = item.toolId || noteAidToolId.value;
  noteAidInput.value = item.input || '';
  noteAidOutput.value = item.output || '';
  if (item.sections?.length) noteAidSections.value = item.sections;
  else parseNoteAidSections(item.output || '');
  noteAidCopied.value = '';
}

function contactInitials(p) {
  const a = String(p.firstName || p.displayName || '?')[0] || '?';
  const b = String(p.lastName || '')[0] || '';
  return `${a}${b}`.toUpperCase();
}

function formatSlotState(raw) {
  return String(raw || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeOfficeUi(status, slotState) {
  const slot = String(slotState || '').toUpperCase();
  const st = String(status || '').toUpperCase();
  if (slot === 'ASSIGNED_AVAILABLE') return 'Available';
  if (slot === 'ASSIGNED_BOOKED' || st === 'BOOKED') return 'Booked';
  if (slot === 'ASSIGNED_TEMPORARY') return 'Temporarily assigned';
  if (slot === 'COMPANY_HOLD') return 'Company hold';
  if (st === 'RELEASED') return 'Released';
  return st || slot || 'Scheduled';
}

function isDone(task) {
  return ['completed', 'done'].includes(String(task?.status || '').toLowerCase());
}

async function markTaskStatus(task) {
  const nextStatus = isDone(task) ? 'open' : 'completed';
  try {
    await axios.patch(
      `${apiBase}/tasks/${task.id}/status`,
      { status: nextStatus },
      { headers: authHeaders(), withCredentials: true }
    );
    await openTaskDetail(task);
    if (taskSuite.value === 'assigned' || taskSuite.value === 'mine') {
      await loadTasks(taskView.value);
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not update task';
  }
}

async function postTaskComment() {
  if (!taskDetail.value?.task?.id || !taskComment.value.trim()) return;
  taskCommentBusy.value = true;
  try {
    await axios.post(
      `${apiBase}/tasks/${taskDetail.value.task.id}/comments`,
      { body: taskComment.value.trim() },
      { headers: authHeaders(), withCredentials: true }
    );
    taskComment.value = '';
    await openTaskDetail(taskDetail.value.task);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not comment';
  } finally {
    taskCommentBusy.value = false;
  }
}

async function loadCalendar() {
  const request = ++calendarRequest; const date = day.value;
  tab.value = 'calendar'; calendarLoading.value = true; error.value = ''; dayItems.value = [];
  try {
    const { data } = await axios.get(`${apiBase}/calendar/day`, { headers: authHeaders(), withCredentials: true, params: { day: date, timeZone: calendarTimeZone } });
    if (request === calendarRequest && day.value === date) dayItems.value = data.items || [];
  } catch (e) { if (request === calendarRequest) error.value = e?.response?.data?.error?.message || 'Could not load your schedule. Try again.'; }
  finally { if (request === calendarRequest) calendarLoading.value = false; }
}
function switchCalendar() { loadCalendar(); }
function shiftDay(delta) {
  const d = new Date(`${day.value}T12:00:00`);
  d.setDate(d.getDate() + delta);
  day.value = localDay(d);
  if (showOffice.value) loadOffice();
  else loadCalendar();
}
async function toggleOffice() {
  showOffice.value = !showOffice.value;
  if (showOffice.value) await loadOffice();
  else await loadCalendar();
}
async function loadOffice() {
  const { data } = await axios.get(`${apiBase}/office`, {
    headers: authHeaders(),
    withCredentials: true,
    params: {
      day: day.value,
      officeId: officeFilterId.value || undefined
    }
  });
  officeSlots.value = data.mySlots || data.slots || [];
  officeLocations.value = data.locations || [];
  officeRoster.value = data.offices || [];
  if (data.agencyId) sessionAgencyId.value = data.agencyId;
}
function setOfficeFilter(id) {
  officeFilterId.value = id;
  loadOffice();
}

async function messageUser(userId, name, agencyId) {
  if (!userId) return;
  dmBusyId.value = userId;
  error.value = '';
  try {
    const { data } = await axios.post(
      `${apiBase}/chat/direct`,
      {
        otherUserId: userId,
        agencyId: agencyId || sessionAgencyId.value || undefined
      },
      { headers: authHeaders(), withCredentials: true }
    );
    if(isMobile.value){msgSuite.value='direct';await mobileNavigate({view:'home',suite:'direct',threadId:String(data.threadId)});tab.value='home';return;}
    activeChatId.value = data.threadId;
    activeChatTitle.value = name || 'Direct message';
    tab.value = 'chat';
    await loadChatMessages();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not start chat';
  } finally {
    dmBusyId.value = null;
  }
}

function hourOf(iso) {
  try {
    return new Date(iso).getHours() + new Date(iso).getMinutes() / 60;
  } catch {
    return DAY_START;
  }
}
function itemsForHour(hour) {
  return (dayItems.value || []).filter((item) => {
    const start = hourOf(item.startAt);
    const end = item.endAt ? hourOf(item.endAt) : start + 0.5;
    return start < hour + 1 && end > hour && Math.floor(start) === hour;
  });
}
function blockStyle(item) {
  const start = hourOf(item.startAt);
  const end = item.endAt ? hourOf(item.endAt) : start + 0.5;
  const mins = Math.max(20, (end - start) * 60);
  return { minHeight: `${Math.min(mins, 120)}px` };
}
function formatHourLabel(h) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = ((h + 11) % 12) + 1;
  return `${hr} ${ampm}`;
}
function formatClock(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function loadDirectory(suite = 'providers', { activate = true } = {}) {
  const activeSession = session.value;
  const activeTaskRequest = taskDetailRequest;
  if (activate) { tab.value = 'contacts'; contactSuite.value = suite; }
  try {
    const { data } = await axios.get(`${apiBase}/directory`, {
      headers: authHeaders(),
      params: isMobile.value && activate ? {agencyId:'all'} : undefined,
      withCredentials: true
    });
    if (!session.value || session.value !== activeSession || (!activate && activeTaskRequest !== taskDetailRequest)) return;
    directoryAgencies.value=data.agencies || [];
    directoryProviders.value = data.providers || [];
    directorySchool.value = data.schoolStaff || [];
    if (data.agencyId) sessionAgencyId.value = data.agencyId;
  } catch (e) {
    if (!session.value || session.value !== activeSession || (!activate && activeTaskRequest !== taskDetailRequest)) return;
    error.value = e?.response?.data?.error?.message || 'Could not load directory';
    directoryProviders.value = [];
    directorySchool.value = [];
  }
}

async function loadSavedContacts() {
  contactSuite.value = 'saved';
  tab.value = 'contacts';
  try {
    const { data } = await axios.get(`${apiBase}/contacts`, {
      headers: authHeaders(),
      withCredentials: true
    });
    contacts.value = data.contacts || [];
  } catch {
    contacts.value = [];
  }
}

async function loadContacts() {
  await loadDirectory('providers');
}

function formatRole(role) {
  return String(role || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Team';
}

function composeTo(c) { if(isMobile.value)openMobileEmailDraft({to:c.email || ''});else openEmailComposer(router,{quickView:true,session:session.value,mode:'new',to:c.email || ''}); }

async function sendCompose({deliveryChoice=null}={}) {
  if (composeBusy.value || !composeToEmail.value.trim() || (!composeText.value.trim() && !composeAttachments.value.length)) return;
  composeBusy.value = true;
  error.value = '';
  const draft = { text: composeText.value, to: composeToEmail.value, cc: composeCc.value, bcc: composeBcc.value, attachments: composeAttachments.value, mode: 'reply' };
  const sessionAtSend = session.value;
  try {
    const { data } = await axios.post(
      `${apiBase}/compose`,
      {
        deliveryChoice,
        to: composeToEmail.value.trim(),
        subject: composeSubject.value.trim(),
        text: composeText.value.trim(), cc: composeCc.value, bcc: composeBcc.value, attachments: composeAttachments.value
      },
      { headers: authHeaders(), withCredentials: true }
    );
    if (session.value !== sessionAtSend) return;
    showCompose.value = false;
    composeToEmail.value = '';
    composeSubject.value = '';
    composeText.value = ''; composeCc.value = ''; composeBcc.value = ''; composeAttachments.value = [];
    if (data.conversation?.scheduled) offerUndo(data.conversation.id, data.conversation.messageId, draft);
    sendNotice.value = data.conversation?.scheduled ? 'Email queued. You have 20 seconds to undo.' : 'Email sent';
    await openConversation({ id: data.conversation.id });
  } catch (e) {
    if (session.value !== sessionAtSend) return;
    if (e?.response?.data?.error?.code === 'RECIPIENT_AVAILABILITY_CHOICE_REQUIRED') { composeAvailability.value=e.response.data.error.availability; return; }
    error.value = e?.response?.data?.error?.message || 'Could not send message';
  } finally {
    composeBusy.value = false;
  }
}

async function createTask() {
  if (!newTaskTitle.value.trim()) return;
  taskBusy.value = true;
  error.value = '';
  try {
    await axios.post(
      `${apiBase}/tasks`,
      { title: newTaskTitle.value.trim(), dueDate: newTaskDue.value || null },
      { headers: authHeaders(), withCredentials: true }
    );
    showNewTask.value = false;
    newTaskTitle.value = '';
    newTaskDue.value = '';
    await loadTasks(taskView.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not create task';
  } finally {
    taskBusy.value = false;
  }
}

async function createContact() {
  if (!newContactEmail.value.trim()) return;
  contactBusy.value = true;
  error.value = '';
  try {
    await axios.post(
      `${apiBase}/contacts`,
      {
        email: newContactEmail.value.trim(),
        displayName: newContactName.value.trim() || null,
        phone: newContactPhone.value.trim() || null
      },
      { headers: authHeaders(), withCredentials: true }
    );
    showNewContact.value = false;
    newContactName.value = '';
    newContactEmail.value = '';
    newContactPhone.value = '';
    await loadSavedContacts();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not save contact';
  } finally {
    contactBusy.value = false;
  }
}

async function sendQuickReply({deliveryChoice=null}={}) {
  const id = activeConv.value?.id;
  if (!id || replyBusy.value || (!replyText.value.trim() && !replyAttachments.value.length)) return;
  const draft = { text: replyText.value, to: replyTo.value, cc: replyCc.value, bcc: replyBcc.value, attachments: replyAttachments.value, mode: replyMode.value };
  replyBusy.value = true; error.value = '';
  const sessionAtSend = session.value;
  try {
    const { data } = await axios.post(`${apiBase}/conversations/${id}/reply`, {
      deliveryChoice, text: replyText.value.trim(), mode: replyMode.value, to: replyTo.value, cc: replyCc.value, bcc: replyBcc.value, attachments: replyAttachments.value
    }, { headers: authHeaders(), withCredentials: true });
    if (session.value !== sessionAtSend) return;
    emailDrafts.delete(id);
    if (activeConv.value?.id !== id) { sendNotice.value = 'Message submitted'; return; }
    replyText.value = ''; replyAttachments.value = [];
    sendNotice.value = data.scheduled ? 'Email queued. You have 20 seconds to undo.' : 'Message sent';
    const destination = data.forwardedConversationId || id;
    if (data.scheduled) offerUndo(destination, data.messageId, draft);
    showMobileReply.value=false;
    if(isMobile.value && route.query.compose)returnInApp({...route.query,compose:undefined});
    await openConversation({ id: destination }, { refresh: true });
  } catch (e) {
    if (session.value !== sessionAtSend || activeConv.value?.id !== id) return;
    if (e?.response?.data?.error?.code === 'RECIPIENT_AVAILABILITY_CHOICE_REQUIRED') { replyAvailability.value=e.response.data.error.availability; return; }
    error.value = e?.response?.data?.error?.message || 'Reply failed';
  }
  finally { replyBusy.value = false; }
}

function joinHref(item) { return item.joinUrl || null; }
function extendForMeeting(item) {
  axios
    .post(
      `${apiBase}/session/heartbeat`,
      { meetingEndsAt: item.endAt },
      { headers: authHeaders(), withCredentials: true }
    )
    .catch(() => {});
}

function clearSession({notify=true}={}) {
  const wasUnlocked=!!session.value;
  window.dispatchEvent(new Event('quick-view-session-ended'));
  showMobileReply.value=false;dismissQuickPreview();
  session.value = null; sessionUserId.value = null; sessionAgencyId.value = null;
  showMobileSettings.value=false;clearTimeout(preferenceTimer);
  stopHeartbeat(); clearTimeout(undoTimer); clearTimeout(quickPreviewTimer); clearTimeout(quickPreviewHideTimer);
  ++conversationRequest; ++homeRequest; ++chatRequest; ++calendarRequest;
  ++taskDetailRequest; ++noteAidRequest; noteAidBusy.value = false;
  emailDrafts.clear(); ++emailCacheEpoch;emailDetailCache.clear(); chatDrafts.clear();
  activeConv.value = null; threadMessages.value = []; conversations.value = [];
  chatMessages.value = []; chatList.value = []; inboxItems.value = []; activeChatId.value = null;
  replyText.value = ''; replyAttachments.value = []; chatReply.value = ''; chatAttachments.value = [];
  composeToEmail.value = ''; composeSubject.value = ''; composeText.value = ''; composeAttachments.value = [];
  badgeRequest++;lastBadgeRefresh=0;messageBadgeRequest++;lastMessageBadgeRefresh=0;messageBadge.value=null;mobileCounts.value={};myWorkVisited.value=false;calendarVisited.value=false;clientsVisited.value=false;workspaceBadges.value={mywork:null,tasks:null};
  taskCountRequest++;taskCounts.value={assigned:null,mine:null,lists:null,projects:null};closeTaskDetail();closeTaskAction();
  tasks.value = []; dayItems.value = []; undoSend.value = null; sendNotice.value = ''; showCompose.value = false;
  taskDetail.value = null; calEvent.value = null; showNewTask.value = false; showNewContact.value = false;
  newTaskTitle.value = ''; newTaskDue.value = ''; taskComment.value = '';
  newContactName.value = ''; newContactEmail.value = ''; newContactPhone.value = '';
  directoryProviders.value = []; directorySchool.value = []; contacts.value = [];
  noteAidInput.value = ''; noteAidOutput.value = ''; noteAidInitials.value = ''; noteAidSections.value = []; noteAidDrawer.value = [];
  stopNoteAidSpeak();
  passcode.value = ''; tab.value = 'home'; moreOpen.value = false; lastActivitySent=0;expiresAt.value=null;
  if(isMobile.value){if(wasUnlocked && notify)emit('locked');}else try { sessionStorage.removeItem('plottwist.quickViewSession'); } catch { /* ignore */ }
}
async function logout() {
  const headers = authHeaders();
  clearSession();
  await axios.post(`${apiBase}/session/logout`, {}, { headers, withCredentials: true }).catch(() => {});
  error.value = '';
}
async function mobileNavigate(query,{replace=false}={}) {
  if(!isMobile.value)return;
  const clean=Object.fromEntries(Object.entries(query).filter(([,value])=>value!==undefined && value!==null));
  if(replace)await router.replace({path:'/mobile/workspace',query:clean});else await router.push({path:'/mobile/workspace',query:clean});
}
function returnInApp(query) {
  if(isMobile.value){trackMobileNavigation(router);return backInMobile(router,{path:'/mobile/workspace',query:Object.fromEntries(Object.entries(query).filter(([,value])=>value!==undefined))});}
}
function closeConversation(){rememberReply();showMobileReply.value=false;dismissQuickPreview();++conversationRequest;activeConv.value=null;threadMessages.value=[];threadLoading.value=false;tab.value='home';returnInApp({view:'home',suite:msgSuite.value});}
function closeMobileReply(){if(!mobileEmailReply.value)return;rememberReply();showMobileReply.value=false;if(route.query.compose)returnInApp({...route.query,compose:undefined});}
watch(()=>route.fullPath,async()=>{
  if(!isMobile.value || !session.value)return;
  dismissQuickPreview();
  const view=String(route.query.view || 'home');if(view!=='home'){if(tab.value!==view)await navigateTo(view,{fromRoute:true});return;}
  const conversationId=String(route.query.conversationId || ''),threadId=String(route.query.threadId || '');
  if(/^[1-9]\d*$/.test(conversationId)){
    if(String(activeConv.value?.id)!==conversationId || tab.value!=='thread')await openConversation({id:Number(conversationId)});
    showMobileReply.value=['reply','reply_all','forward'].includes(route.query.compose);
    if(showMobileReply.value)changeReplyMode(route.query.compose);
  }else if(/^[1-9]\d*$/.test(threadId)){
    showMobileReply.value=false;tab.value='home';
  }else{
    showMobileReply.value=false;rememberReply();++conversationRequest;threadLoading.value=false;tab.value='home';
  }
});
async function openDeepLink() {
  const target = quickViewDeepLink(route.query, tokenInfo.value?.deepLinkPath);
  if (target.conversationId) await openConversation({ id: Number(target.conversationId) });
  else if (target.threadId) {if(isMobile.value)tab.value='home';else await openChatThread({ id: Number(target.threadId) });}
  else if (target.join) {
    try {
      const { data } = await axios.get(`${apiBase}/meetings/${target.join}/${encodeURIComponent(target.id)}/link`, { headers: authHeaders(), withCredentials: true });
      window.location.assign(data.joinUrl);
    } catch (e) { error.value = e?.response?.data?.error?.message || 'Could not open meeting'; }
  }
}

function channelIcon(ch) {
  const c = String(ch || '');
  if (c === 'sms') return Smartphone;
  if (c === 'secure') return LockKeyhole;
  if (c === 'call' || c === 'voicemail') return Phone;
  return Mail;
}
function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function formatTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}
function formatExpiry(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleTimeString();
  } catch {
    return '';
  }
}

watch([agencyName, agencyLogoUrl, agencyPrimaryColor], () => {
  if (route.params.token) installQuickViewManifest();
});

onMounted(() => {
  if(isMobile.value)window.addEventListener('resize',resizeMobile);
  document.addEventListener('pointerdown',outsidePreview);
  for(const type of ['pointerdown','keydown','touchstart'])window.addEventListener(type,recordActivity,{passive:true});
  window.addEventListener('focus',checkDeadline);
  document.addEventListener('visibilitychange',checkDeadline);document.addEventListener('visibilitychange',refreshVisibleBadges);
  try {
    homeScreenTip.value = localStorage.getItem(HOME_TIP_KEY) !== '1';
  } catch {
    homeScreenTip.value = true;
  }
  if (isMobile.value || sessionOnly.value || (!route.params.token && route.name === 'QuickViewApp')) {
    resumeSession();
  } else {
    loadTokenInfo();
  }
});
defineExpose({openNotificationTask:id=>openTaskDetail({id}),lock:logout,openDeepLink,openPreferences:openMobilePreferences});
onUnmounted(() => {
  window.removeEventListener('resize',resizeMobile);clearTimeout(preferenceTimer);
  document.removeEventListener('pointerdown',outsidePreview);dismissQuickPreview();
  if(isMobile.value)clearSession({notify:false});
  for(const type of ['pointerdown','keydown','touchstart'])window.removeEventListener(type,recordActivity);
  window.removeEventListener('focus',checkDeadline);
  document.removeEventListener('visibilitychange',checkDeadline);document.removeEventListener('visibilitychange',refreshVisibleBadges);
  stopHeartbeat(); clearTimeout(undoTimer);
  stopNoteAidSpeak();
});
watch([composeToEmail, composeCc, composeBcc, composeText, composeSubject, session], () => { composeAvailability.value=null; });
watch([replyTo, replyCc, replyBcc, replyText, () => activeConv.value?.id, session], () => { replyAvailability.value=null; });
</script>

<style scoped>
.qv {
  --qv-radius: 18px;
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  background: var(--qv-bg);
  color: var(--qv-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  isolation: isolate;
}
.qv *, .qv *::before, .qv *::after { box-sizing: border-box; }
.qv h1, .qv h2, .qv h3, .qv h4, .qv strong { color: var(--qv-text); -webkit-text-fill-color: currentColor; }
.qv button, .qv input, .qv select, .qv textarea { font-family: inherit; }
.qv button, .qv a, .qv input, .qv select, .qv textarea { -webkit-tap-highlight-color: transparent; }
.qv button { cursor: pointer; }
.qv button:disabled { opacity: .55; cursor: wait; }
.qv :is(button, a, input, select, textarea):focus-visible { outline: 3px solid #93b8ff; outline-offset: 3px; }
.qv-skip { position: fixed; top: -80px; left: 16px; z-index: 100; padding: 12px 18px; border-radius: 10px; background: var(--qv-primary); color: #fff; }
.qv-skip:focus { top: 12px; }
.qv-top { min-height: 92px; display: flex; align-items: center; gap: 20px; padding: max(20px, env(safe-area-inset-top)) 32px 20px; background: #fff; border-bottom: 1px solid var(--qv-border); }
.qv-brand-row { display: flex; flex-shrink: 0; }
.qv-brand-row :deep(.auricwell-brand small) { max-width: 155px; overflow: hidden; text-overflow: ellipsis; }
.qv-organization { display: flex; align-items: center; gap: 10px; min-width: 0; color: var(--qv-muted); font-size: 13px; font-weight: 600; }
.qv-organization > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qv-logo { width: 30px; height: 30px; object-fit: contain; border: 1px solid var(--qv-border); border-radius: 9px; background: #fff; flex-shrink: 0; }
.qv-top-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-shrink: 0; }
.qv-icon-button { display: inline-flex; justify-content: center; align-items: center; gap: 7px; min-height: 42px; padding: 9px 12px; border: 1px solid var(--qv-border); border-radius: 11px; color: var(--qv-muted); background: #fff; font-size: 12px; font-weight: 650; }
.qv-icon-button:hover { color: var(--qv-primary); background: var(--qv-primary-soft); }
.qv-session-status { display: flex; align-items: center; gap: 7px; margin-right: 10px; color: var(--qv-muted); font-size: 11px; }
.qv-session-status > span { width: 6px; height: 6px; border-radius: 50%; background: #21916d; }
.qv-workspace { max-width: 1120px; margin: 0 auto; padding: 34px 40px 64px; min-width: 0; }
.qv-workspace:focus { outline: none; }
.qv-signed-in { padding-left: 232px; }
.qv-signed-in::before { content: ''; position: fixed; inset: 0 auto 0 0; width: 232px; z-index: -1; border-right: 1px solid var(--qv-border); background: #fff; }
.qv-signed-in .qv-top { position: sticky; top: 0; z-index: 30; }
.qv-signed-in .qv-brand-row { position: fixed; top: 26px; left: 25px; }
.qv-tabs { position: fixed; z-index: 35; top: 125px; left: 16px; bottom: 22px; width: 200px; display: flex; flex-direction: column; gap: 7px; }
.qv-nav-caption { padding: 0 16px 12px; color: #8592a7; font-size: 10px; font-weight: 700; letter-spacing: .14em; }
.qv-tabs > button { display: flex; align-items: center; gap: 13px; min-height: 48px; padding: 12px 16px; border: 0; border-radius: 11px; background: transparent; color: var(--qv-muted); font-size: 14px; font-weight: 550; text-align: left; }
.qv-tabs > button:hover { background: #f5f8fd; color: var(--qv-text); }
.qv-tabs > button.on { background: var(--qv-primary-soft); color: #1d4ed8; font-weight: 700; }
.qv-nav-footer { margin-top: auto; padding: 16px 10px 0; }
.qv-nav-note { display: flex; align-items: flex-start; gap: 9px; padding-bottom: 20px; color: #7a899f; font-size: 11px; line-height: 1.7; }
.qv-nav-note svg { margin-top: 3px; flex-shrink: 0; }
.qv-workspace-link, .qv-gate-link { display: inline-flex; align-items: center; gap: 8px; color: var(--qv-primary); font-size: 12px; font-weight: 600; text-decoration: none; }
.qv-workspace-link { border-top: 1px solid var(--qv-border); padding-top: 18px; }
.qv-page-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
.qv-eyebrow { margin: 0 0 8px; color: var(--qv-muted); font-size: 11px; font-weight: 600; letter-spacing: .035em; }
.qv-page-heading h1 { margin: 0; font-size: clamp(26px, 3vw, 34px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.qv-page-description { margin: 9px 0 0; color: var(--qv-muted); font-size: 13px; }
.qv-workspace-tag { flex-shrink: 0; padding: 6px 10px; border: 1px solid #dce6f4; border-radius: 7px; color: #69809e; font-size: 9px; font-weight: 650; letter-spacing: .12em; }
.qv-content, .qv-pane { min-width: 0; }
.qv-pane, .qv-content > :deep(.presence) { border: 1px solid var(--qv-border); border-radius: var(--qv-radius); background: #fff; box-shadow: 0 3px 12px #173c6a03; overflow: hidden; }
.qv-pane > h2 { margin: 22px 24px 12px; font-size: 20px; letter-spacing: -.02em; }
.qv-messages-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 24px; border-bottom: 1px solid var(--qv-border); }
.qv-messages-heading > span { color: #8290a5; font-size: 9px; letter-spacing: .12em; font-weight: 600; }
.qv :deep(.email-reader) { --email-message-background: #fff; --email-message-color: #172b4d; }
.qv :deep(.email-reader .muted) { color: var(--qv-muted); }
.qv-suite { display: flex; align-items: center; gap: 5px; padding: 14px 20px; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: thin; -webkit-overflow-scrolling: touch; }
.qv-suite button, .qv-sorters button { flex-shrink: 0; min-height: 36px; padding: 8px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--qv-muted); font-size: 12px; font-weight: 550; white-space: nowrap; }
.qv-suite button:hover, .qv-sorters button:hover { background: #f4f7fc; }
.qv-suite button.on, .qv-sorters button.on { color: #1d4ed8; background: var(--qv-primary-soft); font-weight: 650; }
.qv-suite > a { flex-shrink: 0; }
.qv-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 20px; flex-wrap: wrap; border-bottom: 1px solid #f0f3f8; }
.qv-sorters, .qv-day-nav { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.qv-sorters button { font-size: 11px; }
.qv-day-nav { padding: 12px 20px; }
.qv-pad { padding: 24px; }
.qv-row { display: flex; align-items: center; gap: 13px; width: 100%; min-height: 82px; padding: 18px 24px; border: 0; border-bottom: 1px solid #edf1f7; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.qv-row:last-child { border-bottom: 0; }
button.qv-row:hover { background: #f8faff; }
.qv-row.unread { background: #f7faff; }
.qv-row .ch { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; border-radius: 12px; color: #5278b5; background: #edf3fc; }
.qv-row .meta { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; }
.qv-row .meta strong { overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.qv-row.unread .meta strong { font-weight: 700; }
.qv-row .meta small { overflow: hidden; color: var(--qv-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.qv-row .meta > small:last-child:not(:first-of-type) { font-size: 10px; color: #8592a7; }
.qv-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; padding: 11px 16px; border: 1px solid transparent; border-radius: 10px; font-size: 13px; font-weight: 600; text-decoration: none; }
.qv-btn.primary { color: #fff; background: var(--qv-primary); box-shadow: 0 2px 4px #2563eb15; }
.qv-btn.primary:hover:not(:disabled) { background: #1d4ed8; }
.qv-btn.ghost { color: #526986; background: #f7f9fd; border-color: var(--qv-border); }
.qv-btn.ghost:hover { color: #1d4ed8; background: #edf4ff; }
.qv-btn.ghost.on { color: #1d4ed8; background: var(--qv-primary-soft); border-color: #b9d1ff; }
.qv-btn.sm { min-height: 36px; padding: 8px 11px; font-size: 11px; }
.badge { flex-shrink: 0; padding: 3px 8px; border-radius: 20px; background: #edf3ff; color: #3158a4; font-size: 10px; font-weight: 650; }
.muted { color: var(--qv-muted); }
.qv-notice, .qv-lock-warning, .qv-err { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; padding: 14px 18px; border: 1px solid #cfe3da; border-radius: 12px; color: #27694e; background: #f0faf5; font-size: 13px; }
.qv-lock-warning { border-color: #eed7a8; color: #80550d; background: #fff8e9; }
.qv-lock-warning > span { flex: 1; }
.qv-err { border-color: #f1cfd2; background: #fff4f4; color: #9d3846; }
.qv-err > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.qv-loading { display: flex; justify-content: center; align-items: center; gap: 12px; padding: 80px 20px; color: var(--qv-muted); }
.qv-spinner { width: 20px; height: 20px; border: 2px solid #dbe8ff; border-top-color: var(--qv-primary); border-radius: 50%; animation: qv-spin .8s linear infinite; }
@keyframes qv-spin { to { transform: rotate(360deg); } }
.qv-more-panel { display: grid; gap: 22px; }
.qv-tool-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.qv-tool-card { display: flex; flex-direction: column; align-items: flex-start; gap: 17px; min-height: 190px; padding: 24px; border: 1px solid var(--qv-border); border-radius: 16px; background: #fff; text-align: left; }
.qv-tool-card:hover { border-color: #afc9f4; box-shadow: 0 5px 16px #1d4ed808; }
.qv-tool-icon { display: grid; place-items: center; width: 45px; height: 45px; border-radius: 12px; color: #3569c8; background: #eef4ff; }
.qv-tool-card > span:nth-child(2) { flex: 1; }
.qv-tool-card strong { display: block; margin-bottom: 5px; font-size: 14px; font-weight: 650; }
.qv-tool-card small { display: block; color: var(--qv-muted); font-size: 12px; line-height: 1.6; }
.qv-tool-card > svg { display: none; }
.qv-more-account { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px 24px; border: 1px solid var(--qv-border); border-radius: 16px; background: #fff; }
.qv-more-account h2 { margin: 0 0 4px; font-size: 14px; font-weight: 650; }
.qv-more-account p { margin: 0; font-size: 12px; color: var(--qv-muted); }
.qv-more-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.qv:not(.qv-signed-in) .qv-top { justify-content: space-between; }
.qv:not(.qv-signed-in) .qv-workspace { display: flex; flex-direction: column; align-items: center; max-width: 600px; padding-top: 56px; }
.qv:not(.qv-signed-in) .qv-err { width: 100%; }
.qv-gate { order: 1; width: 100%; padding: 36px; border: 1px solid var(--qv-border); border-radius: 22px; background: #fff; box-shadow: 0 12px 40px #173c6a06; }
.qv-gate-icon { display: grid; place-items: center; width: 54px; height: 54px; margin-bottom: 24px; border-radius: 15px; color: var(--qv-primary); background: var(--qv-primary-soft); }
.qv-gate h1 { margin: 0 0 12px; font-size: 29px; font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.qv-gate p { color: var(--qv-muted); }
.qv-gate p.qv-eyebrow { color: #4770aa; margin-bottom: 8px; }
.qv-form { display: flex; flex-direction: column; gap: 12px; margin-top: 26px; }
.qv-form label { display: flex; flex-direction: column; gap: 8px; color: #314967; font-size: 12px; font-weight: 600; }
.qv-field-hint { margin-top: -4px; color: #7b8aa0; font-size: 10px; font-weight: 400; }
.qv-form input[type=email], .qv-pin { width: 100%; min-height: 48px; padding: 12px; border: 1px solid #dbe3ee; border-radius: 10px; background: #fcfdff; color: var(--qv-text); font-size: 16px; }
.qv-pin { min-height: 60px; font-size: 27px; letter-spacing: .38em; text-align: center; }
.qv-form > .qv-btn { width: 100%; min-height: 50px; margin-top: 4px; }
.qv-hint { margin-top: 18px; color: var(--qv-muted); font-size: 11px; line-height: 1.7; overflow-wrap: anywhere; }
.qv-gate-link { margin-top: 24px; }
.qv-homescreen { order: 2; width: 100%; margin-top: 20px; padding: 18px 22px; border: 1px solid var(--qv-border); border-radius: 14px; background: #edf3fc; }
.qv-homescreen strong { font-size: 12px; }
.qv-homescreen p { margin: 6px 0 12px; color: var(--qv-muted); font-size: 11px; line-height: 1.7; }
.qv-reply { display: grid; gap: 10px; margin: 20px 24px 24px; }
.qv-reply label { display: block; color: var(--qv-muted); font-size: 12px; }
.qv-reply input, .qv-reply textarea, .qv-sheet input, .qv-sheet textarea, .qv-date, .qv input.qv-date, .qv select.qv-date, .qv textarea { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; border: 1px solid #dbe3ee; border-radius: 9px; background: #fff; color: var(--qv-text); font-size: 16px; }
.qv-reply input { margin: 6px 0 8px; }
.qv textarea { resize: vertical; line-height: 1.6; }
.qv-date { width: auto; }
.qv-bubble { margin: 16px 24px; padding: 16px 18px; border: 1px solid var(--qv-border); border-radius: 13px; background: #f8fafd; }
.qv-bubble.outbound { border-color: #dce7fb; background: #eff5ff; }
.qv-bubble .when { margin-bottom: 8px; color: var(--qv-muted); font-size: 11px; }
.qv-bubble .body { overflow-wrap: anywhere; line-height: 1.7; font-size: 13px; }
.qv-agenda-item { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 100px; padding: 22px 24px; border-bottom: 1px solid var(--qv-border); cursor: pointer; }
.qv-agenda-item:hover { background: #f8faff; }
.qv-agenda-item strong { font-size: 13px; font-weight: 600; }
.qv-agenda-item p { margin: 7px 0 0; color: var(--qv-muted); font-size: 12px; }
.qv-agenda-item small { color: #a34848; }
.qv-day-grid { padding: 0 16px 20px; }
.qv-hour-row { display: grid; grid-template-columns: 52px 1fr; min-height: 56px; border-top: 1px solid var(--qv-border); }
.qv-hour-label { padding: 5px 8px 0 0; text-align: right; color: var(--qv-muted); font-size: 10px; }
.qv-hour-lane { position: relative; min-height: 56px; padding: 3px 6px 5px 10px; border-left: 1px solid var(--qv-border); }
.qv-cal-block { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; padding: 10px; border-left: 3px solid #7ca7ef; border-radius: 7px; background: #eff5ff; }
.qv-cal-block strong { font-size: 12px; }
.qv-cal-block small { color: var(--qv-muted); font-size: 11px; }
.qv-cal-block .qv-btn { align-self: flex-start; margin-top: 6px; }
.qv-office-section { margin-bottom: 12px; }
.qv-section-title { margin: 18px 24px 10px; font-size: 14px; }
.qv-office-card { margin: 12px 20px; padding: 16px; border: 1px solid var(--qv-border); border-radius: 12px; }
.qv-office-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 6px; }
.qv-office-head small { color: var(--qv-muted); font-size: 11px; }
.qv-avatar { width: 40px; height: 40px; flex-shrink: 0; border-radius: 13px; background: #eef4ff; object-fit: cover; }
.qv-avatar-fallback { display: grid; place-items: center; color: #4774b9; font-size: 11px; font-weight: 650; }
.qv-contact-row .meta small { white-space: normal; overflow-wrap: anywhere; }
.qv-na-row { display: grid; grid-template-columns: minmax(0,1.35fr) minmax(0,.85fr); gap: 12px; align-items: end; margin-bottom: 16px; }
.qv-na-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; font-size: 12px; }
.qv-na-field .qv-date { width: 100%; }
.qv-na-initials { text-transform: uppercase; letter-spacing: .06em; }
.qv-note-out { margin-top: 16px; padding: 16px; border: 1px solid var(--qv-border); border-radius: 12px; background: #f8fafd; white-space: pre-wrap; font-size: 13px; line-height: 1.7; max-height: 40vh; overflow: auto; }
.qv-note-section { margin-bottom: 12px; border: 1px solid var(--qv-border); border-radius: 12px; overflow: hidden; }
.qv-note-section-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--qv-border); background: #f5f8fd; }
.qv-note-section-title { color: #496385; font-size: 12px; font-weight: 650; }
.qv-note-section-body { margin: 0; padding: 16px; color: var(--qv-text); white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; font-size: 14px; line-height: 1.7; }
.qv-note-block { margin-top: 16px; }
.qv-note-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
.qv-note-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin: 0 0 12px; color: var(--qv-muted); font-size: 12px; }
.qv-note-meta-sep { opacity: .5; }
.qv-save-new { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.qv-save-new .qv-btn { width: 100%; color: #fff; background: var(--qv-primary); }
.qv-save-same-dos { background: #426baf !important; }
.qv-save-fresh { background: #526783 !important; }
.qv-ready-badge { display: inline-block; padding: 3px 8px; margin-left: 8px; border-radius: 20px; background: #e8f7ef; color: #287153; font-size: 10px; font-weight: 650; }
.qv-soap-letter { display: inline-grid; place-items: center; width: 22px; height: 22px; margin-right: 6px; border-radius: 7px; color: #fff; background: var(--qv-primary); font-size: 11px; font-weight: 700; }
.qv-modal { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; background: #13264165; backdrop-filter: blur(4px); }
.qv-sheet { width: 100%; max-width: 500px; max-height: 88dvh; padding: 26px; border: 1px solid var(--qv-border); border-radius: 20px; overflow-y: auto; overscroll-behavior: contain; background: #fff; box-shadow: 0 20px 80px #10254226; }
.qv-sheet h3 { margin: 0 0 8px; font-size: 19px; }
.qv-sheet label { display: block; margin: 14px 0 7px; color: var(--qv-muted); font-size: 12px; }
.qv-sheet-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.qv-sheet-actions .qv-btn { flex: 1; }
.qv-brand-menu{border:0;background:transparent;padding:0;cursor:pointer;text-align:left;border-radius:8px}.qv-brand-menu:focus-visible{outline:2px solid #245be8;outline-offset:5px}.qv-task-detail h3 { margin: 8px 0; }
.qv-task-detail h4 { margin: 22px 0 10px; color: var(--qv-muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.qv-detail-meta { margin: 0 0 8px; color: var(--qv-muted); font-size: 12px; }
.qv-detail-body { margin: 14px 0; white-space: pre-wrap; font-size: 14px; line-height: 1.7; }
.qv-links { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
.qv-links a { color: var(--qv-primary); font-size: 13px; overflow-wrap: anywhere; }
.qv-comment { padding: 12px 0; border-bottom: 1px solid var(--qv-border); }
.qv-comment strong { display: block; font-size: 13px; }
.qv-comment small { color: var(--qv-muted); font-size: 11px; }
.qv-comment p { margin: 6px 0 0; font-size: 13px; line-height: 1.6; }
@media (max-width: 1100px) {
  .qv-signed-in { padding-left: 208px; }
  .qv-signed-in::before { width: 208px; }
  .qv-tabs { width: 176px; }
  .qv-signed-in .qv-brand-row { left: 20px; }
  .qv-workspace { padding: 30px 26px 50px; }
  .qv-session-status { display: none; }
  .qv-tool-grid { grid-template-columns: 1fr; }
  .qv-tool-card { flex-direction: row; align-items: center; min-height: 100px; padding: 20px; }
  .qv-tool-card > svg { display: block; flex-shrink: 0; color: #8b9cb3; }
  .qv-more-account { align-items: flex-start; flex-direction: column; }
}
@media (max-width: 760px) {
  .qv-signed-in { display: flex; flex-direction: column; height: 100dvh; min-height: 0; padding-left: 0; overflow: hidden; }
  .qv-signed-in::before { display: none; }
  .qv-top { min-height: 80px; padding: max(16px, env(safe-area-inset-top)) 20px 16px; gap: 12px; }
  .qv-signed-in .qv-brand-row { position: static; }
  .qv-signed-in .qv-top { flex-shrink: 0; }
  .qv-signed-in .qv-workspace { flex: 1; width: 100%; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px)); }
  .qv-brand-row :deep(.auricwell-brand) { font-size: 18px; gap: 7px; }
  .qv-brand-row :deep(.auricwell-brand img) { width: 29px; height: 29px; }
  .qv-brand-row :deep(.auricwell-brand small) { font-size: 10px; }
  .qv-signed-in .qv-organization { display: none; }
  .qv:not(.qv-signed-in) .qv-organization { max-width: 45%; font-size: 11px; }
  .qv-top-actions { gap: 6px; }
  .qv-icon-button { min-width: 42px; min-height: 44px; padding: 10px; }
  .qv-lock-label { display: none; }
  .qv-extend { font-size: 10px; }
  .qv-workspace { padding: 26px 20px 24px; }
  .qv-tabs { inset: auto 0 0; z-index: 40; flex-direction: row; align-items: center; width: 100%; height: calc(74px + env(safe-area-inset-bottom, 0px)); padding: 8px max(12px, env(safe-area-inset-right, 0px)) calc(8px + env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px)); border-top: 1px solid var(--qv-border); background: #fffffffa; box-shadow: 0 -5px 24px #133b6a05; backdrop-filter: blur(16px); }
  .qv-tabs > button { flex: 1; flex-direction: column; justify-content: center; gap: 4px; min-width: 0; min-height: 54px; padding: 7px 4px; border-radius: 12px; font-size: 10px; line-height: 1.2; }
  .qv-nav-caption, .qv-nav-footer { display: none; }
  .qv-page-heading { margin-bottom: 22px; }
  .qv-page-heading h1 { font-size: 28px; }
  .qv-page-description { font-size: 12px; line-height: 1.6; }
  .qv-workspace-tag { display: none; }
  .qv-eyebrow { font-size: 10px; }
  .qv-pane { border-radius: 16px; }
  .qv-messages-heading { padding: 18px; }
  .qv-messages-heading > span { font-size: 8px; }
  .qv-suite { padding: 12px; }
  .qv-suite button, .qv-sorters button { min-height: 44px; }
  .qv-btn.sm { min-height: 44px; }
  .qv-toolbar { padding: 10px 12px; gap: 8px; }
  .qv-sorters { gap: 0; }
  .qv-sorters button { padding: 7px 9px; }
  .qv-row { gap: 10px; min-height: 90px; padding: 17px 16px; }
  .qv-row .ch { width: 35px; height: 35px; border-radius: 11px; }
  .qv-row .meta strong { font-size: 12px; }
  .qv-pad { padding: 22px 18px; }
  .qv-reply { margin: 16px; }
  .qv-bubble { margin: 14px 16px; padding: 14px; }
  .qv-agenda-item { padding: 20px 18px; flex-wrap: wrap; }
  .qv-lock-warning { padding: 14px; gap: 8px; font-size: 12px; }
  .qv-lock-warning .qv-btn { margin-left: 26px; }
  .qv:not(.qv-signed-in) .qv-workspace { padding: 30px 20px; }
  .qv-gate { padding: 28px 24px; }
  .qv-gate h1 { font-size: 27px; }
  .qv-homescreen { padding: 16px 20px; }
  .qv-tool-card { gap: 14px; padding: 18px; }
  .qv-tool-card strong { font-size: 13px; }
  .qv-tool-card small { font-size: 11px; }
  .qv-more-account { padding: 20px; }
  .qv-more-actions { width: 100%; }
  .qv-more-actions .qv-btn { flex: 1; font-size: 11px; }
  .qv-modal { align-items: flex-end; padding: 0; }
  .qv-sheet { max-width: 100%; max-height: 90dvh; padding: 26px 22px max(26px, env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; }
}
@media (max-width: 360px) {
  .qv-top { padding-left: 14px; padding-right: 14px; }
  .qv-workspace { padding-left: 12px; padding-right: 12px; }
  .qv-extend svg { display: none; }
  .qv-na-row { grid-template-columns: 1fr; }
  .qv-messages-heading > span { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .qv-spinner { animation: none; }
  .qv *, .qv *::before, .qv *::after { scroll-behavior: auto; transition: none; }
}
@media(max-width:360px){.qv-mobile .qv-extend span{display:none}.qv-mobile .qv-top :deep(.auricwell-brand){font-size:16px;gap:5px}.qv-mobile .qv-top :deep(.auricwell-brand img){width:28px;height:28px}}
</style>

<style>
.qv-email-preview{position:fixed;z-index:3000;background:#fff;color:#24372d;border:1px solid #86aa99;border-radius:9px;padding:16px;width:min(410px,90vw);box-sizing:border-box;max-height:320px;overflow:auto;box-shadow:0 8px 24px #0004}.qv-email-preview pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.5}
</style>

<style scoped>
.qv-preview-close{float:right;border:1px solid #cad8eb;background:white;color:#254978;border-radius:6px;padding:5px 9px;cursor:pointer}.qv-reply-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.qv-reply-heading h2{font-size:19px;margin:0}.qv-modal .qv-reply{margin:0;max-height:calc(100dvh - 48px);overflow:auto;padding:22px;padding-bottom:calc(22px + env(safe-area-inset-bottom));width:min(620px,calc(100vw - 28px))}
</style>

<style scoped>
.qv-mobile-reply{color:var(--qv-text);font-family:inherit}.qv-mobile-reply :is(button,input,textarea,select){font-family:inherit}.qv-mobile-reply .qv-reply-heading{position:sticky;top:-22px;background:white;z-index:2;padding:4px 0}

.qv-nav-badge{position:absolute;right:15%;top:7px;min-width:17px;padding:2px 4px;border-radius:10px;background:#255ad9;color:white;font-size:9px;font-weight:750}.qv-tabs>button{position:relative}.qv-message-back{font-size:12px;min-height:40px;border:0!important;margin:7px 10px!important;padding:7px 9px!important}.qv-calendar-modes{display:flex;gap:5px;padding:2px 16px 14px}.qv-calendar-modes button{font:inherit;font-size:12px;border:0;background:#f0f4fa;color:#647a98;padding:8px 16px;border-radius:8px}.qv-calendar-modes button[aria-pressed=true]{background:#245be0;color:white}.qv-note-readiness{margin:8px 0 15px;font-size:12px;color:#6e819d;line-height:1.6}.qv-cal-block{width:100%;text-align:left;color:#244c84;cursor:pointer;border:0;border-left:3px solid #7ca7ef}.qv-mobile-messages .qv-workspace{padding:0 0 calc(78px + env(safe-area-inset-bottom,0px));max-width:none}.qv-mobile-messages .qv-pane.thread{border:0;border-radius:0;box-shadow:none}.qv-mobile-messages .qv-content{width:100%}.qv-mobile .qv-day-nav{flex-wrap:nowrap;gap:5px;padding:12px 10px}.qv-mobile .qv-day-nav .qv-btn{padding:8px 9px;min-height:38px;font-size:11px;flex-shrink:0}.qv-mobile .qv-day-nav .qv-date{flex:1;min-width:0;width:100px;padding:8px 4px;min-height:38px;font-size:12px;box-sizing:border-box}.qv-mobile .qv-na-row{grid-template-columns:minmax(0,1fr) minmax(80px,.55fr)}.qv-mobile .qv-na-row input{box-sizing:border-box;min-width:0}.qv-mobile .qv-contact-row{padding:16px 13px;gap:11px}.qv-mobile .qv-contact-row .meta strong{font-size:13px}.qv-mobile .qv-contact-row .meta small{font-size:11px}.qv-mobile .qv-contact-row .qv-btn{padding:9px 12px;font-size:11px;min-height:37px}.qv-mobile .qv-contact-row .qv-avatar{width:36px;height:36px}
@media(max-width:760px){.qv-mobile .qv-top{padding:12px 14px;min-height:72px;box-sizing:border-box}.qv-mobile .qv-top :deep(.auricwell-brand){max-width:190px}.qv-mobile .qv-top-actions{gap:5px}.qv-mobile .qv-icon-button{min-width:33px;height:35px;padding:7px;border-radius:10px}.qv-mobile .qv-extend span{font-size:10px}.qv-mobile .qv-organization{display:none}.qv-mobile-messages .qv-workspace{padding-top:0;padding-left:0;padding-right:0}.qv-mobile .qv-tabs{padding:5px 5px calc(5px + env(safe-area-inset-bottom,0px));gap:3px;grid-template-columns:repeat(auto-fit,minmax(50px,1fr))}.qv-mobile .qv-tabs>button{min-height:57px;padding:7px 4px;min-width:0;flex:1}.qv-mobile .qv-tabs>button span{font-size:10px}.qv-mobile .qv-top .qv-lock-label{display:none}.qv-mobile .qv-page-heading{margin-bottom:17px}.qv-mobile .qv-page-heading h1{font-size:25px}.qv-mobile .qv-page-description{font-size:12px}.qv-mobile:not(.qv-mobile-messages) .qv-workspace{padding-left:13px;padding-right:13px}}
</style>

<style scoped>
.qv-work-heading{padding:12px 0!important;margin-bottom:8px!important}.qv-work-heading h1{font-size:24px!important;margin:0!important}.qv-work-heading .qv-eyebrow,.qv-work-heading .qv-page-description{display:none}.qv-mobile-composer{overflow-y:auto;padding:0!important;align-items:flex-start!important}.qv-mobile-composer :deep(.email-composer){width:100%;box-sizing:border-box;min-height:100dvh;padding:20px 16px;padding-bottom:max(20px,env(safe-area-inset-bottom))}
</style>

<style>@media(max-width:760px){.qv-mobile :is(input:not([type=checkbox]):not([type=radio]),textarea,select),.qv-mobile-composer :is(input,textarea,select),.mm-recipient-overlay :is(input,textarea,select){font-size:16px!important}}</style>

<style scoped>
.qv-directory-search{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:10px;padding:12px 16px;background:#f7faff}.qv-directory-search label{min-width:0;display:grid;gap:5px;font-size:12px}.qv-directory-search input,.qv-directory-search select{box-sizing:border-box;min-width:0;width:100%;font:inherit;font-size:16px;padding:9px;border:1px solid #d6e2f2;border-radius:8px;background:#fff}.qv-extension{display:inline-block;white-space:nowrap;font-size:12px;color:#2459a5}.qv-school-admin{font-size:10px;letter-spacing:.02em;color:#526b88}.qv-directory-search-toggle{white-space:nowrap}@media(max-width:440px){.qv-directory-search{grid-template-columns:minmax(0,1fr)}}
</style>

<style scoped>.qv-contact-row .meta strong{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;line-height:1.45}.qv-contact-row>.qv-btn{flex-shrink:0}.qv-contact-row .qv-extension{margin-left:4px}</style>

<style scoped>
.qv-mobile,.qv-mobile .qv-workspace,.qv-mobile .qv-content{box-sizing:border-box;width:100%;max-width:100%;min-width:0}.qv-mobile .qv-workspace{overflow-x:hidden}.qv-mobile .qv-content>*{min-width:0;max-width:100%;box-sizing:border-box}
</style>

<style scoped>.qv-task-count{font-size:11px;font-variant-numeric:tabular-nums;margin-left:4px}.qv-selected-day{font-size:13px;color:#466384;margin:0;padding:0 16px 12px}.qv-task-due{display:grid;gap:9px;font-size:14px}.qv-task-due input{font:inherit;font-size:16px;min-width:0;max-width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd9ed;border-radius:9px}.qv-task-action-buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.qv-task-action>p{white-space:pre-wrap;overflow-wrap:anywhere}.qv-task-action button{min-height:44px}</style>

<style scoped>
.qv-mobile .qv-tabs>button.qv-fixed-shortcut{border-right:1px solid #cdd8ea;border-radius:10px 0 0 10px;margin-right:3px}.qv-top-actions>.qv-icon-button{position:relative}.qv-notification-dot{position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:#2860df;box-shadow:0 0 0 3px #eef3ff;animation:qv-pulse 2s ease-out infinite}.qv-countdown{font-size:9px;line-height:1.2;white-space:nowrap;color:#526b90}.qv-mobile .qv-extend{display:grid;grid-template-columns:auto auto;gap:2px 5px;min-width:68px}.qv-countdown{grid-column:1/-1}.qv-mobile .qv-tabs>button{min-width:0;flex:1}.qv-mobile .qv-tabs>button>span:not(.qv-nav-badge){font-size:10px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}@keyframes qv-pulse{0%,100%{box-shadow:0 0 0 3px #eef3ff}50%{box-shadow:0 0 0 6px #2860df20}}@media(prefers-reduced-motion:reduce){.qv-notification-dot{animation:none}}
</style>
