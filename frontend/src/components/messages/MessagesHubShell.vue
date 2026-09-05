<template>
  <div
    class="msg-hub"
    :class="{
      'msg-hub--drawer': isDrawerLayout,
      'msg-hub--mobile-thread': mobileShowThread && (!!selected || !!conversationPreview)
    }"
  >
    <header class="msg-hub-head">
      <div class="msg-hub-head-main">
        <button
          type="button"
          class="msg-hub-rail-toggle"
          :aria-expanded="railOpen"
          @click="railOpen = !railOpen"
        >
          Menu
        </button>
        <div>
          <h2 class="msg-hub-title">Messaging Hub</h2>
          <p class="msg-hub-sub">{{ hubSubtitle }}</p>
        </div>
      </div>
      <div class="msg-hub-head-actions">
        <button
          v-if="isDrawerLayout"
          type="button"
          class="btn btn-secondary btn-xs"
          @click="openTeamChat"
        >
          Team chat
        </button>
        <button type="button" class="btn btn-primary" @click="openNewConversation">
          + New conversation
        </button>
      </div>
    </header>

    <div v-if="error" class="msg-hub-error">{{ error }}</div>

    <div class="msg-hub-body">
      <div
        v-if="railOpen"
        class="msg-hub-rail-backdrop"
        @click="railOpen = false"
      />

      <nav
        class="msg-hub-rail"
        :class="{ open: railOpen }"
        aria-label="Messaging navigation"
      >
        <div class="msg-hub-rail-section">
          <p class="msg-hub-rail-label">Inbox</p>
          <button
            v-for="item in inboxNavItems"
            :key="'inbox-' + item.id"
            type="button"
            class="msg-hub-rail-item"
            :class="{ active: navSection === 'inbox' && navId === item.id }"
            @click="selectNav('inbox', item.id)"
          >
            <span>{{ item.label }}</span>
            <span
              v-if="inboxBadgeCount(item.id)"
              class="msg-hub-rail-badge"
              :aria-label="`${inboxBadgeCount(item.id)} ${item.label}`"
            >{{ inboxBadgeCount(item.id) }}</span>
          </button>
        </div>
        <div class="msg-hub-rail-section">
          <p class="msg-hub-rail-label">People</p>
          <button
            v-for="item in peopleNavItems"
            :key="'people-' + item.id"
            type="button"
            class="msg-hub-rail-item"
            :class="{ active: navSection === 'people' && navId === item.id }"
            @click="selectNav('people', item.id)"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="msg-hub-rail-section">
          <p class="msg-hub-rail-label">Tools</p>
          <button
            v-for="item in toolsNavItems"
            :key="'tools-' + item.id"
            type="button"
            class="msg-hub-rail-item"
            :class="{ active: navSection === 'tools' && navId === item.id }"
            @click="selectNav('tools', item.id)"
          >
            {{ item.label }}
            <span v-if="item.stub" class="msg-hub-rail-soon">Soon</span>
          </button>
        </div>
      </nav>

      <div class="msg-hub-grid">
        <section
          class="msg-hub-list-col"
          :aria-label="listColumnTitle"
        >
          <div class="msg-hub-list-head">
            <h3>{{ listColumnTitle }}</h3>
          </div>
          <label class="msg-hub-search">
            <span class="sr-only">Filter list</span>
            <input
              v-model="listSearch"
              type="search"
              :placeholder="listSearchPlaceholder"
            />
          </label>
          <div v-if="loadingList || loadingQueued" class="msg-hub-muted pad">Loading…</div>

          <ul v-else-if="isQueuedMode && queuedItems.length" class="msg-hub-list">
            <li
              v-for="q in queuedItems"
              :key="q.id"
              class="msg-hub-row"
            >
              <div class="msg-hub-avatar" aria-hidden="true">
                <span>{{ initials(q.subject || q.channel || '?') }}</span>
              </div>
              <div class="msg-hub-row-body">
                <div class="msg-hub-row-top">
                  <strong>{{ methodLabel(q.channel) || q.channel }} · {{ queueReasonLabel(q.queueReason) }}</strong>
                  <span v-if="q.scheduledSendAt" class="msg-hub-time">{{ formatTime(q.scheduledSendAt) }}</span>
                </div>
                <p class="msg-hub-snippet">{{ q.subject || q.bodyPreview || '' }}</p>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" @click="undoQueuedItem(q)">Undo</button>
            </li>
          </ul>
          <div v-else-if="isQueuedMode" class="msg-hub-empty">
            <p>No queued messages. Delayed sends, scheduled messages, and availability holds appear here.</p>
          </div>

          <ul v-else-if="isConversationMode && filteredConversations.length" class="msg-hub-list">
            <li
              v-for="c in filteredConversations"
              :key="c.id"
              class="msg-hub-row"
              :class="{
                active: selectedConversation?.id === c.id,
                unread: c.is_unread
              }"
              @click="pickConversation(c)"
            >
              <div class="msg-hub-avatar" aria-hidden="true">
                <span>{{ initials(c.primary_participant_name || c.subject || '?') }}</span>
              </div>
              <div class="msg-hub-row-body">
                <div class="msg-hub-row-top">
                  <strong>{{ c.primary_participant_name || c.subject || 'Conversation' }}</strong>
                  <span v-if="c.last_message_at" class="msg-hub-time">{{ formatTime(c.last_message_at) }}</span>
                </div>
                <p class="msg-hub-snippet">
                  <span v-if="isConversationSnoozed(c)" class="msg-hub-snooze-tag" title="Snoozed">⏰</span>
                  <span
                    v-if="c.is_unknown_sender || c.sender_trust === 'unknown' || navId === 'unknown'"
                    class="msg-hub-unknown-tag"
                    title="Unknown sender"
                  >Unknown</span>
                  {{ c.last_message_preview || c.subject || '' }}
                </p>
              </div>
              <div class="msg-hub-row-actions" @click.stop>
                <div class="msg-hub-snooze-wrap">
                  <button
                    type="button"
                    class="msg-hub-snooze-btn"
                    :class="{ on: isConversationSnoozed(c) }"
                    title="Snooze"
                    @click="toggleSnoozeMenu(c.id)"
                  >
                    ⏰
                  </button>
                  <div v-if="snoozeMenuFor === c.id" class="msg-hub-snooze-menu">
                    <button type="button" @click="snoozeConversation(c, '1h')">1 hour</button>
                    <button type="button" @click="snoozeConversation(c, 'later_today')">Later today</button>
                    <button type="button" @click="snoozeConversation(c, 'tomorrow')">Tomorrow 9am</button>
                    <button type="button" @click="snoozeConversation(c, 'next_week')">Next week</button>
                    <button
                      v-if="isConversationSnoozed(c)"
                      type="button"
                      @click="snoozeConversation(c, null)"
                    >
                      Clear snooze
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  class="msg-hub-star-btn"
                  :class="{ on: !!c.starred }"
                  :title="c.starred ? 'Unstar' : 'Star'"
                  @click="toggleConversationStar(c)"
                >
                  {{ c.starred ? '★' : '☆' }}
                </button>
              </div>
              <span v-if="c.is_unread" class="msg-hub-unread-dot" aria-label="Unread" />
            </li>
          </ul>

          <ul v-else-if="isPeopleBrowseMode && filteredPeople.length" class="msg-hub-list">
            <li
              v-for="p in filteredPeople"
              :key="p.personKey"
              class="msg-hub-row"
              :class="{ active: isPersonRowActive(p) }"
              @click="pickPerson(p)"
            >
              <div class="msg-hub-avatar" aria-hidden="true">
                <img v-if="p.photoUrl" :src="photoSrc(p.photoUrl)" :alt="''" />
                <img
                  v-else-if="rowAvatarIcon(p)"
                  class="msg-hub-avatar-tenant"
                  :src="photoSrc(rowAvatarIcon(p))"
                  :alt="''"
                />
                <span v-else>{{ initials(p.displayName) }}</span>
              </div>
              <div class="msg-hub-row-body">
                <div class="msg-hub-row-top">
                  <strong>{{ peopleRowTitle(p) }}</strong>
                  <span v-if="p.occurredAt" class="msg-hub-time">{{ formatTime(p.occurredAt) }}</span>
                </div>
                <p class="msg-hub-snippet">
                  <span v-if="peopleTalkingTo(p)" class="msg-hub-talking">Talking to: {{ peopleTalkingTo(p) }}</span>
                  <template v-else>
                    <span
                      v-if="agencyLabel(p)"
                      class="msg-hub-agency"
                      :class="{ 'msg-hub-agency-other': isOtherAgency(p) }"
                    >{{ agencyLabel(p) }}</span>
                    <span v-if="agencyLabel(p) && personRoleLabel(p)"> · </span>
                    {{ personRoleLabel(p) }}
                  </template>
                </p>
                <div v-if="peopleChannelChips(p).length" class="msg-hub-chip-row">
                  <span
                    v-for="ch in peopleChannelChips(p)"
                    :key="ch"
                    class="msg-hub-mini-chip"
                  >{{ ch }}</span>
                </div>
              </div>
              <span
                class="msg-hub-kind"
                :class="personBadgeClass(p)"
              >
                {{ personBadgeLabel(p) }}
              </span>
            </li>
          </ul>

          <div v-else class="msg-hub-empty">
            <p>{{ emptyListCopy }}</p>
            <button
              v-if="navSection !== 'tools'"
              type="button"
              class="btn btn-primary"
              @click="openNewConversation"
            >
              + New conversation
            </button>
          </div>
        </section>

        <section class="msg-hub-thread-col" aria-label="Conversation">
          <template v-if="selected">
            <header class="msg-hub-thread-head">
              <button
                type="button"
                class="msg-hub-back-list"
                @click="backToList"
              >
                ← List
              </button>
              <div class="msg-hub-avatar lg" aria-hidden="true">
                <img v-if="selected.photoUrl" :src="photoSrc(selected.photoUrl)" :alt="''" />
                <img
                  v-else-if="rowAvatarIcon(selected)"
                  class="msg-hub-avatar-tenant"
                  :src="photoSrc(rowAvatarIcon(selected))"
                  :alt="''"
                />
                <span v-else>{{ initials(selected.displayName) }}</span>
              </div>
              <div>
                <h3>
                  <button
                    v-if="clientProfilePath"
                    type="button"
                    class="msg-hub-name-link"
                    title="Open client profile"
                    @click="openClientProfile"
                  >
                    {{ threadTitle }}
                  </button>
                  <span v-else>{{ threadTitle }}</span>
                </h3>
                <p class="msg-hub-muted">
                  <template v-if="talkingToLabel">Talking to: {{ talkingToLabel }}</template>
                  <template v-else>
                    <span
                      v-if="agencyLabel(selected)"
                      class="msg-hub-agency"
                      :class="{ 'msg-hub-agency-other': isOtherAgency(selected) }"
                    >{{ agencyLabel(selected) }}</span>
                    <span v-if="agencyLabel(selected) && personRoleLabel(selected)"> · </span>
                    {{ personRoleLabel(selected) }}
                  </template>
                </p>
              </div>
            </header>

            <p v-if="clientNoPortalBanner" class="msg-hub-banner-warn">
              {{ clientNoPortalBanner }}
              <button
                v-if="canSendPortalInvite"
                type="button"
                class="msg-hub-invite-inline"
                :disabled="portalInviteBusy"
                @click="sendPortalInvite"
              >
                {{ portalInviteBusy ? 'Sending…' : 'Send portal invitation' }}
              </button>
            </p>

            <div v-if="clientMessaging?.guardians?.length" class="msg-hub-talking-bar">
              <label>
                Talking to
                <select v-model.number="talkingToUserId" class="msg-hub-talking-select" @change="onTalkingToChange">
                  <option
                    v-for="g in clientMessaging.guardians"
                    :key="g.userId"
                    :value="g.userId"
                  >
                    {{ g.displayName }}{{ g.portalAccess ? '' : ' (no portal)' }}
                  </option>
                </select>
              </label>
            </div>

            <div class="msg-hub-channel-toggles" role="tablist" aria-label="Send via">
              <button
                v-for="ch in methodButtons"
                :key="ch.id"
                type="button"
                class="msg-hub-channel"
                :class="{
                  active: sendMethod === ch.id,
                  recommended: ch.recommended,
                  unavailable: !ch.available
                }"
                :disabled="!ch.available"
                :title="ch.reason || ''"
                @click="selectMethod(ch.id)"
              >
                <span>{{ methodLabel(ch.id) }}</span>
                <span v-if="ch.recommended && ch.available" class="msg-hub-rec">Best</span>
                <span v-else-if="!ch.available" class="msg-hub-not-yet">{{ methodUnavailableShort(ch) }}</span>
              </button>
            </div>
            <p v-if="methodUnavailableHint" class="msg-hub-method-hint">{{ methodUnavailableHint }}</p>
            <div v-if="canSendPortalInvite" class="msg-hub-invite-row">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="portalInviteBusy"
                @click="sendPortalInvite"
              >
                {{ portalInviteBusy ? 'Sending invitation…' : 'Send portal invitation' }}
              </button>
              <span class="msg-hub-muted">Email a branded invite so they can create their portal account.</span>
            </div>
            <p v-if="secureHint" class="msg-hub-secure-hint">{{ secureHint }}</p>
            <label
              v-if="showSecureEmailToggle"
              class="msg-hub-secure-toggle"
            >
              <input
                type="checkbox"
                :checked="sendMethod === 'secure'"
                @change="onSecureToggle($event)"
              />
              Send as secure portal message (recommended for active clients)
            </label>

            <div class="msg-hub-timeline">
              <div v-if="loadingTimeline" class="msg-hub-muted">Loading conversation…</div>
              <template v-else-if="timeline.length">
                <div
                  v-for="msg in timeline"
                  :key="msg.id"
                  class="msg-hub-bubble"
                  :class="[msg.direction, `ch-${msg.channel}`]"
                >
                  <span class="msg-hub-bubble-ch">{{ methodLabel(msg.channel) }}</span>
                  <p v-if="msg.bodyPreview">{{ msg.bodyPreview }}</p>
                  <div v-if="msg.attachments?.length" class="msg-hub-bubble-atts">
                    <a
                      v-for="att in msg.attachments"
                      :key="att.id || att.file_path"
                      class="msg-hub-att-link"
                      :href="att.file_url"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        v-if="isImageAttachment(att)"
                        :src="att.file_url"
                        :alt="att.original_filename || 'attachment'"
                        class="msg-hub-att-img"
                      />
                      <span v-else>{{ att.original_filename || 'Attachment' }}</span>
                    </a>
                  </div>
                  <div
                    v-if="isChatChannel(msg.channel)"
                    class="msg-hub-reactions"
                  >
                    <button
                      v-for="rx in (msg.reactions || [])"
                      :key="rx.code"
                      type="button"
                      class="msg-hub-rx-chip"
                      :class="{ mine: rx.mineActive }"
                      :title="rx.code"
                      @click="toggleChatReaction(msg, rx.code)"
                    >
                      <span>{{ rx.code }}</span>
                      <span v-if="rx.count > 1" class="msg-hub-rx-count">{{ rx.count }}</span>
                    </button>
                    <div class="msg-hub-rx-add-wrap">
                      <button
                        type="button"
                        class="msg-hub-rx-add"
                        title="Add reaction"
                        @click.stop="reactionPickerFor = reactionPickerFor === msg.id ? null : msg.id"
                      >
                        🙂+
                      </button>
                      <div v-if="reactionPickerFor === msg.id" class="msg-hub-rx-picker" @click.stop>
                        <button
                          v-for="emoji in QUICK_REACTIONS"
                          :key="emoji"
                          type="button"
                          @click="toggleChatReaction(msg, emoji); reactionPickerFor = null"
                        >{{ emoji }}</button>
                      </div>
                    </div>
                  </div>
                  <div class="msg-hub-bubble-meta">
                    <time>{{ formatTime(msg.createdAt) }}</time>
                    <span
                      v-if="msg.meta?.sendStatus === 'scheduled'"
                      class="msg-hub-sent-tag"
                    >Queued</span>
                    <span
                      v-else-if="msg.direction === 'outbound'"
                      class="msg-hub-sent-tag"
                    >Sent</span>
                    <span
                      v-if="msg.meta?.openedAt"
                      class="msg-hub-open-tag"
                      :title="formatTime(msg.meta.openedAt)"
                    >
                      Opened
                    </span>
                    <span
                      v-else-if="msg.channel === 'email' && msg.direction === 'outbound' && msg.meta?.sendStatus !== 'scheduled'"
                      class="msg-hub-open-tag pending"
                    >
                      Not opened
                    </span>
                    <button
                      v-if="msg.channel === 'email' && msg.meta?.conversationId"
                      type="button"
                      class="msg-hub-star-btn"
                      :class="{ on: !!msg.meta?.starred }"
                      :title="msg.meta?.starred ? 'Unstar conversation' : 'Star conversation'"
                      @click="toggleStarByConversationId(msg.meta.conversationId, !!msg.meta?.starred, msg)"
                    >
                      {{ msg.meta?.starred ? '★' : '☆' }}
                    </button>
                    <button
                      v-if="msg.channel === 'email' && msg.meta?.conversationId && msg.meta?.sendStatus === 'scheduled'"
                      type="button"
                      class="msg-hub-like"
                      title="Undo / recall"
                      @click="undoScheduledMessage(msg)"
                    >
                      Undo
                    </button>
                    <button
                      v-else-if="msg.channel === 'email' && msg.meta?.conversationId"
                      type="button"
                      class="msg-hub-like"
                      title="Like"
                      :disabled="reactingId === msg.id"
                      @click="reactToMessage(msg)"
                    >
                      {{ reactingId === msg.id ? '…' : '❤️' }}
                    </button>
                  </div>
                </div>
              </template>
              <div v-else class="msg-hub-empty soft">
                No messages yet. Write below and send.
              </div>
            </div>

            <div class="msg-hub-composer">
              <p v-if="deliveryNotice" class="msg-hub-delivery-note">{{ deliveryNotice }}</p>
              <div v-if="undoBanner" class="msg-hub-undo">
                <span>
                  {{ undoBannerLabel }}
                  <strong v-if="undoCountdownLabel"> {{ undoCountdownLabel }}</strong>
                </span>
                <button type="button" @click="undoBannerSend">Undo</button>
              </div>
              <template v-if="sendMethod === 'email'">
                <div class="msg-hub-email-row msg-hub-to-row">
                  <label>To</label>
                  <div class="msg-hub-to-value">
                    <strong>{{ composeToName || '—' }}</strong>
                    <span v-if="composeToEmail" class="msg-hub-to-email">{{ composeToEmail }}</span>
                    <span v-else class="msg-hub-to-missing">No email on this recipient</span>
                  </div>
                </div>
                <input
                  v-model="composeSubject"
                  type="text"
                  class="msg-hub-subject"
                  placeholder="Subject"
                />
                <div class="msg-hub-email-row">
                  <label>From</label>
                  <select v-model="composeFromAliasId" class="msg-hub-alias">
                    <option v-for="a in emailAliases" :key="a.id" :value="a.id">
                      {{ a.email }} ({{ a.displayName }})
                    </option>
                    <option v-if="!emailAliases.length" :value="null">messages@ (default)</option>
                  </select>
                </div>
                <input
                  v-model="composeCc"
                  type="text"
                  class="msg-hub-subject"
                  placeholder="Cc — type a name or email, pick from staff"
                  list="msg-hub-staff-suggest"
                  @input="onCcBccInput('cc')"
                />
                <input
                  v-model="composeBcc"
                  type="text"
                  class="msg-hub-subject"
                  placeholder="Bcc — type a name or email, pick from staff"
                  list="msg-hub-staff-suggest"
                  @input="onCcBccInput('bcc')"
                />
                <datalist id="msg-hub-staff-suggest">
                  <option
                    v-for="s in staffSuggest"
                    :key="s.email"
                    :value="s.email"
                  >
                    {{ s.displayName }}{{ s.agencyName ? ` · ${s.agencyName}` : '' }}
                  </option>
                </datalist>
                <div class="msg-hub-attach-row">
                  <label class="msg-hub-attach-btn">
                    Attach files
                    <input type="file" multiple hidden @change="onAttachFiles" />
                  </label>
                  <ul v-if="composeAttachments.length" class="msg-hub-attach-list">
                    <li v-for="(f, i) in composeAttachments" :key="i">
                      {{ f.filename }}
                      <button type="button" @click="composeAttachments.splice(i, 1)">×</button>
                    </li>
                  </ul>
                </div>
              </template>
              <div
                v-if="smartReply || smartReplyLoading"
                class="msg-hub-smart-reply"
              >
                <span class="msg-hub-smart-label">Suggested reply</span>
                <p v-if="smartReplyLoading" class="msg-hub-smart-text loading">Thinking…</p>
                <p v-else class="msg-hub-smart-text">{{ smartReply }}</p>
                <button
                  v-if="smartReply && !smartReplyLoading"
                  type="button"
                  class="btn btn-ghost btn-sm"
                  @click="applySmartReply"
                >
                  Apply suggestion
                </button>
              </div>
              <textarea
                ref="composeEl"
                v-model="composeBody"
                rows="3"
                :placeholder="composerPlaceholder"
                @keydown.meta.enter.prevent="send"
                @keydown.ctrl.enter.prevent="send"
              />
              <div
                v-if="sendMethod === 'internal' || sendMethod === 'secure'"
                class="msg-hub-chat-tools"
              >
                <ul v-if="chatStagedAttachments.length" class="msg-hub-attach-list chat">
                  <li v-for="(f, i) in chatStagedAttachments" :key="f.filePath || i">
                    {{ f.originalFilename || 'File' }}
                    <button type="button" @click="chatStagedAttachments.splice(i, 1)">×</button>
                  </li>
                </ul>
                <div class="msg-hub-chat-tool-row">
                  <div class="msg-hub-emoji-wrap">
                    <button
                      type="button"
                      class="msg-hub-tool-btn"
                      :class="{ active: emojiPickerOpen }"
                      title="Insert emoji"
                      @click.stop="emojiPickerOpen = !emojiPickerOpen"
                    >
                      🙂
                    </button>
                    <div v-if="emojiPickerOpen" class="msg-hub-emoji-picker" @click.stop>
                      <div v-for="group in EMOJI_GRID" :key="group.label" class="msg-hub-emoji-group">
                        <div class="msg-hub-emoji-group-label">{{ group.label }}</div>
                        <div class="msg-hub-emoji-row">
                          <button
                            v-for="e in group.emojis"
                            :key="e"
                            type="button"
                            class="msg-hub-emoji-btn"
                            @click="insertEmoji(e)"
                          >{{ e }}</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <label class="msg-hub-tool-btn" title="Attach file">
                    📎
                    <input type="file" multiple hidden :disabled="uploadingChatAttach" @change="onChatAttachFiles" />
                  </label>
                  <span v-if="uploadingChatAttach" class="msg-hub-muted">Uploading…</span>
                </div>
              </div>
              <div class="msg-hub-compose-actions">
                <span class="msg-hub-muted">Via {{ methodLabel(sendMethod) || '…' }}</span>
                <label class="msg-hub-delay-label">
                  Undo delay
                  <select v-model.number="undoDelaySeconds" class="msg-hub-delay-select">
                    <option v-for="opt in undoDelayOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </label>
                <div ref="sendSplitEl" class="msg-hub-send-split" :class="{ open: showSchedule }">
                  <button
                    type="button"
                    class="btn btn-primary msg-hub-send-main"
                    :disabled="sending || !canSendCompose || !activeMethod?.available"
                    :title="sendQueueReason || undefined"
                    @click="send"
                  >
                    <span class="msg-hub-send-main-label">{{ sendButtonLabel }}</span>
                    <span v-if="sendQueueReason" class="msg-hub-send-main-why">{{ sendQueueReason }}</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary msg-hub-send-caret"
                    aria-label="Send options"
                    aria-haspopup="menu"
                    :aria-expanded="showSchedule ? 'true' : 'false'"
                    :disabled="sending || !canSendCompose || !activeMethod?.available"
                    @click.stop="toggleSendMenu"
                  >
                    ▾
                  </button>
                  <div v-if="showSchedule" class="msg-hub-schedule-menu" role="menu" @click.stop>
                    <button type="button" role="menuitem" @click="pickSchedule(null); send()">
                      <span class="msg-hub-menu-title">Send now</span>
                      <span class="msg-hub-menu-sub">Uses the undo delay above</span>
                    </button>
                    <button
                      v-if="senderOutsideHours"
                      type="button"
                      role="menuitem"
                      @click="queueAndSend('next_available')"
                    >
                      <span class="msg-hub-menu-title">During my availability hours</span>
                      <span class="msg-hub-menu-sub">Hold until you’re back on the clock</span>
                    </button>
                    <button type="button" role="menuitem" @click="queueAndSend('in_1_hour')">
                      <span class="msg-hub-menu-title">In 1 hour</span>
                      <span class="msg-hub-menu-sub">Schedule send</span>
                    </button>
                    <button type="button" role="menuitem" @click="queueAndSend('tomorrow_9am')">
                      <span class="msg-hub-menu-title">Tomorrow 9am</span>
                      <span class="msg-hub-menu-sub">Schedule send</span>
                    </button>
                    <button type="button" role="menuitem" @click="queueAndSend('monday_9am')">
                      <span class="msg-hub-menu-title">Next Monday 9am</span>
                      <span class="msg-hub-menu-sub">Schedule send</span>
                    </button>
                  </div>
                </div>
              </div>
              <p v-if="senderOutsideHours" class="msg-hub-muted msg-hub-sender-avail">
                {{ selected?.senderGate?.message || "You're outside your availability hours." }}
                Guardians and families still get mail when you send — open the send ▾ menu and choose
                <strong>During my availability hours</strong>
                if you want to wait.
                <router-link v-if="myWorkSchedulePath" :to="myWorkSchedulePath" class="msg-hub-inline-link">
                  Edit availability hours
                </router-link>
              </p>
              <div
                v-if="sendMethod === 'email' && signaturePreview?.eligible && signaturePreview?.html"
                class="msg-hub-sig-preview"
              >
                <div class="msg-hub-sig-preview-head">
                  <span>Email signature preview</span>
                  <span v-if="!signaturePreview.enabled" class="msg-hub-muted">Off on profile</span>
                </div>
                <div class="msg-hub-sig-preview-body" v-html="signaturePreview.html" />
              </div>
              <p v-if="sendError" class="msg-hub-error inline">{{ sendError }}</p>
            </div>
          </template>

          <template v-else-if="conversationPreview">
            <header class="msg-hub-thread-head">
              <button type="button" class="msg-hub-back-list" @click="backToList">← List</button>
              <div class="msg-hub-thread-head-main">
                <h3>{{ selectedConversation?.primary_participant_name || selectedConversation?.subject || 'Conversation' }}</h3>
                <p class="msg-hub-muted">
                  {{ selectedConversation?.primary_participant_email || 'Inbox conversation' }}
                  <span v-if="isConversationSnoozed(selectedConversation)" class="msg-hub-snooze-until">
                    · Snoozed until {{ formatTime(selectedConversation.snoozed_until) }}
                  </span>
                </p>
              </div>
              <div v-if="selectedConversation?.id" class="msg-hub-thread-actions">
                <div class="msg-hub-snooze-wrap">
                  <button
                    type="button"
                    class="msg-hub-snooze-btn lg"
                    :class="{ on: isConversationSnoozed(selectedConversation) }"
                    title="Snooze"
                    @click="toggleSnoozeMenu(`thread-${selectedConversation.id}`)"
                  >
                    ⏰ Snooze
                  </button>
                  <div
                    v-if="snoozeMenuFor === `thread-${selectedConversation.id}`"
                    class="msg-hub-snooze-menu end"
                  >
                    <button type="button" @click="snoozeConversation(selectedConversation, '1h')">1 hour</button>
                    <button type="button" @click="snoozeConversation(selectedConversation, 'later_today')">Later today</button>
                    <button type="button" @click="snoozeConversation(selectedConversation, 'tomorrow')">Tomorrow 9am</button>
                    <button type="button" @click="snoozeConversation(selectedConversation, 'next_week')">Next week</button>
                    <button
                      v-if="isConversationSnoozed(selectedConversation)"
                      type="button"
                      @click="snoozeConversation(selectedConversation, null)"
                    >
                      Clear snooze
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  class="msg-hub-star-btn lg"
                  :class="{ on: !!selectedConversation.starred }"
                  :title="selectedConversation.starred ? 'Unstar' : 'Star'"
                  @click="toggleConversationStar(selectedConversation)"
                >
                  {{ selectedConversation.starred ? '★' : '☆' }}
                </button>
              </div>
            </header>
            <div v-if="isUnknownConversation" class="msg-hub-unknown-banner">
              <div>
                <strong>Unknown sender</strong>
                <p>
                  This address isn’t in your known contacts. Mark them known and add to contacts to bring
                  unread mail into Unread.
                </p>
              </div>
              <button type="button" class="btn btn-primary" @click="openResolveUnknown">
                Mark known &amp; add to contacts
              </button>
            </div>
            <div class="msg-hub-timeline">
              <div
                v-for="msg in (conversationPreview.messages || [])"
                :key="msg.id"
                class="msg-hub-bubble"
                :class="String(msg.direction || '').toLowerCase() === 'outbound' ? 'outbound' : 'inbound'"
              >
                <span class="msg-hub-bubble-ch">{{ msg.channel || 'email' }}</span>
                <p>{{ msg.body_text || msg.subject || '' }}</p>
                <div class="msg-hub-bubble-meta">
                  <time>{{ formatTime(msg.sent_at || msg.created_at) }}</time>
                </div>
              </div>
              <div v-if="!(conversationPreview.messages || []).length" class="msg-hub-empty soft">
                No messages in this conversation.
              </div>
            </div>
          </template>

          <div v-else class="msg-hub-thread-empty">
            <h3>Who do you want to reach?</h3>
            <p>
              Browse your clients by name or school, open someone recent, or search by name, email, or phone.
            </p>
            <button type="button" class="btn btn-primary" @click="openNewConversation">
              + New conversation
            </button>
          </div>
        </section>

        <aside class="msg-hub-context" aria-label="Context">
          <template v-if="selected">
            <section class="msg-hub-panel">
              <h3>Profile</h3>
              <div class="msg-hub-profile-head">
                <div class="msg-hub-avatar lg" aria-hidden="true">
                  <img v-if="selected.photoUrl" :src="photoSrc(selected.photoUrl)" :alt="''" />
                  <img
                    v-else-if="rowAvatarIcon(selected)"
                    class="msg-hub-avatar-tenant"
                    :src="photoSrc(rowAvatarIcon(selected))"
                    :alt="''"
                  />
                  <span v-else>{{ initials(selected.displayName) }}</span>
                </div>
                <div>
                  <p class="msg-hub-profile-name">
                    <button
                      v-if="clientProfilePath"
                      type="button"
                      class="msg-hub-name-link"
                      @click="openClientProfile"
                    >
                      {{ selected.displayName }}
                    </button>
                    <template v-else>{{ selected.displayName }}</template>
                  </p>
                  <p class="msg-hub-muted">
                    <span
                      v-if="agencyLabel(selected)"
                      class="msg-hub-agency"
                      :class="{ 'msg-hub-agency-other': isOtherAgency(selected) }"
                    >{{ agencyLabel(selected) }}</span>
                    <span v-if="agencyLabel(selected) && personRoleLabel(selected)"> · </span>
                    {{ personRoleLabel(selected) }}
                  </p>
                </div>
              </div>
              <ul class="msg-hub-kv">
                <li v-if="agencyLabel(selected)"><span>Agency</span><strong>{{ agencyLabel(selected) }}</strong></li>
                <li v-if="selected.email"><span>Email</span><strong>{{ selected.email }}</strong></li>
                <li v-else-if="talkingToGuardianEmail">
                  <span>Email</span>
                  <strong>{{ talkingToGuardianEmail }}</strong>
                  <em class="msg-hub-kv-hint"> (guardian)</em>
                </li>
                <li v-else-if="isClientSelection">
                  <span>Email</span>
                  <strong class="msg-hub-missing">None on client record</strong>
                </li>
                <li v-if="selected.phone"><span>Phone</span><strong>{{ selected.phone }}</strong></li>
                <li>
                  <span>Preferred</span>
                  <strong>{{ methodLabel(selected.preferredMethod) || '—' }}</strong>
                </li>
              </ul>
              <p v-if="deliveryNotice" class="msg-hub-delivery-note sidebar">{{ deliveryNotice }}</p>
              <div class="msg-hub-context-actions">
                <button
                  v-if="clientProfilePath"
                  type="button"
                  class="btn btn-secondary btn-xs"
                  @click="openClientProfile"
                >
                  Open client profile
                </button>
                <router-link
                  v-else-if="profilePath"
                  class="btn btn-secondary btn-xs"
                  :to="profilePath"
                >
                  View profile
                </router-link>
                <button type="button" class="btn btn-secondary btn-xs" @click="createReminderStub">
                  Create reminder
                </button>
              </div>
              <p v-if="reminderNotice" class="msg-hub-muted pad-top">{{ reminderNotice }}</p>
            </section>

            <section v-if="clientMessaging" class="msg-hub-panel">
              <h3>Client &amp; guardians</h3>
              <div class="msg-hub-party-card">
                <router-link
                  v-if="clientProfilePath"
                  class="msg-hub-name-link"
                  :to="clientProfilePath"
                >
                  <strong>{{ clientMessaging.clientName }}</strong>
                </router-link>
                <strong v-else>{{ clientMessaging.clientName }}</strong>
                <span class="msg-hub-muted">Client</span>
                <span class="msg-hub-portal-flag" :class="{ on: clientMessaging.clientHasPortal }">
                  {{ clientMessaging.clientHasPortal ? 'Portal access' : 'No portal access' }}
                </span>
                <label v-if="clientMessaging.clientHasPortal" class="msg-hub-party-check">
                  <input v-model="includeClientOnSend" type="checkbox" />
                  Include client on send
                </label>
              </div>
              <div
                v-for="g in clientMessaging.guardians"
                :key="g.userId"
                class="msg-hub-party-card"
                :class="{ active: Number(talkingToUserId) === Number(g.userId) }"
                @click="talkingToUserId = g.userId; onTalkingToChange()"
              >
                <strong>{{ g.displayName }}</strong>
                <span class="msg-hub-muted">{{ g.relationshipTitle || 'Guardian' }}</span>
                <span class="msg-hub-portal-flag" :class="{ on: g.portalAccess }">
                  {{ g.portalAccess ? 'Portal access' : 'No portal' }}
                </span>
                <button
                  v-if="!g.portalAccess && (g.canInviteToPortal || g.email)"
                  type="button"
                  class="btn btn-secondary btn-xs"
                  :disabled="portalInviteBusy"
                  @click.stop="sendPortalInviteForGuardian(g)"
                >
                  Invite to portal
                </button>
                <label class="msg-hub-party-check" @click.stop>
                  <input
                    type="checkbox"
                    :checked="Number(talkingToUserId) === Number(g.userId) || participantExtraIds.includes(g.userId)"
                    @change="toggleGuardianParticipant(g, $event.target.checked)"
                  />
                  Participant
                </label>
              </div>
            </section>
            <section class="msg-hub-panel">
              <h3>Methods</h3>
              <ul class="msg-hub-methods">
                <li v-for="m in selected.methods || []" :key="m.id" :class="{ off: !m.available }">
                  <strong>{{ methodLabel(m.id) }}</strong>
                  <span>{{ m.available ? (m.recommended ? 'Recommended' : 'Available') : (m.reason || 'Not available yet') }}</span>
                </li>
              </ul>
              <button
                v-if="canSendPortalInvite"
                type="button"
                class="btn btn-primary btn-xs msg-hub-invite-side"
                :disabled="portalInviteBusy"
                @click="sendPortalInvite"
              >
                {{ portalInviteBusy ? 'Sending…' : 'Send portal invitation' }}
              </button>
            </section>
            <section class="msg-hub-panel">
              <h3>Recent files</h3>
              <div v-if="loadingContext" class="msg-hub-muted">Loading…</div>
              <ul v-else-if="recentFiles.length" class="msg-hub-side-list">
                <li v-for="f in recentFiles" :key="f.id">
                  <a v-if="f.url" :href="f.url" target="_blank" rel="noopener">{{ f.name }}</a>
                  <span v-else>{{ f.name }}</span>
                  <time>{{ formatTime(f.createdAt) }}</time>
                </li>
              </ul>
              <p v-else class="msg-hub-muted">No recent files.</p>
            </section>
            <section class="msg-hub-panel">
              <h3>Recent activity</h3>
              <div v-if="loadingContext" class="msg-hub-muted">Loading…</div>
              <ul v-else-if="recentActivity.length" class="msg-hub-side-list">
                <li v-for="a in recentActivity" :key="a.id">
                  <strong>{{ a.label }}</strong>
                  <span class="msg-hub-muted">{{ a.preview }}</span>
                  <time>{{ formatTime(a.createdAt) }}</time>
                </li>
              </ul>
              <p v-else class="msg-hub-muted">No recent activity.</p>
            </section>
          </template>
          <section v-else class="msg-hub-panel msg-hub-panel-muted">
            <p>Select a person to see contact details, files, and activity.</p>
          </section>
          <section class="msg-hub-panel msg-hub-banner">
            <p>One conversation per person. Channels are how you send — not separate inboxes.</p>
          </section>
        </aside>
      </div>
    </div>

    <StartConversationModal
      v-if="showNew"
      :agency-id="agencyId"
      @close="showNew = false"
      @pick="pickPerson"
      @open-group="onOpenGroupFromModal"
    />

    <ResolveUnknownSenderModal
      v-if="showResolveUnknown && selectedConversation?.id && agencyId"
      :agency-id="agencyId"
      :conversation-id="selectedConversation.id"
      :sender-email="selectedConversation.primary_participant_email || ''"
      :sender-name="selectedConversation.primary_participant_name || ''"
      @close="showResolveUnknown = false"
      @resolved="onUnknownResolved"
    />

    <div v-if="sendConfirmOpen" class="msg-hub-modal" @click.self="cancelSendConfirm">
      <div class="msg-hub-modal-card" role="dialog" aria-labelledby="msg-hub-confirm-title">
        <header>
          <h3 id="msg-hub-confirm-title">Confirm recipients</h3>
          <button type="button" class="msg-hub-modal-close" @click="cancelSendConfirm">×</button>
        </header>
        <p class="msg-hub-muted">
          Send to <strong>{{ talkingToLabel || selected?.displayName }}</strong> only, or the same message to all portal guardians
          <template v-if="clientMessaging?.clientHasPortal">
            (optionally include the client).
          </template>
        </p>
        <label v-if="clientMessaging?.clientHasPortal" class="msg-hub-party-check pad">
          <input v-model="includeClientOnSend" type="checkbox" />
          Also include client
        </label>
        <div class="msg-hub-confirm-actions">
          <button type="button" class="btn btn-secondary" @click="cancelSendConfirm">Cancel</button>
          <button type="button" class="btn btn-secondary" @click="confirmSendThisGuardianOnly">
            This guardian only
          </button>
          <button
            v-if="(clientMessaging?.portalGuardians || []).length > 1"
            type="button"
            class="btn btn-primary"
            @click="confirmSendAllPortalGuardians"
          >
            All portal guardians
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary"
            @click="confirmSendThisGuardianOnly"
          >
            Send
          </button>
        </div>
      </div>
    </div>

    <div v-if="showHubSettings" class="msg-hub-modal" @click.self="showHubSettings = false">
      <div class="msg-hub-modal-card msg-hub-settings-card" role="dialog" aria-labelledby="msg-hub-settings-title">
        <header>
          <h3 id="msg-hub-settings-title">Send delay settings</h3>
          <button type="button" class="msg-hub-modal-close" @click="showHubSettings = false">×</button>
        </header>
        <p class="msg-hub-muted">
          Every send waits this long so you can undo and edit. Default is 20 seconds; maximum is 10 minutes.
          Scheduled sends and availability holds also appear under Queued.
        </p>
        <div class="msg-hub-settings-grid">
          <label>
            Email
            <select v-model.number="sendDelayPrefs.email">
              <option v-for="opt in undoDelayOptions" :key="'e-' + opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label>
            Secure message
            <select v-model.number="sendDelayPrefs.secure">
              <option v-for="opt in undoDelayOptions" :key="'s-' + opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label>
            Internal chat
            <select v-model.number="sendDelayPrefs.internal">
              <option v-for="opt in undoDelayOptions" :key="'i-' + opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label>
            SMS
            <select v-model.number="sendDelayPrefs.sms">
              <option v-for="opt in undoDelayOptions" :key="'m-' + opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
        </div>
        <div class="msg-hub-confirm-actions">
          <button type="button" class="btn btn-secondary" @click="showHubSettings = false">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="savingDelayPrefs"
            @click="saveSendDelayPrefs"
          >
            {{ savingDelayPrefs ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import StartConversationModal from './StartConversationModal.vue';
import ResolveUnknownSenderModal from './ResolveUnknownSenderModal.vue';

const props = defineProps({
  layout: { type: String, default: 'page' } // 'page' | 'drawer'
});

const emit = defineEmits(['open-team-chat', 'unread-change']);

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const loadingList = ref(false);
const loadingTimeline = ref(false);
const peopleLoading = ref(false);
const sending = ref(false);
const error = ref('');
const sendError = ref('');
const people = ref([]);
const conversations = ref([]);
const listFilter = ref('recent');
const listSearch = ref('');
const selected = ref(null);
const talkingToUserId = ref(null);
const includeClientOnSend = ref(false);
const participantExtraIds = ref([]);
const sendConfirmOpen = ref(false);
const sendConfirmPending = ref(null);
const selectedConversation = ref(null);
const conversationPreview = ref(null);
const inboxCounts = ref({ unread: 0, snoozed: 0, unknown: 0 });
const showResolveUnknown = ref(false);
const snoozeMenuFor = ref(null);
const timeline = ref([]);
const recentFiles = ref([]);
const recentActivity = ref([]);
const loadingContext = ref(false);
const navSection = ref('people'); // inbox | people | tools
const navId = ref('recent');
const railOpen = ref(false);
const mobileShowThread = ref(false);
const sharedFilesHint = ref(false);
const reminderNotice = ref('');
const sendMethod = ref('secure');
const composeBody = ref('');
const composeSubject = ref('');
const composeCc = ref('');
const composeBcc = ref('');
const composeAttachments = ref([]);
const chatStagedAttachments = ref([]);
const chatThreadId = ref(null);
const uploadingChatAttach = ref(false);
const emojiPickerOpen = ref(false);
const reactionPickerFor = ref(null);
const composeFromAliasId = ref(null);
const emailAliases = ref([]);
const signaturePreview = ref(null);
const reactingId = ref(null);
const staffSuggest = ref([]);
let staffSuggestTimer = null;
const showNew = ref(false);
const newTab = ref('caseload');
const peopleQuery = ref('');
const peopleResults = ref([]);
const newSearchEl = ref(null);
const composeEl = ref(null);
let peopleTimer = null;

const undoDelaySeconds = ref(20);
const schedulePreset = ref(null);
const showSchedule = ref(false);
const undoBanner = ref(null);
const undoNow = ref(Date.now());
let undoBannerTimer = null;
let undoTickTimer = null;

const undoDelayOptions = [
  { value: 10, label: '10 seconds' },
  { value: 20, label: '20 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes (max)' }
];
const sendDelayPrefs = ref({
  email: 20,
  secure: 20,
  internal: 20,
  sms: 20
});
const showHubSettings = ref(false);
const savingDelayPrefs = ref(false);
const smartReply = ref('');
const smartReplyLoading = ref(false);
let smartReplyTimer = null;
const queuedItems = ref([]);
const loadingQueued = ref(false);

const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const inboxNavItems = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'unread', label: 'Unread' },
  { id: 'unknown', label: 'Unknown Senders' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'starred', label: 'Starred' },
  { id: 'queued', label: 'Queued' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' }
];

const peopleNavItems = [
  { id: 'contacts', label: 'Contacts' },
  { id: 'caseload', label: 'Clients' },
  { id: 'guardians', label: 'Guardians' },
  { id: 'staff', label: 'Staff' },
  { id: 'school_staff', label: 'School staff' },
  { id: 'recent', label: 'Recent' }
];

const toolsNavItems = [
  { id: 'calls', label: 'Calls & Voicemail', stub: true },
  { id: 'shared_files', label: 'Shared Files' },
  { id: 'channels', label: 'Channels' },
  { id: 'mentions_chat', label: 'Mentions' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'team_chat', label: 'Team chat' },
  { id: 'settings', label: 'Settings' }
];

const isDrawerLayout = computed(() => props.layout === 'drawer');
const isPageLayout = computed(() => !isDrawerLayout.value);

const hubSubtitle = computed(() => {
  if (navSection.value === 'tools' && navId.value === 'calls') {
    return 'Calls & voicemail are coming soon.';
  }
  if (navSection.value === 'tools' && navId.value === 'shared_files') {
    return 'Files shared in conversations will appear here.';
  }
  if (navSection.value === 'inbox') {
    if (navId.value === 'unknown') {
      return 'Mail from senders who are not in your known contacts — treat like a spam review folder.';
    }
    return 'Conversations assigned to you or in your App inbox — not the shared agency mailbox.';
  }
  return 'Pick a person, choose how to send, then write in the box at the bottom.';
});

const listColumnTitle = computed(() => {
  if (navSection.value === 'inbox') {
    return inboxNavItems.find((x) => x.id === navId.value)?.label || 'Inbox';
  }
  if (navSection.value === 'tools') {
    return toolsNavItems.find((x) => x.id === navId.value)?.label || 'Tools';
  }
  return peopleNavItems.find((x) => x.id === navId.value)?.label || 'People';
});

const listSearchPlaceholder = computed(() => {
  if (navSection.value === 'people' && navId.value === 'contacts') {
    return 'Search contacts, staff, clients, guardians…';
  }
  return 'Filter this list…';
});

const isConversationMode = computed(() => {
  if (navSection.value !== 'inbox') return false;
  return ['inbox', 'unread', 'unknown', 'mentions', 'starred', 'snoozed', 'drafts'].includes(navId.value);
});

const isQueuedMode = computed(() => navSection.value === 'inbox' && navId.value === 'queued');

const isPeopleBrowseMode = computed(() => {
  if (navSection.value === 'people') return true;
  if (navSection.value === 'inbox' && navId.value === 'sent') return true;
  return false;
});

const communicationsPath = computed(() => {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/admin/communications` : '/admin/communications';
});

const profilePath = computed(() => {
  const uid = selected.value?.userId;
  if (!uid) return null;
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/admin/users/${uid}` : `/admin/users/${uid}`;
});

const selectedClientId = computed(() => {
  const p = selected.value;
  const ctx = clientMessaging.value;
  const direct =
    Number(p?.clientId || ctx?.clientId || 0) ||
    Number(p?.clientMessaging?.clientId || 0) ||
    0;
  if (direct) return direct;
  const pk = String(p?.personKey || '');
  const m = pk.match(/^client:(\d+)/i);
  if (m) return Number(m[1]) || 0;
  return 0;
});

const isClientSelection = computed(() => {
  const kinds = selected.value?.kinds || [];
  return kinds.includes('client') || !!clientMessaging.value || !!selectedClientId.value;
});

const clientProfilePath = computed(() => {
  const id = selectedClientId.value;
  if (!id) return null;
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/admin/clients/${id}` : `/admin/clients/${id}`;
});

function openClientProfile() {
  const path = clientProfilePath.value;
  if (!path) return;
  router.push(path).catch(() => {
    window.location.assign(path);
  });
}

const talkingToGuardianEmail = computed(() => {
  const ctx = clientMessaging.value;
  if (!ctx?.guardians?.length) return null;
  const g =
    ctx.guardians.find((x) => Number(x.userId) === Number(talkingToUserId.value)) ||
    ctx.guardians.find((x) => x.email) ||
    null;
  return g?.email || null;
});

const composeToName = computed(() => {
  if (talkingToLabel.value) return talkingToLabel.value;
  return selected.value?.displayName || '';
});

const composeToEmail = computed(() => {
  if (sendMethod.value !== 'email') return '';
  const direct = String(selected.value?.email || '').trim();
  if (direct) return direct;
  return String(talkingToGuardianEmail.value || '').trim();
});

const newTabs = [
  { id: 'caseload', label: 'Clients' },
  { id: 'recent', label: 'Recent' },
  { id: 'staff', label: 'Staff' },
  { id: 'school_staff', label: 'School staff' },
  { id: 'guardians', label: 'Guardians' },
  { id: 'search', label: 'Search' }
];

const filteredPeople = computed(() => {
  let list = [...(people.value || [])];
  const f = listFilter.value;
  if (f === 'guardians') {
    list = list.filter((p) => (p.kinds || []).includes('guardian'));
  } else if (f === 'clients') {
    list = list.filter((p) => (p.kinds || []).includes('client'));
  } else if (f === 'staff') {
    list = list.filter((p) =>
      (p.kinds || []).some((k) => ['employee', 'staff', 'team'].includes(k))
    );
  } else if (f === 'school_staff') {
    list = list.filter((p) => (p.kinds || []).includes('school_staff'));
  } else if (f === 'caseload') {
    list = list.filter((p) => (p.kinds || []).includes('client'));
  }
  const q = listSearch.value.trim().toLowerCase();
  if (q) {
    list = list.filter((p) => fuzzyMatchPerson(p, q));
  }
  return list;
});

const filteredConversations = computed(() => {
  let list = [...(conversations.value || [])];
  const q = listSearch.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => {
    const hay = `${c.primary_participant_name || ''} ${c.primary_participant_email || ''} ${c.subject || ''} ${c.last_message_preview || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

const emptyListCopy = computed(() => {
  if (navSection.value === 'tools' && navId.value === 'calls') {
    return 'Calls & voicemail are coming soon.';
  }
  if (navSection.value === 'tools' && navId.value === 'shared_files') {
    return 'No shared files yet. Attachments from conversations will show here.';
  }
  if (isConversationMode.value) {
    if (navId.value === 'unknown') {
      return 'No unknown senders right now. New mail from addresses outside your known contacts will land here.';
    }
    return 'Nothing in this inbox view yet.';
  }
  if (listFilter.value === 'contacts') {
    return 'No contacts yet. Use + New conversation to message someone, or save an external email/phone as a contact.';
  }
  if (listFilter.value === 'caseload' || listFilter.value === 'clients') {
    return 'No clients assigned to you across your agencies yet. Try Search, or open New conversation → Clients.';
  }
  if (listFilter.value === 'recent') {
    return 'No recent people yet. Open New conversation and browse Clients.';
  }
  if (listFilter.value === 'sent') {
    return 'No sent messages yet. Emails and internal messages you send will show here.';
  }
  if (listFilter.value === 'staff') return 'No staff in this list. Try Search.';
  if (listFilter.value === 'school_staff' || (navSection.value === 'people' && navId.value === 'school_staff')) {
    return 'No school staff at your assigned schools yet.';
  }
  if (listFilter.value === 'guardians') {
    return 'No guardians linked to your caseload clients yet (including no-portal parents). Try Search or open a client.';
  }
  return 'Nothing in this filter. Try Clients or Search.';
});

const newTabHint = computed(() => {
  if (newTab.value === 'caseload') {
    return 'Your assigned clients across every agency you belong to — other agencies are labeled in the primary color.';
  }
  if (newTab.value === 'recent') {
    return 'People you recently messaged across every agency you belong to — each row shows the person and their agency.';
  }
  if (newTab.value === 'staff') return 'Active agency staff (not school staff).';
  if (newTab.value === 'school_staff') {
    return 'School staff at schools you are assigned to — each row shows their school.';
  }
  if (newTab.value === 'guardians') {
    return 'Guardians linked to clients on your caseload (portal access).';
  }
  return 'Type at least 2 characters — matches anywhere in the name (typos OK). Initials, code, email, or phone also work.';
});

const clientMessaging = computed(() => selected.value?.clientMessaging || null);

const talkingToLabel = computed(() => {
  const ctx = clientMessaging.value;
  if (!ctx?.guardians?.length) return '';
  const id = Number(talkingToUserId.value || ctx.talkingToUserId || 0);
  const g = ctx.guardians.find((x) => Number(x.userId) === id);
  return g?.displayName || '';
});

const threadTitle = computed(() => {
  const ctx = clientMessaging.value;
  if (ctx?.clientName) return ctx.clientName;
  return selected.value?.displayName || '';
});

const clientNoPortalBanner = computed(() => {
  const ctx = clientMessaging.value;
  if (!ctx) return '';
  if (ctx.clientHasPortal) return '';
  return 'This client does not have portal access yet. You can email them, or send a portal invitation.';
});

const portalInviteBusy = ref(false);

const canSendPortalInvite = computed(() => {
  if (selected.value?.canInviteToPortal) return true;
  const talking = talkingToGuardian.value;
  if (talking && !talking.portalAccess && talking.email) return true;
  const ctx = clientMessaging.value;
  if (ctx && !ctx.clientHasPortal) {
    const g = (ctx.guardians || []).find((x) => !x.portalAccess && x.email);
    if (g) return true;
  }
  return false;
});

const talkingToGuardian = computed(() => {
  const ctx = clientMessaging.value;
  if (!ctx?.guardians?.length) return null;
  const tid = Number(talkingToUserId.value);
  return ctx.guardians.find((g) => Number(g.userId) === tid) || null;
});

const methodUnavailableHint = computed(() => {
  const secure = (selected.value?.methods || []).find((m) => m.id === 'secure');
  const sms = (selected.value?.methods || []).find((m) => m.id === 'sms');
  const bits = [];
  if (secure && !secure.available) bits.push(secure.reason || 'Secure portal messaging isn’t available yet');
  if (sms && !sms.available) bits.push(sms.reason || 'SMS isn’t available yet');
  return bits.join(' · ');
});

function methodUnavailableShort(ch) {
  if (!ch || ch.available) return '';
  if (ch.id === 'sms') return 'Not yet';
  if (ch.id === 'secure') return 'No portal';
  return 'Unavailable';
}

async function sendPortalInvite() {
  const g = talkingToGuardian.value;
  if (g && !g.portalAccess) {
    await sendPortalInviteForGuardian(g);
    return;
  }
  await sendPortalInviteForGuardian({
    userId: selected.value?.userId || null,
    personKey: selected.value?.personKey || null,
    email: selected.value?.email || null,
    clientId: selected.value?.clientId || clientMessaging.value?.clientId || null
  });
}

async function sendPortalInviteForGuardian(g) {
  if (!agencyId.value || portalInviteBusy.value) return;
  portalInviteBusy.value = true;
  sendError.value = '';
  try {
    const { data } = await api.post(
      '/messages/hub/portal-invite',
      {
        agencyId: agencyId.value,
        personKey: g.personKey || selected.value?.personKey || null,
        guardianUserId: g.userId || null,
        clientId: g.clientId || selected.value?.clientId || clientMessaging.value?.clientId || null
      },
      { skipGlobalLoading: true }
    );
    reminderNotice.value = data?.emailed
      ? `Portal invitation sent to ${data.emailed}.`
      : 'Portal invitation sent.';
    setTimeout(() => {
      reminderNotice.value = '';
    }, 5000);
    if (selected.value?.personKey) {
      await pickPerson({ ...selected.value, personKey: data?.personKey || selected.value.personKey });
    } else if (data?.personKey) {
      await pickPerson({ personKey: data.personKey, agencyId: agencyId.value });
    }
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not send portal invitation';
  } finally {
    portalInviteBusy.value = false;
  }
}

function peopleRowTitle(p) {
  if (p?.clientMessaging?.clientName) return p.clientMessaging.clientName;
  if ((p?.kinds || []).includes('client')) return p.displayName;
  if ((p?.kinds || []).includes('guardian') && p.relationshipMeta) {
    const m = String(p.relationshipMeta);
    const of = m.match(/Guardian of (.+)/i);
    if (of?.[1]) return of[1];
  }
  return p?.displayName || '';
}

function peopleTalkingTo(p) {
  if (p?.talkingToName) return p.talkingToName;
  if (p?.clientMessaging?.talkingToName) return p.clientMessaging.talkingToName;
  if ((p?.kinds || []).includes('guardian')) return p.displayName || '';
  const tid = p?.clientMessaging?.talkingToUserId;
  if (tid && p?.clientMessaging?.guardians?.length) {
    const g = p.clientMessaging.guardians.find((x) => Number(x.userId) === Number(tid));
    if (g?.displayName) return g.displayName;
  }
  return p?.clientMessaging?.guardians?.[0]?.displayName || '';
}

function peopleChannelChips(p) {
  const methods = p?.methods || [];
  return methods.filter((m) => m.available).map((m) => methodLabel(m.id)).filter(Boolean).slice(0, 3);
}

function isPersonRowActive(p) {
  if (!selected.value || !p) return false;
  if (selected.value.personKey === p.personKey) return true;
  const selectedClientId =
    Number(selected.value.clientId || selected.value.clientMessaging?.clientId || 0) || 0;
  const rowClientId = Number(p.clientId || p.clientMessaging?.clientId || 0) || 0;
  return !!(selectedClientId && rowClientId && selectedClientId === rowClientId);
}

function talkingToPersonKey() {
  const ctx = clientMessaging.value;
  const id = Number(talkingToUserId.value || ctx?.talkingToUserId || 0);
  const g = ctx?.guardians?.find((x) => Number(x.userId) === id);
  if (g?.personKey) return g.personKey;
  if (ctx?.defaultTalkingToPersonKey) return ctx.defaultTalkingToPersonKey;
  return selected.value?.personKey || null;
}

function toggleGuardianParticipant(g, checked) {
  const id = Number(g.userId);
  if (!id) return;
  if (checked) {
    if (Number(talkingToUserId.value) !== id && !participantExtraIds.value.includes(id)) {
      participantExtraIds.value = [...participantExtraIds.value, id];
    }
  } else {
    if (Number(talkingToUserId.value) === id) {
      // Keep talking-to selected; unchecking just removes extras
      return;
    }
    participantExtraIds.value = participantExtraIds.value.filter((x) => x !== id);
  }
}

async function onTalkingToChange() {
  const ctx = clientMessaging.value;
  const g = ctx?.guardians?.find((x) => Number(x.userId) === Number(talkingToUserId.value));
  if (!g?.personKey) return;
  const priorMessaging = ctx;
  try {
    const aid = selected.value?.agencyId || agencyId.value;
    const { data } = await api.get(`/messages/hub/people/${encodeURIComponent(g.personKey)}`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    if (data?.person) {
      selected.value = {
        ...data.person,
        clientMessaging: data.person.clientMessaging || priorMessaging
      };
      talkingToUserId.value = g.userId;
      sendMethod.value =
        data.person.preferredMethod ||
        data.person.methods?.find((m) => m.available)?.id ||
        sendMethod.value;
      await loadTimeline(data.person.personKey);
      await loadPersonContext(data.person.personKey);
    }
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not switch guardian';
  }
}

function needsGuardianSendConfirm() {
  const ctx = clientMessaging.value;
  if (!ctx) return false;
  if (sendMethod.value !== 'secure' && sendMethod.value !== 'email') return false;
  const portalCount = (ctx.portalGuardians || []).length;
  return portalCount > 1 || !!ctx.clientHasPortal;
}

const deliveryNotice = computed(() => {
  // Availability hold only applies to outbound email — not internal/secure chat.
  if (sendMethod.value !== 'email') return '';
  const gate = selected.value?.deliveryGate;
  if (!gate?.message || gate.availableNow) return '';
  return gate.message;
});

const senderOutsideHours = computed(() => {
  if (sendMethod.value !== 'email') return false;
  const gate = selected.value?.senderGate;
  return !!(gate && gate.availableNow === false && gate.sendAt);
});

const myWorkSchedulePath = computed(() => {
  const uid = authStore.user?.id;
  if (!uid) return null;
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}/admin/users/${uid}` : `/admin/users/${uid}`;
});

const sendButtonLabel = computed(() => {
  if (sending.value) return 'Sending…';
  if (schedulePreset.value || deliveryNotice.value) return 'Queue send';
  const delay = Number(undoDelaySeconds.value) || 0;
  if (delay > 0) return `Send (${delay}s undo)`;
  return 'Send now';
});

const sendQueueReason = computed(() => {
  if (sending.value) return '';
  if (schedulePreset.value === 'next_available') return 'During your availability hours';
  if (schedulePreset.value === 'in_1_hour') return 'Scheduled in 1 hour';
  if (schedulePreset.value === 'tomorrow_9am') return 'Scheduled tomorrow 9am';
  if (schedulePreset.value === 'monday_9am') return 'Scheduled next Monday 9am';
  if (schedulePreset.value) return scheduleLabel(schedulePreset.value);
  if (deliveryNotice.value) {
    const gate = selected.value?.deliveryGate;
    if (gate?.outsideAvailability) return 'Recipient availability hours';
    if (gate?.plannedOut) return 'Recipient planned out';
    return 'Recipient delivery hold';
  }
  return '';
});

const sendSplitEl = ref(null);

function toggleSendMenu() {
  showSchedule.value = !showSchedule.value;
}

function queueAndSend(preset) {
  pickSchedule(preset);
  send();
}

function rowAvatarIcon(p) {
  if (!p) return null;
  return p.agencyIconUrl || null;
}

const undoBannerLabel = computed(() => {
  if (!undoBanner.value) return '';
  if (undoBanner.value.kind === 'scheduled') return 'Queued — you can recall it until it sends.';
  return 'Queued — undo to edit before it sends.';
});

const activeDelaySeconds = computed(() => {
  const m = sendMethod.value;
  if (m === 'email') return sendDelayPrefs.value.email;
  if (m === 'secure') return sendDelayPrefs.value.secure;
  if (m === 'internal') return sendDelayPrefs.value.internal;
  if (m === 'sms') return sendDelayPrefs.value.sms;
  return undoDelaySeconds.value;
});

watch(sendMethod, (m) => {
  undoDelaySeconds.value = activeDelaySeconds.value;
  scheduleSmartReply();
});

watch(
  () => selected.value?.personKey,
  () => scheduleSmartReply()
);

watch(
  () => timeline.value?.length,
  () => scheduleSmartReply()
);

const undoCountdownLabel = computed(() => {
  if (!undoBanner.value?.expiresAt) return '';
  const ms = Math.max(0, undoBanner.value.expiresAt - undoNow.value);
  if (ms <= 0) return '';
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `(${m}m ${String(s).padStart(2, '0')}s)`;
  }
  return `(${totalSec}s)`;
});

function scheduleLabel(preset) {
  const map = {
    next_available: 'During my availability hours',
    in_1_hour: 'In 1 hour',
    tomorrow_9am: 'Tomorrow 9am',
    monday_9am: 'Next Monday 9am'
  };
  return map[preset] || preset;
}

function pickSchedule(preset) {
  schedulePreset.value = preset;
  showSchedule.value = false;
}

function clearUndoBanner() {
  if (undoBannerTimer) {
    clearTimeout(undoBannerTimer);
    undoBannerTimer = null;
  }
  if (undoTickTimer) {
    clearInterval(undoTickTimer);
    undoTickTimer = null;
  }
  undoBanner.value = null;
}

function startUndoBanner({
  conversationId,
  messageId,
  queueId,
  expiresAt,
  kind,
  body,
  subject,
  method,
  delaySeconds
} = {}) {
  clearUndoBanner();
  const delayMs = Math.max(1000, Number(delaySeconds || undoDelaySeconds.value || 20) * 1000);
  const exp = expiresAt ? new Date(expiresAt).getTime() : Date.now() + delayMs;
  undoBanner.value = {
    conversationId: conversationId || null,
    messageId: messageId || null,
    queueId: queueId || null,
    expiresAt: exp,
    kind: kind || 'undo',
    body: body != null ? String(body) : '',
    subject: subject != null ? String(subject) : '',
    method: method || sendMethod.value
  };
  undoNow.value = Date.now();
  undoTickTimer = setInterval(() => {
    undoNow.value = Date.now();
    if (undoBanner.value && undoNow.value >= undoBanner.value.expiresAt) {
      clearUndoBanner();
    }
  }, 500);
  // Keep the sticky banner for at most 10 minutes; long schedules stay undoable in Queued.
  const displayMs = Math.min(Math.max(1000, exp - Date.now()), 10 * 60 * 1000);
  undoBannerTimer = setTimeout(() => {
    clearUndoBanner();
  }, displayMs);
}

async function undoBannerSend() {
  if (!undoBanner.value) return;
  const fallback = undoBanner.value;
  try {
    let data = null;
    if (fallback.queueId) {
      const res = await api.post(
        `/messages/hub/queued/hubq-${fallback.queueId}/undo`,
        {},
        { skipGlobalLoading: true }
      );
      data = res.data;
    } else if (fallback.conversationId && fallback.messageId) {
      const res = await api.post(
        `/communications/conversations/${fallback.conversationId}/messages/${fallback.messageId}/undo`,
        {},
        { skipGlobalLoading: true }
      );
      data = res.data;
    }
    composeBody.value = String(data?.body ?? fallback.body ?? '');
    if (data?.subject != null || fallback.subject) {
      composeSubject.value = String(data?.subject ?? fallback.subject ?? '');
    }
    const channel = data?.channel || fallback.method;
    if (channel && ['email', 'sms', 'secure', 'internal'].includes(channel)) {
      sendMethod.value = channel;
    }
    clearUndoBanner();
    if (selected.value?.personKey) await loadTimeline(selected.value.personKey);
    if (navId.value === 'queued') await loadQueued();
    await focusComposer();
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not undo';
  }
}

async function undoScheduledMessage(msg) {
  const conversationId = msg?.meta?.conversationId;
  const messageId = msg?.meta?.messageId;
  const queueId = msg?.meta?.queueId;
  try {
    let data = null;
    if (queueId) {
      const res = await api.post(
        `/messages/hub/queued/hubq-${queueId}/undo`,
        {},
        { skipGlobalLoading: true }
      );
      data = res.data;
    } else if (conversationId && messageId) {
      const res = await api.post(
        `/communications/conversations/${conversationId}/messages/${messageId}/undo`,
        {},
        { skipGlobalLoading: true }
      );
      data = res.data;
    } else {
      return;
    }
    if (data?.body != null) composeBody.value = String(data.body);
    if (data?.subject != null) composeSubject.value = String(data.subject);
    clearUndoBanner();
    await loadTimeline(selected.value?.personKey);
    if (navId.value === 'queued') await loadQueued();
    await focusComposer();
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not undo';
  }
}

function scheduleSmartReply() {
  clearTimeout(smartReplyTimer);
  smartReply.value = '';
  smartReplyLoading.value = false;
  if (!selected.value?.personKey || !agencyId.value) return;
  // Only suggest when the other person sent the latest message.
  const last = timeline.value?.length ? timeline.value[timeline.value.length - 1] : null;
  if (!last || String(last.direction || '').toLowerCase() !== 'inbound') return;
  smartReplyTimer = setTimeout(() => loadSmartReply(), 450);
}

async function loadSmartReply() {
  if (!selected.value?.personKey || !agencyId.value) return;
  const last = timeline.value?.length ? timeline.value[timeline.value.length - 1] : null;
  if (!last || String(last.direction || '').toLowerCase() !== 'inbound') {
    smartReply.value = '';
    smartReplyLoading.value = false;
    return;
  }
  smartReplyLoading.value = true;
  try {
    const { data } = await api.get('/messages/hub/smart-reply', {
      params: {
        agencyId: agencyId.value,
        personKey: selected.value.personKey,
        channel: sendMethod.value || 'secure'
      },
      skipGlobalLoading: true
    });
    // Re-check in case we sent while the request was in flight.
    const stillLast = timeline.value?.length ? timeline.value[timeline.value.length - 1] : null;
    if (!stillLast || String(stillLast.direction || '').toLowerCase() !== 'inbound') {
      smartReply.value = '';
      return;
    }
    smartReply.value = String(data?.suggestion || '').trim();
  } catch {
    smartReply.value = '';
  } finally {
    smartReplyLoading.value = false;
  }
}

function applySmartReply() {
  if (!smartReply.value) return;
  composeBody.value = smartReply.value;
  focusComposer();
}

async function loadSendDelayPrefs() {
  try {
    const { data } = await api.get('/communications/prefs', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    const p = data?.prefs || {};
    sendDelayPrefs.value = {
      email: Number(p.sendDelayEmailSeconds) || 20,
      secure: Number(p.sendDelaySecureSeconds) || 20,
      internal: Number(p.sendDelayInternalSeconds) || 20,
      sms: Number(p.sendDelaySmsSeconds) || 20
    };
    undoDelaySeconds.value = activeDelaySeconds.value;
  } catch {
    /* keep defaults */
  }
}

async function saveSendDelayPrefs() {
  savingDelayPrefs.value = true;
  try {
    const clamp = (n) => Math.min(600, Math.max(1, Number(n) || 20));
    const { data } = await api.patch(
      '/communications/prefs',
      {
        sendDelayEmailSeconds: clamp(sendDelayPrefs.value.email),
        sendDelaySecureSeconds: clamp(sendDelayPrefs.value.secure),
        sendDelayInternalSeconds: clamp(sendDelayPrefs.value.internal),
        sendDelaySmsSeconds: clamp(sendDelayPrefs.value.sms)
      },
      { skipGlobalLoading: true }
    );
    const p = data?.prefs || {};
    sendDelayPrefs.value = {
      email: Number(p.sendDelayEmailSeconds) || sendDelayPrefs.value.email,
      secure: Number(p.sendDelaySecureSeconds) || sendDelayPrefs.value.secure,
      internal: Number(p.sendDelayInternalSeconds) || sendDelayPrefs.value.internal,
      sms: Number(p.sendDelaySmsSeconds) || sendDelayPrefs.value.sms
    };
    undoDelaySeconds.value = activeDelaySeconds.value;
    showHubSettings.value = false;
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not save delay settings';
  } finally {
    savingDelayPrefs.value = false;
  }
}

async function loadQueued() {
  loadingQueued.value = true;
  queuedItems.value = [];
  try {
    const { data } = await api.get('/messages/hub/queued', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    queuedItems.value = Array.isArray(data?.items) ? data.items : [];
  } catch (e) {
    queuedItems.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not load queued messages';
  } finally {
    loadingQueued.value = false;
  }
}

async function undoQueuedItem(item) {
  try {
    let data = null;
    if (item.source === 'hub_queue' && item.queueId) {
      const res = await api.post(
        `/messages/hub/queued/hubq-${item.queueId}/undo`,
        {},
        { skipGlobalLoading: true }
      );
      data = res.data;
    } else if (item.conversationId && item.messageId) {
      const res = await api.post(
        `/messages/hub/queued/email-${item.messageId}/undo`,
        { conversationId: item.conversationId, messageId: item.messageId },
        { skipGlobalLoading: true }
      );
      data = res.data;
    }
    if (data?.body != null) composeBody.value = String(data.body);
    if (data?.subject != null) composeSubject.value = String(data.subject);
    if (data?.channel) sendMethod.value = data.channel;
    if (data?.personKey) {
      const person = await resolvePerson(data.personKey).catch(() => null);
      if (person) await pickPerson(person);
    }
    await loadQueued();
    await focusComposer();
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not undo queued message';
  }
}

async function resolvePerson(personKey) {
  const { data } = await api.get(`/messages/hub/people/${encodeURIComponent(personKey)}`, {
    params: { agencyId: agencyId.value },
    skipGlobalLoading: true
  });
  return data?.person || null;
}

function fuzzyMatchPerson(p, q) {
  const hay = `${p.displayName || ''} ${p.relationshipMeta || ''} ${p.agencyName || ''} ${p.email || ''} ${p.phone || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9@+.\s]/g, ' ');
  const needle = String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9@+.\s]/g, ' ')
    .trim();
  if (!needle) return true;
  if (hay.includes(needle)) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => hay.includes(t))) return true;
  // light typo tolerance: consecutive chars appear in order
  const compact = hay.replace(/\s+/g, '');
  const n = needle.replace(/\s+/g, '');
  if (n.length >= 2) {
    let i = 0;
    for (const ch of compact) {
      if (ch === n[i]) i += 1;
      if (i >= n.length) return true;
    }
  }
  return false;
}

const emptyPickerCopy = computed(() => {
  if (newTab.value === 'search' && peopleQuery.value.trim().length >= 2) return 'No matches.';
  if (newTab.value === 'search') return 'Start typing to search.';
  return 'No people in this list yet.';
});

const methodButtons = computed(() => selected.value?.methods || []);
const activeMethod = computed(() =>
  (selected.value?.methods || []).find((m) => m.id === sendMethod.value)
);

const showSecureEmailToggle = computed(() => {
  if (!selected.value?.isActiveClient && !selected.value?.secureDefault) return false;
  const secure = (selected.value?.methods || []).find((m) => m.id === 'secure');
  const email = (selected.value?.methods || []).find((m) => m.id === 'email');
  return !!(secure?.available && email?.available);
});

const secureHint = computed(() => {
  if (!selected.value) return '';
  if (selected.value.isActiveClient || selected.value.secureDefault) {
    if (sendMethod.value === 'secure') {
      return 'Active client: Secure is on. Uncheck below (or pick Email) for a normal email if they prefer not to open the portal.';
    }
    if (sendMethod.value === 'email') {
      return 'Sending as regular email — not a secure portal message. Replies look like normal email.';
    }
  }
  if (sendMethod.value === 'email') {
    return 'Regular email via messages@ — looks like normal email in and out.';
  }
  return '';
});

const composerPlaceholder = computed(() => {
  if (sendMethod.value === 'sms') return 'Write a text message…';
  if (sendMethod.value === 'email') return 'Write an email…';
  if (sendMethod.value === 'internal') return 'Write an internal message…';
  return 'Write a secure message…';
});

const canSendCompose = computed(() => {
  if (sendMethod.value === 'internal' || sendMethod.value === 'secure') {
    return !!(composeBody.value.trim() || chatStagedAttachments.value.length);
  }
  return !!composeBody.value.trim();
});

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '🙏', '✅', '🔥'];
const EMOJI_GRID = [
  { label: 'Smileys', emojis: ['😊', '😂', '🥹', '😍', '🤩', '😎', '🥳', '😅', '😢', '😡', '🤔', '🙄', '🫠', '🥰', '😇', '🤦'] },
  { label: 'Gestures', emojis: ['👍', '👎', '👏', '🙌', '🤝', '✌️', '💪', '🤜', '🫶', '🤞', '🙏', '🫡'] },
  { label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❤️‍🔥', '✅', '💯'] },
  { label: 'Celebration', emojis: ['🎉', '🎊', '🎈', '🏆', '🥂', '🎯', '🚀', '🔥', '⭐', '💥', '👑', '💎'] }
];

function isChatChannel(channel) {
  return channel === 'internal' || channel === 'secure';
}

function isImageAttachment(att) {
  const kind = String(att?.file_kind || att?.kind || '').toLowerCase();
  const mime = String(att?.mime_type || att?.mimeType || '').toLowerCase();
  return kind === 'image' || kind === 'gif' || mime.startsWith('image/');
}

function insertEmoji(emoji) {
  const el = composeEl.value;
  if (!el || typeof el.selectionStart !== 'number') {
    composeBody.value += emoji;
    emojiPickerOpen.value = false;
    return;
  }
  const start = el.selectionStart;
  const end = el.selectionEnd;
  composeBody.value = composeBody.value.slice(0, start) + emoji + composeBody.value.slice(end);
  emojiPickerOpen.value = false;
  requestAnimationFrame(() => {
    const pos = start + [...emoji].length;
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

async function ensureChatThread() {
  if (chatThreadId.value) return chatThreadId.value;
  if (!selected.value?.personKey) return null;
  const sendAgencyId = selected.value.agencyId || agencyId.value;
  const { data } = await api.post(
    '/messages/hub/ensure-thread',
    { agencyId: sendAgencyId, personKey: selected.value.personKey },
    { skipGlobalLoading: true }
  );
  chatThreadId.value = data?.threadId || null;
  return chatThreadId.value;
}

async function onChatAttachFiles(ev) {
  const files = Array.from(ev.target?.files || []);
  ev.target.value = '';
  if (!files.length) return;
  uploadingChatAttach.value = true;
  sendError.value = '';
  try {
    const threadId = await ensureChatThread();
    if (!threadId) {
      sendError.value = 'Could not open chat thread for attachments';
      return;
    }
    for (const file of files.slice(0, 10)) {
      if (file.size > 20 * 1024 * 1024) {
        sendError.value = `${file.name} is too large (max 20MB)`;
        continue;
      }
      const fd = new FormData();
      fd.append('file', file);
      const resp = await api.post(`/chat/threads/${threadId}/attachments`, fd, {
        skipGlobalLoading: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const data = resp.data || {};
      if (data.filePath) {
        chatStagedAttachments.value.push({
          filePath: data.filePath,
          mimeType: data.mimeType || null,
          kind: data.kind || 'file',
          originalFilename: data.originalFilename || file.name || null,
          byteSize: data.byteSize || file.size || null
        });
      }
    }
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not attach file';
  } finally {
    uploadingChatAttach.value = false;
  }
}

async function toggleChatReaction(msg, code) {
  const messageId = msg?.meta?.messageId;
  if (!messageId || !code) return;
  const existing = (msg.reactions || []).find((r) => r.code === code);
  try {
    if (existing?.mineActive) {
      await api.delete(`/chat/messages/${messageId}/reactions/${encodeURIComponent(code)}`, {
        skipGlobalLoading: true
      });
    } else {
      await api.post(
        `/chat/messages/${messageId}/reactions`,
        { code },
        { skipGlobalLoading: true }
      );
    }
    await loadTimeline(selected.value?.personKey);
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not update reaction';
  }
}

function onSecureToggle(ev) {
  const on = !!ev?.target?.checked;
  if (on) selectMethod('secure');
  else selectMethod('email');
}

function methodLabel(id) {
  const map = { secure: 'Secure', sms: 'SMS', email: 'Email', internal: 'Internal' };
  return map[id] || '';
}

function queueReasonLabel(reason) {
  const map = {
    undo_delay: 'Undo delay',
    schedule: 'Scheduled',
    availability: 'Availability hold'
  };
  return map[reason] || 'Queued';
}

/** Row badge: school staff show role (not Internal), since they are external+portal. */
function personBadgeLabel(person) {
  if ((person?.kinds || []).includes('school_staff')) return 'School staff';
  return methodLabel(person?.preferredMethod) || kindFromKinds(person?.kinds);
}

function personBadgeClass(person) {
  if ((person?.kinds || []).includes('school_staff')) return 'kind-school-staff';
  return `kind-${person?.preferredMethod || 'secure'}`;
}

function photoSrc(url) {
  return toUploadsUrl(url) || url;
}

function isOtherAgency(person) {
  const current = Number(agencyId.value);
  const theirs = Number(person?.agencyId);
  return !!(current && theirs && current !== theirs);
}

function onCcBccInput() {
  clearTimeout(staffSuggestTimer);
  const raw = `${composeCc.value} ${composeBcc.value}`;
  const parts = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const q = parts[parts.length - 1] || '';
  if (q.length < 2) {
    staffSuggest.value = [];
    return;
  }
  staffSuggestTimer = setTimeout(async () => {
    try {
      const results = await fetchPeople({ q, limit: 20 });
      staffSuggest.value = (results || [])
        .filter((p) =>
          p.email &&
          (p.kinds || []).some((k) => ['employee', 'staff', 'team', 'school_staff'].includes(k))
        )
        .map((p) => ({
          email: p.email,
          displayName: p.displayName,
          agencyName: p.agencyName || null
        }));
    } catch {
      staffSuggest.value = [];
    }
  }, 200);
}

function formatRoleLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const key = s.toLowerCase().replace(/\s+/g, '_');
  const map = {
    school_staff: 'School Staff',
    provider: 'Provider',
    provider_plus: 'Provider Plus',
    admin: 'Admin',
    super_admin: 'Super Admin',
    staff: 'Staff',
    employee: 'Employee',
    team: 'Team',
    guardian: 'Guardian',
    client: 'Client',
    client_guardian: 'Guardian',
    contact: 'Contact',
    external: 'External',
    facilitator: 'Facilitator',
    supervisor: 'Supervisor',
    intern: 'Intern',
    support: 'Support',
    schedule_manager: 'Schedule Manager',
    clinical_practice_assistant: 'Clinical Practice Assistant'
  };
  if (map[key]) return map[key];
  // Title-case words; turn underscores into spaces
  return s
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function kindsLabel(kinds) {
  if (!kinds?.length) return '';
  return kinds.map((k) => formatRoleLabel(k)).join(' · ');
}

function personRoleLabel(person) {
  if (!person) return '';
  if (person.title) return formatRoleLabel(person.title);
  if (person.relationshipMeta) {
    const meta = String(person.relationshipMeta);
    // Role-like meta (provider, school_staff) vs free text ("Guardian of …")
    if (/^[a-z0-9_]+$/i.test(meta) || meta.includes('_')) return formatRoleLabel(meta);
    return meta;
  }
  return kindsLabel(person.kinds);
}

function agencyLabel(person) {
  if (!person) return '';
  const names = [...new Set([...(person.agencyNames || []), person.agencyName].filter(Boolean))];
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  return names.join(' · ');
}

function kindFromKinds(kinds) {
  if ((kinds || []).includes('guardian') || (kinds || []).includes('client')) return 'Client';
  if ((kinds || []).includes('school_staff')) return 'School Staff';
  if ((kinds || []).some((k) => ['employee', 'staff', 'team'].includes(k))) return 'Staff';
  return 'Person';
}

function initials(label) {
  const parts = String(label || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function focusComposer() {
  await nextTick();
  composeEl.value?.focus?.();
}

function selectMethod(id) {
  sendMethod.value = id;
  if (id === 'email') {
    loadSignaturePreview(selected.value?.agencyId || agencyId.value);
  }
  focusComposer();
}

async function fetchPeople({ browse, q, limit = 40 } = {}) {
  const params = { allAgencies: true, limit };
  if (agencyId.value) params.agencyId = agencyId.value;
  if (browse) params.browse = browse;
  if (q) params.q = q;
  const { data } = await api.get('/messages/hub/people', { params, skipGlobalLoading: true });
  return Array.isArray(data?.results) ? data.results : [];
}


function selectNav(section, id) {
  navSection.value = section;
  navId.value = id;
  railOpen.value = false;
  sharedFilesHint.value = false;
  reminderNotice.value = '';
  selectedConversation.value = null;
  conversationPreview.value = null;

  if (section === 'tools') {
    if (id === 'team_chat') {
      openTeamChat();
      return;
    }
    if (id === 'channels') {
      openTeamChat('channels');
      return;
    }
    if (id === 'mentions_chat') {
      openTeamChat('mentions');
      return;
    }
    if (id === 'assistant') {
      openTeamChat('assistant');
      return;
    }
    if (id === 'settings') {
      showHubSettings.value = true;
      return;
    }
    if (id === 'shared_files') {
      sharedFilesHint.value = true;
      people.value = [];
      conversations.value = [];
      return;
    }
    if (id === 'calls') {
      people.value = [];
      conversations.value = [];
      return;
    }
  }

  if (section === 'people' || (section === 'inbox' && id === 'sent')) {
    listFilter.value = id === 'sent' ? 'sent' : id;
    loadList();
    return;
  }

  if (section === 'inbox') {
    if (id === 'queued') {
      loadQueued();
      return;
    }
    loadConversations();
  }
}

async function openTeamChat(tab = null) {
  const chatTab = tab ? String(tab).toLowerCase() : null;
  emit('open-team-chat', chatTab);
  if (isDrawerLayout.value) return;
  const slug = String(route.params?.organizationSlug || '').trim();
  const path = route.path.includes('/messages')
    ? route.path
    : slug
      ? `/${slug}/messages`
      : '/messages';
  const q = { ...route.query, view: 'workspace' };
  if (chatTab) q.tab = chatTab;
  await router.push({ path, query: q }).catch(() => {});
}

async function loadConversations() {
  loadingList.value = true;
  error.value = '';
  people.value = [];
  conversations.value = [];
  try {
    if (!agencyId.value) {
      conversations.value = [];
      return;
    }
    const params = { agencyId: agencyId.value, limit: 40 };
    const id = navId.value;
    if (id === 'mentions') {
      params.channel = 'mention';
      params.filter = 'all';
    } else if (id === 'drafts') {
      params.filter = 'drafts';
    } else if (id === 'inbox') {
      // Non-admins are server-scoped to assigned + personal App inbox (not shared messages@).
      params.filter = 'all';
    } else if (id === 'unknown') {
      params.filter = 'unknown';
    } else {
      params.filter = id; // unread, starred, snoozed
    }
    const { data } = await api.get('/communications/conversations', {
      params,
      skipGlobalLoading: true
    });
    conversations.value = Array.isArray(data?.conversations) ? data.conversations : [];
    await loadInboxCounts();
  } catch (e) {
    conversations.value = [];
    const status = e?.response?.status;
    if (status === 403) {
      error.value = 'Inbox views need Communications access. Use People filters, or open Communications Center.';
    } else {
      error.value = e?.response?.data?.error?.message || 'Could not load conversations';
    }
  } finally {
    loadingList.value = false;
  }
}

async function loadInboxCounts() {
  if (!agencyId.value) {
    inboxCounts.value = { unread: 0, snoozed: 0, unknown: 0 };
    return;
  }
  try {
    const { data } = await api.get('/communications/attention-summary', {
      params: { agencyId: agencyId.value },
      skipGlobalLoading: true
    });
    const s = data?.summary || {};
    inboxCounts.value = {
      unread: Number(s.unread || 0),
      snoozed: Number(s.snoozed || 0),
      unknown: Number(s.unknownSenders || 0)
    };
  } catch {
    /* keep prior counts */
  }
}

function inboxBadgeCount(id) {
  if (id === 'unread') return inboxCounts.value.unread > 0 ? inboxCounts.value.unread : 0;
  if (id === 'snoozed') return inboxCounts.value.snoozed > 0 ? inboxCounts.value.snoozed : 0;
  if (id === 'unknown') return inboxCounts.value.unknown > 0 ? inboxCounts.value.unknown : 0;
  return 0;
}

const isUnknownConversation = computed(() => {
  const c = selectedConversation.value;
  if (!c) return false;
  return !!(c.is_unknown_sender || c.sender_trust === 'unknown' || navId.value === 'unknown');
});

function openResolveUnknown() {
  if (!selectedConversation.value?.id) return;
  showResolveUnknown.value = true;
}

async function onUnknownResolved() {
  showResolveUnknown.value = false;
  const id = selectedConversation.value?.id;
  if (selectedConversation.value) {
    selectedConversation.value = {
      ...selectedConversation.value,
      is_unknown_sender: 0,
      sender_trust: 'contact',
      is_unread: true
    };
  }
  reminderNotice.value = 'Sender marked known — conversation moved to Unread.';
  setTimeout(() => {
    reminderNotice.value = '';
  }, 4000);
  await loadConversations();
  if (navId.value === 'unknown' && id) {
    conversations.value = conversations.value.filter((c) => Number(c.id) !== Number(id));
  }
}

function isConversationSnoozed(c) {
  if (!c) return false;
  if (c.is_snoozed) return true;
  if (!c.snoozed_until) return false;
  return new Date(c.snoozed_until).getTime() > Date.now();
}

function toggleSnoozeMenu(key) {
  snoozeMenuFor.value = snoozeMenuFor.value === key ? null : key;
}

async function snoozeConversation(conv, preset) {
  if (!conv?.id) return;
  snoozeMenuFor.value = null;
  try {
    const body = preset ? { snoozePreset: preset } : { clearSnooze: true };
    await api.patch(`/communications/conversations/${conv.id}`, body, { skipGlobalLoading: true });
    const until =
      preset === '1h'
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : preset === 'later_today'
          ? new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
          : preset === 'tomorrow'
            ? (() => {
                const d = new Date();
                d.setDate(d.getDate() + 1);
                d.setHours(9, 0, 0, 0);
                return d.toISOString();
              })()
            : preset === 'next_week'
              ? (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  d.setHours(9, 0, 0, 0);
                  return d.toISOString();
                })()
              : null;
    conv.snoozed_until = until;
    conv.is_snoozed = !!until;
    if (until) conv.is_unread = false;
    if (selectedConversation.value?.id === conv.id) {
      selectedConversation.value = {
        ...selectedConversation.value,
        snoozed_until: until,
        is_snoozed: !!until,
        is_unread: until ? false : selectedConversation.value.is_unread
      };
    }
    // Refresh list so Unread/Snoozed/Inbox match server filters + badges.
    if (isConversationMode.value) await loadConversations();
    else await loadInboxCounts();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not update snooze';
  }
}

async function toggleConversationStar(conv) {
  if (!conv?.id) return;
  const next = !conv.starred;
  try {
    await api.patch(
      `/communications/conversations/${conv.id}`,
      { starred: next },
      { skipGlobalLoading: true }
    );
    conv.starred = next;
    const idx = conversations.value.findIndex((c) => Number(c.id) === Number(conv.id));
    if (idx >= 0) conversations.value[idx] = { ...conversations.value[idx], starred: next };
    if (selectedConversation.value?.id === conv.id) {
      selectedConversation.value = { ...selectedConversation.value, starred: next };
    }
    // If viewing Starred and unstarred, refresh list
    if (navId.value === 'starred' && !next) {
      await loadConversations();
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not update star';
  }
}

async function toggleStarByConversationId(conversationId, currentlyStarred, msg = null) {
  const next = !currentlyStarred;
  try {
    await api.patch(
      `/communications/conversations/${conversationId}`,
      { starred: next },
      { skipGlobalLoading: true }
    );
    if (msg?.meta) msg.meta.starred = next;
    const idx = conversations.value.findIndex((c) => Number(c.id) === Number(conversationId));
    if (idx >= 0) {
      conversations.value[idx] = { ...conversations.value[idx], starred: next };
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not update star';
  }
}

async function pickConversation(conv) {
  selectedConversation.value = conv;
  conversationPreview.value = null;
  mobileShowThread.value = true;
  const unknown =
    !!(conv?.is_unknown_sender || conv?.sender_trust === 'unknown') || navId.value === 'unknown';
  // Unknown senders stay in conversation preview so staff can mark known / add contact
  if (!unknown) {
    const email = String(conv?.primary_participant_email || '').trim();
    const name = String(conv?.primary_participant_name || '').trim();
    if (email || name) {
      try {
        const q = email || name;
        const results = await fetchPeople({ q, limit: 8 });
        const match =
          (results || []).find((p) => {
            if (email && String(p.email || '').toLowerCase() === email.toLowerCase()) return true;
            if (name && String(p.displayName || '').toLowerCase() === name.toLowerCase()) return true;
            return false;
          }) || results?.[0];
        if (match) {
          await pickPerson(match);
          return;
        }
      } catch {
        /* fall through to preview */
      }
    }
  }
  // Preview conversation messages when person cannot be resolved
  selected.value = null;
  timeline.value = [];
  try {
    const { data } = await api.get(`/communications/conversations/${conv.id}`, {
      params: { agencyId: agencyId.value, markRead: unknown ? '0' : undefined },
      skipGlobalLoading: true
    });
    conversationPreview.value = data;
    const detailConv = data?.conversation;
    if (detailConv) {
      selectedConversation.value = {
        ...conv,
        ...detailConv,
        primary_participant_email:
          conv.primary_participant_email || detailConv.primary_participant_email,
        primary_participant_name:
          conv.primary_participant_name || detailConv.primary_participant_name
      };
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not open conversation';
  }
}

async function loadPersonContext(personKey) {
  recentFiles.value = [];
  recentActivity.value = [];
  if (!personKey) return;
  loadingContext.value = true;
  try {
    const aid = selected.value?.agencyId || agencyId.value;
    const params = {};
    if (aid) params.agencyId = aid;
    const [filesRes, actRes] = await Promise.all([
      api.get(`/messages/hub/people/${encodeURIComponent(personKey)}/files`, { params, skipGlobalLoading: true }),
      api.get(`/messages/hub/people/${encodeURIComponent(personKey)}/activity`, { params, skipGlobalLoading: true })
    ]);
    recentFiles.value = Array.isArray(filesRes.data?.files) ? filesRes.data.files : [];
    recentActivity.value = Array.isArray(actRes.data?.activity) ? actRes.data.activity : [];
  } catch {
    recentFiles.value = [];
    recentActivity.value = [];
  } finally {
    loadingContext.value = false;
  }
}

function backToList() {
  mobileShowThread.value = false;
}

function createReminderStub() {
  reminderNotice.value = 'Reminders coming soon — use Tasks for now.';
  setTimeout(() => { reminderNotice.value = ''; }, 4000);
}

async function loadList() {
  loadingList.value = true;
  error.value = '';
  try {
    const f = listFilter.value;
    const q = listSearch.value.trim();

    if (f === 'contacts') {
      const params = {
        agencyId: agencyId.value,
        allAgencies: true,
        limit: 60
      };
      if (q.length >= 2) params.q = q;
      const { data } = await api.get('/messages/hub/contacts', { params, skipGlobalLoading: true });
      people.value = Array.isArray(data?.results) ? data.results : [];
      return;
    }

    const browse =
      f === 'caseload' || f === 'my_clients'
        ? 'caseload'
        : f === 'recent'
          ? 'recent'
          : f === 'sent'
            ? 'sent'
            : f === 'staff' || f === 'school_staff' || f === 'guardians'
              ? f
              : f === 'clients'
                ? 'caseload'
                : 'suggested';
    people.value = await fetchPeople({
      browse,
      q: q.length >= 2 && ['staff', 'school_staff', 'guardians'].includes(browse) ? q : undefined
    });
  } catch (e) {
    people.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not load people';
  } finally {
    loadingList.value = false;
  }
}

function setListFilter(id) {
  listFilter.value = id;
  loadList();
}

async function openNewConversation() {
  showNew.value = true;
}

async function onOpenGroupFromModal(group) {
  showNew.value = false;
  const threadId = Number(group?.groupId || group?.threadId || 0) || null;
  const slug = String(route.params?.organizationSlug || '').trim();
  const path = route.path.includes('/messages')
    ? route.path
    : slug
      ? `/${slug}/messages`
      : '/messages';
  const q = { ...route.query, view: 'workspace', tab: 'channels' };
  if (threadId) q.threadId = String(threadId);
  emit('open-team-chat', 'channels');
  if (isDrawerLayout.value) {
    if (group?.displayName) {
      reminderNotice.value = threadId
        ? `Opening “${group.displayName}” in Team chat…`
        : `Open Channels in Team chat to continue in “${group.displayName}”.`;
      setTimeout(() => {
        reminderNotice.value = '';
      }, 5000);
    }
    return;
  }
  await router.push({ path, query: q }).catch(() => {});
  if (group?.displayName && !threadId) {
    reminderNotice.value = `Open Channels in Team chat to continue in “${group.displayName}”.`;
    setTimeout(() => {
      reminderNotice.value = '';
    }, 5000);
  }
}

async function pickPerson(person) {
  showNew.value = false;
  selected.value = person;
  selectedConversation.value = null;
  conversationPreview.value = null;
  mobileShowThread.value = true;
  sendMethod.value = person.preferredMethod || person.methods?.find((m) => m.available)?.id || 'secure';
  composeBody.value = '';
  composeSubject.value = '';
  composeCc.value = '';
  composeBcc.value = '';
  composeAttachments.value = [];
  chatStagedAttachments.value = [];
  chatThreadId.value = null;
  emojiPickerOpen.value = false;
  reactionPickerFor.value = null;
  includeClientOnSend.value = false;
  participantExtraIds.value = [];
  sendConfirmOpen.value = false;
  sendConfirmPending.value = null;
  talkingToUserId.value =
    person?.clientMessaging?.talkingToUserId ||
    person?.userId ||
    null;
  await loadEmailAliases(person?.agencyId || agencyId.value);
  await loadSignaturePreview(person?.agencyId || agencyId.value);
  sendError.value = '';
  if (!people.value.some((p) => p.personKey === person.personKey)) {
    people.value = [person, ...people.value];
  }
  await Promise.all([
    loadTimeline(person.personKey),
    loadPersonContext(person.personKey)
  ]);
  const ctx = selected.value?.clientMessaging;
  if (ctx?.talkingToUserId) {
    talkingToUserId.value = ctx.talkingToUserId;
  }
  // Client-centric: after resolving a client row, switch timeline/methods to the talking-to guardian
  const pickedClient = (person.kinds || []).includes('client');
  const talkingGuardian = ctx?.guardians?.find(
    (g) => Number(g.userId) === Number(talkingToUserId.value)
  );
  if (pickedClient && talkingGuardian?.personKey && talkingGuardian.personKey !== selected.value?.personKey) {
    await onTalkingToChange();
  }
  await focusComposer();
}

async function loadTimeline(personKey) {
  if (!personKey) {
    timeline.value = [];
    return;
  }
  loadingTimeline.value = true;
  try {
    const aid = selected.value?.agencyId || agencyId.value;
    const reqParams = {};
    if (aid) reqParams.agencyId = aid;
    const { data } = await api.get(`/messages/hub/people/${encodeURIComponent(personKey)}/timeline`, {
      params: reqParams,
      skipGlobalLoading: true
    });
    if (data?.person) {
      const priorMessaging = selected.value?.clientMessaging;
      selected.value = {
        ...data.person,
        clientMessaging: data.person.clientMessaging || priorMessaging || null
      };
    }
    timeline.value = Array.isArray(data?.items) ? data.items : [];
    const chatMsg = timeline.value.find((m) => m?.meta?.threadId);
    if (chatMsg?.meta?.threadId) chatThreadId.value = chatMsg.meta.threadId;
  } catch (e) {
    timeline.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not load timeline';
  } finally {
    loadingTimeline.value = false;
  }
}

async function loadEmailAliases(aid) {
  emailAliases.value = [];
  composeFromAliasId.value = null;
  if (!aid) return;
  try {
    const { data } = await api.get('/messages/hub/aliases', {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    emailAliases.value = Array.isArray(data?.aliases) ? data.aliases : [];
    const messages = emailAliases.value.find((a) => a.kind === 'messages');
    composeFromAliasId.value = messages?.id || emailAliases.value[0]?.id || null;
  } catch {
    emailAliases.value = [];
  }
}

async function loadSignaturePreview(aid) {
  signaturePreview.value = null;
  const agency = aid || selected.value?.agencyId || agencyId.value;
  try {
    const { data } = await api.get('/messages/hub/signature-preview', {
      params: agency ? { agencyId: agency } : {},
      skipGlobalLoading: true
    });
    signaturePreview.value = data || null;
  } catch {
    signaturePreview.value = null;
  }
}

function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        contentBase64: base64
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function onAttachFiles(ev) {
  const files = Array.from(ev.target?.files || []);
  ev.target.value = '';
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) {
      sendError.value = `${file.name} is too large (max 8MB)`;
      continue;
    }
    try {
      const att = await readFileAsAttachment(file);
      composeAttachments.value.push(att);
    } catch {
      sendError.value = `Could not attach ${file.name}`;
    }
  }
}

async function reactToMessage(msg) {
  const conversationId = msg?.meta?.conversationId;
  if (!conversationId) return;
  reactingId.value = msg.id;
  try {
    await api.post('/messages/hub/react', {
      agencyId: selected.value?.agencyId || agencyId.value,
      conversationId,
      emoji: '❤️'
    });
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not react';
  } finally {
    reactingId.value = null;
  }
}

async function send() {
  if (!selected.value?.personKey) return;
  if (!canSendCompose.value) return;
  const sendAgencyId = selected.value.agencyId || agencyId.value;
  if (!sendAgencyId) {
    sendError.value = 'Missing agency for this conversation';
    return;
  }
  if (!activeMethod.value?.available) {
    sendError.value = activeMethod.value?.reason || 'That method is not available';
    return;
  }
  if (
    (sendMethod.value === 'secure' || sendMethod.value === 'email') &&
    needsGuardianSendConfirm() &&
    !sendConfirmPending.value
  ) {
    sendConfirmOpen.value = true;
    return;
  }
  await executeSend({
    sendToAllPortalGuardians: !!sendConfirmPending.value?.sendToAll,
    includeClient: !!(includeClientOnSend.value || sendConfirmPending.value?.includeClient)
  });
  sendConfirmPending.value = null;
  sendConfirmOpen.value = false;
}

function confirmSendThisGuardianOnly() {
  sendConfirmPending.value = { sendToAll: false, includeClient: includeClientOnSend.value };
  sendConfirmOpen.value = false;
  send();
}

function confirmSendAllPortalGuardians() {
  sendConfirmPending.value = { sendToAll: true, includeClient: includeClientOnSend.value };
  sendConfirmOpen.value = false;
  send();
}

function cancelSendConfirm() {
  sendConfirmOpen.value = false;
  sendConfirmPending.value = null;
}

async function executeSend({ sendToAllPortalGuardians = false, includeClient = false } = {}) {
  const sendAgencyId = selected.value.agencyId || agencyId.value;
  sending.value = true;
  sendError.value = '';
  try {
    const ctx = clientMessaging.value;
    const targets = [];
    let emailCcExtra = '';

    if (sendMethod.value === 'sms' && ctx?.clientId) {
      const smsKey =
        ctx.clientPersonKey ||
        (sendAgencyId ? `client:${ctx.clientId}@${sendAgencyId}` : `client:${ctx.clientId}`);
      targets.push(smsKey);
    } else {
      const primaryKey = talkingToPersonKey() || selected.value.personKey;
      targets.push(primaryKey);

      if (sendToAllPortalGuardians && ctx?.portalGuardians?.length) {
        for (const g of ctx.portalGuardians) {
          if (g.personKey && !targets.includes(g.personKey)) targets.push(g.personKey);
        }
      } else {
        for (const id of participantExtraIds.value) {
          const g = ctx?.guardians?.find((x) => Number(x.userId) === Number(id));
          if (g?.personKey && !targets.includes(g.personKey)) targets.push(g.personKey);
        }
      }

      if (includeClient && ctx) {
        if (sendMethod.value === 'email' && ctx.clientEmail) {
          emailCcExtra = String(ctx.clientEmail).trim();
        } else if (ctx.clientPersonKey || ctx.clientUserId) {
          const clientKey =
            ctx.clientPersonKey ||
            (sendAgencyId
              ? `user:${ctx.clientUserId}@${sendAgencyId}`
              : `user:${ctx.clientUserId}`);
          if (clientKey && !targets.includes(clientKey)) targets.push(clientKey);
        }
      }
    }

    const primaryKey = targets[0];
    let lastData = null;
    for (const personKey of targets) {
      const payload = {
        agencyId: sendAgencyId,
        personKey,
        method: sendMethod.value,
        body: composeBody.value.trim(),
        subject: composeSubject.value.trim() || undefined
      };
      if (sendMethod.value === 'email') {
        let cc = composeCc.value.trim();
        if (personKey === primaryKey && emailCcExtra) {
          const parts = cc ? cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [];
          if (!parts.some((p) => p.toLowerCase() === emailCcExtra.toLowerCase())) {
            parts.push(emailCcExtra);
          }
          cc = parts.join(', ');
        }
        if (cc) payload.cc = cc;
        if (composeBcc.value.trim()) payload.bcc = composeBcc.value.trim();
        if (composeAttachments.value.length) payload.attachments = composeAttachments.value;
        if (composeFromAliasId.value) payload.fromAliasIdentityId = composeFromAliasId.value;
      }
      if (sendMethod.value === 'internal' || sendMethod.value === 'secure') {
        if (chatStagedAttachments.value.length) {
          payload.attachments = [...chatStagedAttachments.value];
        }
      }
      const useNextAvailable = schedulePreset.value === 'next_available';
      if (useNextAvailable) {
        payload.sendDuringNextAvailable = true;
        payload.schedulePreset = 'next_available';
      } else if (schedulePreset.value) {
        payload.schedulePreset = schedulePreset.value;
      } else {
        payload.undoDelaySeconds = Number(undoDelaySeconds.value) || 20;
      }
      const { data } = await api.post('/messages/hub/send', payload, { skipGlobalLoading: true });
      if (data?.error?.message) {
        throw Object.assign(new Error(data.error.message), { response: { data } });
      }
      if (personKey === primaryKey) lastData = data;
    }
    const data = lastData || {};
    const wasScheduledPreset = !!schedulePreset.value;
    const sentBody = composeBody.value.trim();
    const sentSubject = composeSubject.value.trim();
    const sentMethod = sendMethod.value;
    composeBody.value = '';
    composeSubject.value = '';
    composeCc.value = '';
    composeBcc.value = '';
    composeAttachments.value = [];
    chatStagedAttachments.value = [];
    if (data?.threadRef?.threadId) chatThreadId.value = data.threadRef.threadId;
    schedulePreset.value = null;
    showSchedule.value = false;
    emojiPickerOpen.value = false;
    const isQueuedSend = !!(data?.queued || data?.scheduled || data?.queueId);
    if (
      !isQueuedSend &&
      (sentMethod === 'internal' || sentMethod === 'secure') &&
      (sentBody || data?.chat?.id)
    ) {
      const optimisticId = data?.chat?.id
        ? `chat-${data.chat.id}`
        : `local-${Date.now()}`;
      if (!timeline.value.some((m) => m.id === optimisticId)) {
        timeline.value = [
          ...timeline.value,
          {
            id: optimisticId,
            channel: sentMethod,
            bodyPreview: sentBody || data?.chat?.body || '[attachment]',
            createdAt: data?.chat?.created_at || new Date().toISOString(),
            direction: 'outbound',
            attachments: data?.chat?.attachments || [],
            reactions: [],
            meta: {
              threadId: data?.threadRef?.threadId || chatThreadId.value,
              messageId: data?.chat?.id || null
            }
          }
        ];
      }
    }
    if (isQueuedSend) {
      const delaySec =
        Number(data?.undoDelaySeconds ?? undoDelaySeconds.value) ||
        Math.max(
          1,
          Math.round(
            (new Date(data.undoExpiresAt || data.scheduledSendAt).getTime() - Date.now()) / 1000
          )
        ) ||
        20;
      startUndoBanner({
        conversationId: data?.threadRef?.conversationId || null,
        messageId: data?.messageId || null,
        queueId: data?.queueId || null,
        expiresAt: data.undoExpiresAt || data.scheduledSendAt,
        delaySeconds: delaySec,
        body: sentBody,
        subject: sentSubject,
        method: sentMethod,
        kind:
          wasScheduledPreset ||
          data.queueReason === 'schedule' ||
          data.queueReason === 'availability' ||
          data.deliveryGate?.receiveAt ||
          data.senderGate?.sendAt
            ? 'scheduled'
            : 'undo'
      });
      if (navId.value === 'queued') loadQueued();
    }
    await loadTimeline(selected.value.personKey);
    await loadPersonContext(selected.value.personKey);
    scheduleSmartReply();
    if (selected.value && !people.value.some((p) => p.personKey === selected.value.personKey)) {
      people.value = [selected.value, ...people.value];
    } else if (selected.value) {
      people.value = [
        selected.value,
        ...people.value.filter((p) => p.personKey !== selected.value.personKey)
      ];
    }
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || e?.message || 'Send failed';
  } finally {
    sending.value = false;
  }
}

watch(
  () => agencyStore.currentAgency?.id,
  () => {
    selected.value = null;
    selectedConversation.value = null;
    conversationPreview.value = null;
    timeline.value = [];
    recentFiles.value = [];
    recentActivity.value = [];
    if (isConversationMode.value) loadConversations();
    else loadList();
  }
);

let listSearchTimer = null;
watch(listSearch, () => {
  const f = listFilter.value;
  if (!['staff', 'school_staff', 'guardians'].includes(f)) return;
  clearTimeout(listSearchTimer);
  listSearchTimer = setTimeout(() => loadList(), 280);
});

onMounted(() => {
  selectNav('people', 'recent');
  document.addEventListener('click', onDocClickClosePickers);
  loadInboxCounts();
  loadSendDelayPrefs();
});
onUnmounted(() => {
  clearUndoBanner();
  clearTimeout(staffSuggestTimer);
  clearTimeout(peopleTimer);
  clearTimeout(listSearchTimer);
  clearTimeout(smartReplyTimer);
  document.removeEventListener('click', onDocClickClosePickers);
});

function onDocClickClosePickers(ev) {
  const el = ev?.target;
  if (emojiPickerOpen.value && !el?.closest?.('.msg-hub-emoji-wrap')) {
    emojiPickerOpen.value = false;
  }
  if (reactionPickerFor.value != null && !el?.closest?.('.msg-hub-rx-add-wrap')) {
    reactionPickerFor.value = null;
  }
  if (snoozeMenuFor.value != null && !el?.closest?.('.msg-hub-snooze-wrap')) {
    snoozeMenuFor.value = null;
  }
  if (showSchedule.value && !el?.closest?.('.msg-hub-send-split')) {
    showSchedule.value = false;
  }
}

const hasActiveChat = computed(
  () => !!selected.value || !!selectedConversation.value || !!conversationPreview.value
);

defineExpose({
  reload: () => (isConversationMode.value ? loadConversations() : loadList()),
  openTeamChat,
  hasActiveChat
});
</script>

<style scoped>
.msg-hub {
  --mh-primary: var(--primary, var(--agency-primary-color, #1f6b4a));
  --mh-ink: #0f172a;
  --mh-muted: #64748b;
  --mh-line: #e2e8f0;
  --mh-surface: #ffffff;
  --mh-surface-2: #f8fafc;
  --mh-row-line: #f1f5f9;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
  color: var(--mh-ink);
  width: 100%;
}
.msg-hub-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
  flex-shrink: 0;
}
.msg-hub-title {
  margin: 0;
  font-size: clamp(1.35rem, 2vw, 1.75rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: color-mix(in srgb, var(--mh-primary) 45%, var(--mh-ink));
}
.msg-hub-sub { margin: 4px 0 0; color: var(--mh-muted); font-size: 13px; max-width: 42rem; }
.msg-hub-error {
  color: #b91c1c;
  background: #fef2f2;
  padding: 10px 12px;
  border-radius: 10px;
  flex-shrink: 0;
}
.msg-hub-error.inline { margin: 0; padding: 8px 10px; }
.msg-hub-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr) minmax(220px, 280px);
  gap: 10px;
  overflow: hidden;
}
.msg-hub-list-col,
.msg-hub-thread-col,
.msg-hub-context {
  background: var(--mh-surface);
  border: 1px solid var(--mh-line);
  border-radius: 14px;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.msg-hub-filters,
.msg-hub-modal-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 12px 0;
}
.msg-hub-modal-tabs { padding: 0 0 8px; }
.msg-hub-chip {
  border: 1px solid var(--mh-line);
  background: var(--mh-surface-2);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  color: var(--mh-ink);
}
.msg-hub-chip.active {
  background: color-mix(in srgb, var(--mh-primary) 14%, #fff);
  border-color: color-mix(in srgb, var(--mh-primary) 40%, var(--mh-line));
  color: var(--mh-primary);
}
.msg-hub-search { display: block; padding: 10px 12px; }
.msg-hub-search input,
.msg-hub-modal-input,
.msg-hub-subject,
.msg-hub-composer textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--mh-line);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.msg-hub-list {
  list-style: none;
  margin: 0;
  padding: 0 0 12px;
  overflow: auto;
  flex: 1;
}
.msg-hub-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-top: 1px solid #f1f5f9;
  align-items: center;
}
.msg-hub-row:hover,
.msg-hub-row.active { background: color-mix(in srgb, var(--mh-primary) 6%, #fff); }
.msg-hub-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mh-primary) 18%, #e2e8f0);
  color: var(--mh-primary);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
  overflow: hidden;
  flex-shrink: 0;
}
.msg-hub-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.msg-hub-avatar-tenant {
  object-fit: contain !important;
  padding: 5px;
  box-sizing: border-box;
  background: #fff;
}
.msg-hub-avatar.lg { width: 48px; height: 48px; font-size: 14px; }
.msg-hub-row-top { display: flex; justify-content: space-between; gap: 8px; }
.msg-hub-time,
.msg-hub-muted,
.msg-hub-snippet { margin: 0; font-size: 12px; color: var(--mh-muted); }
.msg-hub-snippet { margin-top: 4px; color: #475569; }
.msg-hub-agency {
  font-weight: 700;
  color: var(--mh-muted);
}
.msg-hub-agency-other {
  color: var(--mh-primary);
  font-weight: 800;
}
.msg-hub-sent-tag,
.msg-hub-open-tag {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--mh-primary);
}
.msg-hub-open-tag.pending {
  color: var(--mh-muted);
  font-weight: 600;
}
.msg-hub-delivery-note {
  margin: 0 0 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--mh-primary) 12%, #fff);
  border: 1px solid color-mix(in srgb, var(--mh-primary) 28%, #e2e8f0);
  color: var(--mh-ink);
  font-size: 13px;
  line-height: 1.45;
}
.msg-hub-delivery-note.sidebar {
  margin-top: 10px;
}
.msg-hub-undo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #0f172a;
  color: #f8fafc;
  font-size: 13px;
}
.msg-hub-undo button {
  border: 0;
  border-radius: 8px;
  background: #fff;
  color: #0f172a;
  font-weight: 700;
  padding: 6px 10px;
  cursor: pointer;
}
.msg-hub-smart-reply {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 12px;
  margin: 0 0 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}
.msg-hub-smart-label {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #94a3b8;
}
.msg-hub-smart-text {
  flex: 1 1 180px;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: #64748b;
  white-space: pre-wrap;
}
.msg-hub-smart-text.loading {
  font-style: italic;
  color: #94a3b8;
}
.msg-hub-settings-card {
  max-width: 420px;
}
.msg-hub-settings-grid {
  display: grid;
  gap: 12px;
  margin: 14px 0 18px;
}
.msg-hub-settings-grid label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--mh-ink);
}
.msg-hub-settings-grid select {
  border: 1px solid var(--mh-line);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 500;
  background: #fff;
}
.msg-hub-delay-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--mh-muted);
}
.msg-hub-delay-select {
  border: 1px solid var(--mh-line);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  background: #fff;
}
.msg-hub-schedule-wrap {
  position: relative;
}
.msg-hub-send-split {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  border-radius: 8px;
  margin-left: auto;
}
.msg-hub-send-main {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
  border-right: none !important;
  padding: 6px 12px !important;
  line-height: 1.15;
  min-height: 36px;
}
.msg-hub-send-main-label {
  font-weight: 700;
  font-size: 13px;
}
.msg-hub-send-main-why {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.9;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.msg-hub-send-caret {
  border-top-left-radius: 0 !important;
  border-bottom-left-radius: 0 !important;
  padding-left: 8px !important;
  padding-right: 8px !important;
  min-width: 28px;
  border-left: 1px solid rgba(255, 255, 255, 0.28) !important;
}
.msg-hub-schedule-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  min-width: 240px;
  background: #fff;
  border: 1px solid var(--mh-line);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
  padding: 6px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.msg-hub-schedule-menu button {
  border: 0;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.msg-hub-schedule-menu button:hover {
  background: #f1f5f9;
}
.msg-hub-menu-title {
  font-weight: 750;
  color: var(--mh-ink, #0b1f3a);
}
.msg-hub-menu-sub {
  font-size: 11px;
  color: var(--mh-muted, #64748b);
  font-weight: 550;
}
.msg-hub-compose-actions .btn-ghost {
  border: 1px solid var(--mh-line);
  background: #fff;
  color: var(--mh-ink);
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.msg-hub-kind {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
  white-space: nowrap;
}
.kind-sms { background: #ecfdf5; color: #047857; }
.kind-secure { background: #eff6ff; color: #1d4ed8; }
.kind-internal { background: #f5f3ff; color: #6d28d9; }
.kind-email { background: #fff7ed; color: #c2410c; }
.kind-school-staff { background: #ecfdf5; color: #047857; }
.msg-hub-empty,
.msg-hub-thread-empty {
  padding: 28px 20px;
  text-align: center;
  color: var(--mh-muted);
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}
.msg-hub-empty.soft { padding: 16px; }
.msg-hub-empty p { margin: 0; max-width: 22rem; }
.pad { padding: 12px; }
.msg-hub-thread-empty h3 { margin: 0; color: var(--mh-ink); }
.msg-hub-thread-head {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--mh-line);
  flex-shrink: 0;
}
.msg-hub-thread-head h3 { margin: 0; font-size: 1.05rem; }
.msg-hub-name-link {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: #1d4ed8;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  font-weight: inherit;
  text-align: left;
}
.msg-hub-name-link:hover {
  color: #1e40af;
}
.msg-hub-missing { color: #b45309; font-weight: 600; }
.msg-hub-kv-hint { font-style: normal; color: #64748b; font-weight: 500; font-size: 0.85em; }
.msg-hub-to-row {
  align-items: flex-start;
}
.msg-hub-to-value {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.msg-hub-to-email {
  color: #334155;
  font-size: 0.9rem;
  word-break: break-all;
}
.msg-hub-to-missing {
  color: #b45309;
  font-size: 0.85rem;
}
.msg-hub-inline-link-btn {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  margin: 0 2px;
  color: var(--mh-primary, #2e9a43);
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}
.msg-hub-channel-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--mh-line);
  flex-shrink: 0;
}
.msg-hub-channel {
  border: 1px solid var(--mh-line);
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.msg-hub-channel.active {
  border-color: var(--mh-primary);
  background: color-mix(in srgb, var(--mh-primary) 12%, #fff);
  color: var(--mh-primary);
}
.msg-hub-channel:disabled { opacity: 0.55; cursor: not-allowed; }
.msg-hub-channel.unavailable {
  background: #f1f5f9;
  color: #94a3b8;
  border-color: #e2e8f0;
}
.msg-hub-not-yet {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: #e2e8f0;
  color: #64748b;
}
.msg-hub-method-hint {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.35;
}
.msg-hub-invite-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  margin: 0.55rem 0 0.25rem;
}
.msg-hub-invite-inline {
  margin-left: 0.5rem;
  border: none;
  background: transparent;
  color: #0f766e;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  font-size: inherit;
}
.msg-hub-invite-inline:disabled {
  opacity: 0.6;
  cursor: wait;
}
.msg-hub-invite-side {
  margin-top: 0.65rem;
}
.msg-hub-secure-hint {
  margin: 0;
  padding: 0 16px 8px;
  font-size: 12px;
  color: var(--mh-muted);
  line-height: 1.4;
}
.msg-hub-secure-toggle {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 0 16px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mh-ink);
  cursor: pointer;
}
.msg-hub-secure-toggle input {
  margin-top: 2px;
}
.msg-hub-rec {
  font-size: 9px;
  text-transform: uppercase;
  background: var(--mh-primary);
  color: #fff;
  border-radius: 4px;
  padding: 1px 4px;
}
.msg-hub-timeline {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #f8fafc;
}
.msg-hub-bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--mh-line);
  align-self: flex-start;
}
.msg-hub-bubble.outbound {
  align-self: flex-end;
  background: color-mix(in srgb, var(--mh-primary) 10%, #fff);
}
.msg-hub-bubble p { margin: 4px 0; white-space: pre-wrap; font-size: 14px; }
.msg-hub-bubble time { font-size: 11px; color: var(--mh-muted); }
.msg-hub-bubble-ch {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--mh-primary);
}
.msg-hub-composer {
  padding: 8px 14px 4px;
  border-top: 1px solid var(--mh-line);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  min-height: 0;
  max-height: min(42vh, 380px);
  overflow-y: auto;
  background: #fff;
}
.msg-hub-subject {
  width: 100%;
  border: 1px solid var(--mh-line);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}
.msg-hub-email-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mh-muted);
}
.msg-hub-alias {
  flex: 1;
  border: 1px solid var(--mh-line);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
}
.msg-hub-attach-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.msg-hub-attach-btn {
  cursor: pointer;
  color: var(--mh-primary);
  font-weight: 650;
}
.msg-hub-attach-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.msg-hub-attach-list li {
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.msg-hub-attach-list button {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.msg-hub-bubble-atts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 6px 0;
}
.msg-hub-att-link {
  display: block;
  max-width: 220px;
  font-size: 12px;
  color: var(--mh-primary);
  text-decoration: none;
}
.msg-hub-att-img {
  display: block;
  max-width: 200px;
  max-height: 160px;
  border-radius: 8px;
  object-fit: cover;
}
.msg-hub-reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-top: 6px;
}
.msg-hub-rx-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 13px;
  cursor: pointer;
}
.msg-hub-rx-chip.mine {
  border-color: color-mix(in srgb, var(--mh-primary) 50%, #e2e8f0);
  background: color-mix(in srgb, var(--mh-primary) 10%, #fff);
}
.msg-hub-rx-count {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
}
.msg-hub-rx-add-wrap {
  position: relative;
}
.msg-hub-rx-add {
  border: 1px dashed #cbd5e1;
  background: transparent;
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 11px;
  cursor: pointer;
  color: #64748b;
}
.msg-hub-rx-picker {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  z-index: 5;
  display: flex;
  gap: 2px;
  padding: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}
.msg-hub-rx-picker button {
  border: 0;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
}
.msg-hub-rx-picker button:hover {
  background: #f1f5f9;
}
.msg-hub-chat-tools {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 2px;
}
.msg-hub-chat-tool-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.msg-hub-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--mh-line);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
}
.msg-hub-tool-btn.active {
  border-color: var(--mh-primary);
  background: color-mix(in srgb, var(--mh-primary) 10%, #fff);
}
.msg-hub-emoji-wrap {
  position: relative;
}
.msg-hub-emoji-picker {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 8;
  width: min(280px, 70vw);
  max-height: 220px;
  overflow: auto;
  padding: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
}
.msg-hub-emoji-group + .msg-hub-emoji-group {
  margin-top: 8px;
}
.msg-hub-emoji-group-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
  margin-bottom: 4px;
}
.msg-hub-emoji-row {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.msg-hub-emoji-btn {
  border: 0;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
}
.msg-hub-emoji-btn:hover {
  background: #f1f5f9;
}
.msg-hub-bubble-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.msg-hub-like {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  opacity: 0.75;
}
.msg-hub-like:hover { opacity: 1; }
.msg-hub-compose-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.msg-hub-sender-avail {
  margin: 6px 0 0;
  font-size: 0.85rem;
  line-height: 1.35;
}
.msg-hub-inline-link {
  color: var(--mh-primary);
  text-decoration: underline;
  margin-left: 4px;
}
.msg-hub-talking {
  color: var(--mh-ink-muted, #64748b);
}
.msg-hub-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.msg-hub-mini-chip {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--mh-line);
  color: var(--mh-ink-muted, #64748b);
  background: var(--mh-surface-2, #f8fafc);
}
.msg-hub-chip {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--mh-line);
  color: var(--mh-ink-muted, #64748b);
}
.msg-hub-banner-warn {
  margin: 0 12px 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 0.85rem;
}
.msg-hub-talking-bar {
  padding: 0 12px 8px;
}
.msg-hub-talking-select {
  margin-left: 6px;
  max-width: 100%;
}
.msg-hub-party-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--mh-line);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
}
.msg-hub-party-card.active {
  border-color: var(--mh-primary);
}
.msg-hub-portal-flag {
  font-size: 0.75rem;
  color: #94a3b8;
}
.msg-hub-portal-flag.on {
  color: #047857;
}
.msg-hub-party-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  margin-top: 4px;
}
.msg-hub-party-check.pad {
  margin: 10px 0;
}
.msg-hub-confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
.msg-hub-sig-preview {
  margin-top: 4px;
  margin-bottom: 0;
  padding: 4px 6px 0;
  border: 1px solid var(--mh-line);
  border-radius: 10px;
  background: #fff;
  flex-shrink: 0;
  overflow: visible;
}
.msg-hub-sig-preview-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--mh-ink-muted, #64748b);
  margin-bottom: 2px;
}
.msg-hub-sig-preview-body {
  overflow: visible;
  max-width: 100%;
  line-height: 0;
}
.msg-hub-sig-preview-body :deep(table) {
  margin: 0 !important;
  margin-bottom: 0 !important;
}
.msg-hub-sig-preview-body :deep(td),
.msg-hub-sig-preview-body :deep(div) {
  line-height: normal;
}
.msg-hub-sig-preview-body :deep(img) {
  max-width: 100%;
  height: auto;
}
.msg-hub-context { padding: 12px; gap: 10px; overflow: auto; }
.msg-hub-panel {
  border: 1px solid var(--mh-line);
  border-radius: 12px;
  padding: 12px;
  background: var(--mh-surface);
}
.msg-hub-panel h3 { margin: 0 0 6px; font-size: 0.92rem; color: var(--mh-primary); }
.msg-hub-profile-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}
.msg-hub-profile-name { margin: 0 0 4px; font-weight: 750; }
.msg-hub-kv { list-style: none; margin: 10px 0 0; padding: 0; }
.msg-hub-kv li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  padding: 4px 0;
  border-top: 1px solid #f1f5f9;
}
.msg-hub-kv span { color: var(--mh-muted); }
.msg-hub-methods { list-style: none; margin: 0; padding: 0; }
.msg-hub-methods li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  padding: 6px 0;
  border-top: 1px solid #f1f5f9;
}
.msg-hub-methods li.off { opacity: 0.55; }
.msg-hub-banner {
  background: color-mix(in srgb, var(--mh-primary) 10%, #fff);
  font-size: 13px;
  color: #334155;
}
.msg-hub-banner p { margin: 0; }
.msg-hub-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: 16px;
}
.msg-hub-modal-card {
  width: min(520px, 100%);
  max-height: min(80vh, 640px);
  overflow: auto;
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}
.msg-hub-modal-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.msg-hub-modal-card h3 { margin: 0; }
.msg-hub-modal-close {
  border: 0;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}
.msg-hub-modal-input { margin: 10px 0; }
.msg-hub-people { list-style: none; margin: 0; padding: 0; }
.msg-hub-people li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 10px;
  padding: 10px 4px;
  border-top: 1px solid #f1f5f9;
  cursor: pointer;
}
.msg-hub-people li:hover { background: #f8fafc; }
.msg-hub-methods-inline { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 1100px) {
  .msg-hub-grid { grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); }
  .msg-hub-context { display: none; }
}
@media (max-width: 800px) {
  .msg-hub:not(.msg-hub--drawer) .msg-hub-rail-toggle { display: inline-flex; }
  .msg-hub:not(.msg-hub--drawer) .msg-hub-rail {
    display: none;
    position: absolute;
    z-index: 5;
    left: 0;
    top: 0;
    bottom: 0;
    width: min(220px, 78vw);
    border-radius: 0 14px 14px 0;
  }
  .msg-hub:not(.msg-hub--drawer) .msg-hub-rail.open { display: flex; }
  .msg-hub:not(.msg-hub--drawer) .msg-hub-rail-backdrop {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    z-index: 4;
  }
  .msg-hub-grid { grid-template-columns: 1fr; }
  .msg-hub-list-col { display: flex; }
  .msg-hub-thread-col { display: none; }
  .msg-hub--mobile-thread .msg-hub-list-col { display: none; }
  .msg-hub--mobile-thread .msg-hub-thread-col { display: flex; }
  .msg-hub-back-list { display: inline-flex; }
}


.msg-hub-head-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.msg-hub-head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.msg-hub-rail-toggle {
  display: none;
  border: 1px solid var(--mh-line);
  background: var(--mh-surface-2);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: var(--mh-ink);
}
.msg-hub-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
  overflow: hidden;
  position: relative;
}
.msg-hub-rail {
  width: 168px;
  flex-shrink: 0;
  background: var(--mh-surface);
  color: var(--mh-ink);
  border: 1px solid var(--mh-line);
  border-radius: 14px;
  padding: 12px 8px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.msg-hub:not(.msg-hub--drawer) .msg-hub-rail {
  display: flex;
}
.msg-hub:not(.msg-hub--drawer) .msg-hub-rail-backdrop {
  display: none;
}
.msg-hub-rail-section { display: flex; flex-direction: column; gap: 2px; }
.msg-hub-rail-label {
  margin: 0 8px 4px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mh-muted);
}
.msg-hub-rail-item {
  border: 0;
  background: transparent;
  color: var(--mh-ink);
  text-align: left;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.msg-hub-rail-item:hover {
  background: var(--mh-surface-2);
}
.msg-hub-rail-item.active {
  background: color-mix(in srgb, var(--mh-primary) 14%, #fff);
  color: var(--mh-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mh-primary) 28%, var(--mh-line));
}
.msg-hub-rail-soon {
  font-size: 9px;
  text-transform: uppercase;
  font-weight: 800;
  color: var(--mh-muted);
  background: var(--mh-surface-2);
  border: 1px solid var(--mh-line);
  border-radius: 999px;
  padding: 1px 5px;
}
.msg-hub-rail-backdrop {
  display: none;
}
.msg-hub-list-head {
  padding: 12px 12px 0;
}
.msg-hub-list-head h3 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--mh-primary);
}
.msg-hub-unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mh-primary);
}
.msg-hub-star-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;
  flex-shrink: 0;
}
.msg-hub-star-btn.on { color: #d97706; }
.msg-hub-star-btn.lg { font-size: 20px; padding: 6px 8px; }
.msg-hub-star-btn:hover { color: #d97706; }
.msg-hub-rail-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--mh-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.msg-hub-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.msg-hub-snooze-wrap {
  position: relative;
}
.msg-hub-snooze-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}
.msg-hub-snooze-btn.on,
.msg-hub-snooze-btn:hover {
  color: #0369a1;
  background: #e0f2fe;
}
.msg-hub-snooze-btn.lg {
  font-size: 12px;
  font-weight: 700;
  padding: 6px 8px;
  border: 1px solid var(--mh-line);
  background: #fff;
}
.msg-hub-snooze-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 8;
  min-width: 150px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.msg-hub-snooze-menu.end {
  right: 0;
  left: auto;
}
.msg-hub-snooze-menu button {
  border: 0;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  color: var(--mh-ink);
}
.msg-hub-snooze-menu button:hover {
  background: #f1f5f9;
}
.msg-hub-snooze-tag {
  margin-right: 4px;
}
.msg-hub-unknown-tag {
  display: inline-block;
  margin-right: 6px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #9a3412;
  background: #ffedd5;
  vertical-align: middle;
}
.msg-hub-unknown-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.85rem;
  margin: 0 0 0.75rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid #fdba74;
  border-radius: 10px;
  background: #fff7ed;
}
.msg-hub-unknown-banner strong {
  display: block;
  color: #9a3412;
  font-size: 0.92rem;
}
.msg-hub-unknown-banner p {
  margin: 0.2rem 0 0;
  font-size: 0.84rem;
  color: #7c2d12;
  line-height: 1.35;
}
.msg-hub-unknown-banner .btn {
  flex-shrink: 0;
  white-space: nowrap;
}
.msg-hub-snooze-until {
  color: #0369a1;
}
.msg-hub-thread-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.msg-hub-thread-head-main { min-width: 0; flex: 1; }
.msg-hub-row.unread strong { font-weight: 800; }
.msg-hub-back-list {
  display: none;
  border: 1px solid var(--mh-line);
  background: #fff;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  margin-right: 4px;
}
.msg-hub-context-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.msg-hub-side-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.msg-hub-side-list li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  border-top: 1px solid var(--mh-row-line);
  font-size: 12px;
}
.msg-hub-side-list time {
  color: var(--mh-muted);
  font-size: 11px;
}
.pad-top { padding-top: 8px; margin: 0; }
.msg-hub--drawer .msg-hub-rail-toggle {
  display: inline-flex;
}
.msg-hub--drawer .msg-hub-rail {
  display: none;
  position: absolute;
  z-index: 5;
  left: 0;
  top: 0;
  bottom: 0;
  width: min(200px, 78%);
  border-radius: 0 12px 12px 0;
  padding: 8px 6px;
}
.msg-hub--drawer .msg-hub-rail.open {
  display: flex;
}
.msg-hub--drawer .msg-hub-rail-backdrop {
  display: block;
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  z-index: 4;
}
.msg-hub--drawer .msg-hub-title {
  font-size: 1.15rem;
}
.msg-hub--drawer .msg-hub-context {
  display: none;
}
.msg-hub--drawer .msg-hub-sub {
  display: none;
}
.msg-hub--drawer .msg-hub-grid {
  grid-template-columns: 1fr;
}
.msg-hub--drawer .msg-hub-list-col { display: flex; }
.msg-hub--drawer .msg-hub-thread-col { display: none; }
.msg-hub--drawer.msg-hub--mobile-thread .msg-hub-list-col { display: none; }
.msg-hub--drawer.msg-hub--mobile-thread .msg-hub-thread-col { display: flex; }
.msg-hub--drawer .msg-hub-back-list { display: inline-flex; }

:global([data-theme='dark']) .msg-hub {
  --mh-ink: #e2e8f0;
  --mh-muted: #94a3b8;
  --mh-line: #334155;
  --mh-surface: #0f172a;
  --mh-surface-2: #1e293b;
  --mh-row-line: #1e293b;
}
:global([data-theme='dark']) .msg-hub-row {
  border-top-color: var(--mh-row-line);
}
:global([data-theme='dark']) .msg-hub-row:hover,
:global([data-theme='dark']) .msg-hub-row.active {
  background: color-mix(in srgb, var(--mh-primary) 18%, #0f172a);
}
:global([data-theme='dark']) .msg-hub-chip.active {
  background: color-mix(in srgb, var(--mh-primary) 22%, #0f172a);
  color: #e2e8f0;
}
:global([data-theme='dark']) .msg-hub-search input,
:global([data-theme='dark']) .msg-hub-modal-input,
:global([data-theme='dark']) .msg-hub-subject,
:global([data-theme='dark']) .msg-hub-composer textarea,
:global([data-theme='dark']) .msg-hub-alias,
:global([data-theme='dark']) .msg-hub-delay-select,
:global([data-theme='dark']) .msg-hub-settings-grid select {
  background: #0b1220;
  color: #e2e8f0;
  border-color: #334155;
}
:global([data-theme='dark']) .msg-hub-smart-reply {
  background: #1e293b;
  border-color: #334155;
}
:global([data-theme='dark']) .msg-hub-smart-text {
  color: #94a3b8;
}
:global([data-theme='dark']) .msg-hub-bubble {
  background: #1e293b;
  color: #e2e8f0;
}
:global([data-theme='dark']) .msg-hub-bubble.outbound {
  background: color-mix(in srgb, var(--mh-primary) 28%, #0f172a);
}
:global([data-theme='dark']) .msg-hub-modal-card {
  background: #0f172a;
  color: #e2e8f0;
  border-color: #334155;
}
:global([data-theme='dark']) .msg-hub-people li {
  border-top-color: #1e293b;
}
:global([data-theme='dark']) .msg-hub-people li:hover {
  background: #1e293b;
}
:global([data-theme='dark']) .msg-hub-kv li {
  border-top-color: #1e293b;
}
:global([data-theme='dark']) .msg-hub-delivery-note {
  background: color-mix(in srgb, var(--mh-primary) 18%, #0f172a);
  border-color: color-mix(in srgb, var(--mh-primary) 35%, #334155);
  color: #e2e8f0;
}
:global([data-theme='dark']) .msg-hub-schedule-menu {
  background: #0f172a;
  border-color: #334155;
}
:global([data-theme='dark']) .msg-hub-schedule-menu button {
  color: #e2e8f0;
}
:global([data-theme='dark']) .msg-hub-schedule-menu button:hover {
  background: #1e293b;
}
:global([data-theme='dark']) .msg-hub-compose-actions .btn-ghost {
  background: #1e293b;
  color: #e2e8f0;
  border-color: #334155;
}
:global([data-theme='dark']) .msg-hub-error {
  background: #450a0a;
  color: #fecaca;
}
:global([data-theme='dark']) .chats-view {
  color: #e2e8f0;
}
</style>
