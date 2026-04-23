<template>
  <div class="cpd-page" :style="themeVars">
    <div class="cpd-shell">
      <header class="cpd-topbar">
        <div class="cpd-topbar-left">
          <div class="cpd-brand-mark">
            <img v-if="displayLogoUrl" :src="displayLogoUrl" :alt="`${brandName} logo`" class="cpd-brand-logo" />
            <span v-else>{{ eventInitials }}</span>
          </div>
          <div class="cpd-topbar-copy">
            <div class="cpd-title-row">
              <h1>{{ eventTitle }}</h1>
              <span class="cpd-live-pill">LIVE</span>
              <span class="cpd-count-pill">{{ participantCount }}</span>
            </div>
            <p>{{ roleLabel }} · {{ brandName }} palette {{ themeSourceLabel }}</p>
          </div>
        </div>

        <div class="cpd-presenter-strip" aria-label="Presenter video strip">
          <article v-if="showLeadPresenterInTopStrip" class="cpd-video-tile cpd-video-tile-active">
            <div class="cpd-video-frame cpd-video-frame-lead"></div>
            <div class="cpd-video-caption">
              <span>{{ leadPresenter.name }}</span>
              <span>{{ leadPresenter.role }}</span>
            </div>
          </article>

          <article
            v-for="assistant in visibleAssistants"
            :key="assistant.name"
            class="cpd-video-tile"
          >
            <div class="cpd-video-frame cpd-video-frame-assistant"></div>
            <div class="cpd-video-caption">
              <span>{{ assistant.name }}</span>
              <span>{{ assistant.role }}</span>
            </div>
          </article>
        </div>

        <div class="cpd-topbar-actions">
          <button type="button" class="cpd-topbar-btn" @click="toggleCompactLayout">
            {{ railCollapsed ? "Expand Panels" : "Compact Layout" }}
          </button>
          <button type="button" class="cpd-topbar-btn" @click="engageCollapsed = !engageCollapsed">
            {{ engageCollapsed ? "Show Engage" : "Hide Engage" }}
          </button>
          <router-link v-if="builderHref" :to="builderHref" class="cpd-topbar-btn cpd-topbar-link">
            Builder
          </router-link>
        </div>
      </header>

      <section v-if="canManagePresentation" class="cpd-host-toolbar" aria-label="Presenter controls">
        <div class="cpd-host-chip">
          <span class="cpd-host-label">Slide</span>
          <strong>{{ currentSlide.number }} / {{ slides.length }}</strong>
        </div>
        <div class="cpd-host-chip">
          <span class="cpd-host-label">Mapped activity</span>
          <strong>{{ currentSlide.activityId ? currentActivity.shortLabel : "None" }}</strong>
        </div>
        <button type="button" class="cpd-host-btn" @click="toggleRelease">
          {{ activityReleased ? "Lock Activity" : "Release Activity" }}
        </button>
        <button type="button" class="cpd-host-btn" @click="followPresenterLocked = !followPresenterLocked">
          {{ followPresenterLocked ? "Unlock Navigation" : "Lock Follow Mode" }}
        </button>
      </section>

      <main class="cpd-main-grid" :class="{ 'is-rail-collapsed': railCollapsed, 'is-workspace-focused': hasSlideWorkspaceAttachment }">
        <section class="cpd-workspace-card">
          <div class="cpd-card-topline">
            <div class="cpd-card-title">
              <span>{{ worksheetLabel }}</span>
              <button type="button" class="cpd-chevron-btn">v</button>
            </div>
            <div class="cpd-save-cluster">
              <select
                v-if="documentLibrary.length"
                v-model="selectedDocumentId"
                class="cpd-doc-picker"
              >
                <option
                  v-for="doc in documentLibrary"
                  :key="`doc-${doc.id}`"
                  :value="doc.id"
                >
                  {{ doc.displayLabel }}
                </option>
              </select>
              <span class="cpd-save-pill" :class="`is-${saveState}`">{{ saveStateLabel }}</span>
              <button type="button" class="cpd-more-btn">...</button>
            </div>
          </div>

          <div v-if="canManagePresentation && !isGuardianView" class="cpd-doc-admin-row">
            <input
              v-model.trim="libraryUploadTitle"
              class="cpd-doc-admin-input"
              type="text"
              maxlength="255"
              placeholder="Optional library title"
            />
            <input
              ref="hiddenUploadInput"
              type="file"
              accept="application/pdf"
              class="cpd-hidden-upload"
              @change="onDocumentUpload"
            />
            <button type="button" class="cpd-docs-btn" :disabled="libraryUploading" @click="triggerDocumentUpload">
              {{ libraryUploading ? "Uploading..." : "Upload PDF to class library" }}
            </button>
            <button
              v-if="selectedDocument && !editingFieldDefinitions"
              type="button"
              class="cpd-docs-btn"
              @click="openFieldDefinitionEditor"
            >
              Map typing fields
            </button>
            <button
              v-if="selectedDocument && editingFieldDefinitions"
              type="button"
              class="cpd-docs-btn"
              @click="saveFieldDefinitionEditor"
            >
              Save field map
            </button>
            <button
              v-if="editingFieldDefinitions"
              type="button"
              class="cpd-docs-btn"
              @click="cancelFieldDefinitionEditor"
            >
              Cancel
            </button>
          </div>
          <p v-if="documentError" class="cpd-doc-error">{{ documentError }}</p>

          <div class="cpd-workspace-shell">
            <nav class="cpd-tool-rail" aria-label="Worksheet tools">
              <button
                v-for="tool in worksheetTools"
                :key="tool.id"
                type="button"
                class="cpd-tool-btn"
                :class="{ active: tool.id === activeWorksheetTool }"
                @click="activeWorksheetTool = tool.id"
              >
                {{ tool.label }}
              </button>
            </nav>

            <div class="cpd-document-surface">
              <div v-if="selectedDocument && editingFieldDefinitions && documentBlobUrl && canManagePresentation" class="cpd-document-page cpd-document-page-builder">
                <div class="cpd-activity-tag">Template editor</div>
                <h2>{{ selectedDocument.displayLabel }}</h2>
                <p class="cpd-document-directions">
                  Set where each participant types on this PDF. The same template can be reused across future runs of this program.
                </p>
                <PDFFieldDefinitionBuilder
                  :pdf-url="documentBlobUrl"
                  v-model="fieldDefinitionsDraft"
                />
              </div>

              <div v-else-if="usingLiveDocumentWorkspace" class="cpd-document-page">
                <div class="cpd-activity-tag">{{ currentActivity.shortLabel }}</div>
                <h2>{{ selectedDocument.displayLabel }}</h2>
                <p class="cpd-document-directions">
                  Every participant gets a private saved copy of this worksheet. Their answers are restored when they return to class details later.
                </p>
                <ClassroomFillablePdfWorkspace
                  :pdf-url="documentBlobUrl"
                  :field-definitions="activeFieldDefinitions"
                  :disabled="!activityReleased"
                  v-model="documentValues"
                />
              </div>

              <div v-else class="cpd-document-page">
                <div class="cpd-activity-tag">{{ currentActivity.shortLabel }}</div>
                <h2>{{ currentActivity.title }}</h2>
                <p class="cpd-document-directions">
                  {{ activityReleased ? currentActivity.instructions : "The presenter is introducing this activity. Fields unlock when Release Activity is used." }}
                </p>

                <div class="cpd-document-content">
                  <template v-for="block in currentActivity.blocks" :key="block.id">
                    <section v-if="block.type === 'prompt'" class="cpd-doc-block cpd-doc-block-note">
                      <p>{{ block.copy }}</p>
                    </section>

                    <label v-else-if="block.type === 'shortText'" class="cpd-doc-block">
                      <span class="cpd-doc-label">{{ block.label }}</span>
                      <input
                        v-model.trim="workspaceDraft[block.model]"
                        class="cpd-doc-input"
                        type="text"
                        :disabled="!activityReleased"
                        :placeholder="block.placeholder"
                      />
                    </label>

                    <label v-else-if="block.type === 'paragraph'" class="cpd-doc-block">
                      <span class="cpd-doc-label">{{ block.label }}</span>
                      <textarea
                        v-model.trim="workspaceDraft[block.model]"
                        class="cpd-doc-input cpd-doc-textarea"
                        rows="4"
                        :disabled="!activityReleased"
                        :placeholder="block.placeholder"
                      />
                    </label>

                    <section v-else-if="block.type === 'mood'" class="cpd-doc-block">
                      <span class="cpd-doc-label">{{ block.label }}</span>
                      <div class="cpd-mood-row" role="group" :aria-label="block.label">
                        <button
                          v-for="option in block.options"
                          :key="option.value"
                          type="button"
                          class="cpd-mood-btn"
                          :class="{ active: workspaceDraft[block.model] === option.value }"
                          :disabled="!activityReleased"
                          @click="workspaceDraft[block.model] = option.value"
                        >
                          {{ option.label }}
                        </button>
                      </div>
                    </section>

                    <section v-else-if="block.type === 'checklist'" class="cpd-doc-block">
                      <span class="cpd-doc-label">{{ block.label }}</span>
                      <div class="cpd-checklist">
                        <label
                          v-for="item in block.options"
                          :key="item.value"
                          class="cpd-check-row"
                        >
                          <input
                            v-model="workspaceDraft[block.model]"
                            type="checkbox"
                            :value="item.value"
                            :disabled="!activityReleased"
                          />
                          <span>{{ item.label }}</span>
                        </label>
                      </div>
                    </section>

                    <section v-else-if="block.type === 'table'" class="cpd-doc-block">
                      <span class="cpd-doc-label">{{ block.label }}</span>
                      <div class="cpd-table-wrap">
                        <table class="cpd-response-table">
                          <thead>
                            <tr>
                              <th v-for="column in block.columns" :key="column.key">{{ column.label }}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr
                              v-for="(row, rowIndex) in workspaceDraft[block.model]"
                              :key="`${block.model}-${rowIndex}`"
                            >
                              <td v-for="column in block.columns" :key="column.key">
                                <input
                                  v-model.trim="row[column.key]"
                                  class="cpd-doc-input cpd-doc-input-inline"
                                  type="text"
                                  :disabled="!activityReleased"
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <div class="cpd-workspace-bar">
            <button
              type="button"
              class="cpd-docs-btn"
              :disabled="!selectedDocument"
              @click="downloadFilledDocument"
            >
              {{ selectedDocument ? "Download My Document" : "My Documents" }}
            </button>
            <span class="cpd-saved-text">{{ saveStateLabel }}</span>
          </div>
        </section>

        <section class="cpd-center-column">
          <article class="cpd-stage-card">
            <div class="cpd-stage-content" :class="{ 'is-workspace-supporting': hasSlideWorkspaceAttachment }">
              <div class="cpd-stage-copy">
                <span class="cpd-stage-number">{{ currentSlide.number.toString().padStart(2, "0") }}</span>
                <h3>{{ currentSlide.headline }}</h3>
                <p>{{ currentSlide.summary }}</p>
              </div>

              <div class="cpd-stage-visual">
                <div v-if="currentSlideGoogleUrl" class="cpd-stage-visual-frame cpd-stage-visual-frame-embed">
                  <iframe
                    class="cpd-stage-embed"
                    :src="currentSlideGoogleUrl"
                    title="Google Slides stage"
                    loading="lazy"
                  ></iframe>
                </div>
                <div v-else-if="showLeadPresenterInStage" class="cpd-stage-visual-frame cpd-stage-visual-frame-presenter">
                  <div class="cpd-video-frame cpd-video-frame-lead cpd-video-frame-stage"></div>
                  <div class="cpd-stage-presenter-caption">
                    <span>{{ leadPresenter.name }}</span>
                    <span>{{ leadPresenter.role }}</span>
                  </div>
                </div>
                <div v-else class="cpd-stage-visual-frame">
                  <div class="cpd-stage-visual-seedling"></div>
                </div>
              </div>
            </div>

            <div v-if="spotlightQuestion" class="cpd-spotlight-card">
              <div class="cpd-spotlight-head">
                <strong>Question For The Whole Room</strong>
                <span>{{ spotlightQuestion.promotedBy === 'assistant' ? 'Promoted by assistant' : 'Promoted by class' }}</span>
              </div>
              <p>{{ spotlightQuestion.body }}</p>
              <div class="cpd-spotlight-actions">
                <span>{{ spotlightQuestion.votes }} promotions</span>
                <button v-if="isLeadPresenter" type="button" class="cpd-answer-live-btn" @click="dismissPromotedQuestion(spotlightQuestion.id)">
                  Dismiss
                </button>
              </div>
            </div>

            <div class="cpd-stage-nav">
              <div class="cpd-stage-nav-left">
                <button
                  type="button"
                  class="cpd-stage-nav-btn"
                  :disabled="currentSlideIndex === 0"
                  @click="goToSlide(currentSlideIndex - 1)"
                >
                  Prev
                </button>
                <div class="cpd-stage-progress">Slide {{ currentSlide.number }} of {{ slides.length }}</div>
                <button
                  type="button"
                  class="cpd-stage-nav-btn"
                  :disabled="currentSlideIndex === slides.length - 1"
                  @click="goToSlide(currentSlideIndex + 1)"
                >
                  Next
                </button>
              </div>

              <button
                type="button"
                class="cpd-follow-btn"
                @click="followPresenterLocked = !followPresenterLocked"
              >
                {{ followPresenterLocked ? "Follow Presenter" : "Free Navigation" }}
              </button>
            </div>
          </article>

          <section v-if="!engageCollapsed" class="cpd-engage-card">
            <div class="cpd-engage-head">
              <h4>{{ canManagePresentation ? "Presenter Console" : "Engage" }}</h4>
              <span>{{ followPresenterLocked ? "Guided mode" : "Flexible mode" }}</span>
            </div>

            <div class="cpd-engage-grid" :style="engageGridStyle">
              <article v-if="canManagePresentation" class="cpd-engage-panel">
                <div class="cpd-engage-panel-head">
                  <span>{{ isAssistantPresenter ? "Moderator desk" : "Presenter queue" }}</span>
                  <button type="button" class="cpd-more-btn">...</button>
                </div>
                <p class="cpd-engage-question">
                  {{ spotlightQuestion
                    ? spotlightQuestion.body
                    : isAssistantPresenter
                      ? "Questions you promote or that reach the class threshold will land in the presenter spotlight."
                      : "Assistant-promoted or class-promoted questions will appear here for the presenter." }}
                </p>
                <div class="cpd-host-poll-status">
                  <span class="cpd-activity-tag">{{ spotlightQuestion ? 'Spotlight live' : 'Queue waiting' }}</span>
                  <span>{{ promotedThresholdLabel }}</span>
                </div>
                <div class="cpd-host-poll-actions">
                  <button
                    type="button"
                    class="cpd-submit-btn"
                    :disabled="!nextPromotableQuestion || !isAssistantPresenter"
                    @click="promoteQuestion(nextPromotableQuestion?.id, 'assistant')"
                  >
                    {{ isAssistantPresenter ? 'Send To Presenter' : 'Presenter View' }}
                  </button>
                  <button
                    type="button"
                    class="cpd-docs-btn"
                    :disabled="!spotlightQuestion || !isLeadPresenter"
                    @click="dismissPromotedQuestion(spotlightQuestion?.id)"
                  >
                    Dismiss Question
                  </button>
                </div>
              </article>

              <article v-if="canManagePresentation" class="cpd-engage-panel">
                <div class="cpd-engage-panel-head">
                  <span>Slide poll</span>
                  <button type="button" class="cpd-more-btn">...</button>
                </div>
                <p class="cpd-engage-question">
                  {{ activeSlidePoll ? activeSlidePoll.question : "No poll is tied to this slide yet." }}
                </p>
                <div class="cpd-host-poll-status">
                  <span class="cpd-activity-tag">{{ activePoll ? 'Live now' : 'Not released' }}</span>
                  <span v-if="activeSlidePoll">{{ activeSlidePoll.releaseMode === 'auto' ? 'Auto release' : 'Manual release' }}</span>
                </div>
                <div class="cpd-host-poll-actions">
                  <button type="button" class="cpd-submit-btn" :disabled="!activeSlidePoll" @click="releaseCurrentSlidePoll">
                    Release Poll
                  </button>
                  <button type="button" class="cpd-docs-btn" :disabled="!activePoll" @click="closeActivePoll">
                    Close Poll
                  </button>
                </div>
              </article>

              <article v-else-if="showParticipantPollCard" class="cpd-engage-panel cpd-engage-panel-pulse">
                <div class="cpd-engage-panel-head">
                  <span>{{ activePoll.title }}</span>
                  <button type="button" class="cpd-more-btn">...</button>
                </div>
                <p class="cpd-engage-question">{{ activePoll.question }}</p>
                <div class="cpd-option-list">
                  <label
                    v-for="option in activePoll.options"
                    :key="option.id"
                    class="cpd-option-row"
                  >
                    <input v-model="participantPollChoice" type="radio" :name="`poll-${activePoll.id}`" :value="option.label" />
                    <span>{{ option.label }}</span>
                  </label>
                </div>
                <button type="button" class="cpd-submit-btn" @click="submitParticipantPoll">Submit</button>
              </article>

              <article class="cpd-engage-panel">
                <div class="cpd-engage-panel-head">
                  <span>{{ canManagePresentation ? "Speaker notes" : "Word cloud" }}</span>
                  <button type="button" class="cpd-more-btn">...</button>
                </div>
                <template v-if="canManagePresentation">
                  <p class="cpd-host-notes-copy">{{ currentSlideNotes || "No speaker notes added for this slide yet." }}</p>
                </template>
                <template v-else>
                  <div class="cpd-word-cloud">
                    <span
                      v-for="word in wordCloudWords"
                      :key="word.label"
                      class="cpd-word"
                      :style="{ fontSize: `${word.size}px` }"
                    >
                      {{ word.label }}
                    </span>
                  </div>
                </template>
              </article>

              <article class="cpd-engage-panel cpd-engage-panel-hand">
                <div class="cpd-engage-panel-head">
                  <span>{{ canManagePresentation ? "Room controls" : "Raise Hand" }}</span>
                </div>
                <div class="cpd-hand-spot">{{ canManagePresentation ? "Host" : "Hand" }}</div>
                <p>
                  {{ canManagePresentation
                    ? "Collapse the rail for smaller screens, keep polls tied to slides, and release activities only when ready."
                    : "You'll be added to the queue to ask a question." }}
                </p>
                <button v-if="canManagePresentation" type="button" class="cpd-submit-btn" @click="railCollapsed = !railCollapsed">
                  {{ railCollapsed ? "Show Right Rail" : "Hide Right Rail" }}
                </button>
                <button v-else type="button" class="cpd-submit-btn" @click="handRaisedSelf = !handRaisedSelf">
                  {{ handRaisedSelf ? "Lower Hand" : "Raise Hand" }}
                </button>
              </article>
            </div>
          </section>
        </section>

        <aside v-if="!railCollapsed" class="cpd-rail-column">
          <section class="cpd-rail-card">
            <div class="cpd-rail-tabs" role="tablist" aria-label="Engagement tabs">
              <button
                v-for="tab in railTabs"
                :key="tab.id"
                type="button"
                class="cpd-rail-tab"
                :class="{ active: activeRailTab === tab.id }"
                :aria-selected="activeRailTab === tab.id"
                @click="activeRailTab = tab.id"
              >
                {{ tab.label }}
              </button>
            </div>

            <div class="cpd-rail-thread">
              <div class="cpd-rail-thread-head">
                <strong>{{ activeRailTitle }}</strong>
                <button type="button" class="cpd-chevron-btn">Go</button>
              </div>

              <div v-if="activeRailTab === 'chat'" class="cpd-rail-feed">
                <article v-for="message in chatMessages" :key="message.id" class="cpd-thread-item">
                  <div class="cpd-thread-avatar" :style="{ background: message.badgeColor }">{{ message.avatar }}</div>
                  <div class="cpd-thread-body">
                    <div class="cpd-thread-meta">
                      <strong>{{ message.author }}</strong>
                      <span>{{ message.time }}</span>
                    </div>
                    <p>{{ message.body }}</p>
                  </div>
                </article>
              </div>

              <div v-else-if="activeRailTab === 'qa'" class="cpd-rail-feed">
                <article v-for="question in questions" :key="question.id" class="cpd-thread-item">
                  <div class="cpd-thread-avatar" :style="{ background: question.badgeColor }">{{ question.avatar }}</div>
                  <div class="cpd-thread-body">
                    <div class="cpd-thread-meta">
                      <strong>{{ question.author }}</strong>
                      <span>{{ question.time }}</span>
                    </div>
                    <p>{{ question.body }}</p>
                    <div class="cpd-thread-reactions">
                      {{ question.votes }} promotions
                      <span v-if="question.promoted"> · sent to presenter</span>
                    </div>
                    <button type="button" class="cpd-answer-live-btn" @click="handleQuestionAction(question)">
                      {{ getQuestionActionLabel(question) }}
                    </button>
                  </div>
                </article>
              </div>

              <div v-else-if="activeRailTab === 'polls'" class="cpd-rail-feed">
                <article v-for="poll in polls" :key="poll.id" class="cpd-side-poll">
                  <div class="cpd-thread-meta">
                    <strong>{{ poll.question }}</strong>
                    <span>{{ poll.visibility }}</span>
                  </div>
                  <div class="cpd-poll-results">
                    <div v-for="option in poll.options" :key="option.label" class="cpd-poll-row">
                      <div class="cpd-poll-row-head">
                        <span>{{ option.label }}</span>
                        <span>{{ option.percent }}%</span>
                      </div>
                      <div class="cpd-poll-bar"><span :style="{ width: `${option.percent}%` }"></span></div>
                    </div>
                  </div>
                </article>
              </div>

              <div v-else class="cpd-rail-feed">
                <article v-for="person in people" :key="person.name" class="cpd-thread-item">
                  <div class="cpd-thread-avatar" :style="{ background: person.badgeColor }">{{ person.avatar }}</div>
                  <div class="cpd-thread-body">
                    <div class="cpd-thread-meta">
                      <strong>{{ person.name }}</strong>
                      <span>{{ person.role }}</span>
                    </div>
                    <p>{{ person.status }}</p>
                  </div>
                </article>
              </div>

              <div class="cpd-thread-composer">
                <input
                  v-model.trim="chatDraft"
                  class="cpd-composer-input"
                  type="text"
                  :placeholder="activeRailTab === 'chat' ? 'Type a message...' : 'Add a note...'"
                />
                <button type="button" class="cpd-send-btn">Send</button>
              </div>
            </div>
          </section>

          <section class="cpd-question-card">
            <div class="cpd-question-head">
              <strong>Questions</strong>
              <span>Most Recent</span>
            </div>

            <article v-for="question in questions" :key="`stack-${question.id}`" class="cpd-question-item">
              <div class="cpd-question-meta">
                <div class="cpd-question-user">
                  <div class="cpd-mini-avatar" :style="{ background: question.badgeColor }">{{ question.avatar }}</div>
                  <strong>{{ question.author }}</strong>
                </div>
                <span>{{ question.time }}</span>
              </div>
              <p>{{ question.body }}</p>
              <div class="cpd-question-actions">
                <span>{{ question.votes }} promotions</span>
                <button type="button" class="cpd-answer-live-btn" @click="handleQuestionAction(question)">
                  {{ getQuestionActionLabel(question) }}
                </button>
              </div>
            </article>
          </section>

          <section class="cpd-hands-card">
            <div class="cpd-hands-head">
              <strong>Hands Raised ({{ raisedHands.length }})</strong>
              <button type="button" class="cpd-chevron-btn">^</button>
            </div>
            <div class="cpd-hand-list">
              <span
                v-for="hand in raisedHands"
                :key="hand.name"
                class="cpd-hand-badge"
                :style="{ background: hand.badgeColor }"
              >
                {{ hand.avatar }}
              </span>
            </div>
          </section>
        </aside>
      </main>

      <footer class="cpd-action-bar">
        <template v-if="canManagePresentation">
          <button type="button" class="cpd-action-btn" @click="micOn = !micOn">{{ micOn ? "Mute Host Mic" : "Unmute Host Mic" }}</button>
          <button type="button" class="cpd-action-btn" :disabled="!videoAllowed" @click="videoOn = !videoOn">
            {{ videoAllowed ? (videoOn ? "Stop Camera" : "Start Camera") : "Video Disabled" }}
          </button>
          <button type="button" class="cpd-action-btn">Share Screen</button>
          <button type="button" class="cpd-action-btn" :disabled="!activeSlidePoll" @click="releaseCurrentSlidePoll">
            {{ activePoll ? "Poll Live" : "Release Poll" }}
          </button>
          <router-link v-if="builderHref" :to="builderHref" class="cpd-action-btn cpd-action-link">Open Builder</router-link>
          <button type="button" class="cpd-action-btn cpd-action-btn-leave">End Class</button>
        </template>

        <template v-else>
          <button type="button" class="cpd-action-btn" @click="micOn = !micOn">{{ micOn ? "Mute" : "Unmute" }}</button>
          <button type="button" class="cpd-action-btn" :disabled="!videoAllowed" @click="videoOn = !videoOn">
            {{ videoAllowed ? (videoOn ? "Stop Video" : "Start Video") : "Video Disabled" }}
          </button>
          <button type="button" class="cpd-action-btn">Share</button>
          <button type="button" class="cpd-action-btn" @click="reactionPulse = !reactionPulse">Reactions</button>
          <button type="button" class="cpd-action-btn" @click="handRaisedSelf = !handRaisedSelf">
            {{ handRaisedSelf ? "Lower Hand" : "Raise Hand" }}
          </button>
          <button type="button" class="cpd-action-btn cpd-action-btn-leave">Leave</button>
        </template>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import ClassroomFillablePdfWorkspace from '../../components/classroom/ClassroomFillablePdfWorkspace.vue';
import PDFFieldDefinitionBuilder from '../../components/documents/PDFFieldDefinitionBuilder.vue';
import {
  createMentalHealthDemoPlan,
  loadClassPresentationEventAssignment,
  loadClassPresentationSession,
  loadGuardianClassPresentationEventAssignment,
  normalizeClassPresentationPlan
} from '../../services/classPresentationBuilder';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';

const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const activityCatalog = {
  "activity-1": {
    shortLabel: "Activity #1",
    title: "Welcome Check-in",
    instructions: "Kids can mark how they are arriving and name one feeling or body clue they notice right now.",
    pageCount: 1,
    blocks: [
      { id: "a1-copy", type: "prompt", copy: "This response stays private unless the facilitator intentionally opens a sharing moment." },
      {
        id: "a1-mood",
        type: "mood",
        label: "How big do your feelings feel right now?",
        model: "mood",
        options: [
          { label: "Really big", value: "really_big" },
          { label: "A little wiggly", value: "wiggly" },
          { label: "Pretty steady", value: "steady" },
          { label: "Calm and ready", value: "ready" }
        ]
      },
      {
        id: "a1-note",
        type: "shortText",
        label: "What feeling word fits best right now?",
        model: "arrivalNote",
        placeholder: "Worried, excited, frustrated, proud..."
      }
    ]
  },
  "activity-2": {
    shortLabel: "Activity #2",
    title: "Body Clues Map",
    instructions: "Directions: Think about a time you felt upset and name what your body did first.",
    pageCount: 1,
    blocks: [
      { id: "a2-copy", type: "prompt", copy: "The left document area should feel like a real worksheet, not a floating form." },
      {
        id: "a2-table",
        type: "table",
        label: "Body clue tracker",
        model: "foodWebRows",
        columns: [
          { key: "organism", label: "Feeling" },
          { key: "eats", label: "What happens in my body?" }
        ]
      },
      {
        id: "a2-reflection",
        type: "paragraph",
        label: "What body clue do you want to notice sooner next time?",
        model: "reflection",
        placeholder: "Write a short note about something your body does before feelings get really big"
      }
    ]
  },
  "activity-3": {
    shortLabel: "Activity #3",
    title: "My Calm-Down Toolbox",
    instructions: "Choose the calming tools that work best for you and describe one place you can practice them.",
    pageCount: 1,
    blocks: [
      { id: "a3-copy", type: "prompt", copy: "There is no single right calm-down tool. Kids can choose what truly helps their body feel safer and steadier." },
      {
        id: "a3-checklist",
        type: "checklist",
        label: "Tools I might try",
        model: "toolboxChoices",
        options: [
          { label: 'Slow breathing', value: 'breathing' },
          { label: 'Squeezing something soft', value: 'sensory' },
          { label: 'Stretching or moving', value: 'movement' },
          { label: 'Talking to an adult', value: 'adult' }
        ]
      },
      {
        id: "a3-reflection",
        type: "paragraph",
        label: "Where could you practice one of these tools this week?",
        model: "toolboxReflection",
        placeholder: "At bedtime, before school, on the bus, during a break..."
      }
    ]
  },
  "activity-4": {
    shortLabel: "Activity #4",
    title: "Trusted Adult Plan",
    instructions: "Write the names of safe adults who can help when feelings get too big.",
    pageCount: 1,
    blocks: [
      {
        id: "a4-home",
        type: "shortText",
        label: "Trusted adult at home",
        model: "trustedHome",
        placeholder: "Parent, grandparent, older sibling..."
      },
      {
        id: "a4-school",
        type: "shortText",
        label: "Trusted adult at school",
        model: "trustedSchool",
        placeholder: "Teacher, counselor, social worker..."
      },
      {
        id: "a4-community",
        type: "shortText",
        label: "Trusted adult in the community",
        model: "trustedCommunity",
        placeholder: "Coach, neighbor, mentor..."
      }
    ]
  },
  "activity-5": {
    shortLabel: "Activity #5",
    title: "One Small Step",
    instructions: "Pick one strategy you want to try before the next class.",
    pageCount: 1,
    blocks: [
      {
        id: "a5-step",
        type: "shortText",
        label: "My small step for this week",
        model: "smallStep",
        placeholder: "I will practice slow breathing before bed."
      }
    ]
  },
  fallback: {
    shortLabel: "No activity",
    title: "Presentation Only",
    instructions: "This slide does not currently have a worksheet mapped to it.",
    pageCount: 1,
    blocks: [
      { id: "fallback-copy", type: "prompt", copy: "Slides can stay presentation-only, or they can map directly to worksheets, polls, and future live activities." }
    ]
  }
};

const worksheetTools = [
  { id: "select", label: "Sel" },
  { id: "annotate", label: "Pen" },
  { id: "text", label: "Text" },
  { id: "check", label: "Box" },
  { id: "image", label: "Img" }
];

const wordCloudWords = [
  { label: "calm", size: 21 },
  { label: "feelings", size: 18 },
  { label: "safe", size: 16 },
  { label: "breathing", size: 14 },
  { label: "support", size: 13 },
  { label: "body clues", size: 12 },
  { label: "trusted adults", size: 11 }
];

const chatMessages = [
  { id: 1, avatar: "M", author: "Maya", time: "4:05 PM", body: "Sometimes my hands get shaky when I feel embarrassed.", badgeColor: "#6c5ce7" },
  { id: 2, avatar: "J", author: "Jalen", time: "4:06 PM", body: "Can moving around help if my body feels super tense?", badgeColor: "#43aa65" },
  { id: 3, avatar: "MR", author: "Ms. Rivera", time: "4:07 PM", body: "Yes, movement can be a great regulation tool when it feels safe.", badgeColor: "#c79dff" },
  { id: 4, avatar: "L", author: "Lina", time: "4:08 PM", body: "I like squeezing a pillow when I am frustrated.", badgeColor: "#d65f9b" }
];

const questions = ref([
  { id: 1, avatar: "S", author: "Sofia", time: "4:10 PM", body: "What should I do if I notice a body clue in the middle of class?", votes: 3, badgeColor: "#e2a93b" },
  { id: 2, avatar: "E", author: "Ethan", time: "4:11 PM", body: "How do I know which adult is safe to ask for help?", votes: 2, badgeColor: "#6ca8ff" }
]);

const people = [
  { avatar: "MR", name: "Ms. Rivera", role: "Presenter", status: "Guiding the lesson and pacing the room", badgeColor: "#c79dff" },
  { avatar: "MJ", name: "Mr. Johnson", role: "Teaching assistant", status: "Monitoring chat and support requests", badgeColor: "#7fa866" },
  { avatar: "M", name: "Maya", role: "Participant", status: "Working in the body clues worksheet", badgeColor: "#6c5ce7" },
  { avatar: "J", name: "Jalen", role: "Participant", status: "Following presenter", badgeColor: "#43aa65" }
];

const raisedHands = [
  { avatar: "S", name: "Sofia", wait: "Waiting 00:48", badgeColor: "#d65f9b" },
  { avatar: "L", name: "Liam", wait: "Waiting 00:19", badgeColor: "#43aa65" }
];

const leadPresenter = {
  name: "Ms. Rivera",
  role: "Child Wellness Coach"
};

const assistants = [
  { name: "Mr. Johnson", role: "TA" },
  { name: "Riley Chen", role: "Assistant" }
];

const workspaceDraft = ref({
  mood: "steady",
  arrivalNote: "Nervous but ready",
  foodWebRows: [
    { organism: "Worried", eats: "tight chest" },
    { organism: "Frustrated", eats: "hot face" },
    { organism: "Embarrassed", eats: "butterflies" },
    { organism: "Angry", eats: "tense fists" },
    { organism: "Sad", eats: "heavy body" },
    { organism: "Excited", eats: "bouncy legs" }
  ],
  reflection: "I want to notice my tight chest sooner so I can try slow breathing before feelings get huge.",
  toolboxChoices: ['breathing', 'movement'],
  toolboxReflection: 'I can practice my calm-down tools before homework.',
  trustedHome: 'Grandma',
  trustedSchool: 'School counselor',
  trustedCommunity: 'Coach Elena',
  smallStep: 'I will use a breathing card when my body feels tight.'
});

const seriesId = computed(() => String(route.query.seriesId || '').trim());
const sessionId = computed(() => String(route.query.sessionId || '').trim());
const presentationPlan = ref(normalizeClassPresentationPlan(createMentalHealthDemoPlan(route.params.eventId || route.query.eventId || 'demo')));
const presentationLoading = ref(false);
const currentSlideIndex = ref(0);
const activeRailTab = ref("chat");
const followPresenterLocked = ref(true);
const activityReleased = ref(true);
const activeWorksheetTool = ref("annotate");
const saveState = ref("saved");
const micOn = ref(false);
const videoOn = ref(false);
const handRaisedSelf = ref(false);
const reactionPulse = ref(false);
const chatDraft = ref("");
const hiddenUploadInput = ref(null);
const libraryUploadTitle = ref('');
const libraryUploading = ref(false);
const documentLibrary = ref([]);
const selectedDocumentId = ref(null);
const documentValues = ref({});
const editingFieldDefinitions = ref(false);
const fieldDefinitionsDraft = ref([]);
const documentBlobUrl = ref('');
const documentLoading = ref(false);
const documentError = ref('');
const docSaveTimer = ref(null);
const hydratingDocumentValues = ref(false);
const activePollId = ref('');
const participantPollAnswers = ref({});
const participantPollChoice = ref('');
const railCollapsed = ref(false);
const engageCollapsed = ref(false);

const role = computed(() => String(route.query.role || "participant").trim().toLowerCase());
const isLeadPresenter = computed(() => ["host", "presenter"].includes(role.value));
const isAssistantPresenter = computed(() => ["assistant", "moderator"].includes(role.value));
const canManagePresentation = computed(() => isLeadPresenter.value || isAssistantPresenter.value);
const isGuardianView = computed(() => String(authStore.user?.role || '').trim().toLowerCase() === 'client_guardian');
const roleLabel = computed(() => {
  if (role.value === "host") return "Host / Lead Presenter";
  if (role.value === "assistant") return "Assistant Presenter";
  if (role.value === "observer") return "Observer";
  return "Participant";
});
const eventTitle = computed(() => String(route.query.title || presentationPlan.value.title || "Class Presentation Dashboard").trim());
const eventId = computed(() => {
  const parsed = Number(route.params.eventId || route.query.eventId || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
});
const eventIdLabel = computed(() => String(route.params.eventId || route.query.eventId || "preview"));
const currentAgencyId = computed(() => {
  const parsed = Number(route.query.agencyId || agencyStore.currentAgency?.id || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
});
const canUseLiveDocuments = computed(() => eventId.value > 0 && (isGuardianView.value || currentAgencyId.value > 0));
const documentEndpointBase = computed(() =>
  isGuardianView.value
    ? `/guardian-portal/skill-builders/events/${eventId.value}/program-documents`
    : `/skill-builders/events/${eventId.value}/program-documents`
);
const documentRequestParams = computed(() => (isGuardianView.value ? {} : { agencyId: currentAgencyId.value }));
const participantCount = computed(() => Number(route.query.participantCount || 28));
const slides = computed(() => presentationPlan.value.slides || []);
const polls = computed(() => presentationPlan.value.polls || []);
const currentSlide = computed(() => slides.value[currentSlideIndex.value] || slides.value[0] || null);
const currentActivity = computed(() => activityCatalog[currentSlide.value?.activityId] || activityCatalog.fallback);
const selectedDocument = computed(() =>
  documentLibrary.value.find((doc) => Number(doc.id) === Number(selectedDocumentId.value)) || null
);
const hasActivityAttachment = computed(() => !!currentSlide.value?.activityId);
const hasDocumentAttachment = computed(() => !!currentSlide.value?.documentId || !!selectedDocument.value);
const hasSlideWorkspaceAttachment = computed(() => hasActivityAttachment.value || hasDocumentAttachment.value);
const activeFieldDefinitions = computed(() =>
  editingFieldDefinitions.value
    ? fieldDefinitionsDraft.value
    : Array.isArray(selectedDocument.value?.fieldDefinitions)
      ? selectedDocument.value.fieldDefinitions
      : []
);
const usingLiveDocumentWorkspace = computed(() => !!selectedDocument.value && !!documentBlobUrl.value && !editingFieldDefinitions.value);
const worksheetLabel = computed(() => {
  if (selectedDocument.value) {
    return `Slide ${currentSlide.value?.number || 1}, ${selectedDocument.value.displayLabel}`;
  }
  return `Slide ${currentSlide.value?.number || 1}, ${currentActivity.value.shortLabel}`;
});
const visibleAssistants = computed(() => assistants.slice(0, 1));
const showLeadPresenterInTopStrip = computed(() => hasSlideWorkspaceAttachment.value);
const showLeadPresenterInStage = computed(() => !hasSlideWorkspaceAttachment.value);
const activeSlidePoll = computed(() =>
  polls.value.find((poll) => poll.id === currentSlide.value?.pollId) || null
);
const activePoll = computed(() =>
  polls.value.find((poll) => poll.id === activePollId.value) || null
);
const activePollAnswer = computed(() => participantPollAnswers.value[activePoll.value?.id || ''] || '');
const showParticipantPollCard = computed(() => !canManagePresentation.value && !!activePoll.value && !activePollAnswer.value);
const promoteThreshold = computed(() => Math.max(1, Math.ceil(participantCount.value * 0.25)));
const promotedThresholdLabel = computed(() => `Auto spotlight at ${promoteThreshold.value} promotions`);
const spotlightQuestion = computed(() =>
  questions.value.find((question) => question.promoted && !question.dismissed) || null
);
const nextPromotableQuestion = computed(() =>
  questions.value.find((question) => !question.promoted && !question.dismissed) || null
);
const currentSlideNotes = computed(() => String(currentSlide.value?.notes || '').trim());
const currentSlideGoogleUrl = computed(() => {
  const perSlide = String(currentSlide.value?.googleSlidesUrl || '').trim();
  if (perSlide) return perSlide;
  if (presentationPlan.value.deckSource === 'google') {
    return String(presentationPlan.value.deckGoogleSlidesUrl || '').trim();
  }
  return '';
});
const builderHref = computed(() => {
  if (!canManagePresentation.value) return null;
  const base = route.params.organizationSlug
    ? `/${route.params.organizationSlug}/class-presentation-builder/${eventIdLabel.value}`
    : `/class-presentation-builder/${eventIdLabel.value}`;
  return {
    path: base,
    query: {
      agencyId: String(currentAgencyId.value || ''),
      seriesId: seriesId.value,
      sessionId: sessionId.value
    }
  };
});
const activeRailTitle = computed(() => {
  if (activeRailTab.value === "qa") return "Class Questions";
  if (activeRailTab.value === "polls") return "Live Polls";
  if (activeRailTab.value === "people") return "People";
  return "Class Chat";
});
const engageGridStyle = computed(() => {
  const panelCount = canManagePresentation.value ? 4 : (showParticipantPollCard.value ? 3 : 2);
  return {
    gridTemplateColumns: `repeat(${panelCount}, minmax(0, 1fr))`
  };
});
const railTabs = [
  { id: "chat", label: "Chat" },
  { id: "qa", label: "Q&A" },
  { id: "polls", label: "Polls" },
  { id: "people", label: "People" }
];
const videoAllowed = computed(() => role.value !== "observer");
const saveStateLabel = computed(() => {
  if (saveState.value === "saving") return "Saving...";
  if (saveState.value === "offline") return "Offline, retrying";
  if (saveState.value === "error") return "Save failed";
  return "All changes saved";
});
const eventInitials = computed(() => {
  const words = eventTitle.value.split(/\s+/).filter(Boolean).slice(0, 2);
  if (!words.length) return "CP";
  return words.map((word) => word[0]).join("").toUpperCase();
});

function normalizeHexColor(value, fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#([0-9a-f]{3})$/i.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toUpperCase();
  }
  if (/^#([0-9a-f]{6})$/i.test(hex)) {
    return hex.toUpperCase();
  }
  return fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(first, second, weight = 0.5) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const mix = (left, right) => Math.round(left * (1 - weight) + right * weight);
  return `#${[mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

const queryPrimaryColor = computed(() =>
  normalizeHexColor(
    route.query.eventPrimaryColor || route.query.primaryColor || route.query.brandPrimary || "",
    ""
  )
);
const querySecondaryColor = computed(() =>
  normalizeHexColor(
    route.query.eventSecondaryColor || route.query.secondaryColor || route.query.brandSecondary || "",
    ""
  )
);
const queryAccentColor = computed(() =>
  normalizeHexColor(
    route.query.eventAccentColor || route.query.accentColor || route.query.brandAccent || "",
    ""
  )
);

const brandPrimary = computed(() =>
  queryPrimaryColor.value || normalizeHexColor(brandingStore.primaryColor, "#62C584")
);
const brandSecondary = computed(() =>
  querySecondaryColor.value || normalizeHexColor(brandingStore.secondaryColor, "#1A3A2D")
);
const brandAccent = computed(() =>
  queryAccentColor.value || normalizeHexColor(brandingStore.accentColor, brandPrimary.value)
);
const displayLogoUrl = computed(() => brandingStore.displayLogoUrl || brandingStore.logoUrl || '');
const brandName = computed(() => brandingStore.displayName || route.params.organizationSlug || 'Classroom');
const themeSourceLabel = computed(() =>
  queryPrimaryColor.value || querySecondaryColor.value || queryAccentColor.value ? "override active" : "from brand settings"
);

const themeVars = computed(() => {
  const primary = brandPrimary.value;
  const secondary = brandSecondary.value;
  const accent = brandAccent.value;
  const toneSeed = mixHex(primary, secondary, 0.35);
  const background = mixHex(toneSeed, "#05070C", 0.58);
  const surface = mixHex(toneSeed, "#0A0F16", 0.46);
  const surfaceAlt = mixHex(primary, "#101725", 0.62);
  const line = rgba(primary, 0.26);
  const fontFamily = brandingStore.fontFamily || '"Source Sans 3", "Segoe UI", sans-serif';
  return {
    "--cpd-brand-primary": primary,
    "--cpd-brand-secondary": secondary,
    "--cpd-brand-accent": accent,
    "--cpd-bg": background,
    "--cpd-surface": surface,
    "--cpd-surface-alt": surfaceAlt,
    "--cpd-line": line,
    "--cpd-soft-primary": rgba(primary, 0.16),
    "--cpd-soft-accent": rgba(accent, 0.16),
    "--cpd-soft-white": "rgba(255, 255, 255, 0.06)",
    "--cpd-text": "#F8FAFF",
    "--cpd-text-soft": "rgba(231, 239, 255, 0.72)",
    "--cpd-shadow": `0 28px 60px ${rgba("#020617", 0.46)}`,
    "--cpd-font-body": fontFamily,
    "--cpd-font-title": fontFamily,
    "--cpd-sheet": "#FCFCFF",
    "--cpd-sheet-line": "#D8DEE8",
    "--cpd-sheet-text": "#182337",
    "--cpd-sheet-muted": "#68758B",
    "--cpd-sheet-fill": rgba(primary, 0.12)
  };
});

let saveTimer = null;

function queueAutosave() {
  if (!activityReleased.value) return;
  saveState.value = "saving";
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveState.value = "saved";
  }, 650);
}

function normalizeFieldDefaults(fieldDefinitions, sourceValues = {}) {
  const nextValues = { ...(sourceValues || {}) };
  (fieldDefinitions || []).forEach((field) => {
    if (!field?.id) return;
    if (field.type === 'date' && field.autoToday && !nextValues[field.id]) {
      nextValues[field.id] = new Date().toISOString().slice(0, 10);
      return;
    }
    if (field.type === 'checkbox' && !(field.id in nextValues)) {
      nextValues[field.id] = !!field.defaultChecked;
      return;
    }
    if ((field.type === 'select' || field.type === 'radio') && !(field.id in nextValues)) {
      nextValues[field.id] = '';
      return;
    }
    if (!(field.id in nextValues)) {
      nextValues[field.id] = '';
    }
  });
  return nextValues;
}

async function loadDocumentLibrary() {
  if (!canUseLiveDocuments.value) {
    documentLibrary.value = [];
    selectedDocumentId.value = null;
    return;
  }
  try {
    const response = await api.get(documentEndpointBase.value, {
      params: documentRequestParams.value,
      skipGlobalLoading: true
    });
    documentLibrary.value = Array.isArray(response.data?.documents) ? response.data.documents : [];
    const selectedExists = documentLibrary.value.some((doc) => Number(doc.id) === Number(selectedDocumentId.value));
    if (!selectedExists) {
      const preferredId = Number(route.query.documentId || 0);
      const matchingPreferred = documentLibrary.value.find((doc) => Number(doc.id) === preferredId);
      selectedDocumentId.value = matchingPreferred?.id || documentLibrary.value[0]?.id || null;
    }
  } catch (error) {
    documentLibrary.value = [];
    documentError.value = error.response?.data?.error?.message || error.message || 'Failed to load class documents';
  }
}

async function loadSelectedDocumentBlob() {
  if (!selectedDocument.value || !canUseLiveDocuments.value) {
    if (documentBlobUrl.value) {
      URL.revokeObjectURL(documentBlobUrl.value);
      documentBlobUrl.value = '';
    }
    return;
  }
  documentLoading.value = true;
  documentError.value = '';
  try {
    const response = await api.get(`${documentEndpointBase.value}/${selectedDocument.value.id}/file`, {
      params: documentRequestParams.value,
      responseType: 'blob',
      skipGlobalLoading: true
    });
    if (documentBlobUrl.value) {
      URL.revokeObjectURL(documentBlobUrl.value);
    }
    documentBlobUrl.value = URL.createObjectURL(response.data);
  } catch (error) {
    documentError.value = error.response?.data?.error?.message || error.message || 'Unable to load the PDF';
    if (documentBlobUrl.value) {
      URL.revokeObjectURL(documentBlobUrl.value);
      documentBlobUrl.value = '';
    }
  } finally {
    documentLoading.value = false;
  }
}

async function loadSelectedDocumentResponse() {
  if (!selectedDocument.value || !canUseLiveDocuments.value) {
    documentValues.value = {};
    return;
  }
  try {
    const response = await api.get(`${documentEndpointBase.value}/${selectedDocument.value.id}/response`, {
      params: documentRequestParams.value,
      skipGlobalLoading: true
    });
    hydratingDocumentValues.value = true;
    documentValues.value = normalizeFieldDefaults(
      selectedDocument.value.fieldDefinitions || [],
      response.data?.response?.fieldValues || {}
    );
    saveState.value = 'saved';
  } catch (error) {
    hydratingDocumentValues.value = true;
    documentValues.value = normalizeFieldDefaults(selectedDocument.value.fieldDefinitions || [], {});
    documentError.value = error.response?.data?.error?.message || error.message || 'Unable to load your saved response';
  } finally {
    window.setTimeout(() => {
      hydratingDocumentValues.value = false;
    }, 0);
  }
}

async function saveDocumentResponse({ status = 'draft' } = {}) {
  if (!selectedDocument.value || !canUseLiveDocuments.value || editingFieldDefinitions.value) return;
  try {
    const response = await api.put(
      `${documentEndpointBase.value}/${selectedDocument.value.id}/response`,
      {
        ...(isGuardianView.value ? {} : { agencyId: currentAgencyId.value }),
        responseValues: documentValues.value,
        status
      },
      { skipGlobalLoading: true }
    );
    hydratingDocumentValues.value = true;
    documentValues.value = normalizeFieldDefaults(
      selectedDocument.value.fieldDefinitions || [],
      response.data?.response?.fieldValues || documentValues.value
    );
    saveState.value = 'saved';
  } catch (error) {
    saveState.value = 'error';
    documentError.value = error.response?.data?.error?.message || error.message || 'Failed to save your class document';
  } finally {
    window.setTimeout(() => {
      hydratingDocumentValues.value = false;
    }, 0);
  }
}

function queueDocumentAutosave() {
  if (!selectedDocument.value || editingFieldDefinitions.value) return;
  saveState.value = 'saving';
  if (docSaveTimer.value) window.clearTimeout(docSaveTimer.value);
  docSaveTimer.value = window.setTimeout(() => {
    saveDocumentResponse();
  }, 650);
}

function triggerDocumentUpload() {
  hiddenUploadInput.value?.click();
}

async function onDocumentUpload(event) {
  const file = event.target?.files?.[0];
  if (!file || !canUseLiveDocuments.value || isGuardianView.value) return;
  libraryUploading.value = true;
  documentError.value = '';
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('agencyId', String(currentAgencyId.value));
    const title = String(libraryUploadTitle.value || '').trim();
    if (title) formData.append('title', title.slice(0, 255));
    await api.post(documentEndpointBase.value, formData, { skipGlobalLoading: true });
    libraryUploadTitle.value = '';
    await loadDocumentLibrary();
    selectedDocumentId.value = documentLibrary.value[0]?.id || selectedDocumentId.value;
  } catch (error) {
    documentError.value = error.response?.data?.error?.message || error.message || 'Upload failed';
  } finally {
    libraryUploading.value = false;
    if (event.target) event.target.value = '';
  }
}

function openFieldDefinitionEditor() {
  if (!selectedDocument.value) return;
  fieldDefinitionsDraft.value = JSON.parse(JSON.stringify(selectedDocument.value.fieldDefinitions || []));
  editingFieldDefinitions.value = true;
}

function cancelFieldDefinitionEditor() {
  editingFieldDefinitions.value = false;
  fieldDefinitionsDraft.value = [];
}

async function saveFieldDefinitionEditor() {
  if (!selectedDocument.value || isGuardianView.value) return;
  try {
    await api.patch(
      `${documentEndpointBase.value}/${selectedDocument.value.id}`,
      {
        agencyId: currentAgencyId.value,
        fieldDefinitions: fieldDefinitionsDraft.value
      },
      { skipGlobalLoading: true }
    );
    editingFieldDefinitions.value = false;
    await loadDocumentLibrary();
    await loadSelectedDocumentResponse();
  } catch (error) {
    documentError.value = error.response?.data?.error?.message || error.message || 'Unable to save field regions';
  }
}

async function downloadFilledDocument() {
  if (!selectedDocument.value || !canUseLiveDocuments.value) return;
  try {
    const response = await api.get(`${documentEndpointBase.value}/${selectedDocument.value.id}/download`, {
      params: documentRequestParams.value,
      responseType: 'blob',
      skipGlobalLoading: true
    });
    const downloadUrl = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = `${String(selectedDocument.value.displayLabel || 'class-document').replace(/\s+/g, '-').toLowerCase()}-responses.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    documentError.value = error.response?.data?.error?.message || error.message || 'Download failed';
  }
}

function syncSlideLinkedDocument() {
  const mappedDocumentId = Number(currentSlide.value?.documentId || 0);
  if (mappedDocumentId > 0 && documentLibrary.value.some((doc) => Number(doc.id) === mappedDocumentId)) {
    selectedDocumentId.value = mappedDocumentId;
  }
}

function syncSlideLinkedPoll() {
  const slidePoll = activeSlidePoll.value;
  if (!slidePoll) {
    activePollId.value = '';
    participantPollChoice.value = '';
    return;
  }
  if (currentSlide.value?.autoLaunchPoll !== false || slidePoll.releaseMode === 'auto') {
    activePollId.value = slidePoll.id;
  } else if (!canManagePresentation.value) {
    activePollId.value = '';
  }
  participantPollChoice.value = participantPollAnswers.value[activePollId.value] || '';
}

function releaseCurrentSlidePoll() {
  if (!activeSlidePoll.value) return;
  activePollId.value = activeSlidePoll.value.id;
  participantPollChoice.value = participantPollAnswers.value[activePollId.value] || '';
}

function closeActivePoll() {
  activePollId.value = '';
  participantPollChoice.value = '';
}

function submitParticipantPoll() {
  if (!activePoll.value || !participantPollChoice.value) return;
  participantPollAnswers.value = {
    ...participantPollAnswers.value,
    [activePoll.value.id]: participantPollChoice.value
  };
  participantPollChoice.value = '';
  if (!canManagePresentation.value) {
    activePollId.value = '';
  }
}

function toggleCompactLayout() {
  railCollapsed.value = !railCollapsed.value;
  engageCollapsed.value = railCollapsed.value ? true : engageCollapsed.value;
}

function promoteQuestion(questionId, source = 'participant') {
  if (!questionId) return;
  questions.value = questions.value.map((question) => {
    if (question.id !== questionId || question.dismissed) return question;
    const nextVotes = source === 'participant' ? Number(question.votes || 0) + 1 : Number(question.votes || 0);
    const shouldPromote = source === 'assistant' || nextVotes >= promoteThreshold.value;
    return {
      ...question,
      votes: nextVotes,
      promoted: shouldPromote || question.promoted,
      dismissed: false,
      promotedBy: shouldPromote ? source : question.promotedBy || ''
    };
  });
}

function dismissPromotedQuestion(questionId) {
  if (!questionId) return;
  questions.value = questions.value.map((question) =>
    question.id === questionId
      ? {
          ...question,
          promoted: false,
          dismissed: true
        }
      : question
  );
}

function getQuestionActionLabel(question) {
  if (question.promoted) {
    if (isLeadPresenter.value) return 'Dismiss';
    return 'Promoted';
  }
  if (isAssistantPresenter.value) return 'Send to presenter';
  if (isLeadPresenter.value) return 'Await promotion';
  return `Promote (${question.votes}/${promoteThreshold.value})`;
}

function handleQuestionAction(question) {
  if (!question) return;
  if (question.promoted && isLeadPresenter.value) {
    dismissPromotedQuestion(question.id);
    return;
  }
  if (question.promoted) return;
  if (isAssistantPresenter.value) {
    promoteQuestion(question.id, 'assistant');
    return;
  }
  if (!canManagePresentation.value) {
    promoteQuestion(question.id, 'participant');
  }
}

async function loadPresentationPlan() {
  presentationLoading.value = true;
  try {
    let assignment = null;
    if (sessionId.value && currentAgencyId.value && !isGuardianView.value) {
      assignment = await loadClassPresentationSession({
        agencyId: currentAgencyId.value,
        sessionId: sessionId.value
      });
    } else if (eventId.value > 0) {
      assignment = isGuardianView.value
        ? await loadGuardianClassPresentationEventAssignment({ eventId: eventId.value })
        : currentAgencyId.value
          ? await loadClassPresentationEventAssignment({
              agencyId: currentAgencyId.value,
              eventId: eventId.value
            })
          : null;
    }

    if (assignment?.session?.plan) {
      presentationPlan.value = normalizeClassPresentationPlan(
        assignment.session.plan,
        assignment.session.id || eventIdLabel.value
      );
    } else {
      presentationPlan.value = normalizeClassPresentationPlan(
        createMentalHealthDemoPlan(eventId.value || route.query.eventId || 'demo'),
        eventId.value || route.query.eventId || 'demo'
      );
    }
  } catch {
    presentationPlan.value = normalizeClassPresentationPlan(
      createMentalHealthDemoPlan(eventId.value || route.query.eventId || 'demo'),
      eventId.value || route.query.eventId || 'demo'
    );
  } finally {
    currentSlideIndex.value = 0;
    applyResponsiveLayout();
    await loadDocumentLibrary();
    syncSlideLinkedPoll();
    presentationLoading.value = false;
  }
}

function applyResponsiveLayout() {
  if (typeof window === 'undefined') return;
  const compact = window.innerWidth <= 1560;
  const extraCompact = window.innerWidth <= 1320;
  railCollapsed.value = compact || !!presentationPlan.value.layout?.defaultRailCollapsed;
  engageCollapsed.value = extraCompact || !!presentationPlan.value.layout?.defaultEngageCollapsed;
}

function goToSlide(index) {
  const nextIndex = Math.max(0, Math.min(index, slides.value.length - 1));
  currentSlideIndex.value = nextIndex;
  syncSlideLinkedDocument();
  syncSlideLinkedPoll();
  saveState.value = "saving";
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveState.value = "saved";
  }, 380);
}

function toggleRelease() {
  activityReleased.value = !activityReleased.value;
}

watch(workspaceDraft, () => {
  if (!selectedDocument.value) queueAutosave();
}, { deep: true });

watch(documentValues, () => {
  if (selectedDocument.value && !hydratingDocumentValues.value) queueDocumentAutosave();
}, { deep: true });

watch(
  () => [eventId.value, currentAgencyId.value, isGuardianView.value, seriesId.value, sessionId.value],
  () => {
    loadPresentationPlan();
  },
  { immediate: true }
);

watch(
  () => selectedDocumentId.value,
  async () => {
    await loadSelectedDocumentBlob();
    await loadSelectedDocumentResponse();
    cancelFieldDefinitionEditor();
  },
  { immediate: true }
);

watch(
  () => [currentSlideIndex.value, documentLibrary.value.length],
  () => {
    syncSlideLinkedDocument();
  },
  { immediate: true }
);

onMounted(() => {
  applyResponsiveLayout();
  window.addEventListener('resize', applyResponsiveLayout);
});

onBeforeUnmount(() => {
  if (saveTimer) window.clearTimeout(saveTimer);
  if (docSaveTimer.value) window.clearTimeout(docSaveTimer.value);
  if (documentBlobUrl.value) URL.revokeObjectURL(documentBlobUrl.value);
  window.removeEventListener('resize', applyResponsiveLayout);
});
</script>

<style scoped>
.cpd-page {
  min-height: 100vh;
  padding: 14px;
  background:
    radial-gradient(circle at top center, var(--cpd-soft-primary), transparent 30%),
    linear-gradient(180deg, var(--cpd-bg) 0%, #090d1c 100%);
  color: var(--cpd-text);
  font-family: var(--cpd-font-body);
}

.cpd-shell {
  display: grid;
  gap: 12px;
}

.cpd-topbar,
.cpd-host-toolbar,
.cpd-workspace-card,
.cpd-stage-card,
.cpd-engage-card,
.cpd-rail-card,
.cpd-question-card,
.cpd-hands-card,
.cpd-action-bar {
  border: 1px solid var(--cpd-line);
  background: var(--cpd-surface);
  box-shadow: var(--cpd-shadow);
}

.cpd-topbar {
  display: grid;
  grid-template-columns: 1.1fr minmax(320px, 420px) auto;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 16px;
}

.cpd-topbar-left,
.cpd-title-row,
.cpd-presenter-strip,
.cpd-topbar-actions,
.cpd-card-title,
.cpd-save-cluster,
.cpd-stage-nav-left,
.cpd-question-user,
.cpd-question-actions,
.cpd-hands-head,
.cpd-hand-list {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cpd-brand-mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--cpd-brand-primary), var(--cpd-brand-accent));
  color: #08111f;
  font-weight: 800;
}

.cpd-brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.94);
}

.cpd-topbar-copy h1 {
  margin: 0;
  font-family: var(--cpd-font-title);
  font-size: 1.2rem;
  font-weight: 700;
}

.cpd-topbar-copy p,
.cpd-stage-copy p,
.cpd-engage-card span,
.cpd-thread-body p,
.cpd-question-item p,
.cpd-engage-panel p,
.cpd-document-directions {
  margin: 0;
  color: var(--cpd-text-soft);
}

.cpd-live-pill,
.cpd-count-pill,
.cpd-save-pill,
.cpd-tool-btn.active,
.cpd-follow-btn,
.cpd-answer-live-btn {
  border-radius: 999px;
}

.cpd-live-pill {
  padding: 4px 10px;
  background: rgba(77, 214, 120, 0.22);
  color: #90f4a6;
  font-size: 0.78rem;
  font-weight: 700;
}

.cpd-count-pill {
  padding: 4px 10px;
  background: var(--cpd-soft-white);
  color: var(--cpd-text);
  font-size: 0.78rem;
}

.cpd-presenter-strip {
  justify-content: center;
}

.cpd-video-tile {
  display: grid;
  gap: 6px;
  width: 172px;
}

.cpd-video-tile-active .cpd-video-frame {
  outline: 2px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.04);
}

.cpd-video-frame {
  height: 94px;
  border-radius: 14px;
  background-size: cover;
  background-position: center;
}

.cpd-video-frame-lead {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.18), transparent),
    radial-gradient(circle at 50% 30%, rgba(255, 227, 212, 0.95) 0 18%, transparent 19%),
    radial-gradient(circle at 50% 70%, rgba(215, 168, 148, 0.95) 0 24%, transparent 25%),
    linear-gradient(135deg, #bfc8d8, #7e8ca5);
}

.cpd-video-frame-assistant {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent),
    radial-gradient(circle at 50% 30%, rgba(154, 116, 84, 0.95) 0 18%, transparent 19%),
    radial-gradient(circle at 50% 70%, rgba(80, 61, 46, 0.95) 0 24%, transparent 25%),
    linear-gradient(135deg, #98a57e, #3e4f3d);
}

.cpd-video-caption {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.8rem;
}

.cpd-topbar-btn,
.cpd-topbar-link,
.cpd-host-btn,
.cpd-chevron-btn,
.cpd-more-btn,
.cpd-page-btn,
.cpd-stage-nav-btn,
.cpd-send-btn,
.cpd-docs-btn,
.cpd-action-btn,
.cpd-tool-btn,
.cpd-mood-btn,
.cpd-submit-btn {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.cpd-topbar-btn,
.cpd-topbar-link,
.cpd-host-btn,
.cpd-docs-btn {
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--cpd-soft-white);
  color: var(--cpd-text);
}

.cpd-topbar-link {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.cpd-host-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
  border-radius: 14px;
}

.cpd-host-chip {
  display: grid;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.cpd-host-label {
  font-size: 0.72rem;
  color: var(--cpd-text-soft);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.cpd-main-grid {
  display: grid;
  grid-template-columns: minmax(420px, 1.1fr) minmax(420px, 1fr) minmax(280px, 0.54fr);
  gap: 12px;
  align-items: start;
}

.cpd-main-grid.is-workspace-focused {
  grid-template-columns: minmax(500px, 1.22fr) minmax(320px, 0.86fr) minmax(280px, 0.54fr);
}

.cpd-main-grid.is-rail-collapsed {
  grid-template-columns: minmax(420px, 1.05fr) minmax(420px, 0.95fr);
}

.cpd-main-grid.is-workspace-focused.is-rail-collapsed {
  grid-template-columns: minmax(520px, 1.24fr) minmax(300px, 0.8fr);
}

.cpd-workspace-card,
.cpd-center-column,
.cpd-rail-column {
  min-height: 0;
}

.cpd-workspace-card,
.cpd-center-column,
.cpd-rail-column {
  display: grid;
  gap: 12px;
}

.cpd-workspace-card {
  padding: 14px;
  border-radius: 18px;
}

.cpd-doc-admin-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.cpd-doc-error {
  margin: 0;
  color: #ffb3c5;
  font-size: 0.9rem;
}

.cpd-card-topline {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.cpd-card-title span,
.cpd-save-pill {
  font-size: 0.92rem;
  font-weight: 600;
}

.cpd-doc-picker,
.cpd-doc-admin-input {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--cpd-text);
  padding: 10px 12px;
  font: inherit;
}

.cpd-doc-picker {
  min-width: 190px;
}

.cpd-doc-admin-input {
  min-width: 220px;
}

.cpd-hidden-upload {
  display: none;
}

.cpd-chevron-btn,
.cpd-more-btn {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
  color: var(--cpd-text);
}

.cpd-save-pill {
  padding: 6px 10px;
  background: rgba(60, 193, 104, 0.16);
  color: #8ff0aa;
}

.cpd-save-pill.is-saving {
  background: rgba(89, 156, 255, 0.16);
  color: #bdd6ff;
}

.cpd-save-pill.is-error,
.cpd-save-pill.is-offline {
  background: rgba(255, 187, 89, 0.16);
  color: #ffd8a0;
}

.cpd-workspace-shell {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  gap: 12px;
}

.cpd-tool-rail {
  display: grid;
  align-content: start;
  gap: 8px;
}

.cpd-tool-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--cpd-text);
  font-size: 0.72rem;
  font-weight: 700;
}

.cpd-tool-btn.active {
  background: linear-gradient(135deg, var(--cpd-brand-accent), var(--cpd-brand-primary));
  color: #08111f;
}

.cpd-document-surface {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.cpd-document-page {
  min-height: 620px;
  padding: 26px 24px 30px;
  border-radius: 18px;
  background: var(--cpd-sheet);
  color: var(--cpd-sheet-text);
}

.cpd-document-page-builder :deep(.pdf-field-builder) {
  margin-top: 16px;
}

.cpd-activity-tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 10px;
  background: var(--cpd-sheet-fill);
  color: var(--cpd-brand-secondary);
  font-size: 0.78rem;
  font-weight: 700;
}

.cpd-document-page h2 {
  margin: 16px 0 8px;
  font-size: 2rem;
  line-height: 1.02;
}

.cpd-document-directions {
  color: var(--cpd-sheet-muted);
  margin-bottom: 16px;
}

.cpd-document-content {
  display: grid;
  gap: 14px;
}

.cpd-doc-block {
  display: grid;
  gap: 8px;
}

.cpd-doc-block-note {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--cpd-sheet-line);
  background: #f7f9fc;
}

.cpd-doc-label {
  font-size: 0.92rem;
  font-weight: 700;
}

.cpd-doc-input {
  width: 100%;
  border: 1px solid var(--cpd-sheet-line);
  border-radius: 12px;
  background: #ffffff;
  padding: 10px 12px;
  color: var(--cpd-sheet-text);
  font: inherit;
}

.cpd-doc-input:disabled {
  background: #f4f6fb;
  color: var(--cpd-sheet-muted);
}

.cpd-doc-textarea {
  resize: vertical;
}

.cpd-mood-row,
.cpd-checklist {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
}

.cpd-mood-btn {
  padding: 9px 12px;
  border-radius: 10px;
  background: #edf2f7;
  color: var(--cpd-sheet-text);
}

.cpd-mood-btn.active {
  background: var(--cpd-sheet-fill);
  color: var(--cpd-brand-secondary);
}

.cpd-check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--cpd-sheet-text);
}

.cpd-table-wrap {
  overflow-x: auto;
}

.cpd-response-table {
  width: 100%;
  border-collapse: collapse;
}

.cpd-response-table th,
.cpd-response-table td {
  padding: 10px 8px;
  border: 1px solid var(--cpd-sheet-line);
  text-align: left;
  vertical-align: top;
}

.cpd-response-table th {
  background: rgba(0, 0, 0, 0.03);
  font-size: 0.85rem;
}

.cpd-doc-input-inline {
  min-width: 150px;
}

.cpd-document-footer,
.cpd-page-nav,
.cpd-zoom-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.cpd-page-btn {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--cpd-text);
}

.cpd-workspace-bar {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.cpd-saved-text {
  color: #93e7ac;
  font-size: 0.9rem;
}

.cpd-stage-card,
.cpd-engage-card,
.cpd-rail-card,
.cpd-question-card,
.cpd-hands-card {
  padding: 14px;
  border-radius: 18px;
}

.cpd-stage-content {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(220px, 0.8fr);
  gap: 12px;
  min-height: 352px;
  border-radius: 16px;
  padding: 22px;
  background:
    linear-gradient(135deg, rgba(0, 0, 0, 0.18), transparent 46%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01)),
    linear-gradient(135deg, color-mix(in srgb, var(--cpd-brand-secondary) 78%, #08111f), color-mix(in srgb, var(--cpd-brand-secondary) 56%, #13213a));
}

.cpd-stage-content.is-workspace-supporting {
  grid-template-columns: minmax(0, 1fr) minmax(180px, 0.62fr);
  min-height: 292px;
}

.cpd-stage-copy {
  display: grid;
  align-content: center;
  gap: 14px;
}

.cpd-stage-number {
  color: color-mix(in srgb, var(--cpd-brand-primary) 86%, #dff9dd);
  font-size: 3rem;
  font-weight: 800;
  line-height: 1;
}

.cpd-stage-copy h3 {
  margin: 0;
  font-size: 2.6rem;
  line-height: 0.94;
  font-family: var(--cpd-font-title);
}

.cpd-stage-visual {
  display: grid;
  align-items: stretch;
}

.cpd-stage-visual-frame {
  position: relative;
  overflow: hidden;
  border-radius: 0 18px 18px 120px;
  border: 4px solid color-mix(in srgb, var(--cpd-brand-primary) 70%, #d9fbd7);
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 244, 197, 0.65), transparent 18%),
    radial-gradient(circle at 60% 28%, rgba(255, 249, 222, 0.55), transparent 14%),
    linear-gradient(180deg, rgba(59, 84, 22, 0.28), rgba(27, 49, 14, 0.76)),
    linear-gradient(135deg, #6b7425, #20310f);
}

.cpd-stage-visual-frame-presenter {
  display: grid;
  align-items: stretch;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.03);
}

.cpd-stage-visual-frame-embed {
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.02);
}

.cpd-stage-embed {
  width: 100%;
  height: 100%;
  min-height: 280px;
  border: 0;
}

.cpd-stage-visual-seedling {
  position: absolute;
  inset: auto 24% 18% 24%;
  height: 42%;
  border-radius: 999px 999px 0 0;
  background:
    radial-gradient(circle at 36% 18%, rgba(233, 255, 198, 0.95) 0 12%, transparent 13%),
    radial-gradient(circle at 64% 24%, rgba(233, 255, 198, 0.95) 0 12%, transparent 13%),
    linear-gradient(180deg, rgba(158, 243, 109, 0.95), rgba(74, 154, 57, 0.98));
  clip-path: polygon(40% 0%, 58% 0%, 65% 30%, 58% 100%, 44% 100%, 36% 30%);
}

.cpd-video-frame-stage {
  height: 100%;
  min-height: 280px;
}

.cpd-stage-presenter-caption {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 14px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(8, 17, 31, 0.56);
  color: #f8faff;
  font-size: 0.84rem;
}

.cpd-stage-nav {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  padding: 10px 8px 0;
}

.cpd-spotlight-card {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--cpd-brand-primary) 12%, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--cpd-line);
}

.cpd-spotlight-head,
.cpd-spotlight-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.cpd-stage-progress {
  padding: 9px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.cpd-stage-nav-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--cpd-text);
}

.cpd-follow-btn,
.cpd-submit-btn,
.cpd-answer-live-btn,
.cpd-send-btn {
  padding: 10px 14px;
  background: linear-gradient(135deg, var(--cpd-brand-accent), var(--cpd-brand-primary));
  color: #08111f;
  font-weight: 700;
}

.cpd-engage-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.cpd-engage-head h4 {
  margin: 0;
  font-size: 1.15rem;
}

.cpd-engage-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.cpd-engage-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--cpd-surface-alt);
  border: 1px solid var(--cpd-line);
}

.cpd-engage-panel-pulse {
  animation: cpd-pulse 1.9s ease-in-out infinite;
}

.cpd-host-poll-status,
.cpd-host-poll-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.cpd-host-notes-copy {
  min-height: 120px;
}

.cpd-engage-panel-head,
.cpd-rail-thread-head,
.cpd-thread-meta,
.cpd-question-head,
.cpd-poll-row-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.cpd-engage-question {
  min-height: 54px;
}

.cpd-option-list {
  display: grid;
  gap: 8px;
}

.cpd-option-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cpd-word-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  align-items: center;
  min-height: 152px;
}

.cpd-word {
  color: color-mix(in srgb, var(--cpd-brand-primary) 70%, #ffffff);
  font-weight: 700;
}

.cpd-engage-panel-hand {
  align-content: space-between;
}

.cpd-hand-spot {
  display: grid;
  place-items: center;
  width: 94px;
  height: 94px;
  border-radius: 999px;
  margin: 8px auto;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.12), transparent 70%), var(--cpd-soft-primary);
  font-weight: 700;
}

.cpd-rail-column {
  display: grid;
  gap: 12px;
}

@keyframes cpd-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(125, 214, 255, 0.08);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(125, 214, 255, 0.02);
  }
}

.cpd-rail-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  margin-bottom: 12px;
}

.cpd-rail-tab {
  border: 0;
  padding: 10px 8px;
  border-radius: 10px;
  background: transparent;
  color: var(--cpd-text-soft);
  cursor: pointer;
}

.cpd-rail-tab.active {
  background: var(--cpd-soft-accent);
  color: var(--cpd-text);
}

.cpd-rail-thread {
  display: grid;
  gap: 12px;
}

.cpd-rail-thread-head {
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.cpd-rail-feed {
  display: grid;
  gap: 12px;
}

.cpd-thread-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.cpd-thread-avatar,
.cpd-mini-avatar,
.cpd-hand-badge {
  display: grid;
  place-items: center;
  color: #ffffff;
  font-weight: 700;
}

.cpd-thread-avatar {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  font-size: 0.78rem;
}

.cpd-thread-body {
  display: grid;
  gap: 6px;
}

.cpd-thread-reactions {
  color: color-mix(in srgb, var(--cpd-brand-primary) 80%, #ffffff);
  font-size: 0.82rem;
}

.cpd-side-poll {
  display: grid;
  gap: 10px;
}

.cpd-poll-results {
  display: grid;
  gap: 9px;
}

.cpd-poll-bar {
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.cpd-poll-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, var(--cpd-brand-accent), var(--cpd-brand-primary));
}

.cpd-thread-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  gap: 8px;
  margin-top: 4px;
}

.cpd-composer-input {
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  padding: 12px 14px;
  color: var(--cpd-text);
  font: inherit;
}

.cpd-question-head {
  margin-bottom: 12px;
}

.cpd-question-item {
  display: grid;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.cpd-question-item:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.cpd-question-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.cpd-mini-avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  font-size: 0.72rem;
}

.cpd-answer-live-btn {
  padding: 7px 10px;
  font-size: 0.82rem;
}

.cpd-hands-card {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.cpd-hand-badge {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  font-size: 0.72rem;
}

.cpd-action-bar {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 16px;
}

.cpd-action-btn {
  min-width: 112px;
  padding: 10px 14px;
  border-radius: 12px;
  background: transparent;
  color: var(--cpd-text);
}

.cpd-action-link {
  text-decoration: none;
  display: inline-flex;
  justify-content: center;
  align-items: center;
}

.cpd-action-btn-leave {
  background: rgba(194, 52, 106, 0.22);
  color: #ffd6e5;
}

@media (max-width: 1450px) {
  .cpd-main-grid {
    grid-template-columns: 1fr;
  }

  .cpd-rail-column {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
  }
}

@media (max-width: 1180px) {
  .cpd-topbar {
    grid-template-columns: 1fr;
    justify-items: start;
  }

  .cpd-presenter-strip {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .cpd-engage-grid,
  .cpd-rail-column {
    grid-template-columns: 1fr;
  }

  .cpd-stage-content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .cpd-page {
    padding: 10px;
  }

  .cpd-workspace-shell {
    grid-template-columns: 1fr;
  }

  .cpd-tool-rail {
    grid-auto-flow: column;
    grid-auto-columns: minmax(56px, 1fr);
    overflow-x: auto;
  }

  .cpd-stage-nav,
  .cpd-question-meta,
  .cpd-hands-card,
  .cpd-action-bar,
  .cpd-card-topline,
  .cpd-workspace-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .cpd-action-btn {
    min-width: 0;
    width: 100%;
  }
}
</style>
