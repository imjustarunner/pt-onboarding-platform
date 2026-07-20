<template>
  <div
    v-if="isAuthenticated"
    class="messages-workspace"
    :class="[
      `layout-${layout}`,
      `theme-${theme}`,
      {
        'has-active-chat': hasActiveChat,
        'mobile-show-chat': pageMobileShowChat,
        'tickets-mode': (mainTab === 'sms' && canSeeSms) || mainTab === 'assistant'
      }
    ]"
  >
    <aside class="mw-list-col">
      <div class="panel-header">
        <div class="org-header">
          <div class="title">Messages</div>
          <div class="subtitle">{{ panelSubtitle }}</div>
        </div>
        <label
          v-if="showComposeAgencyPicker"
          class="compose-agency"
          title="Agency used for directory, channels, and new DMs. Open conversations keep their own agency."
        >
          <span class="compose-agency-label">Compose in</span>
          <select v-model.number="composeAgencyId" @change="onComposeAgencyChange">
            <option
              v-for="a in membershipAgencies"
              :key="a.id"
              :value="a.id"
            >
              {{ a.name }}
            </option>
          </select>
        </label>
      </div>

      <nav class="nav-stubs" aria-label="Team communication">
        <button
          type="button"
          class="nav-stub"
          :class="{ active: mainTab === 'dms' }"
          @click="switchToDms"
        >
          Direct Messages
        </button>
        <button
          type="button"
          class="nav-stub nav-stub-assistant"
          :class="{ active: mainTab === 'assistant' }"
          @click="switchToAssistant"
        >
          Assistant
        </button>
        <template v-if="!isSchoolStaffViewer">
          <button
            type="button"
            class="nav-stub"
            :class="{ active: mainTab === 'channels' }"
            @click="switchToChannels"
          >
            Channels
            <span v-if="channelsUnreadTotal > 0" class="nav-stub-badge">{{ channelsUnreadTotal }}</span>
          </button>
          <button
            type="button"
            class="nav-stub"
            :class="{ active: mainTab === 'threads' }"
            @click="switchToThreadsInbox"
          >
            Threads
            <span v-if="threadsInboxUnread > 0" class="nav-stub-badge">{{ threadsInboxUnread }}</span>
          </button>
          <button
            type="button"
            class="nav-stub"
            :class="{ active: mainTab === 'mentions' }"
            @click="switchToMentionsInbox"
          >
            Mentions
            <span v-if="mentionsInboxUnread > 0" class="nav-stub-badge">{{ mentionsInboxUnread }}</span>
          </button>
        </template>
        <button
          v-if="canSeeSms"
          type="button"
          class="nav-stub"
          :class="{ active: mainTab === 'sms' }"
          @click="switchToSms"
        >
          SMS
        </button>
        <button
          type="button"
          class="nav-stub"
          :class="{ active: mainTab === 'files' }"
          @click="switchToFilesInbox"
        >
          Files
        </button>
        <button
          type="button"
          class="nav-stub"
          :class="{ active: mainTab === 'bookmarks' }"
          @click="switchToBookmarksInbox"
        >
          Bookmarks
        </button>
        <button
          type="button"
          class="nav-stub"
          :class="{ active: mainTab === 'pins' }"
          @click="switchToPinsInbox"
        >
          Pins
        </button>
      </nav>

      <div v-if="mainTab === 'sms' && canSeeSms" class="mw-tickets-host mw-sms-host">
        <CommunicationsHubView embedded :theme="theme" />
      </div>

      <template v-else>
        <div
          v-if="assistantMounted"
          v-show="mainTab === 'assistant'"
          class="mw-tickets-host mw-assistant-host"
        >
          <AskAssistantPanel
            :open="mainTab === 'assistant'"
            variant="embedded"
            :placement-key="assistantPlacementKey"
          />
        </div>

        <div v-show="mainTab !== 'assistant'" class="panel-body">
        <template v-if="needsAgency">
          <div class="empty">
            <p style="margin: 0;">Select an agency to view who’s online.</p>
          </div>

          <div v-if="pendingThreads.length > 0" class="section" style="margin-top: 12px;">
            <div class="section-title">Unread</div>
              <button
              v-for="t in pendingThreads"
              :key="`${t.agency_id}-${t.thread_id}`"
              class="person"
              @click="openThread(t)"
            >
              <span class="dot" :class="dotClassForUserId(t.other_participant?.id)"></span>
              <PeerTenantMark
                :person="presencePersonForId(t.other_participant?.id) || t.other_participant"
                :default-primary="defaultBrandPrimary"
                :default-logo-url="defaultBrandLogo"
                :default-name="defaultBrandName"
                :viewer-memberships="viewerMembershipsForHover"
              />
              <span class="name-block">
                <span class="name">{{ t.other_participant.first_name }} {{ t.other_participant.last_name }}</span>
                <span class="status-line">{{ subtitleForUserId(t.other_participant?.id) }}</span>
              </span>
              <span class="pill">{{ t.unread_count }}</span>
            </button>
          </div>
        </template>

        <template v-else>
          <template v-if="mainTab === 'threads' && !isSchoolStaffViewer">
            <div class="toolbar">
              <input v-model="threadsInboxQ" class="search" placeholder="Search threads…" />
            </div>
            <div v-if="threadsInboxLoading" class="loading">Loading threads…</div>
            <div v-else-if="threadsInboxError" class="error">{{ threadsInboxError }}</div>
            <div v-else class="lists">
              <div class="section">
                <div class="section-title">Threads</div>
                <div v-if="filteredThreadsInbox.length === 0" class="muted">No reply threads yet.</div>
                <button
                  v-for="item in filteredThreadsInbox"
                  :key="item.root_message_id"
                  type="button"
                  class="person"
                  @click="openInboxThread(item)"
                >
                  <span class="channel-hash" aria-hidden="true">💬</span>
                  <span class="name-block">
                    <span class="name">
                      {{ inboxThreadTitle(item) }}
                      <span v-if="item.agency_id && shouldUnifyInboxes && tenantLabelForAgencyId(item.agency_id, item.agency_name)" class="agency-chip">{{ tenantLabelForAgencyId(item.agency_id, item.agency_name) }}</span>
                      <span v-if="item.unread_reply_count" class="agency-chip">{{ item.unread_reply_count }} new</span>
                    </span>
                    <span class="status-line">{{ inboxThreadPreview(item) }}</span>
                  </span>
                  <span v-if="item.reply_count" class="pill">{{ item.reply_count }}</span>
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="mainTab === 'files'">
            <div class="toolbar">
              <input v-model="filesInboxQ" class="search" placeholder="Search files…" />
            </div>
            <div v-if="filesInboxLoading" class="loading">Loading files…</div>
            <div v-else-if="filesInboxError" class="error">{{ filesInboxError }}</div>
            <div v-else class="lists">
              <div class="section">
                <div class="section-title">Files</div>
                <div v-if="filteredFilesInbox.length === 0" class="muted">No files yet.</div>
                <button
                  v-for="item in filteredFilesInbox"
                  :key="item.id"
                  type="button"
                  class="person"
                  @click="openInboxFile(item)"
                >
                  <span class="channel-hash" aria-hidden="true">📎</span>
                  <span class="name-block">
                    <span class="name">
                      {{ item.original_filename || item.file_kind || 'File' }}
                      <span v-if="item.channel_name" class="agency-chip">#{{ item.channel_name }}</span>
                    </span>
                    <span class="status-line">{{ item.sender?.first_name }} {{ item.sender?.last_name }}</span>
                  </span>
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="mainTab === 'bookmarks'">
            <div class="toolbar">
              <input v-model="bookmarksInboxQ" class="search" placeholder="Search bookmarks…" />
            </div>
            <div v-if="bookmarksInboxLoading" class="loading">Loading bookmarks…</div>
            <div v-else-if="bookmarksInboxError" class="error">{{ bookmarksInboxError }}</div>
            <div v-else class="lists">
              <div class="section">
                <div class="section-title">Bookmarks</div>
                <div v-if="filteredBookmarksInbox.length === 0" class="muted">No bookmarks yet.</div>
                <button
                  v-for="item in filteredBookmarksInbox"
                  :key="item.message_id"
                  type="button"
                  class="person"
                  @click="openInboxBookmarkOrPin(item)"
                >
                  <span class="channel-hash" aria-hidden="true">🔖</span>
                  <span class="name-block">
                    <span class="name">
                      {{ item.sender?.first_name }} {{ item.sender?.last_name }}
                      <span v-if="item.channel_name" class="agency-chip">#{{ item.channel_name }}</span>
                    </span>
                    <span class="status-line">{{ truncateText(item.body, 70) }}</span>
                  </span>
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="mainTab === 'pins'">
            <div class="toolbar">
              <input v-model="pinsInboxQ" class="search" placeholder="Search pins…" />
            </div>
            <div v-if="pinsInboxLoading" class="loading">Loading pins…</div>
            <div v-else-if="pinsInboxError" class="error">{{ pinsInboxError }}</div>
            <div v-else class="lists">
              <div class="section">
                <div class="section-title">Pins</div>
                <div v-if="filteredPinsInbox.length === 0" class="muted">No pins yet.</div>
                <button
                  v-for="item in filteredPinsInbox"
                  :key="`${item.thread_id}-${item.message_id}`"
                  type="button"
                  class="person"
                  @click="openInboxBookmarkOrPin(item)"
                >
                  <span class="channel-hash" aria-hidden="true">📌</span>
                  <span class="name-block">
                    <span class="name">
                      {{ item.sender?.first_name }} {{ item.sender?.last_name }}
                      <span v-if="item.channel_name" class="agency-chip">#{{ item.channel_name }}</span>
                    </span>
                    <span class="status-line">{{ truncateText(item.body, 70) }}</span>
                  </span>
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="mainTab === 'mentions' && !isSchoolStaffViewer">
            <div class="toolbar">
              <input v-model="mentionsInboxQ" class="search" placeholder="Search mentions…" />
            </div>
            <div v-if="mentionsInboxLoading" class="loading">Loading mentions…</div>
            <div v-else-if="mentionsInboxError" class="error">{{ mentionsInboxError }}</div>
            <div v-else class="lists">
              <div class="section">
                <div class="section-title">Mentions</div>
                <div v-if="filteredMentionsInbox.length === 0" class="muted">No mentions yet.</div>
                <button
                  v-for="item in filteredMentionsInbox"
                  :key="item.message_id"
                  type="button"
                  class="person"
                  :class="{ 'unread-mention': !item.is_read }"
                  @click="openInboxMention(item)"
                >
                  <span class="channel-hash" aria-hidden="true">@</span>
                  <span class="name-block">
                    <span class="name">
                      {{ item.sender?.first_name }} {{ item.sender?.last_name }}
                      <span v-if="item.channel_name" class="agency-chip">#{{ item.channel_name }}</span>
                    </span>
                    <span class="status-line">{{ truncateText(item.body, 70) }}</span>
                  </span>
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="mainTab === 'channels' && !isSchoolStaffViewer">
            <div class="toolbar">
              <input v-model="channelQ" class="search" placeholder="Search channels…" />
              <button
                v-if="canCreateChannel"
                type="button"
                class="filter-chip"
                @click="showCreateChannel = !showCreateChannel"
              >
                {{ showCreateChannel ? 'Cancel' : '+ New channel' }}
              </button>
            </div>
            <div v-if="showCreateChannel && canCreateChannel" class="create-channel">
              <input v-model="newChannelName" class="search" placeholder="Channel name" maxlength="120" />
              <input v-model="newChannelDesc" class="search" placeholder="Description (optional)" maxlength="500" />
              <label class="create-channel-check">
                <input v-model="newChannelPrivate" type="checkbox" @change="onTogglePrivateCreate" />
                Private (invite-only)
              </label>
              <div v-if="newChannelPrivate" class="invite-picker">
                <div class="invite-picker-label">Invite team members</div>
                <input
                  v-model="createInviteQ"
                  class="search"
                  placeholder="Search team…"
                  maxlength="80"
                />
                <div class="invite-picker-list">
                  <label
                    v-for="u in createInviteCandidates"
                    :key="u.id"
                    class="invite-picker-row"
                  >
                    <input
                      type="checkbox"
                      :checked="createInviteIds.includes(u.id)"
                      @change="toggleCreateInvite(u.id)"
                    />
                    <span>{{ u.first_name }} {{ u.last_name }}</span>
                  </label>
                  <div v-if="createInviteCandidates.length === 0" class="muted">No team members found.</div>
                </div>
              </div>
              <button
                type="button"
                class="btn btn-xs btn-primary"
                :disabled="creatingChannel || !newChannelName.trim()"
                @click="createNewChannel"
              >
                {{ creatingChannel ? 'Creating…' : 'Create' }}
              </button>
              <div v-if="channelError" class="error">{{ channelError }}</div>
            </div>
            <div v-if="channelsLoading" class="loading">Loading channels…</div>
            <div v-else-if="channelError && !showCreateChannel" class="error">{{ channelError }}</div>
            <div v-else class="lists">
              <div class="section">
                <div class="section-title">Channels</div>
                <div v-if="filteredChannels.length === 0" class="muted">No channels yet.</div>
                <button
                  v-for="ch in filteredChannels"
                  :key="ch.thread_id"
                  type="button"
                  class="person channel-row"
                  :class="{ active: activeChannel?.thread_id === ch.thread_id }"
                  @click="openChannelThread(ch)"
                >
                  <span class="channel-hash" aria-hidden="true">#</span>
                  <span class="name-block">
                    <span class="name">
                      {{ ch.name }}
                      <span v-if="ch.kind === 'school'" class="agency-chip">School</span>
                      <span v-if="ch.visibility === 'private'" class="agency-chip">Private</span>
                    </span>
                    <span class="status-line">{{ channelPreview(ch) }}</span>
                  </span>
                  <span v-if="ch.unread_count" class="pill">{{ ch.unread_count }}</span>
                </button>
              </div>
            </div>
          </template>

          <template v-else>
          <div class="toolbar">
            <input v-model="q" class="search" :placeholder="searchPlaceholder" />
            <div v-if="canToggleAudience" class="filter-chips audience-chips">
              <button
                type="button"
                class="filter-chip"
                :class="{ active: audienceMode === 'team' }"
                @click="setAudienceMode('team')"
              >
                Team
              </button>
              <button
                type="button"
                class="filter-chip"
                :class="{ active: audienceMode === 'directory' }"
                @click="setAudienceMode('directory')"
              >
                Other roles
              </button>
            </div>
            <div v-if="canToggleAudience && audienceMode === 'directory'" class="filter-chips">
              <button
                v-for="opt in DIRECTORY_ROLE_OPTIONS"
                :key="opt.id"
                type="button"
                class="filter-chip"
                :class="{ active: directoryRole === opt.id }"
                @click="setDirectoryRole(opt.id)"
              >
                {{ opt.label }}
              </button>
            </div>
            <div class="filter-chips">
              <button type="button" class="filter-chip" :class="{ active: listFilter === 'all' }" @click="listFilter = 'all'">All</button>
              <button type="button" class="filter-chip" :class="{ active: listFilter === 'online' }" @click="listFilter = 'online'">Active</button>
              <button type="button" class="filter-chip" :class="{ active: listFilter === 'away' }" @click="listFilter = 'away'">Idle</button>
              <button type="button" class="filter-chip" :class="{ active: listFilter === 'offline' }" @click="listFilter = 'offline'">Inactive</button>
            </div>
          </div>

          <div v-if="loading" class="loading">Loading…</div>
          <div v-else-if="error" class="error">{{ error }}</div>

          <div v-else class="lists">
            <div v-if="pendingThreads.length > 0" class="section">
              <div class="section-title">Unread</div>
              <button
                v-for="t in pendingThreads"
                :key="`${t.agency_id}-${t.thread_id}`"
                class="person"
                :title="personHoverTitle(presencePersonForId(t.other_participant?.id) || t.other_participant)"
                @click="openThread(t)"
              >
                <span class="dot" :class="dotClassForUserId(t.other_participant?.id)"></span>
                <PeerTenantMark
                  :person="presencePersonForId(t.other_participant?.id) || t.other_participant"
                  :default-primary="defaultBrandPrimary"
                  :default-logo-url="defaultBrandLogo"
                  :default-name="defaultBrandName"
                  :viewer-memberships="viewerMembershipsForHover"
                />
                <span class="name-block">
                  <span class="name">
                    {{ t.other_participant.first_name }} {{ t.other_participant.last_name }}
                    <span v-if="!isClubContext && t.agencyLabel" class="agency-chip">{{ t.agencyLabel }}</span>
                  </span>
                  <span class="status-line">{{ subtitleForUserId(t.other_participant?.id) }}</span>
                </span>
                <span class="pill">{{ t.unread_count }}</span>
              </button>
            </div>

            <div class="section">
              <div class="section-title">{{ dmSectionTitle }}</div>
              <div v-if="dmList.length === 0" class="muted">
                {{ emptyDirectoryMessage }}
              </div>
              <button
                v-for="u in dmList"
                :key="u.id"
                class="person"
                :title="personHoverTitle(u)"
                @click="openChat(u)"
              >
                <span class="dot" :class="presenceDotClassForPerson(u)"></span>
                <PeerTenantMark
                  :person="u"
                  :default-primary="defaultBrandPrimary"
                  :default-logo-url="defaultBrandLogo"
                  :default-name="defaultBrandName"
                  :viewer-memberships="viewerMembershipsForHover"
                />
                <span class="name-block">
                  <span class="name">
                    {{ u.first_name }} {{ u.last_name }}
                    <span v-if="u.id === meId" class="you-chip">you</span>
                    <span v-if="personOrgLabel(u)" class="agency-chip">{{ personOrgLabel(u) }}</span>
                    <span v-else-if="adminsAllMode && u.agency_names" class="agency-chip">{{ u.agency_names }}</span>
                  </span>
                  <span class="status-line">{{ statusSubtitle(u) }}</span>
                </span>
                <span v-if="u.unreadCount" class="pill">{{ u.unreadCount }}</span>
              </button>
            </div>
          </div>
          </template>

        </template>
      </div>
      </template>

      <div v-if="mainTab !== 'assistant'" class="self-footer">
        <button type="button" class="self-status-btn" @click="statusMenuOpen = !statusMenuOpen">
          <span class="dot" :class="myPresenceDotClass"></span>
          <PeerTenantMark
            :person="myPresencePerson"
            :default-primary="defaultBrandPrimary"
            :default-logo-url="defaultBrandLogo"
            :default-name="defaultBrandName"
            :viewer-memberships="viewerMembershipsForHover"
          />
          <span class="self-meta">
            <span class="self-name">{{ myDisplayName }}</span>
            <span class="self-status-label">{{ myStatusDisplay }}</span>
          </span>
          <span class="self-chevron">▾</span>
        </button>
        <div v-if="statusMenuOpen" class="status-menu" @click.stop>
          <template v-if="isPrivileged">
            <div class="status-menu-label">Set status</div>
            <button
              v-for="r in AWAY_REASONS"
              :key="r.id"
              type="button"
              class="status-menu-item"
              @click="quickSetAway(r.id)"
            >
              {{ r.label }}
            </button>
            <button type="button" class="status-menu-item" @click="clearMyAway">I'm back · Active</button>
            <div class="status-menu-divider"></div>
            <button
              type="button"
              class="status-menu-item"
              :class="{ active: myAvailability === 'admins_only' }"
              @click="setMyAvailability('admins_only')"
            >
              Visible to admins only
            </button>
            <button
              type="button"
              class="status-menu-item"
              :class="{ active: myAvailability === 'everyone' }"
              @click="setMyAvailability('everyone')"
            >
              Visible to everyone
            </button>
            <button
              type="button"
              class="status-menu-item"
              :class="{ active: myAvailability === 'offline' }"
              @click="setMyAvailability('offline')"
            >
              Appear offline
            </button>
          </template>
          <template v-else>
            <button type="button" class="status-menu-item" @click="toggleMyAvailability">
              {{ myAvailability === 'offline' ? 'Go Online' : 'Go Offline' }}
            </button>
          </template>
        </div>
      </div>
    </aside>

    <section v-if="!(mainTab === 'sms' && canSeeSms) && mainTab !== 'assistant'" class="mw-chat-col">
      <div v-if="layout === 'page' && hasActiveChat" class="mw-chat-toolbar">
        <button type="button" class="btn btn-secondary btn-xs mw-back" @click="closeChat">← Back</button>
      </div>
      <div v-if="!hasActiveChat" class="mw-empty-chat muted">
        <p>Select a conversation to start messaging.</p>
      </div>
      <div v-if="hasActiveChat" class="chat-box">
            <div class="chat-box-header">
              <div class="chat-title">
                <template v-if="activeChannel"># {{ activeChannel.name }}</template>
                <template v-else>
                  <PeerTenantMark
                    :person="activeChatPresencePerson"
                    :default-primary="defaultBrandPrimary"
                    :default-logo-url="defaultBrandLogo"
                    :default-name="defaultBrandName"
                    :viewer-memberships="viewerMembershipsForHover"
                  />
                  <span>{{ activeChatUser.first_name }} {{ activeChatUser.last_name }}</span>
                </template>
              </div>
              <div class="chat-box-actions">
                <button
                  v-if="canStartVideoMeeting && dmPeerUserId"
                  class="btn btn-xs btn-primary"
                  type="button"
                  :disabled="startingMeeting"
                  @click="startVideoMeeting('TEAM_MEETING')"
                >
                  {{ startingMeeting ? 'Starting…' : 'Start video' }}
                </button>
                <button
                  v-if="canStartHuddle && dmPeerUserId"
                  class="btn btn-xs btn-secondary"
                  type="button"
                  :disabled="startingMeeting"
                  @click="startVideoMeeting('HUDDLE')"
                >
                  Huddle
                </button>
                <button
                  v-if="activeChannel"
                  class="btn btn-xs btn-secondary"
                  type="button"
                  @click="toggleMembersPanel"
                  :disabled="chatLoading"
                >
                  {{ showMembersPanel ? 'Hide members' : 'Members' }}
                </button>
                <button class="btn btn-xs btn-secondary" type="button" @click="toggleSelectMode" :disabled="sending || chatLoading">
                  {{ selectMode ? 'Cancel' : 'Select' }}
                </button>
                <button
                  v-if="selectMode"
                  class="btn btn-xs btn-danger"
                  type="button"
                  @click="deleteSelected"
                  :disabled="sending || selectedMessageIds.length === 0"
                  :title="selectedMessageIds.length ? `Delete ${selectedMessageIds.length} selected` : 'Select messages to delete'"
                >
                  Delete ({{ selectedMessageIds.length }})
                </button>
                <button class="btn btn-xs btn-danger" type="button" @click="deleteThread" :disabled="sending || chatLoading">
                  {{ activeChannel ? 'Hide channel' : 'Delete thread' }}
                </button>
                <button class="btn-close" @click="closeChat">×</button>
              </div>
            </div>

            <div v-if="activeChannel && showMembersPanel" class="members-panel">
              <div class="members-panel-header">
                <span class="section-title" style="margin: 0;">Members</span>
                <span v-if="channelMembers.length" class="muted">{{ channelMembers.length }}</span>
              </div>
              <div v-if="membersLoading" class="muted">Loading members…</div>
              <div v-else-if="membersError" class="error">{{ membersError }}</div>
              <div v-else class="members-list">
                <div v-for="m in channelMembers" :key="m.user_id" class="members-row">
                  <span class="name-block">
                    <span class="name">
                      {{ m.first_name }} {{ m.last_name }}
                      <span v-if="m.user_id === meId" class="you-chip">you</span>
                      <span v-if="m.is_creator" class="agency-chip">Creator</span>
                    </span>
                    <span class="status-line">{{ memberPresenceLabel(m) }}</span>
                  </span>
                  <button
                    v-if="canManageChannelMembers && m.user_id !== meId"
                    type="button"
                    class="btn btn-xs btn-danger"
                    :disabled="membersBusy"
                    @click="removeChannelMember(m.user_id)"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div v-if="canManageChannelMembers" class="invite-picker members-invite">
                <div class="invite-picker-label">Invite</div>
                <input
                  v-model="memberInviteQ"
                  class="search"
                  placeholder="Search team to invite…"
                  maxlength="80"
                />
                <div class="invite-picker-list">
                  <label
                    v-for="u in memberInviteCandidates"
                    :key="u.id"
                    class="invite-picker-row"
                  >
                    <input
                      type="checkbox"
                      :checked="memberInviteIds.includes(u.id)"
                      @change="toggleMemberInvite(u.id)"
                    />
                    <span>{{ u.first_name }} {{ u.last_name }}</span>
                  </label>
                  <div v-if="memberInviteCandidates.length === 0" class="muted">Everyone eligible is already a member.</div>
                </div>
                <button
                  type="button"
                  class="btn btn-xs btn-primary"
                  :disabled="membersBusy || memberInviteIds.length === 0"
                  @click="inviteChannelMembers"
                >
                  {{ membersBusy ? 'Working…' : `Add (${memberInviteIds.length})` }}
                </button>
              </div>

              <button
                type="button"
                class="btn btn-xs btn-secondary leave-channel-btn"
                :disabled="membersBusy"
                @click="leaveActiveChannel"
              >
                Leave channel
              </button>
            </div>

            <div class="chat-messages" ref="chatMessagesEl">
              <div v-if="chatLoading" class="muted">Loading messages…</div>
              <div v-else-if="chatError" class="error">{{ chatError }}</div>
              <div v-else-if="chatMessages.length === 0" class="muted" style="padding: 10px 2px;">
                No messages yet.
              </div>
              <div v-else class="msg-list">
                <div v-for="m in chatMessages" :key="m.id" class="msg-row" :class="{ mine: m.sender_user_id === meId }">
                  <label v-if="selectMode" class="msg-select">
                    <input type="checkbox" :checked="isSelected(m.id)" @change="toggleSelected(m.id)" />
                  </label>
                  <div class="msg" :class="{ mine: m.sender_user_id === meId }">
                  <div class="msg-meta">
                    <span class="msg-author">{{ m.sender_first_name }} {{ m.sender_last_name }}</span>
                    <span class="msg-time">
                      {{ formatTime(m.created_at) }}
                      <span v-if="m.sender_user_id === meId" class="msg-receipt">
                        {{ m.is_read_by_other ? '✓✓' : '✓' }}
                      </span>
                      <button
                        v-if="m.sender_user_id === meId && !m.is_read_by_other"
                        type="button"
                        class="msg-action"
                        @click="unsend(m)"
                        :disabled="sending"
                        title="Unsend (only before read)"
                      >
                        Unsend
                      </button>
                      <button
                        type="button"
                        class="msg-action"
                        @click="deleteForMe(m)"
                        :disabled="sending"
                        title="Delete for me"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        class="msg-action"
                        @click="openReplyPanel(m)"
                        :disabled="sending"
                        title="Reply in thread"
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        class="msg-action"
                        @click="toggleBookmark(m)"
                        :disabled="sending"
                        title="Bookmark"
                      >
                        Bookmark
                      </button>
                      <button
                        type="button"
                        class="msg-action"
                        @click="togglePin(m)"
                        :disabled="sending"
                        title="Pin in conversation"
                      >
                        Pin
                      </button>
                      <button
                        type="button"
                        class="msg-action"
                        @click="createTaskFromMessage(m)"
                        :disabled="taskBusy"
                        title="Create a personal task"
                      >
                        Task
                      </button>
                      <button
                        type="button"
                        class="msg-action"
                        @click="openCalendarFromMessage(m)"
                        title="Add to calendar"
                      >
                        Calendar
                      </button>
                    </span>
                  </div>
                  <div
                    class="msg-body"
                    :class="{ 'msg-highlight': highlightMessageId === m.id }"
                    :data-message-id="m.id"
                  >{{ m.body }}</div>
                  <div v-if="m.attachments?.length" class="msg-attachments">
                    <template v-for="a in m.attachments" :key="a.id || a.file_path">
                      <a
                        v-if="isImageAttachment(a)"
                        :href="a.file_url"
                        target="_blank"
                        rel="noopener"
                        class="msg-attach-image-link"
                      >
                        <img :src="a.file_url" :alt="a.original_filename || 'Image'" class="msg-attach-image" />
                      </a>
                      <video
                        v-else-if="isVideoAttachment(a)"
                        class="msg-attach-video"
                        :src="a.file_url"
                        controls
                        preload="metadata"
                      />
                      <a
                        v-else
                        class="msg-attach-file"
                        :href="a.file_url"
                        target="_blank"
                        rel="noopener"
                      >{{ a.original_filename || 'Attachment' }}</a>
                    </template>
                  </div>
                  <div class="msg-reactions">
                    <button
                      v-for="rx in (m.reactions || [])"
                      :key="rx.code"
                      type="button"
                      class="rx-chip"
                      :class="{ mine: rx.mineActive }"
                      :title="(rx.sampleUserNames || []).join(', ')"
                      @click="toggleReaction(m, rx.code)"
                    >
                      <img v-if="rx.iconUrl" :src="rx.iconUrl" alt="" class="rx-icon" />
                      <span v-else>{{ rx.code }}</span>
                      <span class="rx-count">{{ rx.count }}</span>
                    </button>
                    <div class="rx-add-wrap">
                      <button
                        type="button"
                        class="rx-add-btn"
                        title="Add reaction"
                        @click.stop="toggleReactionPicker(m.id)"
                      >+</button>
                      <div v-if="reactionPickerFor === m.id" class="rx-picker" @click.stop>
                        <button
                          v-for="emoji in QUICK_REACTIONS"
                          :key="emoji"
                          type="button"
                          class="rx-picker-item"
                          @click="toggleReaction(m, emoji); reactionPickerFor = null"
                        >{{ emoji }}</button>
                      </div>
                    </div>
                  </div>
                  <button
                    v-if="Number(m.reply_count) > 0"
                    type="button"
                    class="reply-count-btn"
                    @click="openReplyPanel(m)"
                  >
                    {{ m.reply_count }} {{ m.reply_count === 1 ? 'reply' : 'replies' }}
                  </button>
                  <div v-if="replyRoot?.id === m.id" class="reply-panel">
                    <div class="reply-panel-header">
                      <span class="invite-picker-label">Thread</span>
                      <button type="button" class="btn-close" @click="closeReplyPanel">×</button>
                    </div>
                    <div v-if="repliesLoading" class="muted">Loading replies…</div>
                    <div v-else class="reply-list">
                      <div v-for="r in replyMessages" :key="r.id" class="reply-item">
                        <div class="msg-meta">
                          <span class="msg-author">{{ r.sender_first_name }} {{ r.sender_last_name }}</span>
                          <span class="msg-time">{{ formatTime(r.created_at) }}</span>
                        </div>
                        <div class="msg-body">{{ r.body }}</div>
                        <div v-if="r.attachments?.length" class="msg-attachments">
                          <template v-for="a in r.attachments" :key="a.id || a.file_path">
                            <a
                              v-if="isImageAttachment(a)"
                              :href="a.file_url"
                              target="_blank"
                              rel="noopener"
                              class="msg-attach-image-link"
                            >
                              <img :src="a.file_url" :alt="a.original_filename || 'Image'" class="msg-attach-image" />
                            </a>
                            <video
                              v-else-if="isVideoAttachment(a)"
                              class="msg-attach-video"
                              :src="a.file_url"
                              controls
                              preload="metadata"
                            />
                            <a
                              v-else
                              class="msg-attach-file"
                              :href="a.file_url"
                              target="_blank"
                              rel="noopener"
                            >{{ a.original_filename || 'Attachment' }}</a>
                          </template>
                        </div>
                        <div class="msg-reactions">
                          <button
                            v-for="rx in (r.reactions || [])"
                            :key="rx.code"
                            type="button"
                            class="rx-chip"
                            :class="{ mine: rx.mineActive }"
                            @click="toggleReaction(r, rx.code)"
                          >
                            <img v-if="rx.iconUrl" :src="rx.iconUrl" alt="" class="rx-icon" />
                            <span v-else>{{ rx.code }}</span>
                            <span class="rx-count">{{ rx.count }}</span>
                          </button>
                          <div class="rx-add-wrap">
                            <button
                              type="button"
                              class="rx-add-btn"
                              title="Add reaction"
                              @click.stop="toggleReactionPicker(r.id)"
                            >+</button>
                            <div v-if="reactionPickerFor === r.id" class="rx-picker" @click.stop>
                              <button
                                v-for="emoji in QUICK_REACTIONS"
                                :key="emoji"
                                type="button"
                                class="rx-picker-item"
                                @click="toggleReaction(r, emoji); reactionPickerFor = null"
                              >{{ emoji }}</button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div v-if="!repliesLoading && replyMessages.length === 0" class="muted">No replies yet.</div>
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="chat-composer">
              <div class="composer-main">
                <div v-if="replyRoot" class="reply-composer-banner">
                  Replying to {{ replyRoot.sender_first_name }} {{ replyRoot.sender_last_name }}
                  <button type="button" class="msg-action" @click="closeReplyPanel">Cancel</button>
                </div>
                <div v-if="stagedAttachments.length" class="attach-chips">
                  <span
                    v-for="(a, idx) in stagedAttachments"
                    :key="a.filePath || idx"
                    class="attach-chip"
                  >
                    {{ a.originalFilename || a.kind || 'File' }}
                    <button type="button" class="attach-chip-x" @click="removeStagedAttachment(idx)">×</button>
                  </span>
                </div>
                <div v-if="attachError" class="error">{{ attachError }}</div>
                <div class="composer-wrap">
                  <textarea
                    v-model="draft"
                    rows="2"
                    :placeholder="replyRoot ? 'Reply… (use @ to mention)' : 'Message… (use @ to mention)'"
                    @input="onDraftInput"
                    @keydown="onDraftKeydown"
                  />
                  <div v-if="mentionSuggestions.length" class="mention-menu">
                    <button
                      v-for="(u, idx) in mentionSuggestions"
                      :key="u.id"
                      type="button"
                      class="mention-item"
                      :class="{ active: idx === mentionHighlight }"
                      @mousedown.prevent="insertMention(u)"
                    >
                      {{ u.first_name }} {{ u.last_name }}
                      <span v-if="u.username" class="muted">@{{ u.username }}</span>
                    </button>
                  </div>
                </div>
                <div class="composer-tools">
                  <label class="attach-btn" :class="{ disabled: uploadingAttach || !activeThreadId }">
                    <input
                      ref="fileInputEl"
                      type="file"
                      accept="image/gif,image/png,image/jpeg,image/jpg,image/webp,video/mp4,video/webm,video/quicktime"
                      :disabled="uploadingAttach || !activeThreadId"
                      @change="onAttachFiles"
                    />
                    {{ uploadingAttach ? 'Uploading…' : 'Attach' }}
                  </label>
                </div>
              </div>
              <button
                class="btn btn-primary"
                @click="send"
                :disabled="sending || uploadingAttach || (!draft.trim() && !stagedAttachments.length)"
              >Send</button>
            </div>
          </div>
    </section>
  </div>

  <div
    v-if="calendarModal.open"
    class="mw-modal-overlay"
    @click.self="calendarModal.open = false"
  >
    <div class="mw-modal" @click.stop>
      <div class="mw-modal-head">
        <h3>Add to calendar</h3>
        <button type="button" class="btn-close" @click="calendarModal.open = false">×</button>
      </div>
      <label class="mw-field">
        <span>Title</span>
        <input v-model="calendarModal.title" type="text" />
      </label>
      <label class="mw-field">
        <span>Start</span>
        <input v-model="calendarModal.startLocal" type="datetime-local" />
      </label>
      <label class="mw-field">
        <span>End</span>
        <input v-model="calendarModal.endLocal" type="datetime-local" />
      </label>
      <div v-if="calendarModal.error" class="error">{{ calendarModal.error }}</div>
      <div class="mw-modal-actions">
        <button type="button" class="btn btn-secondary" @click="calendarModal.open = false">Cancel</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="calendarBusy"
          @click="submitCalendarFromMessage"
        >
          {{ calendarBusy ? 'Saving…' : 'Add event' }}
        </button>
      </div>
    </div>
  </div>
  <div v-if="actionToast" class="mw-toast">{{ actionToast }}</div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { usePresenceSessionStore } from '../../store/presenceSession';
import CommunicationsHubView from '../../views/admin/CommunicationsHubView.vue';
import AskAssistantPanel from '../assistant/AskAssistantPanel.vue';
import PeerTenantMark from './PeerTenantMark.vue';
import { useBrandingStore } from '../../store/branding';
import {
  AWAY_REASONS,
  DIRECTORY_ROLE_OPTIONS,
  canToggleDirectoryAudience,
  isPrivilegedPresenceRole,
  isSchoolStaffRole,
  personOrgLabel,
  presenceDotClassForPerson,
  presenceSortRank,
  statusSubtitle
} from '../../utils/presenceStatus';
import { responsibilityFlagsLabel } from '../../utils/ticketTopics';
import { pauseIdleForSessionExtend, clearSessionExtendPause, resetActivityTimer } from '../../utils/activityTracker';

const props = defineProps({
  layout: {
    type: String,
    default: 'drawer',
    validator: (v) => ['drawer', 'page'].includes(String(v || ''))
  },
  /** `platform` = Plot Twist HQ dark shell */
  theme: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'platform'].includes(String(v || ''))
  }
});
const theme = computed(() => (props.theme === 'platform' ? 'platform' : 'default'));

const emit = defineEmits(['unread-change']);

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();
const isAuthenticated = computed(() => authStore.isAuthenticated);
const defaultBrandPrimary = computed(() => brandingStore.primaryColor || null);
const defaultBrandLogo = computed(
  () => brandingStore.getOrganizationChromeIconUrl() || brandingStore.displayLogoUrl || null
);
const defaultBrandName = computed(
  () => agencyStore.currentAgency?.name || 'Your organization'
);
const viewerMembershipsForHover = computed(() => agencyStore.userAgencies || []);
const layout = computed(() => (props.layout === 'page' ? 'page' : 'drawer'));
const isAgencyOrgType = (org) => String(org?.organization_type || org?.organizationType || 'agency').toLowerCase() === 'agency';
const isAffiliationOrgType = (org) => {
  const t = String(org?.organization_type || org?.organizationType || '').toLowerCase();
  return t === 'affiliation' || t === 'clubwebapp';
};
const isSchoolOrgType = (org) =>
  String(org?.organization_type || org?.organizationType || '').toLowerCase() === 'school';

const agencyId = computed(() => {
  const current = agencyStore.currentAgency || null;
  const role = String(authStore.user?.role || '').toLowerCase();

  // School staff: prefer school org id (DM directory is school-scoped server-side).
  if (role === 'school_staff') {
    if (current && isSchoolOrgType(current) && current.id) return current.id;
    const schoolMembership = (agencyStore.userAgencies || []).find((a) => isSchoolOrgType(a));
    if (schoolMembership?.id) return schoolMembership.id;
    const affiliated =
      Number(current?.affiliated_agency_id || 0) ||
      Number(current?.affiliatedAgencyId || 0) ||
      null;
    if (affiliated) return affiliated;
  }

  if (!current) return null;
  if (isAgencyOrgType(current)) return current?.id || null;

  // Club (affiliation) context: scope to club members only.
  if (isAffiliationOrgType(current)) return current?.id || null;

  // School/program/learning context: prefer explicit affiliated agency id.
  const affiliated =
    Number(current?.affiliated_agency_id || 0) ||
    Number(current?.affiliatedAgencyId || 0) ||
    null;
  if (affiliated) return affiliated;

  // Fallback: first agency-type org the user belongs to.
  const userAgency = (agencyStore.userAgencies || []).find((a) => isAgencyOrgType(a));
  if (userAgency?.id) return userAgency.id;
  const knownAgency = (agencyStore.agencies || []).find((a) => isAgencyOrgType(a));
  return knownAgency?.id || null;
});

const COMPOSE_AGENCY_KEY = 'pt.messages.composeAgencyId.v1';
const composeAgencyId = ref(null);
const membershipAgencies = computed(() => {
  const seen = new Map();
  for (const a of agencyStore.userAgencies || []) {
    if (!a?.id || seen.has(a.id)) continue;
    // Prefer parent agencies for compose; include affiliation/club when that is the only context.
    if (isAgencyOrgType(a) || isAffiliationOrgType(a) || isSchoolOrgType(a)) {
      seen.set(a.id, { id: a.id, name: a.name || `Agency ${a.id}` });
    }
  }
  if (!seen.size) {
    for (const a of agencyStore.agencies || []) {
      if (a?.id && !seen.has(a.id) && isAgencyOrgType(a)) {
        seen.set(a.id, { id: a.id, name: a.name || `Agency ${a.id}` });
      }
    }
  }
  return [...seen.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
});
const showComposeAgencyPicker = computed(
  () => !isSchoolStaffRole(authStore.user?.role) && membershipAgencies.value.length > 1
);
const effectiveComposeAgencyId = computed(() => {
  const compose = Number(composeAgencyId.value || 0);
  if (compose && membershipAgencies.value.some((a) => Number(a.id) === compose)) return compose;
  const app = Number(agencyId.value || 0);
  if (app) return app;
  return membershipAgencies.value[0]?.id || null;
});

function persistComposeAgency(id) {
  const n = Number(id || 0);
  if (!n) return;
  try {
    localStorage.setItem(COMPOSE_AGENCY_KEY, String(n));
  } catch {
    /* ignore */
  }
}

function ensureComposeAgency() {
  const membershipIds = new Set(membershipAgencies.value.map((a) => Number(a.id)));
  let next = Number(composeAgencyId.value || 0);
  if (!next || !membershipIds.has(next)) {
    try {
      const raw = localStorage.getItem(COMPOSE_AGENCY_KEY);
      next = raw ? Number(raw) : 0;
    } catch {
      next = 0;
    }
  }
  if (!next || !membershipIds.has(next)) {
    next = Number(agencyId.value || 0) || Number(membershipAgencies.value[0]?.id || 0) || null;
  }
  composeAgencyId.value = next || null;
  if (next) persistComposeAgency(next);
}

const presenceSession = usePresenceSessionStore();
const myRole = computed(() => authStore.user?.role || '');
const isPrivileged = computed(() => isPrivilegedPresenceRole(myRole.value));
const isAdminLike = computed(() => isPrivileged.value);
const adminsAllMode = computed(() => myRole.value === 'super_admin' && myAvailability.value === 'admins_only');
const shouldUnifyInboxes = computed(() => {
  if (isClubContext.value) return false;
  if (myRole.value === 'super_admin') return true;
  return (agencyStore.userAgencies || []).length > 1;
});
const needsAgency = computed(() => {
  if (adminsAllMode.value || shouldUnifyInboxes.value) return false;
  return !effectiveComposeAgencyId.value;
});
const listFilter = ref('all');
const audienceMode = ref('team'); // team | directory
const directoryRole = ref('school_staff');
const statusMenuOpen = ref(false);
const myHeartbeatStatus = ref('offline');
const myStatusLabel = ref(null);
const myCalendarBusy = ref(null);
const taskBusy = ref(false);
const calendarBusy = ref(false);
const startingMeeting = ref(false);
const actionToast = ref('');
let actionToastTimer = null;
const calendarModal = ref({
  open: false,
  title: '',
  startLocal: '',
  endLocal: '',
  messageId: null,
  error: ''
});

const isSchoolStaffViewer = computed(() => isSchoolStaffRole(myRole.value));
/** Clinical SMS inbox — page layout only (too heavy for the rail). */
const canSeeSms = computed(() => {
  if (layout.value !== 'page') return false;
  if (isClubContext.value) return false;
  const r = String(myRole.value || '').toLowerCase();
  return [
    'provider',
    'provider_plus',
    'staff',
    'admin',
    'support',
    'super_admin',
    'clinical_practice_assistant',
    'schedule_manager',
    'intern',
    'intern_plus'
  ].includes(r);
});
const canToggleAudience = computed(() => canToggleDirectoryAudience(myRole.value) && !isClubContext.value);
const canCreateChannel = computed(() => {
  const r = myRole.value;
  return ['admin', 'super_admin', 'support', 'staff', 'clinical_practice_assistant'].includes(r);
});
const mainTab = ref('dms');
const assistantMounted = ref(false);
const assistantPlacementKey = computed(() =>
  layout.value === 'drawer' ? 'chat_drawer_assistant' : 'messages_assistant'
);
const channels = ref([]);
const channelsLoading = ref(false);
const channelError = ref('');
const channelQ = ref('');
const activeChannel = ref(null);
const showCreateChannel = ref(false);
const newChannelName = ref('');
const newChannelDesc = ref('');
const newChannelPrivate = ref(false);
const creatingChannel = ref(false);
const createInviteIds = ref([]);
const createInviteQ = ref('');
const showMembersPanel = ref(false);
const channelMembers = ref([]);
const canManageChannelMembers = ref(false);
const membersLoading = ref(false);
const membersBusy = ref(false);
const membersError = ref('');
const memberInviteIds = ref([]);
const memberInviteQ = ref('');

const threadsInbox = ref([]);
const threadsInboxLoading = ref(false);
const threadsInboxError = ref('');
const threadsInboxQ = ref('');
const mentionsInbox = ref([]);
const mentionsInboxLoading = ref(false);
const mentionsInboxError = ref('');
const mentionsInboxQ = ref('');
const filesInbox = ref([]);
const filesInboxLoading = ref(false);
const filesInboxError = ref('');
const filesInboxQ = ref('');
const bookmarksInbox = ref([]);
const bookmarksInboxLoading = ref(false);
const bookmarksInboxError = ref('');
const bookmarksInboxQ = ref('');
const pinsInbox = ref([]);
const pinsInboxLoading = ref(false);
const pinsInboxError = ref('');
const pinsInboxQ = ref('');
const replyRoot = ref(null);
const replyMessages = ref([]);
const repliesLoading = ref(false);
const highlightMessageId = ref(null);
const mentionSuggestions = ref([]);
const mentionHighlight = ref(0);
const mentionQuery = ref('');
const stagedAttachments = ref([]);
const uploadingAttach = ref(false);
const attachError = ref('');
const fileInputEl = ref(null);
const reactionPickerFor = ref(null);

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '👏', '🙌', '💯', '⭐', '😎', '💪', '🚀'];

function isImageAttachment(a) {
  const kind = String(a?.file_kind || a?.kind || '').toLowerCase();
  const mime = String(a?.mime_type || a?.mimeType || '').toLowerCase();
  return kind === 'image' || kind === 'gif' || mime.startsWith('image/');
}

function isVideoAttachment(a) {
  const kind = String(a?.file_kind || a?.kind || '').toLowerCase();
  const mime = String(a?.mime_type || a?.mimeType || '').toLowerCase();
  return kind === 'video' || mime.startsWith('video/');
}

function removeStagedAttachment(idx) {
  stagedAttachments.value = stagedAttachments.value.filter((_, i) => i !== idx);
}

async function onAttachFiles(ev) {
  const files = Array.from(ev?.target?.files || []);
  if (ev?.target) ev.target.value = '';
  if (!files.length || !activeThreadId.value) return;
  attachError.value = '';
  uploadingAttach.value = true;
  try {
    for (const file of files.slice(0, 10)) {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await api.post(`/chat/threads/${activeThreadId.value}/attachments`, fd, {
        skipGlobalLoading: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const data = resp.data || {};
      if (data.filePath) {
        stagedAttachments.value = [
          ...stagedAttachments.value,
          {
            filePath: data.filePath,
            mimeType: data.mimeType || null,
            kind: data.kind || 'file',
            originalFilename: data.originalFilename || file.name || null,
            byteSize: data.byteSize || file.size || null
          }
        ];
      }
    }
  } catch (e) {
    attachError.value = e.response?.data?.error?.message || 'Failed to upload attachment';
  } finally {
    uploadingAttach.value = false;
  }
}

function toggleReactionPicker(messageId) {
  const id = Number(messageId);
  reactionPickerFor.value = reactionPickerFor.value === id ? null : id;
}

async function toggleReaction(message, code) {
  if (!message?.id || !code) return;
  const mid = Number(message.id);
  const existing = (message.reactions || []).find((r) => r.code === code);
  try {
    if (existing?.mineActive) {
      await api.delete(
        `/chat/messages/${mid}/reactions/${encodeURIComponent(code)}`,
        { skipGlobalLoading: true }
      );
    } else {
      await api.post(
        `/chat/messages/${mid}/reactions`,
        { code },
        { skipGlobalLoading: true }
      );
    }
    // Refresh the list that contains this message
    if (replyMessages.value.some((r) => Number(r.id) === mid)) {
      await refreshReplyPanel();
    } else {
      await loadMessages({ markRead: false, scrollToBottom: false });
    }
  } catch {
    // best-effort
  }
}

const createInviteCandidates = computed(() => {
  const q = createInviteQ.value.trim().toLowerCase();
  return (people.value || [])
    .filter((u) => Number(u.id) !== Number(meId.value))
    .filter((u) => {
      if (!q) return true;
      const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      return name.includes(q);
    })
    .slice(0, 40);
});

const memberInviteCandidates = computed(() => {
  const memberSet = new Set((channelMembers.value || []).map((m) => Number(m.user_id)));
  const q = memberInviteQ.value.trim().toLowerCase();
  return (people.value || [])
    .filter((u) => Number(u.id) !== Number(meId.value))
    .filter((u) => !memberSet.has(Number(u.id)))
    .filter((u) => {
      if (!q) return true;
      const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      return name.includes(q);
    })
    .slice(0, 40);
});

const panelSubtitle = computed(() => {
  if (mainTab.value === 'assistant') return 'Ask Assistant';
  if (mainTab.value === 'sms') return 'SMS conversations with clients';
  if (mainTab.value === 'files') return 'Shared files';
  if (mainTab.value === 'bookmarks') return 'Saved messages';
  if (mainTab.value === 'pins') return 'Pinned messages';
  if (isClubContext.value) return 'Club direct messages';
  if (isSchoolStaffViewer.value) return 'Direct messages · your schools';
  if (mainTab.value === 'channels') return 'Team channels';
  if (mainTab.value === 'threads') return 'Reply threads';
  if (mainTab.value === 'mentions') return 'Your mentions';
  if (audienceMode.value === 'directory') return 'Direct messages · other roles';
  return 'Direct messages · team employees';
});

const channelsUnreadTotal = computed(() =>
  (channels.value || []).reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0)
);
const threadsInboxUnread = computed(() =>
  (threadsInbox.value || []).reduce((sum, t) => sum + (Number(t.unread_reply_count) || 0), 0)
);
const mentionsInboxUnread = computed(() =>
  (mentionsInbox.value || []).filter((m) => !m.is_read).length
);
const filteredThreadsInbox = computed(() => {
  const q = threadsInboxQ.value.trim().toLowerCase();
  const list = threadsInbox.value || [];
  if (!q) return list;
  return list.filter((t) => {
    const hay = [
      t.root_body,
      t.latest_reply?.body,
      t.channel_name,
      t.root_sender?.first_name,
      t.root_sender?.last_name
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});
const filteredMentionsInbox = computed(() => {
  const q = mentionsInboxQ.value.trim().toLowerCase();
  const list = mentionsInbox.value || [];
  if (!q) return list;
  return list.filter((m) => {
    const hay = [m.body, m.channel_name, m.sender?.first_name, m.sender?.last_name].join(' ').toLowerCase();
    return hay.includes(q);
  });
});

const filteredChannels = computed(() => {
  const query = channelQ.value.trim().toLowerCase();
  const list = channels.value || [];
  if (!query) return list;
  return list.filter(
    (c) =>
      String(c.name || '').toLowerCase().includes(query) ||
      String(c.slug || '').toLowerCase().includes(query) ||
      String(c.description || '').toLowerCase().includes(query)
  );
});
const dmSectionTitle = computed(() => {
  if (isSchoolStaffViewer.value) return 'School contacts';
  if (audienceMode.value === 'directory') {
    const opt = DIRECTORY_ROLE_OPTIONS.find((o) => o.id === directoryRole.value);
    return opt ? opt.label : 'Directory';
  }
  return 'Team';
});
const searchPlaceholder = computed(() => {
  if (isClubContext.value) return 'Search club members…';
  if (isSchoolStaffViewer.value) return 'Search your schools…';
  if (audienceMode.value === 'directory') return 'Search directory…';
  return 'Search team…';
});
const emptyDirectoryMessage = computed(() => {
  if (isClubContext.value) return 'No club members found.';
  if (isSchoolStaffViewer.value) return 'No contacts at your schools yet.';
  if (audienceMode.value === 'directory') return 'No users in this role directory.';
  return 'No team employees to show.';
});
const isClubContext = computed(() => {
  const current = agencyStore.currentAgency || null;
  return !!current && isAffiliationOrgType(current);
});

const people = ref([]);
const threads = ref([]);
let pollTimer = null;

const loading = ref(false);
const error = ref('');
const q = ref('');

const myAvailability = ref(null);

const activeChatUser = ref(null);
const activeThreadId = ref(null);
const activeThreadAgencyId = ref(null);
const chatMessages = ref([]);
const chatLoading = ref(false);
const chatError = ref('');
const draft = ref('');
const sending = ref(false);
const chatMessagesEl = ref(null);
const selectMode = ref(false);
const selectedMessageIds = ref([]);

const meId = computed(() => authStore.user?.id);

const hasActiveChat = computed(() => !!(activeChatUser.value || activeChannel.value));
const pageMobileShowChat = computed(() => layout.value === 'page' && hasActiveChat.value);

const totalUnread = computed(() => {
  const dm = (threads.value || []).reduce((sum, t) => sum + (t.unread_count || 0), 0);
  const ch = (channels.value || []).reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0);
  return dm + ch;
});

const loggedInNow = computed(() => {
  if (needsAgency.value) return 0;
  return (people.value || []).filter((u) => u.status === 'online' || u.status === 'idle').length;
});

watch(totalUnread, (n) => emit('unread-change', { totalUnread: n, loggedInNow: loggedInNow.value }), { immediate: true });
watch(loggedInNow, (n) => emit('unread-change', { totalUnread: totalUnread.value, loggedInNow: n }));

const shouldLoadAllThreads = shouldUnifyInboxes;

const agenciesForLabel = computed(() => {
  const map = new Map();
  const put = (a) => {
    const id = Number(a?.id);
    const name = String(a?.name || '').trim();
    if (!id || !name) return;
    map.set(id, name);
  };
  for (const a of agencyStore.agencies || []) put(a);
  for (const a of agencyStore.userAgencies || []) put(a);
  put(agencyStore.currentAgency);
  // Also learn names from loaded threads / presence so HQ chips never show bare IDs.
  for (const t of threads.value || []) {
    const id = Number(t?.agency_id);
    const name = String(t?.agency_name || '').trim();
    if (id && name) map.set(id, name);
  }
  for (const u of people.value || []) {
    for (const m of u?.shared_agency_memberships || []) {
      const id = Number(m?.id);
      const name = String(m?.name || '').trim();
      if (id && name && !/^Agency\s+\d+$/i.test(name)) map.set(id, name);
    }
  }
  return map;
});

function tenantLabelForAgencyId(agencyId, fallbackName = '') {
  const id = Number(agencyId);
  if (!id) return '';
  const fromMap = agenciesForLabel.value.get(id);
  if (fromMap) return fromMap;
  const fromFallback = String(fallbackName || '').trim();
  if (fromFallback && !/^Agency\s+\d+$/i.test(fromFallback)) return fromFallback;
  return '';
}

const pendingThreads = computed(() => {
  const list = (threads.value || []).filter((t) => (t.unread_count || 0) > 0 && t.other_participant);
  const enriched = list.map((t) => ({
    ...t,
    agencyLabel: tenantLabelForAgencyId(t.agency_id, t.agency_name)
  }));
  return enriched.slice(0, 12);
});

const filteredPeople = computed(() => {
  const query = q.value.trim().toLowerCase();
  const list = people.value || [];
  if (!query) return list;
  return list.filter((u) => (`${u.first_name} ${u.last_name}`.toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query)));
});

const unreadByUserId = computed(() => {
  const map = new Map();
  for (const t of (threads.value || [])) {
    const other = t.other_participant;
    if (!other) continue;
    map.set(other.id, (map.get(other.id) || 0) + (t.unread_count || 0));
  }
  return map;
});

const peopleWithUnread = computed(() => {
  return (filteredPeople.value || []).map((u) => ({
    ...u,
    unreadCount: unreadByUserId.value.get(u.id) || 0
  }));
});

const presenceByUserId = computed(() => {
  const map = new Map();
  for (const u of people.value || []) {
    map.set(u.id, u);
  }
  return map;
});

const myDisplayName = computed(() => {
  const u = authStore.user;
  if (!u) return 'You';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'You';
});

const myStatusDisplay = computed(() => {
  // Self may see rich Away labels (Out for Meal). Peers never do.
  if (myHeartbeatStatus.value === 'idle') {
    return myStatusLabel.value || presenceSession.myStatusLabel || 'Idle';
  }
  if (myStatusLabel.value) return myStatusLabel.value;
  if (presenceSession.myStatusLabel) return presenceSession.myStatusLabel;
  if (myHeartbeatStatus.value === 'online') return 'Active';
  return 'Inactive';
});

const myPresenceDotClass = computed(() =>
  presenceDotClassForPerson({
    status: myHeartbeatStatus.value,
    calendar_busy: myCalendarBusy.value,
    status_label: myStatusDisplay.value,
    presence_display_label: myStatusDisplay.value
  })
);

const dmPeerUserId = computed(() => {
  if (activeChannel.value) return null;
  const id = Number(activeChatUser.value?.id || 0);
  if (!id || id === Number(meId.value)) return null;
  return id;
});

const canStartVideoMeeting = computed(() => {
  const r = String(myRole.value || '').toLowerCase();
  return [
    'admin',
    'super_admin',
    'support',
    'staff',
    'provider',
    'provider_plus',
    'supervisor',
    'clinical_practice_assistant'
  ].includes(r);
});

const canStartHuddle = computed(() => String(myRole.value || '').toLowerCase() === 'provider_plus');

function showActionToast(msg) {
  actionToast.value = msg;
  if (actionToastTimer) clearTimeout(actionToastTimer);
  actionToastTimer = setTimeout(() => {
    actionToast.value = '';
  }, 2800);
}

function toDatetimeLocalValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** DM list: Active → Idle → Inactive (includes self). */
const dmList = computed(() => {
  let list = [...(peopleWithUnread.value || [])];
  if (listFilter.value === 'online') list = list.filter((u) => u.status === 'online');
  else if (listFilter.value === 'away') list = list.filter((u) => u.status === 'idle');
  else if (listFilter.value === 'offline') list = list.filter((u) => u.status === 'offline');
  list.sort((a, b) => {
    const rank = presenceSortRank(a.status) - presenceSortRank(b.status);
    if (rank !== 0) return rank;
    const an = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
    const bn = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
    return an.localeCompare(bn);
  });
  return list;
});

function presencePersonForId(userId) {
  return presenceByUserId.value.get(userId) || null;
}

/** Hover: role access vs responsibility flags (billing/payroll/credentialing). */
function personHoverTitle(person) {
  if (!person) return '';
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
  const role = String(person.role || '').replace(/_/g, ' ');
  const flags = responsibilityFlagsLabel(person);
  const parts = [name, role].filter(Boolean);
  if (flags) parts.push(`Responsibility: ${flags}`);
  return parts.join(' · ');
}

function dotClassForUserId(userId) {
  return presenceDotClassForPerson(presencePersonForId(userId));
}

function subtitleForUserId(userId) {
  const u = presencePersonForId(userId);
  return u ? statusSubtitle(u) : 'Inactive';
}

const myPresencePerson = computed(() => {
  const fromList = presencePersonForId(meId.value);
  if (fromList) return fromList;
  return {
    id: meId.value,
    first_name: authStore.user?.first_name,
    last_name: authStore.user?.last_name,
    shared_agency_memberships: []
  };
});

const activeChatPresencePerson = computed(() => {
  if (!activeChatUser.value?.id) return activeChatUser.value;
  return presencePersonForId(activeChatUser.value.id) || activeChatUser.value;
});

const loadPresence = async () => {
  try {
    loading.value = true;
    error.value = '';
    if (adminsAllMode.value) {
      const resp = await api.get('/presence/admins', { skipGlobalLoading: true });
      people.value = resp.data || [];
    } else {
      const presenceAgencyId = effectiveComposeAgencyId.value;
      if (!presenceAgencyId) {
        people.value = [];
        return;
      }
      const params = {};
      if (isSchoolStaffViewer.value) {
        params.audience = 'school';
      } else if (canToggleAudience.value && audienceMode.value === 'directory') {
        params.audience = 'directory';
        params.role = directoryRole.value || 'school_staff';
      } else {
        params.audience = 'team';
      }
      const resp = await api.get(`/presence/agency/${presenceAgencyId}`, {
        params,
        skipGlobalLoading: true
      });
      people.value = resp.data || [];
    }
  } catch {
    error.value = 'Failed to load presence';
    people.value = [];
  } finally {
    loading.value = false;
  }
};

const setAudienceMode = async (mode) => {
  audienceMode.value = mode === 'directory' ? 'directory' : 'team';
  await loadPresence();
};

const setDirectoryRole = async (roleId) => {
  directoryRole.value = roleId;
  audienceMode.value = 'directory';
  await loadPresence();
};

const loadThreads = async () => {
  try {
    const params = {};
    if (!shouldLoadAllThreads.value) {
      if (!agencyId.value) {
        threads.value = [];
        return;
      }
      params.agencyId = agencyId.value;
    }
    const resp = await api.get('/chat/threads', { params, skipGlobalLoading: true });
    threads.value = resp.data || [];
  } catch {
    // ignore
  }
};

const loadChannels = async () => {
  if (isSchoolStaffViewer.value || isClubContext.value) {
    channels.value = [];
    return;
  }
  const channelAgencyId = effectiveComposeAgencyId.value;
  if (!channelAgencyId) {
    channels.value = [];
    return;
  }
  try {
    channelsLoading.value = true;
    channelError.value = '';
    const resp = await api.get('/chat/channels', {
      params: { agencyId: channelAgencyId },
      skipGlobalLoading: true
    });
    channels.value = resp.data?.channels || [];
  } catch (e) {
    channelError.value = e.response?.data?.error?.message || 'Failed to load channels';
    channels.value = [];
  } finally {
    channelsLoading.value = false;
  }
};

const onComposeAgencyChange = async () => {
  persistComposeAgency(composeAgencyId.value);
  const jobs = [loadPresence()];
  if (mainTab.value === 'channels') jobs.push(loadChannels());
  await Promise.all(jobs);
};

const switchToDms = () => {
  mainTab.value = 'dms';
  if (activeChannel.value) closeChat();
  closeReplyPanel();
};

const switchToChannels = async () => {
  mainTab.value = 'channels';
  if (activeChatUser.value) closeChat();
  closeReplyPanel();
  await loadChannels();
};

const switchToThreadsInbox = async () => {
  mainTab.value = 'threads';
  if (activeChatUser.value) closeChat();
  closeReplyPanel();
  await loadThreadsInbox();
};

const switchToMentionsInbox = async () => {
  mainTab.value = 'mentions';
  if (activeChatUser.value) closeChat();
  closeReplyPanel();
  await loadMentionsInbox();
};

const switchToSms = async () => {
  if (!canSeeSms.value) return;
  mainTab.value = 'sms';
  if (activeChatUser.value) closeChat();
  if (activeChannel.value) closeChat();
  closeReplyPanel();
  // Deep-link support: /messages?tab=sms
  try {
    if (String(route.query?.tab || '') !== 'sms' && layout.value === 'page') {
      router.replace({ query: { ...route.query, tab: 'sms' } }).catch(() => {});
    }
  } catch {
    // ignore
  }
};

const switchToAssistant = () => {
  assistantMounted.value = true;
  mainTab.value = 'assistant';
  if (activeChatUser.value) closeChat();
  if (activeChannel.value) closeChat();
  closeReplyPanel();
  try {
    if (layout.value === 'page' && String(route.query?.tab || '') !== 'assistant') {
      router.replace({ query: { ...route.query, view: 'workspace', tab: 'assistant' } }).catch(() => {});
    }
  } catch {
    // ignore
  }
};

watch(mainTab, (tab) => {
  if (layout.value !== 'page') return;
  const qTab = String(route.query?.tab || '');
  if (tab === 'sms' || tab === 'assistant') return;
  if (qTab !== 'sms' && qTab !== 'assistant') return;
  const q = { ...route.query };
  delete q.tab;
  delete q.clientId;
  delete q.contactId;
  router.replace({ path: route.path, query: q }).catch(() => {});
});

const loadFilesInbox = async () => {
  try {
    filesInboxLoading.value = true;
    filesInboxError.value = '';
    const resp = await api.get('/chat/inbox/files', { skipGlobalLoading: true });
    filesInbox.value = Array.isArray(resp.data?.files) ? resp.data.files : [];
  } catch (e) {
    filesInboxError.value = e?.response?.data?.error?.message || 'Failed to load files';
    filesInbox.value = [];
  } finally {
    filesInboxLoading.value = false;
  }
};

const loadBookmarksInbox = async () => {
  try {
    bookmarksInboxLoading.value = true;
    bookmarksInboxError.value = '';
    const resp = await api.get('/chat/inbox/bookmarks', { skipGlobalLoading: true });
    bookmarksInbox.value = Array.isArray(resp.data?.bookmarks) ? resp.data.bookmarks : [];
  } catch (e) {
    bookmarksInboxError.value = e?.response?.data?.error?.message || 'Failed to load bookmarks';
    bookmarksInbox.value = [];
  } finally {
    bookmarksInboxLoading.value = false;
  }
};

const loadPinsInbox = async () => {
  try {
    pinsInboxLoading.value = true;
    pinsInboxError.value = '';
    const resp = await api.get('/chat/inbox/pins', { skipGlobalLoading: true });
    pinsInbox.value = Array.isArray(resp.data?.pins) ? resp.data.pins : [];
  } catch (e) {
    pinsInboxError.value = e?.response?.data?.error?.message || 'Failed to load pins';
    pinsInbox.value = [];
  } finally {
    pinsInboxLoading.value = false;
  }
};

const switchToFilesInbox = async () => {
  mainTab.value = 'files';
  closeReplyPanel();
  await loadFilesInbox();
};

const switchToBookmarksInbox = async () => {
  mainTab.value = 'bookmarks';
  closeReplyPanel();
  await loadBookmarksInbox();
};

const switchToPinsInbox = async () => {
  mainTab.value = 'pins';
  closeReplyPanel();
  await loadPinsInbox();
};

watch(
  () => route.query?.tab,
  async (tab) => {
    const t = String(tab || '').toLowerCase();
    if (!t || layout.value !== 'page') return;
    if (t === 'assistant') {
      if (mainTab.value !== 'assistant') switchToAssistant();
      return;
    }
    if (t === 'sms' && canSeeSms.value) {
      if (mainTab.value !== 'sms') await switchToSms();
      return;
    }
    if (t === 'mentions' && !isSchoolStaffViewer.value) {
      if (mainTab.value !== 'mentions') await switchToMentionsInbox();
      return;
    }
    if (t === 'files') {
      if (mainTab.value !== 'files') await switchToFilesInbox();
      return;
    }
    if (t === 'dms' || t === 'channels' || t === 'threads') {
      mainTab.value = t === 'dms' ? 'dms' : t;
    }
  },
  { immediate: true }
);

defineExpose({ switchToAssistant, switchToDms });

const filteredFilesInbox = computed(() => {
  const q = filesInboxQ.value.trim().toLowerCase();
  const list = filesInbox.value || [];
  if (!q) return list;
  return list.filter((f) =>
    `${f.original_filename || ''} ${f.channel_name || ''} ${f.sender?.first_name || ''} ${f.sender?.last_name || ''}`
      .toLowerCase()
      .includes(q)
  );
});

const filteredBookmarksInbox = computed(() => {
  const q = bookmarksInboxQ.value.trim().toLowerCase();
  const list = bookmarksInbox.value || [];
  if (!q) return list;
  return list.filter((b) =>
    `${b.body || ''} ${b.channel_name || ''} ${b.sender?.first_name || ''} ${b.sender?.last_name || ''}`
      .toLowerCase()
      .includes(q)
  );
});

const filteredPinsInbox = computed(() => {
  const q = pinsInboxQ.value.trim().toLowerCase();
  const list = pinsInbox.value || [];
  if (!q) return list;
  return list.filter((p) =>
    `${p.body || ''} ${p.channel_name || ''} ${p.sender?.first_name || ''} ${p.sender?.last_name || ''}`
      .toLowerCase()
      .includes(q)
  );
});

const openInboxFile = async (item) => {
  await openConversationByThreadId({
    threadId: item.thread_id,
    threadType: item.thread_type,
    channelName: item.channel_name,
    focusMessageId: item.message_id
  });
};

const openInboxBookmarkOrPin = async (item) => {
  await openConversationByThreadId({
    threadId: item.thread_id,
    threadType: item.thread_type,
    channelName: item.channel_name,
    focusMessageId: item.message_id
  });
};

const toggleBookmark = async (m) => {
  if (!m?.id) return;
  try {
    const isBookmarked = (bookmarksInbox.value || []).some((b) => Number(b.message_id) === Number(m.id));
    if (isBookmarked) {
      await api.delete(`/chat/messages/${m.id}/bookmark`, { skipGlobalLoading: true });
    } else {
      await api.post(`/chat/messages/${m.id}/bookmark`, {}, { skipGlobalLoading: true });
    }
    if (mainTab.value === 'bookmarks') await loadBookmarksInbox();
  } catch {
    // best-effort
  }
};

const togglePin = async (m) => {
  if (!m?.id) return;
  try {
    const isPinned = (pinsInbox.value || []).some((p) => Number(p.message_id) === Number(m.id));
    if (isPinned) {
      await api.delete(`/chat/messages/${m.id}/pin`, { skipGlobalLoading: true });
    } else {
      await api.post(`/chat/messages/${m.id}/pin`, {}, { skipGlobalLoading: true });
    }
    if (mainTab.value === 'pins') await loadPinsInbox();
  } catch {
    // best-effort
  }
};

const createTaskFromMessage = async (m) => {
  if (!m?.id || taskBusy.value) return;
  const bodyText = String(m.body || '').trim();
  const title = truncateText(bodyText || 'Message follow-up', 80);
  taskBusy.value = true;
  try {
    await api.post('/me/tasks', {
      title,
      description: `From Messages thread #${activeThreadId.value || ''} message #${m.id}\n\n${bodyText}`.slice(0, 4000),
      agencyId: activeThreadAgencyId.value || agencyId.value || undefined,
      metadata: {
        source: 'messages',
        messageId: m.id,
        threadId: activeThreadId.value || null
      }
    }, { skipGlobalLoading: true });
    showActionToast('Task created');
  } catch (e) {
    showActionToast(e?.response?.data?.error?.message || 'Could not create task');
  } finally {
    taskBusy.value = false;
  }
};

const openCalendarFromMessage = (m) => {
  if (!m?.id) return;
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  calendarModal.value = {
    open: true,
    title: truncateText(String(m.body || '').trim() || 'Follow-up', 80),
    startLocal: toDatetimeLocalValue(start),
    endLocal: toDatetimeLocalValue(end),
    messageId: m.id,
    error: ''
  };
};

const submitCalendarFromMessage = async () => {
  if (!meId.value || calendarBusy.value) return;
  const start = fromDatetimeLocalValue(calendarModal.value.startLocal);
  const end = fromDatetimeLocalValue(calendarModal.value.endLocal);
  if (!start || !end || end <= start) {
    calendarModal.value.error = 'Choose a valid start and end time';
    return;
  }
  const title = String(calendarModal.value.title || '').trim() || 'Follow-up';
  calendarBusy.value = true;
  calendarModal.value.error = '';
  try {
    await api.post(`/users/${meId.value}/schedule-events`, {
      kind: 'PERSONAL_EVENT',
      title,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      agencyId: activeThreadAgencyId.value || agencyId.value || undefined,
      allowLocalOnly: true,
      description: `From Messages message #${calendarModal.value.messageId || ''} thread #${activeThreadId.value || ''}`
    }, { skipGlobalLoading: true });
    calendarModal.value.open = false;
    showActionToast('Added to calendar');
  } catch (e) {
    calendarModal.value.error = e?.response?.data?.error?.message || 'Could not add calendar event';
  } finally {
    calendarBusy.value = false;
  }
};

const startVideoMeeting = async (kind = 'TEAM_MEETING') => {
  if (!activeThreadId.value || !dmPeerUserId.value || startingMeeting.value) return;
  startingMeeting.value = true;
  try {
    const resp = await api.post(
      `/chat/threads/${activeThreadId.value}/start-meeting`,
      { kind },
      { skipGlobalLoading: true }
    );
    const joinUrl = resp.data?.joinUrl;
    const eventId = resp.data?.eventId;
    await loadMessages();
    if (joinUrl) {
      window.open(joinUrl, '_blank', 'noopener');
    } else if (eventId) {
      router.push(`/join/team-meeting/${eventId}`);
    }
    showActionToast(kind === 'HUDDLE' ? 'Huddle started' : 'Video meeting started');
  } catch (e) {
    showActionToast(e?.response?.data?.error?.message || 'Could not start meeting');
  } finally {
    startingMeeting.value = false;
  }
};

function truncateText(text, max = 60) {
  const s = String(text || '').trim();
  if (!s) return '—';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function inboxThreadTitle(item) {
  if (item?.channel_name) return `#${item.channel_name}`;
  const s = item?.root_sender;
  if (s) return `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Thread';
  return 'Thread';
}

function inboxThreadPreview(item) {
  const latest = item?.latest_reply;
  if (latest?.body) {
    const who = `${latest.sender?.first_name || ''}`.trim();
    return `${who ? `${who}: ` : ''}${truncateText(latest.body, 55)}`;
  }
  return truncateText(item?.root_body, 55);
}

const loadThreadsInbox = async () => {
  if (isSchoolStaffViewer.value || isClubContext.value) {
    threadsInbox.value = [];
    return;
  }
  try {
    threadsInboxLoading.value = true;
    threadsInboxError.value = '';
    const params = {};
    if (!shouldUnifyInboxes.value && effectiveComposeAgencyId.value) {
      params.agencyId = effectiveComposeAgencyId.value;
    }
    const resp = await api.get('/chat/inbox/threads', { params, skipGlobalLoading: true });
    threadsInbox.value = resp.data?.items || [];
  } catch (e) {
    threadsInboxError.value = e.response?.data?.error?.message || 'Failed to load threads';
    threadsInbox.value = [];
  } finally {
    threadsInboxLoading.value = false;
  }
};

const loadMentionsInbox = async () => {
  if (isSchoolStaffViewer.value || isClubContext.value) {
    mentionsInbox.value = [];
    return;
  }
  try {
    mentionsInboxLoading.value = true;
    mentionsInboxError.value = '';
    const params = {};
    if (!shouldUnifyInboxes.value && effectiveComposeAgencyId.value) {
      params.agencyId = effectiveComposeAgencyId.value;
    }
    const resp = await api.get('/chat/inbox/mentions', { params, skipGlobalLoading: true });
    mentionsInbox.value = resp.data?.items || [];
  } catch (e) {
    mentionsInboxError.value = e.response?.data?.error?.message || 'Failed to load mentions';
    mentionsInbox.value = [];
  } finally {
    mentionsInboxLoading.value = false;
  }
};

const openReplyPanel = async (rootMsg) => {
  if (!rootMsg?.id || !activeThreadId.value) return;
  replyRoot.value = rootMsg;
  try {
    repliesLoading.value = true;
    const resp = await api.get(`/chat/threads/${activeThreadId.value}/messages`, {
      params: { parentMessageId: rootMsg.id, limit: 100 },
      skipGlobalLoading: true
    });
    replyMessages.value = resp.data || [];
  } catch {
    replyMessages.value = [];
  } finally {
    repliesLoading.value = false;
  }
};

const closeReplyPanel = () => {
  replyRoot.value = null;
  replyMessages.value = [];
  repliesLoading.value = false;
  mentionSuggestions.value = [];
};

const refreshReplyPanel = async () => {
  if (replyRoot.value?.id) await openReplyPanel(replyRoot.value);
};

async function openConversationByThreadId({
  threadId,
  agencyId: aid,
  threadType,
  channelName,
  focusRootId = null,
  focusMessageId = null
}) {
  if (!threadId) return;
  chatError.value = '';
  chatMessages.value = [];
  draft.value = '';
  activeChatUser.value = null;
  activeChannel.value = null;
  try {
    chatLoading.value = true;
    activeThreadId.value = threadId;
    activeThreadAgencyId.value = aid || agencyId.value;
    if (String(threadType || '').toLowerCase() === 'channel') {
      activeChannel.value = {
        thread_id: threadId,
        agency_id: aid || agencyId.value,
        name: channelName || 'channel',
        thread_type: 'channel'
      };
    } else {
      // DM / group — show as chat without channel chrome
      activeChatUser.value = { first_name: 'Conversation', last_name: '', id: null };
    }
    await loadMessages({ markRead: true, scrollToBottom: !focusMessageId });
    if (focusRootId) {
      const root = (chatMessages.value || []).find((m) => Number(m.id) === Number(focusRootId));
      if (root) await openReplyPanel(root);
    }
    if (focusMessageId) {
      highlightMessageId.value = Number(focusMessageId);
      await nextTick();
      const el = chatMessagesEl.value?.querySelector?.(`[data-message-id="${focusMessageId}"]`);
      if (el?.scrollIntoView) el.scrollIntoView({ block: 'center' });
      window.setTimeout(() => {
        if (highlightMessageId.value === Number(focusMessageId)) highlightMessageId.value = null;
      }, 2500);
    }
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to open conversation';
  } finally {
    chatLoading.value = false;
  }
}

const openInboxThread = async (item) => {
  await openConversationByThreadId({
    threadId: item.thread_id,
    agencyId: item.agency_id,
    threadType: item.thread_type,
    channelName: item.channel_name,
    focusRootId: item.root_message_id
  });
};

const openInboxMention = async (item) => {
  const rootId = item.parent_message_id || item.message_id;
  await openConversationByThreadId({
    threadId: item.thread_id,
    agencyId: item.agency_id,
    threadType: item.thread_type,
    channelName: item.channel_name,
    focusRootId: item.parent_message_id || null,
    focusMessageId: item.message_id
  });
  // If mention is a reply, ensure reply panel is on its root
  if (item.parent_message_id) {
    const root = (chatMessages.value || []).find((m) => Number(m.id) === Number(rootId));
    if (root) await openReplyPanel(root);
  }
};

function mentionCandidates() {
  // Prefer team presence list; fall back to empty.
  return (people.value || []).filter((u) => Number(u.id) !== Number(meId.value));
}

function onDraftInput() {
  const text = draft.value || '';
  const m = text.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
  if (!m) {
    mentionSuggestions.value = [];
    mentionQuery.value = '';
    return;
  }
  const q = String(m[1] || '').toLowerCase();
  mentionQuery.value = q;
  mentionSuggestions.value = mentionCandidates()
    .filter((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      const un = String(u.username || '').toLowerCase();
      return !q || name.includes(q) || un.includes(q);
    })
    .slice(0, 6);
  mentionHighlight.value = 0;
}

function onDraftKeydown(e) {
  if (!mentionSuggestions.value.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    mentionHighlight.value = (mentionHighlight.value + 1) % mentionSuggestions.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    mentionHighlight.value =
      (mentionHighlight.value - 1 + mentionSuggestions.value.length) % mentionSuggestions.value.length;
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    insertMention(mentionSuggestions.value[mentionHighlight.value]);
  } else if (e.key === 'Escape') {
    mentionSuggestions.value = [];
  }
}

function insertMention(u) {
  if (!u) return;
  const label = u.username
    ? `@${u.username}`
    : `@${String(u.first_name || '').trim()} ${String(u.last_name || '').trim()}`.trim();
  const text = draft.value || '';
  draft.value = text.replace(/(?:^|\s)@[a-zA-Z0-9._-]*$/, (match) => {
    const lead = match.startsWith(' ') || match.startsWith('\n') ? match[0] : '';
    return `${lead}${label} `;
  });
  if (!draft.value.includes(label)) {
    draft.value = `${text.replace(/@[a-zA-Z0-9._-]*$/, '')}${label} `;
  }
  mentionSuggestions.value = [];
  mentionQuery.value = '';
}

function channelPreview(ch) {
  const body = String(ch?.last_message?.body || '').trim();
  if (body) return body.length > 60 ? `${body.slice(0, 60)}…` : body;
  if (ch?.description) return ch.description;
  if (ch?.kind === 'general') return 'Organization-wide';
  if (ch?.kind === 'school') return 'School team channel';
  return 'No messages yet';
}

const openChannelThread = async (ch) => {
  if (!ch?.thread_id) return;
  chatError.value = '';
  channelError.value = '';
  chatMessages.value = [];
  draft.value = '';
  activeChatUser.value = null;
  try {
    chatLoading.value = true;
    const resp = await api.post(`/chat/channels/${ch.thread_id}/open`, {}, { skipGlobalLoading: true });
    activeThreadId.value = resp.data?.threadId || ch.thread_id;
    activeThreadAgencyId.value = resp.data?.agencyId || ch.agency_id || agencyId.value;
    activeChannel.value = resp.data?.channel || ch;
    await loadMessages({ markRead: true, scrollToBottom: true });
    await loadChannels();
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to open channel';
  } finally {
    chatLoading.value = false;
  }
};

const onTogglePrivateCreate = async () => {
  if (newChannelPrivate.value) {
    // Ensure team presence list is available for invite picker.
    if (audienceMode.value !== 'team') audienceMode.value = 'team';
    await loadPresence();
  }
};

function toggleCreateInvite(userId) {
  const id = Number(userId);
  const cur = createInviteIds.value || [];
  createInviteIds.value = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
}

function toggleMemberInvite(userId) {
  const id = Number(userId);
  const cur = memberInviteIds.value || [];
  memberInviteIds.value = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
}

function memberPresenceLabel(m) {
  const p = m?.presence || {};
  const s = String(p.status || '').toLowerCase();
  if (s === 'online' || s === 'active') return 'Active';
  if (s === 'idle' || s === 'away') return 'Idle';
  if (s === 'offline' || s === 'inactive') return 'Inactive';
  // Never surface legacy Team Board / meal display_label to peers.
  return 'Inactive';
}

const loadChannelMembers = async () => {
  const threadId = activeChannel.value?.thread_id || activeThreadId.value;
  if (!threadId) {
    channelMembers.value = [];
    return;
  }
  try {
    membersLoading.value = true;
    membersError.value = '';
    const resp = await api.get(`/chat/channels/${threadId}/members`, { skipGlobalLoading: true });
    channelMembers.value = resp.data?.members || [];
    canManageChannelMembers.value = Boolean(resp.data?.canManage);
  } catch (e) {
    membersError.value = e.response?.data?.error?.message || 'Failed to load members';
    channelMembers.value = [];
    canManageChannelMembers.value = false;
  } finally {
    membersLoading.value = false;
  }
};

const toggleMembersPanel = async () => {
  showMembersPanel.value = !showMembersPanel.value;
  if (showMembersPanel.value) {
    if (audienceMode.value !== 'team') audienceMode.value = 'team';
    await Promise.all([loadChannelMembers(), loadPresence()]);
  }
};

const inviteChannelMembers = async () => {
  const threadId = activeChannel.value?.thread_id || activeThreadId.value;
  if (!threadId || !memberInviteIds.value.length) return;
  try {
    membersBusy.value = true;
    membersError.value = '';
    await api.post(
      `/chat/channels/${threadId}/members`,
      { userIds: memberInviteIds.value },
      { skipGlobalLoading: true }
    );
    memberInviteIds.value = [];
    await loadChannelMembers();
    await loadChannels();
  } catch (e) {
    membersError.value = e.response?.data?.error?.message || 'Failed to invite members';
  } finally {
    membersBusy.value = false;
  }
};

const removeChannelMember = async (userId) => {
  const threadId = activeChannel.value?.thread_id || activeThreadId.value;
  if (!threadId || !userId) return;
  try {
    membersBusy.value = true;
    membersError.value = '';
    await api.delete(`/chat/channels/${threadId}/members/${userId}`, { skipGlobalLoading: true });
    await loadChannelMembers();
    await loadChannels();
  } catch (e) {
    membersError.value = e.response?.data?.error?.message || 'Failed to remove member';
  } finally {
    membersBusy.value = false;
  }
};

const leaveActiveChannel = async () => {
  const threadId = activeChannel.value?.thread_id || activeThreadId.value;
  if (!threadId) return;
  try {
    membersBusy.value = true;
    membersError.value = '';
    await api.post(`/chat/channels/${threadId}/leave`, {}, { skipGlobalLoading: true });
    showMembersPanel.value = false;
    channelMembers.value = [];
    closeChat();
    await loadChannels();
  } catch (e) {
    membersError.value = e.response?.data?.error?.message || 'Failed to leave channel';
  } finally {
    membersBusy.value = false;
  }
};

const createNewChannel = async () => {
  const name = newChannelName.value.trim();
  const channelAgencyId = effectiveComposeAgencyId.value;
  if (!name || !channelAgencyId) return;
  try {
    creatingChannel.value = true;
    channelError.value = '';
    const body = {
      agencyId: channelAgencyId,
      name,
      description: newChannelDesc.value.trim() || null,
      visibility: newChannelPrivate.value ? 'private' : 'public'
    };
    if (newChannelPrivate.value && createInviteIds.value.length) {
      body.memberUserIds = [...createInviteIds.value];
    }
    const resp = await api.post('/chat/channels', body, { skipGlobalLoading: true });
    showCreateChannel.value = false;
    newChannelName.value = '';
    newChannelDesc.value = '';
    newChannelPrivate.value = false;
    createInviteIds.value = [];
    createInviteQ.value = '';
    await loadChannels();
    if (resp.data?.channel) await openChannelThread(resp.data.channel);
  } catch (e) {
    channelError.value = e.response?.data?.error?.message || 'Failed to create channel';
  } finally {
    creatingChannel.value = false;
  }
};

const openChat = async (u, agencyIdOverride = null, organizationIdOverride = null) => {
  chatError.value = '';
  chatMessages.value = [];
  draft.value = '';
  activeChannel.value = null;
  mainTab.value = 'dms';

  try {
    chatLoading.value = true;
    const useAgencyId = agencyIdOverride || effectiveComposeAgencyId.value || agencyId.value;
    if (!useAgencyId) {
      // In super-admin "admins-only" mode there may be no agency context.
      // Don't open the full chat box in that case (it creates a large empty panel).
      chatError.value = 'Select an agency to start a chat';
      activeChatUser.value = null;
      activeThreadId.value = null;
      activeThreadAgencyId.value = null;
      chatMessages.value = [];
      return;
    }

    activeChatUser.value = u;
    activeThreadAgencyId.value = useAgencyId;
    const body = { agencyId: useAgencyId, otherUserId: u.id };
    const oid =
      organizationIdOverride != null && organizationIdOverride !== ''
        ? parseInt(organizationIdOverride, 10)
        : null;
    if (oid) body.organizationId = oid;
    const resp = await api.post('/chat/threads/direct', body, { skipGlobalLoading: true });
    activeThreadId.value = resp.data.threadId;
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to open chat';
  } finally {
    chatLoading.value = false;
  }
};

const openThread = async (t) => {
  if (String(t?.thread_type || '') === 'channel') {
    mainTab.value = 'channels';
    await openChannelThread({
      thread_id: t.thread_id,
      agency_id: t.agency_id,
      name: t.channel_name || t.thread_label || t.channel_slug || 'channel',
      slug: t.channel_slug,
      unread_count: t.unread_count
    });
    return;
  }
  if (!t?.other_participant) return;
  await openChat(t.other_participant, t.agency_id, t.organization_id);
};

/** Open a direct thread by user id (e.g. from URL openChatWith=userId&agencyId=...). Used when supervisor clicks "Chat with supervisee". */
const openChatByUserId = async (otherUserId, agencyIdOverride, displayName = '', organizationIdOverride = null) => {
  const useAgencyId = agencyIdOverride ? parseInt(agencyIdOverride, 10) : agencyId.value;
  if (!useAgencyId || !otherUserId) return;
  chatError.value = '';
  chatMessages.value = [];
  draft.value = '';
  try {
    chatLoading.value = true;
    const body = {
      agencyId: useAgencyId,
      otherUserId: parseInt(otherUserId, 10)
    };
    const oid =
      organizationIdOverride != null && organizationIdOverride !== ''
        ? parseInt(organizationIdOverride, 10)
        : null;
    if (oid) body.organizationId = oid;
    const resp = await api.post('/chat/threads/direct', body, { skipGlobalLoading: true });
    activeThreadId.value = resp.data?.threadId ?? null;
    activeThreadAgencyId.value = useAgencyId;
    const name = (displayName || '').trim() || 'User';
    const parts = name.split(/\s+/);
    activeChatUser.value = {
      id: parseInt(otherUserId, 10),
      first_name: parts[0] || name,
      last_name: parts.slice(1).join(' ') || ''
    };
    if (activeThreadId.value) {
      await loadMessages({ markRead: true, scrollToBottom: true });
    }
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to open chat';
  } finally {
    chatLoading.value = false;
  }
};

const scrollMessagesToBottom = async () => {
  await nextTick();
  const el = chatMessagesEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
};

const toggleSelectMode = () => {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) selectedMessageIds.value = [];
};

const isSelected = (id) => selectedMessageIds.value.includes(Number(id));

const toggleSelected = (id) => {
  const n = Number(id);
  if (!Number.isFinite(n)) return;
  if (isSelected(n)) {
    selectedMessageIds.value = selectedMessageIds.value.filter((x) => x !== n);
  } else {
    selectedMessageIds.value = [...selectedMessageIds.value, n];
  }
};

const loadMessages = async ({ markRead, scrollToBottom } = { markRead: true, scrollToBottom: true }) => {
  if (!activeThreadId.value) return;
  try {
    chatLoading.value = true;
    const resp = await api.get(
      `/chat/threads/${activeThreadId.value}/messages`,
      { params: { limit: 60 }, skipGlobalLoading: true }
    );
    chatMessages.value = resp.data || [];
    if (scrollToBottom) {
      await scrollMessagesToBottom();
    }
    const last = chatMessages.value[chatMessages.value.length - 1];
    const canMarkRead =
      !!markRead && typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
    if (canMarkRead && last?.id) {
      // Fire-and-forget: don't block UI on read receipts or thread refresh.
      api.post(
        `/chat/threads/${activeThreadId.value}/read`,
        { lastReadMessageId: last.id },
        { skipGlobalLoading: true }
      ).catch(() => {});
      loadThreads().catch(() => {});
    }
  } finally {
    chatLoading.value = false;
  }
};

const send = async () => {
  if (!activeThreadId.value) return;
  const body = draft.value.trim();
  const attachments = [...(stagedAttachments.value || [])];
  if (!body && !attachments.length) return;
  try {
    sending.value = true;
    attachError.value = '';
    draft.value = '';
    stagedAttachments.value = [];
    mentionSuggestions.value = [];
    reactionPickerFor.value = null;
    const payload = { body };
    if (attachments.length) payload.attachments = attachments;
    if (replyRoot.value?.id) payload.parentMessageId = replyRoot.value.id;
    await api.post(`/chat/threads/${activeThreadId.value}/messages`, payload, { skipGlobalLoading: true });
    await loadMessages({ markRead: true, scrollToBottom: !replyRoot.value });
    if (replyRoot.value) {
      await refreshReplyPanel();
      const rootId = Number(replyRoot.value.id);
      const root = (chatMessages.value || []).find((m) => Number(m.id) === rootId);
      if (root) root.reply_count = Number(root.reply_count || 0) + 1;
    }
    if (mainTab.value === 'threads') loadThreadsInbox().catch(() => {});
    if (mainTab.value === 'mentions') loadMentionsInbox().catch(() => {});
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to send message';
  } finally {
    sending.value = false;
  }
};

const unsend = async (m) => {
  if (!activeThreadId.value || !m?.id) return;
  if (m.sender_user_id !== meId.value) return;
  if (m.is_read_by_other) return;
  try {
    sending.value = true;
    await api.delete(`/chat/threads/${activeThreadId.value}/messages/${m.id}`, { skipGlobalLoading: true });
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to unsend message';
  } finally {
    sending.value = false;
  }
};

const deleteForMe = async (m) => {
  if (!activeThreadId.value || !m?.id) return;
  try {
    sending.value = true;
    await api.post(
      `/chat/threads/${activeThreadId.value}/messages/${m.id}/delete-for-me`,
      {},
      { skipGlobalLoading: true }
    );
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to delete message';
  } finally {
    sending.value = false;
  }
};

const deleteSelected = async () => {
  if (!activeThreadId.value) return;
  const ids = selectedMessageIds.value || [];
  if (ids.length === 0) return;
  try {
    sending.value = true;
    chatError.value = '';
    await api.post(
      `/chat/threads/${activeThreadId.value}/messages/delete-for-me`,
      { messageIds: ids },
      { skipGlobalLoading: true }
    );
    selectedMessageIds.value = [];
    selectMode.value = false;
    await loadMessages({ markRead: true, scrollToBottom: true });
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to delete selected messages';
  } finally {
    sending.value = false;
  }
};

const deleteThread = async () => {
  if (!activeThreadId.value) return;
  try {
    sending.value = true;
    chatError.value = '';
    await api.post(`/chat/threads/${activeThreadId.value}/delete-for-me`, {}, { skipGlobalLoading: true });
    closeChat();
    await loadThreads();
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || 'Failed to delete thread';
  } finally {
    sending.value = false;
  }
};

const closeChat = () => {
  activeChatUser.value = null;
  activeChannel.value = null;
  activeThreadId.value = null;
  activeThreadAgencyId.value = null;
  chatMessages.value = [];
  draft.value = '';
  chatError.value = '';
  selectMode.value = false;
  selectedMessageIds.value = [];
  showMembersPanel.value = false;
  channelMembers.value = [];
  canManageChannelMembers.value = false;
  membersError.value = '';
  memberInviteIds.value = [];
  memberInviteQ.value = '';
  closeReplyPanel();
  highlightMessageId.value = null;
  stagedAttachments.value = [];
  attachError.value = '';
  uploadingAttach.value = false;
  reactionPickerFor.value = null;
};

const fetchMyPresence = async () => {
  try {
    const data = await presenceSession.refreshFromServer();
    if (data) {
      myAvailability.value = data.availability_level || null;
      myHeartbeatStatus.value = data.heartbeat_status || data.status || 'offline';
      myStatusLabel.value = data.status_label || data.presence_display_label || null;
      myCalendarBusy.value = data.calendar_busy || null;
      if (data.session_extend_active && data.presence_session_extend_until) {
        pauseIdleForSessionExtend(data.presence_session_extend_until);
      } else {
        // Server cleared Away extend — resume normal Timedown immediately.
        clearSessionExtendPause({ reschedule: true });
      }
    }
  } catch {
    // ignore
  }
};

const setMyAvailability = async (level) => {
  try {
    await api.post('/presence/availability', { availabilityLevel: level }, { skipGlobalLoading: true });
    myAvailability.value = level;
    statusMenuOpen.value = false;
    await Promise.all([fetchMyPresence(), loadPresence(), loadThreads()]);
  } catch {
    // ignore
  }
};

const toggleMyAvailability = async () => {
  const next = myAvailability.value === 'offline' ? 'everyone' : 'offline';
  await setMyAvailability(next);
};

const quickSetAway = async (reason) => {
  try {
    if (reason === 'out_day') {
      await presenceSession.applyAway({ reason: 'out_day', extendSession: false });
    } else {
      await presenceSession.applyAway({ reason, durationMinutes: 60, extendSession: true });
      pauseIdleForSessionExtend(presenceSession.sessionExtendUntil);
    }
    statusMenuOpen.value = false;
    await Promise.all([fetchMyPresence(), loadPresence()]);
  } catch {
    // ignore
  }
};

const clearMyAway = async () => {
  try {
    await presenceSession.clearAway();
    clearSessionExtendPause({ reschedule: true });
    resetActivityTimer();
    statusMenuOpen.value = false;
    await Promise.all([fetchMyPresence(), loadPresence()]);
  } catch {
    // ignore
  }
};

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!isAuthenticated.value) return;
    const jobs = [loadPresence(), loadThreads()];
    if (mainTab.value === 'channels' && !isSchoolStaffViewer.value) jobs.push(loadChannels());
    if (mainTab.value === 'threads' && !isSchoolStaffViewer.value) jobs.push(loadThreadsInbox());
    if (mainTab.value === 'mentions' && !isSchoolStaffViewer.value) jobs.push(loadMentionsInbox());
    Promise.all(jobs);
    if (activeThreadId.value) {
      // Poll messages without marking them as read (prevents background tabs from auto-reading).
      loadMessages({ markRead: false });
    }
  }, 20000);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};

watch(agencyId, async () => {
  ensureComposeAgency();
  const openAid = Number(activeThreadAgencyId.value || 0);
  const membershipIds = new Set(membershipAgencies.value.map((a) => Number(a.id)));
  const keepOpenChat = !!(openAid && membershipIds.has(openAid) && activeThreadId.value);
  if (!keepOpenChat) closeChat();
  const jobs = [loadPresence(), loadThreads()];
  if (mainTab.value === 'channels') jobs.push(loadChannels());
  if (mainTab.value === 'threads') jobs.push(loadThreadsInbox());
  if (mainTab.value === 'mentions') jobs.push(loadMentionsInbox());
  await Promise.all(jobs);
});

// When URL has openChat=1 (e.g. Messages card clicked), open the drawer.
watch(
  () => route.query?.openChat,
  (val) => {
    if (val === '1' || val === 'true') {
        const q = { ...route.query };
      delete q.openChat;
      router.replace({ path: route.path, query: q });
    }
  },
  { immediate: true }
);

// When URL has openChatWith + agencyId (e.g. supervisor clicked "Chat with supervisee"), open that thread in the drawer and clear those params.
watch(
  () => ({ query: route.query, path: route.path }),
  async (newVal) => {
    const openChatWith = newVal.query?.openChatWith;
    const agencyIdFromQuery = newVal.query?.agencyId;
    const openChatWithName = newVal.query?.openChatWithName;
    const organizationIdFromQuery = newVal.query?.organizationId;
    if (!openChatWith || !(agencyIdFromQuery || effectiveComposeAgencyId.value || agencyId.value)) return;
    await openChatByUserId(
      openChatWith,
      agencyIdFromQuery || effectiveComposeAgencyId.value || agencyId.value,
      openChatWithName,
      organizationIdFromQuery
    );
    await loadThreads();
    const q = { ...newVal.query };
    delete q.openChatWith;
    delete q.openChatWithName;
    delete q.organizationId;
    router.replace({ path: newVal.path, query: q });
  },
  { immediate: true }
);

function onDocClickClosePickers(e) {
  if (reactionPickerFor.value == null) return;
  const el = e?.target;
  if (el && typeof el.closest === 'function' && el.closest('.rx-add-wrap')) return;
  reactionPickerFor.value = null;
}

onMounted(async () => {
  document.addEventListener('click', onDocClickClosePickers);
  if (!isAuthenticated.value) return;
  ensureComposeAgency();
  // Superadmin HQ often has an empty membership list — load catalog so tenant chips show names.
  try {
    const role = String(authStore.user?.role || '').toLowerCase();
    if (role === 'super_admin' && !(agencyStore.agencies || []).length) {
      await agencyStore.fetchAgencies?.();
    } else if (!(agencyStore.userAgencies || []).length) {
      await agencyStore.fetchUserAgencies?.();
    }
  } catch {
    /* best-effort */
  }
  await Promise.all([fetchMyPresence(), loadPresence(), loadThreads()]);
  startPolling();
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClickClosePickers);
  stopPolling();
});
</script>

<style scoped>
.messages-workspace {
  display: flex;
  width: 100%;
  min-height: 0;
  background: #fff;
  color: var(--text-primary, #1a3d2b);
}

.messages-workspace.layout-drawer {
  flex-direction: column;
  width: 100%;
  height: 100%;
  max-height: 100%;
  border: none;
}

.messages-workspace.layout-page {
  flex: 1;
  min-height: min(70vh, calc(100vh - 180px));
  height: calc(100vh - 160px);
  max-height: calc(100vh - 120px);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
}

.mw-list-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: #fff;
}

.messages-workspace.layout-drawer .mw-list-col {
  flex: 1;
  min-height: 0;
}

.messages-workspace.layout-page .mw-list-col {
  width: 340px;
  max-width: 40%;
  border-right: 1px solid var(--border, #e2e8f0);
  flex-shrink: 0;
}

.messages-workspace.tickets-mode .mw-list-col {
  width: 100%;
  max-width: none;
  border-right: none;
  flex: 1;
}

.mw-tickets-host {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mw-sms-host {
  min-height: 0;
}

.mw-sms-host :deep(.comms-hub) {
  height: 100%;
}

.mw-assistant-host {
  min-height: 0;
  background: var(--bg-primary, #f8fafc);
}

.nav-stub-assistant.active {
  color: var(--primary, #0d9488);
}

/* Tenant Messages: keep SMS chrome on branding tokens (no forced purple). */
.messages-workspace.theme-default.tickets-mode .mw-sms-host {
  background: var(--bg-primary, #f8fafc);
}

.mw-tickets-link-row {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.mw-tickets-full-link {
  font-size: 12px;
  font-weight: 700;
  color: var(--primary, #2d6a4f);
  text-decoration: none;
}

.mw-tickets-desk {
  flex: 1;
  min-height: 0;
}

.mw-chat-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  flex: 1;
  background: #fff;
}

.messages-workspace.layout-drawer .mw-chat-col {
  /* In drawer, conversation stacks under the list in the flex column via panel-body flow —
     list col contains lists+footer; chat col sits as second flex child when drawer is column. */
  border-top: 1px solid var(--border, #e2e8f0);
  max-height: 55%;
}

.messages-workspace.layout-drawer:not(.has-active-chat) .mw-chat-col {
  display: none;
}

.mw-empty-chat {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
}

.messages-workspace.layout-drawer .mw-empty-chat {
  display: none;
}

.mw-chat-toolbar {
  display: none;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.mw-back {
  font-weight: 700;
}

@media (max-width: 767px) {
  .messages-workspace.layout-page {
    flex-direction: column;
    height: calc(100vh - 120px);
  }
  .messages-workspace.layout-page .mw-list-col {
    width: 100%;
    max-width: none;
    border-right: none;
    flex: 1;
  }
  .messages-workspace.layout-page .mw-chat-col {
    display: none;
  }
  .messages-workspace.layout-page.mobile-show-chat .mw-list-col {
    display: none;
  }
  .messages-workspace.layout-page.mobile-show-chat .mw-chat-col {
    display: flex;
    flex: 1;
  }
  .messages-workspace.layout-page.mobile-show-chat .mw-chat-toolbar {
    display: flex;
  }
}

.mw-list-col .panel-header,
.panel-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.title {
  font-weight: 800;
  color: var(--text-primary);
}

.subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.compose-agency {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  min-width: 120px;
  max-width: 180px;
}
.compose-agency-label { letter-spacing: 0.02em; }
.compose-agency select {
  font: inherit;
  font-weight: 650;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 6px;
  background: #fff;
  color: var(--text-primary);
}

.nav-stubs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.nav-stub {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.nav-stub.active {
  background: rgba(34, 197, 94, 0.12);
  color: var(--text-primary);
}
.nav-stub:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.nav-stub-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  margin-left: 4px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
.channel-row .channel-hash {
  width: 18px;
  flex-shrink: 0;
  text-align: center;
  font-weight: 700;
  color: #0f766e;
  opacity: 0.85;
}
.channel-row.active {
  background: #f0fdfa;
}
.create-channel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 12px;
  border-bottom: 1px solid #e2e8f0;
}
.create-channel-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
}
.invite-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px;
  background: #f8fafc;
}
.invite-picker-label {
  font-size: 11px;
  font-weight: 750;
  color: var(--text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.invite-picker-list {
  max-height: 140px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.invite-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 2px;
  cursor: pointer;
  color: var(--text-primary, #1a3d2b);
}
.members-panel {
  border-bottom: 1px solid #e2e8f0;
  padding: 8px 10px 10px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
}
.members-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.members-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.members-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.members-invite {
  margin-top: 2px;
}
.leave-channel-btn {
  align-self: flex-start;
}
.reply-count-btn {
  margin-top: 4px;
  border: none;
  background: transparent;
  color: #0f766e;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
  padding: 0;
}
.reply-count-btn:hover {
  text-decoration: underline;
}
.reply-panel {
  margin-top: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.reply-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.reply-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow: auto;
}
.reply-item {
  padding: 4px 0;
  border-bottom: 1px solid #eef2f7;
}
.reply-item:last-child {
  border-bottom: none;
}
.reply-composer-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #0f766e;
  margin-bottom: 4px;
}
.composer-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}
.composer-wrap textarea {
  width: 100%;
}
.mention-menu {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 4px);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
  z-index: 5;
  overflow: hidden;
}
.mention-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
.mention-item:hover,
.mention-item.active {
  background: #f0fdfa;
}
.msg-highlight {
  outline: 2px solid #14b8a6;
  outline-offset: 2px;
  border-radius: 4px;
  background: #ecfdf5;
}
.unread-mention .name {
  font-weight: 800;
}
.msg-attachments {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.msg-attach-image-link {
  display: inline-block;
  max-width: 100%;
}
.msg-attach-image {
  display: block;
  max-width: min(240px, 100%);
  max-height: 180px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid #e2e8f0;
}
.msg-attach-video {
  display: block;
  max-width: min(280px, 100%);
  max-height: 200px;
  border-radius: 8px;
  background: #0f172a;
}
.msg-attach-file {
  font-size: 12px;
  font-weight: 700;
  color: #0f766e;
  text-decoration: underline;
}
.msg-reactions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}
.rx-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
  line-height: 1.2;
}
.rx-chip.mine {
  border-color: #14b8a6;
  background: #f0fdfa;
}
.rx-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
}
.rx-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
}
.rx-add-wrap {
  position: relative;
}
.rx-add-btn {
  border: 1px dashed #cbd5e1;
  background: #fff;
  border-radius: 999px;
  width: 24px;
  height: 24px;
  font-size: 14px;
  line-height: 1;
  color: #64748b;
  cursor: pointer;
}
.rx-picker {
  position: absolute;
  left: 0;
  bottom: calc(100% + 4px);
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  width: 180px;
  padding: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
  z-index: 6;
}
.rx-picker-item {
  border: none;
  background: transparent;
  font-size: 16px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
}
.rx-picker-item:hover {
  background: #f0fdfa;
}
.attach-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 650;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 3px 8px;
  color: #334155;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attach-chip-x {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: #64748b;
  padding: 0 2px;
}
.composer-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}
.attach-btn {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 750;
  color: #0f766e;
  cursor: pointer;
  border: 1px solid #99f6e4;
  background: #f0fdfa;
  border-radius: 999px;
  padding: 3px 10px;
}
.attach-btn input {
  display: none;
}
.attach-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.filter-chips {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.filter-chip {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  cursor: pointer;
}
.filter-chip.active {
  border-color: #22c55e;
  color: #166534;
  background: #f0fdf4;
}

.name-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.status-line {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.you-chip {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 800;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 6px;
}

.self-footer {
  position: relative;
  border-top: 1px solid var(--border);
  padding: 8px 10px;
  background: #f8fafc;
}
.self-status-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
}
.self-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.self-name {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary);
}
.self-status-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.self-chevron {
  color: var(--text-secondary);
  font-size: 12px;
}
.status-menu {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: calc(100% + 6px);
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  padding: 8px;
  z-index: 5;
  max-height: 280px;
  overflow: auto;
}
.status-menu-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 4px 8px 6px;
}
.status-menu-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-primary);
  cursor: pointer;
}
.status-menu-item:hover,
.status-menu-item.active {
  background: #f0fdf4;
}
.status-menu-divider {
  height: 1px;
  background: var(--border);
  margin: 6px 0;
}

.btn.btn-xs {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 8px;
}

.agency-chip {
  display: inline-block;
  margin-left: 8px;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
}

.mw-list-col .panel-body,
.panel-body {
  flex: 1;
  min-height: 0;
  position: relative; /* contain the absolute chat-box (prevents “ghost window” on collapse) */
  padding: 12px 14px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.toolbar { margin-bottom: 10px; }
.search {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
}

.lists {
  height: calc(100% - 84px);
  overflow: auto;
  padding-right: 4px;
}

.section { margin-bottom: 14px; }
.section-title { font-weight: 800; font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.person {
  width: 100%;
  border: 1px solid var(--border);
  background: white;
  border-radius: 10px;
  padding: 10px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  margin-bottom: 8px;
  text-align: left;
}
.person:hover { border-color: var(--primary); }
.dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
.dot-online { background: #22c55e; }
.dot-idle { background: #f59e0b; }
.dot-busy { background: #6366f1; }
.dot-offline { background: #9ca3af; }
.mw-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.mw-modal {
  width: min(420px, 100%);
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.2);
}
.mw-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mw-modal-head h3 { margin: 0; font-size: 16px; }
.mw-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; }
.mw-field input {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-weight: 500;
}
.mw-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.mw-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 13000;
  background: #0f172a;
  color: #fff;
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 650;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.25);
}
.name { flex: 1; font-weight: 700; color: var(--text-primary); font-size: 13px; }
.pill { border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; font-size: 12px; color: var(--text-secondary); font-weight: 800; }
.muted { color: var(--text-secondary); font-size: 13px; padding: 6px 2px; }
/* Let the main `.lists` container handle scrolling; don't cap Offline at 240px. */
.scroll { max-height: none; overflow: visible; padding-right: 0; }

.mw-chat-col .chat-box {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: none;
  border-radius: 0;
  margin: 0;
  max-height: none;
}
.chat-box {
  position: absolute;
  right: 0;
  bottom: 0;
  top: 0;
  width: 360px;
  height: auto;
  border-top: 1px solid var(--border);
  background: white;
  display: flex;
  flex-direction: column;
  min-height: 0; /* critical for flex+overflow scrolling */
  z-index: 1;
}

.chat-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.chat-title {
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.chat-box-actions { display: flex; gap: 8px; align-items: center; }
.btn-close { border: none; background: none; font-size: 18px; cursor: pointer; color: var(--text-secondary); }

.chat-messages {
  flex: 1;
  overflow: auto;
  padding: 10px 12px;
  background: #f8fafc;
  min-height: 0; /* allows this flex child to scroll instead of pushing composer off-screen */
}
.msg-list { display: flex; flex-direction: column; gap: 10px; }
.msg-row { display: flex; gap: 10px; align-items: flex-start; }
.msg-row.mine { justify-content: flex-end; }
.msg-select { padding-top: 6px; }
.msg-select input { width: 14px; height: 14px; }
.msg {
  border: 1px solid var(--border);
  background: white;
  border-radius: 12px;
  padding: 8px 10px;
  max-width: 90%;
}
.msg.mine { background: #ecfdf5; border-color: #a7f3d0; }
.msg-meta { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
.msg-receipt { margin-left: 6px; font-weight: 900; color: rgba(15, 23, 42, 0.6); }
.msg.mine .msg-receipt { color: rgba(16, 185, 129, 0.9); }
.msg-action {
  margin-left: 10px;
  border: none;
  background: transparent;
  color: rgba(15, 23, 42, 0.55);
  font-weight: 800;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.msg-action:hover { color: rgba(15, 23, 42, 0.75); text-decoration: underline; }
.msg-action:disabled { opacity: 0.6; cursor: not-allowed; }
.msg-body { white-space: pre-wrap; font-size: 13px; color: var(--text-primary); }

.chat-composer {
  border-top: 1px solid var(--border);
  padding: 10px 12px;
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.composer-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.chat-composer textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  min-height: 56px;
  max-height: 140px;
  resize: vertical;
  font-size: 13px;
  box-sizing: border-box;
}
.chat-composer .btn {
  padding: 0 14px;
  font-size: 13px;
  border-radius: 10px;
  min-width: 56px;
  min-height: 56px; /* match textarea min-height */
  height: 100%; /* match current textarea height as it grows */
}

.loading { color: var(--text-secondary); }
.error { color: #b91c1c; font-size: 13px; }
.empty { color: var(--text-secondary); padding: 10px 2px; }

/* Plot Twist HQ / platform dark shell */
.messages-workspace.theme-platform {
  --text-primary: #e5e7eb;
  --text-secondary: #94a3b8;
  --border: rgba(148, 163, 184, 0.18);
  --primary: #8b5cf6;
  background: #0f172a;
  color: #e5e7eb;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.18);
}
.messages-workspace.theme-platform.layout-page {
  min-height: min(78vh, 860px);
  height: min(78vh, 860px);
}
.messages-workspace.theme-platform .mw-list-col {
  background: #111827;
  border-right: 1px solid rgba(148, 163, 184, 0.18);
}
.messages-workspace.theme-platform .panel-header,
.messages-workspace.theme-platform .nav-stubs,
.messages-workspace.theme-platform .self-footer {
  background: #0f172a;
  border-color: rgba(148, 163, 184, 0.18);
}
.messages-workspace.theme-platform .title,
.messages-workspace.theme-platform .name,
.messages-workspace.theme-platform .chat-title,
.messages-workspace.theme-platform .self-name,
.messages-workspace.theme-platform .section-title {
  color: #e5e7eb;
}
.messages-workspace.theme-platform .subtitle,
.messages-workspace.theme-platform .status-line,
.messages-workspace.theme-platform .self-status-label,
.messages-workspace.theme-platform .muted {
  color: #94a3b8;
}
.messages-workspace.theme-platform .nav-stub {
  color: #94a3b8;
}
.messages-workspace.theme-platform .nav-stub.active {
  background: rgba(139, 92, 246, 0.18);
  color: #c4b5fd;
}
.messages-workspace.theme-platform .nav-stub-badge {
  background: #8b5cf6;
  color: #fff;
}
.messages-workspace.theme-platform .person,
.messages-workspace.theme-platform .filter-chip,
.messages-workspace.theme-platform .compose-agency select,
.messages-workspace.theme-platform .search,
.messages-workspace.theme-platform .chat-composer textarea,
.messages-workspace.theme-platform .mw-field input,
.messages-workspace.theme-platform .status-menu {
  background: #0b1220;
  border-color: rgba(148, 163, 184, 0.22);
  color: #e5e7eb;
}
.messages-workspace.theme-platform .person:hover {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
}
.messages-workspace.theme-platform .filter-chip.active {
  border-color: #8b5cf6;
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.16);
}
.messages-workspace.theme-platform .mw-chat-col,
.messages-workspace.theme-platform .chat-box,
.messages-workspace.theme-platform .mw-empty-chat {
  background: #0f172a;
}
.messages-workspace.theme-platform .chat-box-header,
.messages-workspace.theme-platform .chat-composer {
  background: #111827;
  border-color: rgba(148, 163, 184, 0.18);
}
.messages-workspace.theme-platform .msg {
  background: #1e293b;
  color: #e5e7eb;
}
.messages-workspace.theme-platform .msg.mine {
  background: rgba(139, 92, 246, 0.22);
}
.messages-workspace.theme-platform .btn-primary {
  background: linear-gradient(135deg, #7c3aed, #2563eb);
  border: none;
  color: #fff;
}
.messages-workspace.theme-platform .btn-secondary {
  background: #1e293b;
  border-color: rgba(148, 163, 184, 0.28);
  color: #e5e7eb;
}
.messages-workspace.theme-platform .agency-chip,
.messages-workspace.theme-platform .pill,
.messages-workspace.theme-platform .you-chip {
  border-color: rgba(148, 163, 184, 0.28);
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.8);
}
.messages-workspace.theme-platform .mw-modal {
  background: #111827;
  color: #e5e7eb;
}
.messages-workspace.theme-platform .mw-toast {
  background: #7c3aed;
}
.messages-workspace.theme-platform .status-menu-item:hover,
.messages-workspace.theme-platform .status-menu-item.active {
  background: rgba(139, 92, 246, 0.16);
  color: #e5e7eb;
}
</style>

