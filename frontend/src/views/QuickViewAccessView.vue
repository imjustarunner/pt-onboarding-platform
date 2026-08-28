<template>
  <div class="qv" :style="brandStyle">
    <header class="qv-top">
      <div class="qv-brand-row">
        <img v-if="agencyLogoUrl" :src="agencyLogoUrl" alt="" class="qv-logo" />
        <div>
          <div class="qv-brand">{{ agencyName || 'Quick View' }}</div>
          <div class="qv-sub" v-if="session">Expires {{ formatExpiry(expiresAt) }}</div>
        </div>
      </div>
      <button v-if="session" type="button" class="qv-btn ghost" @click="logout">Lock</button>
    </header>

    <div v-if="homeScreenTip && !session" class="qv-homescreen">
      <strong>Add to Home Screen</strong>
      <p>
        On this tenant Quick View page, use Share → Add to Home Screen.
        Keep <strong>Open as Web App</strong> on — it should open this tenant’s Quick View (not the main login).
      </p>
      <button type="button" class="qv-btn ghost sm" @click="dismissHomeTip">Got it</button>
    </div>

    <div v-if="error" class="qv-err">
      {{ error }}
      <button v-if="session" type="button" class="qv-btn ghost sm" @click="retryHome">Retry</button>
    </div>
    <div v-if="loading && !session" class="qv-pad">Loading…</div>

    <section v-else-if="!session && !loading" class="qv-gate">
      <img v-if="agencyLogoUrl" :src="agencyLogoUrl" alt="" class="qv-gate-logo" />
      <h1>{{ agencyName || 'Quick View' }}</h1>
      <template v-if="isLocked">
        <p>Quick View is locked after 3 incorrect passcode attempts.</p>
        <p class="qv-hint">
          Sign in to the portal and reset your 6-digit passcode under My Dashboard → Settings → Privacy &amp; Quick View.
        </p>
        <a v-if="loginUrl" class="qv-btn primary" :href="loginUrl">Sign in to reset</a>
      </template>
      <template v-else>
        <p v-if="tokenInfo">Hi {{ tokenInfo.firstName || 'there' }} — enter your 6-digit passcode.</p>
        <p v-else-if="!error">Validating your private link…</p>
        <form v-if="tokenInfo" class="qv-form" @submit.prevent="unlock">
          <input
            v-model="passcode"
            class="qv-pin"
            type="password"
            inputmode="numeric"
            maxlength="6"
            pattern="\d{6}"
            autocomplete="one-time-code"
            placeholder="••••••"
            aria-label="6-digit Quick View passcode"
          />
          <button type="submit" class="qv-btn primary" :disabled="unlocking || passcode.length !== 6">
            {{ unlocking ? 'Opening…' : 'Open' }}
          </button>
        </form>
        <p class="qv-hint">
          Passcodes are never emailed. Reset yours from My Dashboard → Settings → Privacy &amp; Quick View.
        </p>
      </template>
    </section>

    <template v-if="session">
      <nav class="qv-tabs">
        <button type="button" :class="{ on: tab === 'home' }" @click="tab = 'home'; loadHome()">Messages</button>
        <button type="button" :class="{ on: tab === 'tasks' }" @click="switchTasks">Tasks</button>
        <button type="button" :class="{ on: tab === 'calendar' }" @click="switchCalendar">Calendar</button>
        <button type="button" :class="{ on: tab === 'contacts' }" @click="loadContacts">Contacts</button>
      </nav>

      <div v-if="tab === 'home'" class="qv-pane">
        <div class="qv-suite">
          <button type="button" :class="{ on: msgSuite === 'email' }" @click="switchMsgSuite('email')">Email</button>
          <button type="button" :class="{ on: msgSuite === 'direct' }" @click="switchMsgSuite('direct')">Direct</button>
          <button type="button" :class="{ on: msgSuite === 'channels' }" @click="switchMsgSuite('channels')">Channels</button>
          <button type="button" :class="{ on: msgSuite === 'threads' }" @click="switchMsgSuite('threads')">Threads</button>
          <button type="button" :class="{ on: msgSuite === 'mentions' }" @click="switchMsgSuite('mentions')">Mentions</button>
          <button type="button" :class="{ on: msgSuite === 'files' }" @click="switchMsgSuite('files')">Files</button>
          <button type="button" :class="{ on: msgSuite === 'sms' }" @click="switchMsgSuite('sms')">SMS</button>
        </div>

        <template v-if="msgSuite === 'email'">
          <div class="qv-toolbar">
            <div class="qv-sorters">
              <button type="button" :class="{ on: sort === 'all' }" @click="sort = 'all'">All</button>
              <button type="button" :class="{ on: sort === 'unread' }" @click="sort = 'unread'">Unread</button>
              <button type="button" :class="{ on: sort === 'needs' }" @click="sort = 'needs'">Needs reply</button>
              <button type="button" :class="{ on: sort === 'secure' }" @click="sort = 'secure'">Secure</button>
            </div>
            <button type="button" class="qv-btn primary sm" @click="showCompose = true">New</button>
          </div>
          <button
            v-for="c in filteredConversations"
            :key="c.id"
            type="button"
            class="qv-row"
            :class="{ unread: c.is_unread }"
            @click="openConversation(c)"
          >
            <span class="ch">{{ channelIcon(c.channel) }}</span>
            <div class="meta">
              <strong>{{ c.subject || '(no subject)' }}</strong>
              <small>{{ c.last_message_preview || '' }}</small>
            </div>
            <span v-if="c.has_auto_reply" class="badge">Auto</span>
          </button>
          <div v-if="!filteredConversations.length" class="qv-pad muted">
            No email yet. Integrate a mailbox in Settings to see mail here.
          </div>
        </template>

        <template v-else-if="msgSuite === 'sms'">
          <div class="qv-pad muted">SMS will appear here once messaging is connected. Ready for that channel.</div>
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
            <span class="ch">{{ msgSuite === 'channels' ? '#' : '💬' }}</span>
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
            <span class="ch">{{ msgSuite === 'files' ? '📎' : msgSuite === 'mentions' ? '@' : '🧵' }}</span>
            <div class="meta">
              <strong>{{ inboxTitle(item) }}</strong>
              <small>{{ inboxPreview(item) }}</small>
            </div>
          </button>
          <div v-if="!inboxItems.length && !msgLoading" class="qv-pad muted">Nothing here yet.</div>
          <div v-if="msgLoading" class="qv-pad muted">Loading…</div>
        </template>
      </div>

      <div v-else-if="tab === 'thread'" class="qv-pane thread">
        <button type="button" class="qv-btn ghost" @click="tab = 'home'">← Back</button>
        <h2>{{ activeConv?.subject || 'Conversation' }}</h2>
        <div v-for="m in threadMessages" :key="m.id" class="qv-bubble" :class="m.direction">
          <div class="when">{{ formatTime(m.sent_at || m.created_at) }}
            <span v-if="m.is_auto_reply" class="badge">Auto-reply</span>
          </div>
          <div class="body">{{ m.body_text || stripHtml(m.body_html) }}</div>
        </div>
        <form class="qv-reply" @submit.prevent="sendQuickReply">
          <textarea v-model="replyText" rows="3" placeholder="Reply…" />
          <button type="submit" class="qv-btn primary" :disabled="replyBusy || !replyText.trim()">
            {{ replyBusy ? 'Sending…' : 'Send' }}
          </button>
        </form>
      </div>

      <div v-else-if="tab === 'chat'" class="qv-pane thread">
        <button type="button" class="qv-btn ghost" @click="closeChat">← Back</button>
        <h2>{{ activeChatTitle }}</h2>
        <div v-for="m in chatMessages" :key="m.id" class="qv-bubble" :class="chatBubbleClass(m)">
          <div class="when">{{ formatTime(m.created_at) }} · {{ m.sender_first_name || m.sender_name || '' }}</div>
          <div class="body">{{ m.body || '' }}</div>
        </div>
        <form class="qv-reply" @submit.prevent="sendChatMessage">
          <textarea v-model="chatReply" rows="3" placeholder="Message…" />
          <button type="submit" class="qv-btn primary" :disabled="chatBusy || !chatReply.trim()">
            {{ chatBusy ? 'Sending…' : 'Send' }}
          </button>
        </form>
      </div>

      <div v-else-if="tab === 'tasks'" class="qv-pane">
        <div class="qv-suite">
          <button type="button" :class="{ on: taskSuite === 'assigned' }" @click="loadTasks('assigned')">Assigned</button>
          <button type="button" :class="{ on: taskSuite === 'mine' }" @click="loadTasks('mine')">My tasks</button>
          <button type="button" :class="{ on: taskSuite === 'lists' }" @click="loadSharedLists">Shared lists</button>
          <button type="button" :class="{ on: taskSuite === 'projects' }" @click="loadProjects">Projects</button>
        </div>
        <div v-if="taskSuite === 'assigned' || taskSuite === 'mine'" class="qv-toolbar">
          <div class="qv-pad muted" style="padding:8px 0;margin:0;">Tap a task for details</div>
          <button type="button" class="qv-btn primary sm" @click="showNewTask = true">Add</button>
        </div>
        <template v-if="taskSuite === 'assigned' || taskSuite === 'mine'">
          <button
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
          <div v-if="!tasks.length" class="qv-pad muted">No open tasks.</div>
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
          <div v-if="!taskLists.length" class="qv-pad muted">No shared lists.</div>
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
          <div v-if="!taskProjects.length" class="qv-pad muted">No projects.</div>
        </template>
        <template v-else-if="taskSuite === 'listDetail' || taskSuite === 'projectDetail'">
          <button type="button" class="qv-btn ghost" @click="taskSuite === 'listDetail' ? loadSharedLists() : loadProjects()">← Back</button>
          <h2 class="qv-section-title">{{ suiteDetailTitle }}</h2>
          <button
            v-for="t in suiteTasks"
            :key="t.id"
            type="button"
            class="qv-row"
            @click="openTaskDetail(t)"
          >
            <div class="meta">
              <strong>{{ t.title }}</strong>
              <small>{{ t.status }} · {{ t.due_at ? formatTime(t.due_at) : 'No due' }}</small>
            </div>
          </button>
          <div v-if="!suiteTasks.length" class="qv-pad muted">No tasks in this view.</div>
        </template>
      </div>

      <div v-else-if="tab === 'calendar'" class="qv-pane">
        <div class="qv-day-nav">
          <button type="button" class="qv-btn ghost" @click="shiftDay(-1)">‹</button>
          <input v-model="day" type="date" class="qv-date" @change="loadCalendar" />
          <button type="button" class="qv-btn ghost" @click="shiftDay(1)">›</button>
          <button type="button" class="qv-btn ghost" :class="{ on: showOffice }" @click="toggleOffice">
            {{ showOffice ? 'My day' : 'Office' }}
          </button>
        </div>
        <template v-if="!showOffice">
          <div class="qv-day-grid">
            <div
              v-for="hour in dayHours"
              :key="hour"
              class="qv-hour-row"
            >
              <div class="qv-hour-label">{{ formatHourLabel(hour) }}</div>
              <div class="qv-hour-lane">
                <div
                  v-for="item in itemsForHour(hour)"
                  :key="item.id"
                  class="qv-cal-block"
                  :style="blockStyle(item, hour)"
                >
                  <strong>{{ item.title || item.kind }}</strong>
                  <small>{{ formatClock(item.startAt) }}–{{ formatClock(item.endAt) }}</small>
                  <a
                    v-if="item.canJoin"
                    class="qv-btn primary sm"
                    :href="joinHref(item)"
                    @click="extendForMeeting(item)"
                  >Join</a>
                </div>
              </div>
            </div>
          </div>
          <div v-if="!dayItems.length" class="qv-pad muted">Nothing scheduled this day.</div>
        </template>
        <template v-else>
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
                <small>{{ formatClock(s.start_at) }} – {{ formatClock(s.end_at) }} · {{ s.status || '—' }}</small>
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
        </div>
        <template v-if="contactSuite === 'providers' || contactSuite === 'school'">
          <div v-for="p in directoryPeople" :key="p.id" class="qv-row">
            <div class="meta">
              <strong>{{ p.displayName }}</strong>
              <small>{{ formatRole(p.role) }}</small>
            </div>
            <button
              type="button"
              class="qv-btn primary sm"
              :disabled="dmBusyId === p.id"
              @click="messageUser(p.id, p.displayName)"
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
          <div v-for="c in contacts" :key="c.id" class="qv-row">
            <div class="meta">
              <strong>{{ c.display_name || c.email }}</strong>
              <small>{{ c.email }} · {{ c.trust_status }}</small>
            </div>
            <button type="button" class="qv-btn ghost sm" @click="composeTo(c)">Email</button>
          </div>
          <div v-if="!contacts.length" class="qv-pad muted">No saved contacts yet.</div>
        </template>
      </div>

      <QuickViewMusicDock
        :api-base="apiBase"
        :auth-headers="authHeaders"
        :visible="!!session"
      />
    </template>

    <div v-if="showCompose" class="qv-modal" @click.self="showCompose = false">
      <form class="qv-sheet" @submit.prevent="sendCompose">
        <h3>New message</h3>
        <label>To</label>
        <input v-model="composeToEmail" type="email" required placeholder="email@example.com" />
        <label>Subject</label>
        <input v-model="composeSubject" type="text" placeholder="Subject" />
        <label>Message</label>
        <textarea v-model="composeText" rows="4" required placeholder="Write your message…" />
        <div class="qv-sheet-actions">
          <button type="button" class="qv-btn ghost" @click="showCompose = false">Cancel</button>
          <button type="submit" class="qv-btn primary" :disabled="composeBusy">{{ composeBusy ? 'Sending…' : 'Send' }}</button>
        </div>
      </form>
    </div>

    <div v-if="showNewTask" class="qv-modal" @click.self="showNewTask = false">
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

    <div v-if="showNewContact" class="qv-modal" @click.self="showNewContact = false">
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

    <div v-if="taskDetail" class="qv-modal" @click.self="taskDetail = null">
      <div class="qv-sheet qv-task-detail">
        <button type="button" class="qv-btn ghost sm" @click="taskDetail = null">Close</button>
        <h3>{{ taskDetail.task.title }}</h3>
        <p class="qv-detail-meta">
          {{ taskDetail.task.status }}
          · {{ taskDetail.task.urgency || 'medium' }}
          · {{ taskDetail.task.due_at ? formatTime(taskDetail.task.due_at) : 'No due date' }}
        </p>
        <p v-if="taskDetail.task.project_name || taskDetail.task.task_list_name" class="qv-detail-meta">
          {{ [taskDetail.task.project_name, taskDetail.task.task_list_name].filter(Boolean).join(' · ') }}
        </p>
        <div class="qv-detail-body">
          <template v-if="taskDetail.task.description_locked">Description is protected — open the full app to view.</template>
          <template v-else>{{ taskDetail.task.description || 'No description.' }}</template>
        </div>
        <div v-if="taskDetail.links?.length" class="qv-links">
          <a v-for="l in taskDetail.links" :key="l.id" :href="l.url" target="_blank" rel="noopener">{{ l.label || l.url }}</a>
        </div>
        <div class="qv-sheet-actions">
          <button type="button" class="qv-btn ghost" @click="markTaskStatus(taskDetail.task)">
            {{ isDone(taskDetail.task) ? 'Reopen' : 'Mark done' }}
          </button>
        </div>
        <h4>Comments</h4>
        <div v-for="c in taskDetail.comments" :key="c.id" class="qv-comment">
          <strong>{{ c.author }}</strong>
          <small>{{ formatTime(c.created_at) }}</small>
          <p>{{ c.body }}</p>
        </div>
        <div v-if="!taskDetail.comments?.length" class="muted">No comments yet.</div>
        <form class="qv-reply" @submit.prevent="postTaskComment">
          <textarea v-model="taskComment" rows="2" placeholder="Add a comment…" />
          <button type="submit" class="qv-btn primary" :disabled="taskCommentBusy || !taskComment.trim()">
            {{ taskCommentBusy ? 'Posting…' : 'Comment' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import QuickViewMusicDock from '../components/quickView/QuickViewMusicDock.vue';

const BOOKMARK_KEY = 'plottwist.quickViewBookmark';
const TOKEN_KEY = 'plottwist.quickViewToken';
const HOME_TIP_KEY = 'plottwist.quickViewHomeTipDismissed';
const LOGIN_URL_KEY = 'plottwist.quickViewLoginUrl';

const route = useRoute();
const apiBase = '/api/quick-view';

const loading = ref(true);
const error = ref('');
const tokenInfo = ref(null);
const passcode = ref('');
const unlocking = ref(false);
const session = ref(null);
const sessionUserId = ref(null);
const expiresAt = ref(null);
const agencyName = ref('');
const agencyLogoUrl = ref('');
const agencyPrimaryColor = ref('');
const colorPalette = ref({});
const loginUrl = ref('');
const isLocked = ref(false);
const tab = ref('home');
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
const taskLists = ref([]);
const taskProjects = ref([]);
const suiteTasks = ref([]);
const suiteDetailTitle = ref('');
const taskDetail = ref(null);
const taskComment = ref('');
const taskCommentBusy = ref(false);
const day = ref(new Date().toISOString().slice(0, 10));
const dayItems = ref([]);
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

const showCompose = ref(false);
const composeToEmail = ref('');
const composeSubject = ref('');
const composeText = ref('');
const composeBusy = ref(false);
const showNewTask = ref(false);
const newTaskTitle = ref('');
const newTaskDue = ref('');
const taskBusy = ref(false);
const showNewContact = ref(false);
const newContactName = ref('');
const newContactEmail = ref('');
const newContactPhone = ref('');
const contactBusy = ref(false);
const replyText = ref('');
const replyBusy = ref(false);

const DAY_START = 6;
const DAY_END = 22;
const dayHours = computed(() => {
  const hours = [];
  for (let h = DAY_START; h < DAY_END; h += 1) hours.push(h);
  return hours;
});

const brandStyle = computed(() => {
  const p = colorPalette.value || {};
  const primary = p.primary || agencyPrimaryColor.value || '#166534';
  const secondary = p.secondary || primary;
  const accent = p.accent || secondary;
  const bg = p.backgroundColor
    || `color-mix(in srgb, ${primary} 20%, #06100c)`;
  const surface = p.secondaryBackground
    || `color-mix(in srgb, ${primary} 28%, #0a1610)`;
  const border = `color-mix(in srgb, ${secondary} 35%, #1a2e24)`;
  const text = p.textPrimary || '#f4faf6';
  const muted = p.textMuted || p.textSecondary || '#a7c4b4';
  return {
    '--qv-primary': primary,
    '--qv-secondary': secondary,
    '--qv-accent': accent,
    '--qv-primary-soft': primary,
    '--qv-bg': bg,
    '--qv-surface': surface,
    '--qv-border': border,
    '--qv-text': text,
    '--qv-muted': muted
  };
});

const filteredConversations = computed(() => {
  let list = conversations.value || [];
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
const directoryPeople = computed(() =>
  contactSuite.value === 'school' ? directorySchool.value : directoryProviders.value
);

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
  } catch {
    session.value = null;
    try { sessionStorage.removeItem('plottwist.quickViewSession'); } catch { /* ignore */ }
    // Back to PIN launcher
    window.location.replace('/qv');
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
  const name = agencyName.value ? `${agencyName.value} Quick View` : 'Quick View';
  const iconSrc = agencyLogoUrl.value || '/branding/plottwisthq-platform-bg.png';
  const theme = agencyPrimaryColor.value || colorPalette.value?.primary || '#166534';
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
    expiresAt.value = data.expiresAt;
    if (data.userId) sessionUserId.value = data.userId;
    if (data.agencyId) sessionAgencyId.value = data.agencyId;
    else if (tokenInfo.value?.agencyId) sessionAgencyId.value = tokenInfo.value.agencyId;
    rememberBookmark();
    startHeartbeat();
    await loadHome();
    if (route.query.join && route.query.id) {
      const joinType = String(route.query.join);
      const id = String(route.query.id);
      const pathJoin = joinType === 'supervision'
        ? `/join/supervision/${encodeURIComponent(id)}`
        : `/join/team-meeting/${encodeURIComponent(id)}`;
      window.location.href = pathJoin;
    }
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

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    try {
      const { data } = await axios.post(
        `${apiBase}/session/heartbeat`,
        {},
        { headers: authHeaders(), withCredentials: true }
      );
      expiresAt.value = data.expiresAt;
    } catch {
      session.value = null;
      stopHeartbeat();
    }
  }, 60000);
}
function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function loadHome() {
  error.value = '';
  msgSuite.value = 'email';
  try {
    const { data } = await axios.get(`${apiBase}/home`, {
      headers: authHeaders(),
      withCredentials: true
    });
    conversations.value = data.conversations || [];
    tab.value = 'home';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load messages';
  }
}

async function retryHome() {
  await loadHome();
}

async function switchMsgSuite(suite) {
  msgSuite.value = suite;
  tab.value = 'home';
  chatList.value = [];
  inboxItems.value = [];
  if (suite === 'email') {
    await loadHome();
    return;
  }
  if (suite === 'sms') return;
  msgLoading.value = true;
  error.value = '';
  try {
    if (suite === 'direct') {
      const { data } = await axios.get(`${apiBase}/chat/threads`, {
        headers: authHeaders(),
        withCredentials: true,
        params: { agencyId: 'all' }
      });
      const rows = Array.isArray(data) ? data : (data.threads || []);
      chatList.value = rows.filter((t) => String(t.thread_type || 'direct').toLowerCase() === 'direct');
    } else if (suite === 'channels') {
      const { data } = await axios.get(`${apiBase}/chat/channels`, {
        headers: authHeaders(),
        withCredentials: true
      });
      chatList.value = data.channels || [];
    } else if (suite === 'threads') {
      const { data } = await axios.get(`${apiBase}/chat/inbox/threads`, {
        headers: authHeaders(),
        withCredentials: true
      });
      inboxItems.value = data.items || [];
    } else if (suite === 'mentions') {
      const { data } = await axios.get(`${apiBase}/chat/inbox/mentions`, {
        headers: authHeaders(),
        withCredentials: true
      });
      inboxItems.value = data.items || [];
    } else if (suite === 'files') {
      const { data } = await axios.get(`${apiBase}/chat/inbox/files`, {
        headers: authHeaders(),
        withCredentials: true
      });
      inboxItems.value = data.files || data.items || [];
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load messages';
  } finally {
    msgLoading.value = false;
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
  activeChatId.value = threadId;
  activeChatTitle.value = chatTitle(t);
  tab.value = 'chat';
  await loadChatMessages();
}

async function openInboxItem(item) {
  const threadId = Number(item.thread_id || item.threadId);
  if (!threadId) return;
  activeChatId.value = threadId;
  activeChatTitle.value = inboxTitle(item);
  tab.value = 'chat';
  await loadChatMessages();
}

async function loadChatMessages() {
  if (!activeChatId.value) return;
  const { data } = await axios.get(`${apiBase}/chat/threads/${activeChatId.value}/messages`, {
    headers: authHeaders(),
    withCredentials: true
  });
  chatMessages.value = Array.isArray(data) ? data : (data.messages || []);
  const lastId = chatMessages.value.length
    ? chatMessages.value[chatMessages.value.length - 1]?.id
    : null;
  if (lastId) {
    axios.post(
      `${apiBase}/chat/threads/${activeChatId.value}/read`,
      { lastReadMessageId: lastId },
      { headers: authHeaders(), withCredentials: true }
    ).catch(() => {});
  }
}

function closeChat() {
  tab.value = 'home';
  activeChatId.value = null;
  chatMessages.value = [];
}

function chatBubbleClass(m) {
  if (sessionUserId.value && Number(m.sender_user_id) === Number(sessionUserId.value)) return 'outbound';
  return m.direction || 'inbound';
}

async function sendChatMessage() {
  if (!activeChatId.value || !chatReply.value.trim()) return;
  chatBusy.value = true;
  try {
    await axios.post(
      `${apiBase}/chat/threads/${activeChatId.value}/messages`,
      { body: chatReply.value.trim() },
      { headers: authHeaders(), withCredentials: true }
    );
    chatReply.value = '';
    await loadChatMessages();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Send failed';
  } finally {
    chatBusy.value = false;
  }
}

async function openConversation(c) {
  activeConv.value = c;
  const { data } = await axios.get(`${apiBase}/conversations/${c.id}`, {
    headers: authHeaders(),
    withCredentials: true
  });
  threadMessages.value = data.messages || [];
  tab.value = 'thread';
  c.is_unread = 0;
}

async function loadTasks(view = 'assigned') {
  taskView.value = view;
  taskSuite.value = view;
  tab.value = 'tasks';
  const { data } = await axios.get(`${apiBase}/tasks`, {
    headers: authHeaders(),
    withCredentials: true,
    params: { view }
  });
  tasks.value = data.tasks || [];
}
function switchTasks() { loadTasks(taskView.value); }

async function loadSharedLists() {
  tab.value = 'tasks';
  taskSuite.value = 'lists';
  const { data } = await axios.get(`${apiBase}/task-lists`, {
    headers: authHeaders(),
    withCredentials: true
  });
  taskLists.value = data.lists || [];
}

async function loadProjects() {
  tab.value = 'tasks';
  taskSuite.value = 'projects';
  const { data } = await axios.get(`${apiBase}/task-projects`, {
    headers: authHeaders(),
    withCredentials: true
  });
  taskProjects.value = data.projects || [];
}

async function openSharedList(l) {
  suiteDetailTitle.value = l.name;
  taskSuite.value = 'listDetail';
  const { data } = await axios.get(`${apiBase}/task-lists/${l.id}/tasks`, {
    headers: authHeaders(),
    withCredentials: true
  });
  suiteTasks.value = data.tasks || [];
}

async function openProject(p) {
  suiteDetailTitle.value = p.name;
  taskSuite.value = 'projectDetail';
  const { data } = await axios.get(`${apiBase}/task-projects/${p.id}`, {
    headers: authHeaders(),
    withCredentials: true
  });
  suiteTasks.value = data.tasks || [];
}

async function openTaskDetail(t) {
  try {
    const { data } = await axios.get(`${apiBase}/tasks/${t.id}`, {
      headers: authHeaders(),
      withCredentials: true
    });
    taskDetail.value = data;
    taskComment.value = '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not open task';
  }
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
  tab.value = 'calendar';
  const { data } = await axios.get(`${apiBase}/calendar/day`, {
    headers: authHeaders(),
    withCredentials: true,
    params: { day: day.value }
  });
  dayItems.value = data.items || [];
}
function switchCalendar() { loadCalendar(); }
function shiftDay(delta) {
  const d = new Date(`${day.value}T12:00:00`);
  d.setDate(d.getDate() + delta);
  day.value = d.toISOString().slice(0, 10);
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

async function messageUser(userId, name) {
  if (!userId) return;
  dmBusyId.value = userId;
  error.value = '';
  try {
    const { data } = await axios.post(
      `${apiBase}/chat/direct`,
      {
        otherUserId: userId,
        agencyId: sessionAgencyId.value || undefined
      },
      { headers: authHeaders(), withCredentials: true }
    );
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

async function loadDirectory(suite = 'providers') {
  tab.value = 'contacts';
  contactSuite.value = suite;
  try {
    const { data } = await axios.get(`${apiBase}/directory`, {
      headers: authHeaders(),
      withCredentials: true
    });
    directoryProviders.value = data.providers || [];
    directorySchool.value = data.schoolStaff || [];
    if (data.agencyId) sessionAgencyId.value = data.agencyId;
  } catch (e) {
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

function composeTo(c) {
  composeToEmail.value = c.email || '';
  composeSubject.value = '';
  composeText.value = '';
  showCompose.value = true;
}

async function sendCompose() {
  if (!composeToEmail.value.trim() || !composeText.value.trim()) return;
  composeBusy.value = true;
  error.value = '';
  try {
    await axios.post(
      `${apiBase}/compose`,
      {
        to: composeToEmail.value.trim(),
        subject: composeSubject.value.trim(),
        text: composeText.value.trim()
      },
      { headers: authHeaders(), withCredentials: true }
    );
    showCompose.value = false;
    composeToEmail.value = '';
    composeSubject.value = '';
    composeText.value = '';
    await loadHome();
  } catch (e) {
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

async function sendQuickReply() {
  if (!activeConv.value?.id || !replyText.value.trim()) return;
  replyBusy.value = true;
  try {
    await axios.post(
      `${apiBase}/conversations/${activeConv.value.id}/reply`,
      { text: replyText.value.trim() },
      { headers: authHeaders(), withCredentials: true }
    );
    replyText.value = '';
    await openConversation(activeConv.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Reply failed';
  } finally {
    replyBusy.value = false;
  }
}

function joinHref(item) {
  const kind = String(item.kind || '').toUpperCase();
  if (kind.includes('SUPERVISION')) return `/join/supervision/${encodeURIComponent(item.joinKey)}`;
  return `/join/team-meeting/${encodeURIComponent(item.joinKey)}`;
}
function extendForMeeting(item) {
  axios
    .post(
      `${apiBase}/session/heartbeat`,
      { meetingEndsAt: item.endAt },
      { headers: authHeaders(), withCredentials: true }
    )
    .catch(() => {});
}

async function logout() {
  await axios
    .post(`${apiBase}/session/logout`, {}, { headers: authHeaders(), withCredentials: true })
    .catch(() => {});
  session.value = null;
  stopHeartbeat();
  passcode.value = '';
  error.value = '';
}

function channelIcon(ch) {
  const c = String(ch || '');
  if (c === 'sms') return '📱';
  if (c === 'secure') return '🔒';
  if (c === 'call' || c === 'voicemail') return '📞';
  return '✉';
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
  try {
    homeScreenTip.value = localStorage.getItem(HOME_TIP_KEY) !== '1';
  } catch {
    homeScreenTip.value = true;
  }
  if (sessionOnly.value || (!route.params.token && route.name === 'QuickViewApp')) {
    resumeSession();
  } else {
    loadTokenInfo();
  }
});
onUnmounted(() => {
  stopHeartbeat();
});
</script>

<style scoped>
.qv {
  box-sizing: border-box;
  width: 100%;
  min-width: 100%;
  max-width: 100vw;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0;
  background: var(--qv-bg, #0f172a);
  color: var(--qv-text, #f8fafc);
  font-family: system-ui, -apple-system, sans-serif;
  overflow-x: hidden;
}
.qv *,
.qv *::before,
.qv *::after {
  box-sizing: border-box;
}
.qv-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--qv-border, #1e293b);
  background: color-mix(in srgb, var(--qv-primary, #166534) 12%, transparent);
}
.qv-brand-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.qv-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: contain;
  background: #fff;
  flex-shrink: 0;
}
.qv-gate-logo {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  object-fit: contain;
  background: #fff;
  margin-bottom: 12px;
}
.qv-brand { font-weight: 800; font-size: 1.05rem; }
.qv-sub { font-size: 11px; color: var(--qv-muted, #94a3b8); }
.qv-homescreen {
  margin: 12px 16px;
  padding: 12px;
  border-radius: 12px;
  background: var(--qv-surface, #1e293b);
  border: 1px solid var(--qv-border, #334155);
}
.qv-homescreen strong { display: block; margin-bottom: 4px; }
.qv-homescreen p { margin: 0 0 8px; font-size: 13px; color: var(--qv-muted, #cbd5e1); line-height: 1.4; }
.qv-gate, .qv-pad { padding: 24px 16px; }
.qv-gate h1 {
  margin: 0 0 8px;
  font-size: clamp(1.75rem, 8vw, 2.4rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--qv-text, #e2e8f0);
}
.qv-gate p { margin: 0; line-height: 1.4; }
.qv-form { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; width: 100%; }
.qv-pin {
  width: 100%;
  font-size: 28px;
  letter-spacing: 0.35em;
  text-align: center;
  padding: 14px 12px;
  border-radius: 12px;
  border: 1px solid var(--qv-border, #334155);
  background: var(--qv-surface, #1e293b);
  color: var(--qv-text, #fff);
  -webkit-text-security: disc;
  text-security: disc;
}
.qv-btn { border: none; border-radius: 10px; padding: 12px 14px; font-weight: 700; cursor: pointer; }
.qv-btn.primary { background: var(--qv-primary, #166534); color: #fff; width: 100%; }
.qv-btn.ghost { background: transparent; color: var(--qv-text, #cbd5e1); }
.qv-btn.sm { padding: 6px 10px; font-size: 12px; width: auto; }
.qv-hint {
  font-size: 12px;
  color: var(--qv-muted, #94a3b8);
  margin-top: 16px;
  line-height: 1.45;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.qv-err {
  margin: 12px 16px;
  padding: 10px 12px;
  background: #7f1d1d;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.qv-tabs { display: flex; gap: 4px; padding: 8px; border-bottom: 1px solid var(--qv-border, #1e293b); overflow-x: auto; }
.qv-tabs button { flex: 1; min-width: 0; background: var(--qv-surface, #1e293b); color: var(--qv-muted, #cbd5e1); border: none; border-radius: 8px; padding: 10px 8px; font-weight: 700; }
.qv-tabs button.on { background: var(--qv-primary, #166534); color: #fff; }
.qv-suite {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.qv-suite button {
  flex: 0 0 auto;
  background: var(--qv-surface, #1e293b);
  color: var(--qv-muted, #94a3b8);
  border: none;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.qv-suite button.on { background: var(--qv-secondary, #334155); color: #fff; }
.qv-pane { padding-bottom: 72px; }
.qv-section-title { margin: 8px 16px; font-size: 1.1rem; }
.qv-office-section { margin-bottom: 8px; }
.qv-office-card {
  margin: 8px 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--qv-surface, #1e293b);
  border: 1px solid var(--qv-border, #334155);
}
.qv-office-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 4px;
}
.qv-office-head small { color: var(--qv-muted, #94a3b8); font-size: 12px; }
.qv-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 12px; flex-wrap: wrap; }
.qv-sorters, .qv-day-nav { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.qv-sorters button { background: var(--qv-surface, #1e293b); color: var(--qv-muted, #94a3b8); border: none; border-radius: 999px; padding: 6px 10px; font-size: 12px; }
.qv-sorters button.on { background: var(--qv-secondary, #334155); color: #fff; }
.qv-day-nav { padding: 8px 12px; }
.qv-day-grid { padding: 0 8px 16px; }
.qv-hour-row {
  display: grid;
  grid-template-columns: 52px 1fr;
  min-height: 56px;
  border-top: 1px solid var(--qv-border, #1e293b);
}
.qv-hour-label {
  font-size: 11px;
  color: var(--qv-muted, #64748b);
  padding: 4px 4px 0 0;
  text-align: right;
}
.qv-hour-lane {
  position: relative;
  border-left: 1px solid var(--qv-border, #1e293b);
  padding: 2px 4px 4px 8px;
  min-height: 56px;
}
.qv-cal-block {
  background: color-mix(in srgb, var(--qv-primary, #166534) 28%, var(--qv-surface, #1e293b));
  border-left: 3px solid var(--qv-accent, var(--qv-primary, #22c55e));
  border-radius: 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.qv-cal-block strong { font-size: 13px; }
.qv-cal-block small { font-size: 11px; color: var(--qv-muted, #cbd5e1); }
.qv-cal-block .qv-btn { margin-top: 4px; align-self: flex-start; }
.qv-row { width: 100%; display: flex; gap: 10px; align-items: center; text-align: left; background: transparent; border: none; border-bottom: 1px solid var(--qv-border, #1e293b); padding: 12px 16px; color: inherit; cursor: pointer; }
.qv-row.unread strong { color: var(--qv-text, #fff); }
.qv-row .meta { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.qv-row .meta strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qv-row .meta small { font-size: 12px; color: var(--qv-muted, #94a3b8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge { font-size: 10px; background: color-mix(in srgb, var(--qv-accent, #854d0e) 55%, #000); color: #fef9c3; border-radius: 999px; padding: 2px 6px; font-weight: 800; }
.qv-bubble { margin: 10px 16px; padding: 10px 12px; border-radius: 12px; background: var(--qv-surface, #1e293b); }
.qv-bubble.outbound { background: color-mix(in srgb, var(--qv-primary, #14532d) 55%, #0a1610); }
.qv-bubble .when { font-size: 11px; color: var(--qv-muted, #94a3b8); margin-bottom: 4px; }
.qv-reply { display: grid; gap: 8px; margin: 12px 16px 20px; }
.qv-reply textarea,
.qv-sheet input,
.qv-sheet textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--qv-border, #334155);
  background: var(--qv-surface, #1e293b);
  color: var(--qv-text, #f8fafc);
  padding: 10px;
  resize: vertical;
}
.qv-date { background: var(--qv-surface, #1e293b); color: var(--qv-text, #fff); border: 1px solid var(--qv-border, #334155); border-radius: 8px; padding: 6px; }
.muted { color: var(--qv-muted, #94a3b8); }
.qv-modal {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.72);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 60;
  padding: 12px;
}
.qv-sheet {
  width: 100%;
  max-width: 480px;
  background: var(--qv-bg, #111827);
  border: 1px solid var(--qv-border, #334155);
  border-radius: 16px 16px 12px 12px;
  padding: 16px;
  max-height: 88vh;
  overflow: auto;
}
.qv-task-detail h3 { margin: 8px 0 4px; }
.qv-task-detail h4 { margin: 16px 0 8px; font-size: 13px; color: var(--qv-muted, #94a3b8); text-transform: uppercase; letter-spacing: 0.04em; }
.qv-detail-meta { margin: 0 0 6px; font-size: 12px; color: var(--qv-muted, #94a3b8); }
.qv-detail-body { margin: 10px 0; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
.qv-links { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
.qv-links a { color: color-mix(in srgb, var(--qv-primary, #93c5fd) 70%, #fff); font-size: 13px; word-break: break-all; }
.qv-comment { padding: 8px 0; border-bottom: 1px solid var(--qv-border, #1e293b); }
.qv-comment strong { display: block; font-size: 13px; }
.qv-comment small { color: var(--qv-muted, #64748b); font-size: 11px; }
.qv-comment p { margin: 4px 0 0; font-size: 13px; line-height: 1.4; }
.qv-sheet-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.qv-sheet label { display: block; font-size: 12px; color: var(--qv-muted, #94a3b8); margin: 8px 0 4px; }
.qv-sheet h3 { margin: 0 0 4px; }
.qv-sheet-actions .qv-btn { flex: 1; }
.qv-btn.ghost.on { color: #fff; background: var(--qv-secondary, #334155); }
</style>
