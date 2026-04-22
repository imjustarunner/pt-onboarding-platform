<template>
  <div class="virtual-tutoring-dashboard vt-root">
    <!-- Top Bar -->
    <div class="top-bar vt-topbar">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-sm font-bold">TF</div>
          <div>
            <div class="font-semibold text-lg">Math Tutoring – Solving Linear Equations</div>
            <div class="text-xs text-emerald-400 flex items-center gap-1">
              <div class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              LIVE SESSION
            </div>
          </div>
        </div>
      </div>
      
      <div class="flex items-center gap-6">
        <!-- Timer -->
        <div class="flex items-center gap-2 bg-[#1e2a44] px-4 py-1.5 rounded-lg">
          <span class="text-emerald-400 text-sm font-mono">00:24:18</span>
        </div>
        
        <button @click="endSession" class="vt-btn vt-btn-danger vt-btn-md">
          <span>End Session</span>
        </button>
        
        <div class="vt-pill">TutorFlow AI</div>
      </div>
    </div>

    <div class="vt-body">
      <!-- Left Sidebar: Learning Hub -->
      <div class="vt-sidebar">
        <div class="p-4 border-b border-[#1e2a44]">
          <div class="uppercase text-xs tracking-widest text-gray-400 mb-3">LEARNING HUB</div>
        </div>
        
        <nav class="flex-1 p-3 space-y-1">
          <SidebarNavItem icon="✍️" label="Whiteboard" :active="activeTab?.kind === 'whiteboard'" @click="setActiveTab('whiteboard')" />
          <SidebarNavItem icon="📄" label="Documents" :active="activeTab?.kind === 'document'" @click="openDocumentTab('Worksheet_LinEq.pdf')" />
          <SidebarNavItem icon="📝" label="Activities" :active="activeTab?.kind === 'activity'" @click="openActivityTab('Solve It')" />
          <SidebarNavItem icon="💻" label="Code Lab" :active="activeTab?.kind === 'codelab'" @click="openCodeLabTab()" />
          <SidebarNavItem icon="🎥" label="Videos" :active="activeTab?.kind === 'videos'" @click="openVideosTab()" />
          <SidebarNavItem icon="🔗" label="Links" :active="activeTab?.kind === 'links'" @click="openLinksTab()" />
          
          <div class="pt-4 mt-4 border-t border-[#1e2a44]">
            <div class="uppercase text-xs tracking-widest text-gray-400 mb-3 px-3">TOOLS</div>
            <SidebarNavItem icon="🧮" label="Calculator" />
            <SidebarNavItem icon="📈" label="Graphing Tool" />
            <SidebarNavItem icon="📌" label="Sticky Notes" />
            <SidebarNavItem icon="🧠" label="Mind Map" />
          </div>
          
          <div class="pt-4 mt-4 border-t border-[#1e2a44]">
            <div class="uppercase text-xs tracking-widest text-gray-400 mb-3 px-3">AI TOOLS</div>
            <SidebarNavItem icon="🤖" label="AI Tutor" active />
            <SidebarNavItem icon="📊" label="Summary" />
            <SidebarNavItem icon="📈" label="Progress Insight" />
          </div>
        </nav>
        
        <div class="p-4 border-t border-[#1e2a44] text-xs text-gray-500">
          Session ID: #{{ sessionId }} • Standards: CAS 6.NS.2
        </div>
      </div>

      <!-- Main Content: Whiteboard -->
      <div class="vt-main">
        <!-- Workspace Tabs -->
        <div class="vt-worktabs" role="tablist" aria-label="Session workspace tabs">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            class="vt-worktab"
            :class="{ 'vt-worktabActive': t.id === activeTabId }"
            role="tab"
            :aria-selected="t.id === activeTabId"
            @click="setActiveTab(t.id)"
          >
            <span class="vt-worktabIcon" aria-hidden="true">{{ t.icon }}</span>
            <span class="vt-worktabTitle">{{ t.title }}</span>
            <span class="vt-spacer" />
            <button
              v-if="t.closable"
              type="button"
              class="vt-worktabClose"
              aria-label="Close tab"
              @click.stop="closeTab(t.id)"
            >
              ✕
            </button>
          </button>
        </div>

        <!-- Whiteboard Toolbar -->
        <div v-if="activeTab?.kind === 'whiteboard'" class="vt-toolbar">
          <div class="vt-toolbarGroup">
            <button
              type="button"
              class="vt-btn vt-btn-surface vt-btn-sm vt-toolbtn"
              :class="{ 'vt-btn-selected': wbTool === 'pen' }"
              @click="setWbTool('pen')"
              title="Pen"
            >
              ✏️ Pen
            </button>
            <button
              type="button"
              class="vt-btn vt-btn-surface vt-btn-sm vt-toolbtn"
              :class="{ 'vt-btn-selected': wbTool === 'highlighter' }"
              @click="setWbTool('highlighter')"
              title="Highlighter"
            >
              🖌️ Highlight
            </button>
            <button
              type="button"
              class="vt-btn vt-btn-surface vt-btn-sm vt-toolbtn"
              :class="{ 'vt-btn-selected': wbTool === 'eraser' }"
              @click="setWbTool('eraser')"
              title="Eraser"
            >
              🧽 Erase
            </button>
            <button
              type="button"
              class="vt-btn vt-btn-surface vt-btn-sm vt-toolbtn"
              :class="{ 'vt-btn-selected': wbTool === 'text' }"
              @click="setWbTool('text')"
              title="Text box"
            >
              📝 Text
            </button>
          </div>

          <div class="vt-toolbarDivider" aria-hidden="true" />

          <div class="vt-toolbarGroup vt-toolbarColors" role="group" aria-label="Pen colors">
            <button
              v-for="c in wbColors"
              :key="c"
              type="button"
              class="vt-colorSwatch"
              :class="{ 'vt-colorSwatchActive': wbColor === c }"
              :style="{ backgroundColor: c }"
              :aria-label="`Color ${c}`"
              @click="wbColor = c"
            />
          </div>

          <div class="vt-toolbarDivider" aria-hidden="true" />

          <div class="vt-toolbarGroup" role="group" aria-label="Stroke size">
            <label class="vt-miniLabel" for="wbSize">Size</label>
            <input
              id="wbSize"
              v-model.number="wbSize"
              type="range"
              min="2"
              max="20"
              step="1"
              class="vt-range"
            >
          </div>

          <div class="vt-toolbarDivider" aria-hidden="true" />

          <div class="vt-toolbarGroup" role="group" aria-label="Board view">
            <button
              type="button"
              class="vt-btn vt-btn-ghost vt-btn-sm"
              :class="{ 'vt-btn-selected': wbShowGrid }"
              @click="wbShowGrid = !wbShowGrid"
              title="Toggle grid"
            >
              # Grid
            </button>
            <button
              type="button"
              class="vt-btn vt-btn-ghost vt-btn-sm"
              :class="{ 'vt-btn-selected': wbSnapToGrid }"
              @click="wbSnapToGrid = !wbSnapToGrid"
              title="Snap strokes/text to grid"
            >
              ⊞ Snap
            </button>
            <button
              type="button"
              class="vt-btn vt-btn-ghost vt-btn-sm"
              :class="{ 'vt-btn-selected': wbTextStyle === 'inline' }"
              @click="wbTextStyle = (wbTextStyle === 'inline' ? 'card' : 'inline')"
              title="Toggle text style"
            >
              T {{ wbTextStyle === 'inline' ? 'Inline' : 'Card' }}
            </button>
          </div>

          <div class="vt-spacer"></div>

          <div class="vt-toolbarGroup" role="group" aria-label="History">
            <button type="button" class="vt-btn vt-btn-ghost vt-btn-sm" :disabled="!canUndo" @click="undoStroke">↶ Undo</button>
            <button type="button" class="vt-btn vt-btn-ghost vt-btn-sm" :disabled="!canRedo" @click="redoStroke">↷ Redo</button>
            <button type="button" class="vt-btn vt-btn-ghost vt-btn-sm" @click="clearWhiteboard">Clear</button>
          </div>
        </div>
        
        <!-- Whiteboard Canvas -->
        <div v-if="activeTab?.kind === 'whiteboard'" class="vt-board" :class="{ 'vt-boardGrid': wbShowGrid }">
          <div ref="wbStage" class="vt-boardStage" @pointerdown="onStagePointerDown">
            <canvas ref="wbCanvas" class="vt-whiteboardCanvas" />

            <div class="vt-textLayer" aria-label="Text boxes">
              <div
                v-for="box in wbTextBoxes"
                :key="box.id"
                class="vt-textBox"
                :class="box.style === 'inline' ? 'vt-textBoxInline' : 'vt-textBoxCard'"
                :style="{ left: box.x + 'px', top: box.y + 'px', width: box.w + 'px' }"
              >
                <div class="vt-textBoxBar" @pointerdown.stop="startDragTextBox(box.id, $event)">
                  <div class="vt-textBoxTitle">Text</div>
                  <button type="button" class="vt-textBoxClose" aria-label="Delete text box" @click="deleteTextBox(box.id)">✕</button>
                </div>
                <div
                  class="vt-textBoxBody"
                  contenteditable="true"
                  :data-box-id="box.id"
                  :style="{ color: box.color, fontSize: box.fontSize + 'px' }"
                  @input="onTextBoxInput(box.id, $event)"
                >{{ box.text }}</div>
              </div>
            </div>

            <div class="max-w-3xl mx-auto vt-boardContent">
            <div class="mb-8">
              <h2 class="text-2xl font-semibold mb-6 text-[#1a3a6e]">Example 2: Solve for x</h2>
              <div class="text-3xl font-medium mb-8">3(x − 4) + 2x = 20</div>
              
              <!-- Step by step solution (matching image) -->
              <div class="space-y-6 text-xl">
                <div class="flex items-start gap-4">
                  <div class="text-blue-500 font-mono w-8">→</div>
                  <div>
                    <div class="text-[#1a3a6e] font-medium">3x − 12 + 2x = 20</div>
                  </div>
                </div>
                
                <div class="flex items-center gap-8 text-red-500">
                  <div class="flex-1 h-px bg-red-500 relative">
                    <span class="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-white px-2">+12</span>
                  </div>
                  <div class="flex-1 h-px bg-red-500 relative">
                    <span class="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-white px-2">+12</span>
                  </div>
                </div>
                
                <div class="flex items-center gap-6 text-xl">
                  <div>5x − 12 = 20</div>
                  <div class="text-green-600 font-semibold">5x = 32</div>
                </div>
                
                <div class="border-2 border-green-500 p-6 rounded-2xl inline-block">
                  <div class="text-green-600 text-4xl font-bold">x = 6.4</div>
                </div>
              </div>
            </div>
            
            <!-- Remember bubble (matching image) -->
            <div class="absolute top-32 right-12 bg-[#4c1d95] text-white p-6 rounded-3xl max-w-xs shadow-2xl border border-purple-400">
              <div class="flex items-center gap-2 mb-3">
                <span class="text-2xl">💡</span>
                <span class="font-semibold">Remember!</span>
              </div>
              <div class="text-sm leading-relaxed">
                Distribute first, then combine like terms, then isolate the variable.
              </div>
              <div class="text-purple-300 text-xs mt-4 flex items-center gap-1">
                ⭐ Great work on distribution!
              </div>
            </div>
          </div>
          </div>
        </div>
        
        <!-- Bottom Status -->
        <div v-if="activeTab?.kind === 'whiteboard'" class="h-11 bg-[#0a0f1c] border-t border-[#1e2a44] flex items-center px-6 text-xs text-gray-400">
          <div>Whiteboard synced • Last edit by Tutor 12s ago</div>
          <div class="flex-1"></div>
          <div class="flex items-center gap-4">
            <button @click="generatePractice" class="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs">
              <span>Generate Practice →</span>
            </button>
          </div>
        </div>

        <!-- Document surface -->
        <div v-else-if="activeTab?.kind === 'document'" class="vt-docSurface">
          <div class="vt-docHeader">
            <div class="vt-docTitle">{{ activeTab.title }}</div>
            <div class="vt-docMeta">PDF viewer placeholder (we’ll mount a real PDF viewer next)</div>
          </div>
          <div class="vt-docCanvas">
            <div class="vt-docPlaceholder">
              <div class="vt-docIcon" aria-hidden="true">📄</div>
              <div class="vt-docPlaceholderTitle">Document viewer</div>
              <div class="vt-docPlaceholderSub">This is where `{{ activeTab.title }}` will render with outline + page navigation.</div>
            </div>
          </div>
        </div>

        <!-- Other surfaces (placeholders) -->
        <div v-else class="vt-docSurface">
          <div class="vt-docHeader">
            <div class="vt-docTitle">{{ activeTab?.title || 'Workspace' }}</div>
            <div class="vt-docMeta">Coming next: interactive surface for this tool.</div>
          </div>
          <div class="vt-docCanvas">
            <div class="vt-docPlaceholder">
              <div class="vt-docIcon" aria-hidden="true">🧩</div>
              <div class="vt-docPlaceholderTitle">Surface pending</div>
              <div class="vt-docPlaceholderSub">We’ll implement this tool as a full tabbed surface next.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Sidebar -->
      <div class="vt-right">
        <!-- Video Panel -->
        <div class="vt-videoPanel">
          <div class="vt-panelTitle">LIVE PARTICIPANTS</div>
          <div class="vt-videoGrid">
            <!-- Tutor Video tile (Vonage will mount a <video> here) -->
            <div class="vt-videoTile vt-videoTileTutor">
              <div ref="tutorVideoMount" class="vt-videoMount" aria-label="Tutor video tile">
                <div class="vt-videoPlaceholder" aria-hidden="true">👩‍🏫</div>
              </div>
              <div class="vt-videoName">Ms. Ava</div>
              <div class="vt-videoBadge">LIVE</div>
              <div class="vt-videoRole">Tutor</div>
            </div>

            <!-- Student Video tile -->
            <div class="vt-videoTile vt-videoTileStudent">
              <div ref="studentVideoMount" class="vt-videoMount" aria-label="Student video tile">
                <div class="vt-videoPlaceholder" aria-hidden="true">🧑‍🎓</div>
              </div>
              <div class="vt-videoName">Ethan</div>
              <div class="vt-videoRole">Student</div>
            </div>
          </div>

          <div class="vt-videoControls">
            <button type="button" class="vt-btn vt-btn-surface vt-btn-sm vt-btn-block">🎤 Mute</button>
            <button type="button" class="vt-btn vt-btn-surface vt-btn-sm vt-btn-block">📷 Camera</button>
          </div>
        </div>

        <!-- AI Tutor Panel -->
        <div class="flex-1 flex flex-col min-h-0 border-b border-[#1e2a44]">
          <div class="px-4 pt-4 pb-2 flex items-center justify-between bg-[#121a2b]">
            <div class="flex gap-6 text-sm">
              <button :class="{ 'text-white border-b-2 border-blue-400 pb-2': aiTab === 'tutor' }" @click="aiTab = 'tutor'" class="hover:text-white">Tutor</button>
              <button :class="{ 'text-white border-b-2 border-blue-400 pb-2': aiTab === 'hints' }" @click="aiTab = 'hints'" class="hover:text-white">Hints</button>
              <button :class="{ 'text-white border-b-2 border-blue-400 pb-2': aiTab === 'insights' }" @click="aiTab = 'insights'" class="hover:text-white">Insights</button>
            </div>
            <div class="text-xs px-3 py-1 bg-emerald-900 text-emerald-400 rounded-full">82% confidence</div>
          </div>
          
          <div class="flex-1 p-4 overflow-auto text-sm space-y-4 bg-[#0a0f1c]">
            <div v-if="aiTab === 'tutor'" class="bg-[#1e2a44] p-4 rounded-2xl">
              <div class="text-emerald-400 mb-3">I noticed you did a great job distributing the 3!</div>
              <div class="text-gray-300">Want a hint on the next step?</div>
              <div class="mt-6 flex flex-wrap gap-2">
                <button @click="giveHint" class="vt-btn vt-btn-primary vt-btn-sm">Yes, give me a hint</button>
                <button @click="explainAnotherWay" class="vt-btn vt-btn-surface vt-btn-sm">Explain another way</button>
                <button @click="tryOnOwn" class="vt-btn vt-btn-surface vt-btn-sm">Let me try on my own</button>
              </div>
            </div>
            
            <div v-else-if="aiTab === 'hints'" class="space-y-3">
              <div class="p-4 bg-[#1e2a44] rounded-2xl">
                Hint 1: Combine the x terms after distributing.
              </div>
              <div class="p-4 bg-[#1e2a44] rounded-2xl opacity-70">
                Hint 2: Subtract 12 from both sides to isolate the term with x.
              </div>
            </div>
            
            <div v-else class="p-4 bg-[#1e2a44] rounded-2xl text-xs leading-relaxed">
              Strong progress on distribution (92% accuracy). Needs review on isolating variables in multi-step equations. Aligned to CAS.6.EE.B.5.
            </div>
          </div>
        </div>

        <!-- Session Goals -->
        <div class="p-4 border-b border-[#1e2a44] bg-[#121a2b]">
          <div class="flex justify-between items-center mb-3">
            <div class="uppercase text-xs tracking-widest text-gray-400">SESSION GOALS</div>
            <div class="text-emerald-400 text-xs">2/3 completed</div>
          </div>
          <div class="space-y-3 text-sm">
            <div class="flex items-center gap-3">
              <input type="checkbox" checked class="w-4 h-4 accent-emerald-500"> 
              <span class="line-through opacity-60">Understand variables</span>
            </div>
            <div class="flex items-center gap-3">
              <input type="checkbox" checked class="w-4 h-4 accent-emerald-500"> 
              <span class="line-through opacity-60">Solve multi-step equations</span>
            </div>
            <div class="flex items-center gap-3">
              <input type="checkbox" class="w-4 h-4 accent-emerald-500"> 
              <span>Word problems</span>
            </div>
          </div>
        </div>

        <!-- Activity Panel -->
        <div class="p-4 bg-[#0f1625] border-b border-[#1e2a44]">
          <div class="uppercase text-xs tracking-widest text-gray-400 mb-3">SOLVE IT</div>
          <div class="text-sm mb-2">2(x + 5) - 3x = 7</div>
          <input 
            v-model="studentAnswer" 
            type="text" 
            placeholder="Type your answer..." 
            class="w-full bg-[#1e2a44] border border-[#334155] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
            @keyup.enter="submitAnswer"
          >
          <button @click="submitAnswer" class="vt-btn vt-btn-primary vt-btn-md vt-btn-block vt-mt-10">Submit</button>
        </div>

        <!-- Document Outline -->
        <div class="px-4 py-3 bg-[#121a2b] border-b border-[#1e2a44] text-xs">
          <div class="flex justify-between text-gray-400 mb-2">
            <span>DOCUMENT OUTLINE</span>
            <span class="text-blue-400">Worksheet_LinEq.pdf • Page 3 of 6</span>
          </div>
          <div class="space-y-1 text-[10px] text-gray-400 max-h-24 overflow-auto">
            <div class="pl-3 border-l-2 border-blue-500">1. Introduction</div>
            <div class="pl-3">2. Example 1</div>
            <div class="pl-3 bg-blue-900/30 text-blue-300">3. Example 2 (current)</div>
            <div class="pl-3">4. Practice Problems</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Bar -->
    <div class="vt-bottomBar">
      <button @click="toggleMute" class="vt-btn vt-btn-ghost vt-btn-sm vt-bottomBtn">🔇 Mute</button>
      <button @click="toggleVideo" class="vt-btn vt-btn-ghost vt-btn-sm vt-bottomBtn">📹 Stop Video</button>
      <button @click="shareScreen" class="vt-btn vt-btn-ghost vt-btn-sm vt-bottomBtn">📺 Screen Share</button>
      <button @click="openWhiteboard" class="vt-btn vt-btn-ghost vt-btn-sm vt-bottomBtn">🖼️ Whiteboard</button>
      <button @click="openChat" class="vt-btn vt-btn-ghost vt-btn-sm vt-bottomBtn">💬 Chat</button>
      <button @click="raiseHand" class="vt-btn vt-btn-ghost vt-btn-sm vt-bottomBtn">✋ Raise Hand</button>
      
      <div class="flex-1"></div>
      
      <!-- AI Summary Quick View -->
      <div class="vt-summaryPill" role="status" aria-label="AI Summary">
        <span class="vt-summaryLabel">AI Summary:</span>
        <span class="vt-summaryText">Distributed terms correctly. Strong on combining like terms.</span>
      </div>
    </div>

    <!-- Progress Insights Modal (toggleable) -->
    <div v-if="showProgressModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50" @click.self="showProgressModal = false">
      <div class="bg-[#0f1625] rounded-3xl w-[520px] p-8">
        <div class="flex justify-between mb-6">
          <div>
            <div class="text-2xl font-semibold">Progress Insight</div>
            <div class="text-emerald-400">This Week</div>
          </div>
          <button @click="showProgressModal = false" class="text-gray-400">✕</button>
        </div>
        
        <div class="grid grid-cols-2 gap-6">
          <!-- Overall Progress -->
          <div class="bg-[#1a2538] rounded-3xl p-6 text-center">
            <div class="text-6xl font-bold text-emerald-400 mb-1">78%</div>
            <div class="text-xs uppercase tracking-widest">Overall Progress</div>
            <div class="h-2 bg-[#334155] rounded mt-6 relative">
              <div class="absolute left-0 top-0 h-2 bg-emerald-400 rounded" style="width: 78%"></div>
            </div>
          </div>
          
          <!-- Gauges -->
          <div class="space-y-6">
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span>Concept Understanding</span>
                <span class="text-emerald-400">82%</span>
              </div>
              <div class="h-1.5 bg-[#334155] rounded-full overflow-hidden">
                <div class="h-1.5 bg-blue-400 rounded-full" style="width: 82%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span>Practice Accuracy</span>
                <span class="text-amber-400">76%</span>
              </div>
              <div class="h-1.5 bg-[#334155] rounded-full overflow-hidden">
                <div class="h-1.5 bg-amber-400 rounded-full" style="width: 76%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span>Engagement</span>
                <span class="text-purple-400">88%</span>
              </div>
              <div class="h-1.5 bg-[#334155] rounded-full overflow-hidden">
                <div class="h-1.5 bg-purple-400 rounded-full" style="width: 88%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span>Homework Completion</span>
                <span class="text-rose-400">65%</span>
              </div>
              <div class="h-1.5 bg-[#334155] rounded-full overflow-hidden">
                <div class="h-1.5 bg-rose-400 rounded-full" style="width: 65%"></div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="mt-8 p-4 bg-[#1e2a44] rounded-2xl text-sm">
          <div class="font-medium mb-2 text-emerald-400">Recommendation</div>
          <div class="text-gray-300">Keep practicing word problems to boost your confidence! Next session will focus on application in real-world scenarios aligned to Colorado Academic Standards.</div>
        </div>
        
        <button @click="downloadHomework" class="mt-6 w-full py-4 bg-gradient-to-r from-violet-600 to-blue-600 rounded-2xl font-medium">
          📄 Download Branded Homework Assignment (PDF)
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, defineComponent, h, computed, nextTick, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api.js';
import { useAuthStore } from '../../store/auth.js';

const SidebarNavItem = defineComponent({
  name: 'SidebarNavItem',
  props: {
    icon: { type: String, required: true },
    label: { type: String, required: true },
    active: { type: Boolean, default: false }
  },
  emits: ['click'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          class: ['vt-navitem', props.active ? 'vt-navitem-active' : ''],
          onClick: () => emit('click')
        },
        [
          h('span', { class: 'vt-navicon', 'aria-hidden': 'true' }, props.icon),
          h('span', { class: 'vt-navlabel' }, props.label)
        ]
      );
  }
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const tutorVideoMount = ref(null);
const studentVideoMount = ref(null);

const tabs = ref([
  { id: 'whiteboard', kind: 'whiteboard', title: 'Whiteboard', icon: '🧾', closable: false },
  { id: 'doc-worksheet', kind: 'document', title: 'Worksheet_LinEq.pdf', icon: '📄', closable: true }
]);
const activeTabId = ref('whiteboard');
const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value) || tabs.value[0] || null);

const setActiveTab = (id) => {
  if (!id) return;
  const exists = tabs.value.some((t) => t.id === id);
  if (exists) activeTabId.value = id;
};

const openDocumentTab = (filename) => {
  const id = `doc-${String(filename || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 60);
  const existing = tabs.value.find((t) => t.id === id);
  if (existing) return setActiveTab(existing.id);
  tabs.value.push({ id, kind: 'document', title: filename || 'Document', icon: '📄', closable: true });
  activeTabId.value = id;
};

const openActivityTab = (title) => {
  const id = `activity-${String(title || 'activity').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 60);
  const existing = tabs.value.find((t) => t.id === id);
  if (existing) return setActiveTab(existing.id);
  tabs.value.push({ id, kind: 'activity', title: title || 'Activity', icon: '📝', closable: true });
  activeTabId.value = id;
};

const openCodeLabTab = () => {
  const id = 'codelab';
  const existing = tabs.value.find((t) => t.id === id);
  if (existing) return setActiveTab(existing.id);
  tabs.value.push({ id, kind: 'codelab', title: 'Code Lab', icon: '💻', closable: true });
  activeTabId.value = id;
};

const openVideosTab = () => {
  const id = 'videos';
  const existing = tabs.value.find((t) => t.id === id);
  if (existing) return setActiveTab(existing.id);
  tabs.value.push({ id, kind: 'videos', title: 'Videos', icon: '🎥', closable: true });
  activeTabId.value = id;
};

const openLinksTab = () => {
  const id = 'links';
  const existing = tabs.value.find((t) => t.id === id);
  if (existing) return setActiveTab(existing.id);
  tabs.value.push({ id, kind: 'links', title: 'Links', icon: '🔗', closable: true });
  activeTabId.value = id;
};

const closeTab = (id) => {
  const idx = tabs.value.findIndex((t) => t.id === id);
  if (idx === -1) return;
  if (!tabs.value[idx]?.closable) return;
  const wasActive = activeTabId.value === id;
  tabs.value.splice(idx, 1);
  if (wasActive) {
    const next = tabs.value[idx - 1] || tabs.value[idx] || tabs.value[0] || null;
    if (next?.id) activeTabId.value = next.id;
  }
};

const sessionId = ref(route.params.sessionId || 'TS-78421');
const aiTab = ref('tutor');
const studentAnswer = ref('');
const showProgressModal = ref(false);
const sessionData = ref(null);
const standardsContext = ref([]);
const isDemoMode = ref(false);

const currentProblem = ref('2(x + 5) - 3x = 7');

onMounted(() => {
  loadSessionData();
  initWhiteboard();
});

// ----------------------------
// Interactive Whiteboard (MVP)
// ----------------------------
const wbStage = ref(null);
const wbCanvas = ref(null);
const wbCtx = ref(null);
const wbDpr = ref(1);
const wbTool = ref('pen'); // pen | highlighter | eraser | text
const wbColor = ref('#2563eb');
const wbColors = ref(['#111827', '#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#7c3aed']);
const wbSize = ref(6);
const wbShowGrid = ref(true);
const wbSnapToGrid = ref(false);
const wbTextStyle = ref('inline'); // inline | card
const wbStrokes = ref([]);
const wbRedoStack = ref([]);
const wbIsDrawing = ref(false);
let wbResizeObserver = null;
let wbDragState = null; // { id, startX, startY, originX, originY }

const wbTextBoxes = ref([]);

const canUndo = computed(() => wbStrokes.value.length > 0);
const canRedo = computed(() => wbRedoStack.value.length > 0);

function setWbTool(tool) {
  wbTool.value = tool;
}

function stagePointFromEvent(e) {
  const stageEl = wbStage.value;
  const canvasEl = wbCanvas.value;
  if (!stageEl || !canvasEl) return null;
  const rect = stageEl.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function snapPoint(pt) {
  if (!wbSnapToGrid.value) return pt;
  const size = 20;
  return { x: Math.round(pt.x / size) * size, y: Math.round(pt.y / size) * size };
}

function ensureCanvasSize() {
  const stageEl = wbStage.value;
  const canvasEl = wbCanvas.value;
  if (!stageEl || !canvasEl) return;
  const rect = stageEl.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  wbDpr.value = dpr;

  canvasEl.style.width = `${cssW}px`;
  canvasEl.style.height = `${cssH}px`;
  canvasEl.width = Math.floor(cssW * dpr);
  canvasEl.height = Math.floor(cssH * dpr);

  const ctx = canvasEl.getContext('2d');
  wbCtx.value = ctx;
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
}

function drawStroke(ctx, stroke) {
  if (!ctx || !stroke?.points?.length) return;
  ctx.save();
  const tool = stroke.tool;
  const baseW = Number(stroke.width || 6);
  const color = String(stroke.color || '#2563eb');

  if (tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = Math.max(10, baseW * 2.2);
  } else if (tool === 'highlighter') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = withAlpha(color, 0.28);
    ctx.lineWidth = Math.max(10, baseW * 1.8);
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, baseW);
  }

  const pts = stroke.points;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function redrawAll() {
  const ctx = wbCtx.value;
  const canvasEl = wbCanvas.value;
  if (!ctx || !canvasEl) return;
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  for (const s of wbStrokes.value) drawStroke(ctx, s);
}

function beginStroke(pt) {
  wbIsDrawing.value = true;
  wbRedoStack.value = [];
  wbStrokes.value.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tool: wbTool.value,
    color: wbColor.value,
    width: wbSize.value,
    points: [snapPoint(pt)]
  });
}

function extendStroke(pt) {
  const ctx = wbCtx.value;
  const current = wbStrokes.value[wbStrokes.value.length - 1];
  if (!current) return;
  const pts = current.points;
  const prev = pts[pts.length - 1];
  pts.push(snapPoint(pt));
  // incremental draw segment for responsiveness
  if (ctx && prev) {
    drawStroke(ctx, { ...current, points: [prev, pt] });
  }
}

function endStroke() {
  wbIsDrawing.value = false;
  // normalize: tiny taps should still render
  redrawAll();
}

function onStagePointerDown(e) {
  if (activeTab.value?.kind !== 'whiteboard') return;
  // Ignore clicks on text boxes / bars
  const target = e.target;
  if (target && (target.closest?.('.vt-textBox') || target.closest?.('.vt-worktabs'))) return;

  if (wbTool.value === 'text') {
    const pt = stagePointFromEvent(e);
    if (!pt) return;
    const s = snapPoint(pt);
    createTextBoxAt(s.x, s.y);
    return;
  }

  const pt = stagePointFromEvent(e);
  if (!pt) return;
  e.preventDefault();
  e.stopPropagation();
  wbStage.value?.setPointerCapture?.(e.pointerId);
  beginStroke(pt);
}

function onStagePointerMove(e) {
  if (!wbIsDrawing.value) return;
  const pt = stagePointFromEvent(e);
  if (!pt) return;
  extendStroke(pt);
}

function onStagePointerUp(e) {
  if (!wbIsDrawing.value) return;
  e.preventDefault();
  endStroke();
}

function undoStroke() {
  const last = wbStrokes.value.pop();
  if (last) wbRedoStack.value.push(last);
  redrawAll();
}

function redoStroke() {
  const s = wbRedoStack.value.pop();
  if (s) wbStrokes.value.push(s);
  redrawAll();
}

function clearWhiteboard() {
  if (!confirm('Clear all whiteboard ink and text boxes?')) return;
  wbStrokes.value = [];
  wbRedoStack.value = [];
  wbTextBoxes.value = [];
  redrawAll();
}

function withAlpha(hex, alpha) {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 6) return `rgba(37,99,235,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function createTextBoxAt(x, y) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  wbTextBoxes.value.push({
    id,
    x: Math.max(10, x),
    y: Math.max(10, y),
    w: 240,
    text: '',
    color: '#111827',
    style: wbTextStyle.value,
    fontSize: wbTextStyle.value === 'inline' ? 16 : 14
  });
  nextTick(() => {
    const el = wbStage.value?.querySelector?.(`.vt-textBoxBody[data-box-id="${id}"]`);
    el?.focus?.();
  });
}

function onTextBoxInput(id, e) {
  const text = e?.target?.innerText ?? '';
  const idx = wbTextBoxes.value.findIndex((b) => b.id === id);
  if (idx >= 0) wbTextBoxes.value[idx].text = text;
}

function deleteTextBox(id) {
  wbTextBoxes.value = wbTextBoxes.value.filter((b) => b.id !== id);
}

function startDragTextBox(id, e) {
  const pt = stagePointFromEvent(e);
  if (!pt) return;
  const box = wbTextBoxes.value.find((b) => b.id === id);
  if (!box) return;
  e.preventDefault();
  e.stopPropagation();
  wbDragState = { id, startX: pt.x, startY: pt.y, originX: box.x, originY: box.y };
  window.addEventListener('pointermove', onDragMove, { passive: false });
  window.addEventListener('pointerup', endDrag, { passive: false });
}

function onDragMove(e) {
  if (!wbDragState) return;
  const stageEl = wbStage.value;
  if (!stageEl) return;
  const rect = stageEl.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const dx = x - wbDragState.startX;
  const dy = y - wbDragState.startY;
  const idx = wbTextBoxes.value.findIndex((b) => b.id === wbDragState.id);
  if (idx >= 0) {
    const next = snapPoint({ x: wbDragState.originX + dx, y: wbDragState.originY + dy });
    wbTextBoxes.value[idx].x = Math.max(6, next.x);
    wbTextBoxes.value[idx].y = Math.max(6, next.y);
  }
}

function endDrag() {
  wbDragState = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', endDrag);
}

function initWhiteboard() {
  nextTick(() => {
    if (!wbStage.value || !wbCanvas.value) return;
    ensureCanvasSize();
    redrawAll();

    // attach pointer handlers on stage
    wbStage.value.addEventListener('pointermove', onStagePointerMove, { passive: false });
    wbStage.value.addEventListener('pointerup', onStagePointerUp, { passive: false });
    wbStage.value.addEventListener('pointercancel', onStagePointerUp, { passive: false });

    wbResizeObserver = new ResizeObserver(() => {
      ensureCanvasSize();
      redrawAll();
    });
    wbResizeObserver.observe(wbStage.value);
  });
}

onBeforeUnmount(() => {
  try {
    wbResizeObserver?.disconnect?.();
  } catch {
    // ignore
  }
  try {
    wbStage.value?.removeEventListener?.('pointermove', onStagePointerMove);
    wbStage.value?.removeEventListener?.('pointerup', onStagePointerUp);
    wbStage.value?.removeEventListener?.('pointercancel', onStagePointerUp);
  } catch {
    // ignore
  }
  endDrag();
});

const loadSessionData = async () => {
  const idNum = Number(sessionId.value);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    isDemoMode.value = true;
    return;
  }
  try {
    const res = await api.get(`/learning-class-sessions/sessions/${idNum}`);
    sessionData.value = res.data?.session || null;
    standardsContext.value = sessionData.value?.standards_context_json?.standards || [];
  } catch (e) {
    isDemoMode.value = true;
  }
};

const submitAnswer = () => {
  if (!studentAnswer.value) return;
  console.log('Submitted answer:', studentAnswer.value);
  // Would POST to activity endpoint, update learning_evidence, trigger AI analysis
  alert('Answer submitted! AI Tutor analyzing against Colorado standards... (78% match)');
  studentAnswer.value = '';
};

const giveHint = () => {
  alert('Hint: Remember to distribute the coefficient across the parentheses first.');
};

const explainAnotherWay = () => {
  alert('Alternative explanation using balance scale visual: subtract 12 from both sides of the equation.');
};

const tryOnOwn = () => {
  alert('Great choice! The AI Tutor will monitor your independent work and provide feedback.');
};

const generatePractice = () => {
  showProgressModal.value = true;
};

const endSession = async () => {
  if (!confirm('End this tutoring session? Transcript will be analyzed by AI for progress summary, strengths, and standards gaps.')) return;
  const idNum = Number(sessionId.value);
  if (Number.isFinite(idNum) && idNum > 0) {
    try {
      await api.post(`/learning-class-sessions/sessions/${idNum}/end`, {
        transcriptText: '[Demo transcript captured in session. Replace with live speech-to-text from Vonage.]'
      });
    } catch (e) {
      console.warn('End session API failed:', e?.response?.data || e.message);
    }
  }
  alert('Session ended. AI summary and standards-aligned homework will appear in the guardian portal.');
  router.push('/guardian');
};

const toggleMute = () => alert('Microphone toggled (Vonage integration)');
const toggleVideo = () => alert('Camera toggled');
const shareScreen = () => alert('Screen sharing started (integrated with whiteboard)');
const openWhiteboard = () => alert('Whiteboard tools expanded');
const openChat = () => alert('Session chat opened');
const raiseHand = () => alert('Hand raised. Tutor notified.');

const downloadHomework = () => {
  alert('Downloading branded PDF homework aligned to Colorado Department of Education standards. Added to guardian portal.');
  showProgressModal.value = false;
};

// Expose for testing
defineExpose({ sessionId });
</script>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

.virtual-tutoring-dashboard {
  font-family: var(--font-display, 'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}

.vt-root {
  min-height: 100vh;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0a0f1c;
  color: #fff;
}

.vt-topbar {
  padding: 12px 18px;
  background: #121a2b;
  border-bottom: 1px solid #1e2a44;
  box-shadow: 0 1px 0 rgba(30, 42, 68, 0.6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.vt-pill {
  padding: 6px 10px;
  background: rgba(30, 42, 68, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(10px);
}

.vt-btn {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 850;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(30, 42, 68, 0.75);
  transition: transform 0.12s ease, filter 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}

.vt-btn:focus {
  outline: none;
}

.vt-btn:focus-visible {
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.28);
  border-color: rgba(96, 165, 250, 0.6);
}

.vt-btn:hover {
  filter: brightness(1.06);
}

.vt-btn:active {
  transform: translateY(1px);
}

.vt-btn-sm {
  padding: 8px 10px;
  font-size: 12px;
  border-radius: 12px;
}

.vt-btn-md {
  padding: 10px 14px;
  font-size: 13px;
  border-radius: 12px;
}

.vt-btn-block {
  width: 100%;
}

.vt-btn-ghost {
  background: transparent;
  border-color: transparent;
  color: rgba(255, 255, 255, 0.82);
}

.vt-btn-ghost:hover {
  background: rgba(30, 42, 68, 0.7);
  border-color: rgba(255, 255, 255, 0.08);
}

.vt-btn-surface {
  background: rgba(30, 42, 68, 0.9);
}

.vt-btn-surface:hover {
  background: rgba(42, 58, 90, 0.95);
}

.vt-btn-primary {
  background: linear-gradient(90deg, rgba(37, 99, 235, 0.95), rgba(124, 58, 237, 0.95));
  border-color: rgba(99, 102, 241, 0.35);
}

.vt-btn-danger {
  background: linear-gradient(90deg, rgba(220, 38, 38, 0.95), rgba(244, 63, 94, 0.95));
  border-color: rgba(248, 113, 113, 0.35);
}

.vt-toolbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.vt-toolbtn-accent {
  color: rgba(147, 197, 253, 0.95);
}

.vt-zoomPill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 999px;
  background: rgba(30, 42, 68, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(52, 211, 153, 0.95);
  font-size: 12px;
  font-weight: 900;
}

.vt-zoomDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.vt-mt-10 {
  margin-top: 10px;
}

.vt-bottomBar {
  height: 56px;
  background: #121a2b;
  border-top: 1px solid #1e2a44;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
}

.vt-bottomBtn {
  padding: 8px 10px;
}

.vt-summaryPill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 999px;
  background: rgba(30, 42, 68, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  max-width: 420px;
  overflow: hidden;
  white-space: nowrap;
}

.vt-summaryLabel {
  color: rgba(196, 181, 253, 0.95);
  font-weight: 900;
  font-size: 12px;
}

.vt-summaryText {
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vt-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.vt-sidebar {
  width: 240px;
  flex: 0 0 240px;
  background: #0f1625;
  border-right: 1px solid #1e2a44;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.vt-sidebar nav {
  padding: 10px;
  overflow: auto;
}

.vt-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #05080f;
}

.vt-toolbar {
  height: 48px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0a0f1c;
  border-bottom: 1px solid #1e2a44;
  color: rgba(255, 255, 255, 0.84);
}

.vt-toolbarGroup {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.vt-toolbarDivider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.08);
  margin: 0 6px;
}

.vt-miniLabel {
  font-size: 11px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.58);
}

.vt-range {
  width: 120px;
}

.vt-toolbarColors {
  gap: 6px;
}

.vt-colorSwatch {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.16);
  cursor: pointer;
  padding: 0;
}

.vt-colorSwatchActive {
  border-color: rgba(96, 165, 250, 0.9);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.22);
}

.vt-btn-selected {
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.55);
  border-color: rgba(96, 165, 250, 0.65);
}

.vt-worktabs {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px 0;
  background: #0a0f1c;
  border-bottom: 1px solid #1e2a44;
  overflow-x: auto;
}

.vt-worktab {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(18, 26, 43, 0.55);
  color: rgba(255, 255, 255, 0.78);
  border-bottom: 0;
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
  padding: 8px 10px;
  min-width: 160px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.vt-worktabActive {
  background: #121a2b;
  color: #fff;
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.18);
}

.vt-worktabIcon {
  width: 18px;
  display: inline-flex;
  justify-content: center;
}

.vt-worktabTitle {
  font-size: 12px;
  font-weight: 850;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vt-worktabClose {
  appearance: none;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 10px;
  font-weight: 900;
}

.vt-worktabClose:hover {
  background: rgba(30, 42, 68, 0.65);
  color: rgba(255, 255, 255, 0.9);
}

.vt-board {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 28px 26px;
  background-color: #ffffff;
  color: #0b1020;
}

.vt-boardGrid {
  background-image:
    linear-gradient(#f1f3f5 1px, transparent 1px),
    linear-gradient(90deg, #f1f3f5 1px, transparent 1px);
  background-size: 20px 20px;
}

.vt-boardStage {
  position: relative;
  min-height: 100%;
}

.vt-boardContent {
  position: relative;
  z-index: 1;
}

.vt-whiteboardCanvas {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.vt-textLayer {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.vt-textBox {
  position: absolute;
  pointer-events: auto;
  border-radius: 14px;
  overflow: hidden;
}

.vt-textBoxInline {
  background: transparent;
  border: 0;
  box-shadow: none;
}

.vt-textBoxCard {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.12);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.12);
}

.vt-textBoxBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.06);
  cursor: move;
  user-select: none;
}

.vt-textBoxInline .vt-textBoxBar {
  opacity: 0;
  height: 0;
  padding: 0 10px;
  overflow: hidden;
  transition: opacity 0.12s ease;
}

.vt-textBoxInline:hover .vt-textBoxBar,
.vt-textBoxInline:focus-within .vt-textBoxBar {
  opacity: 1;
  height: auto;
  padding: 8px 10px;
}

.vt-textBoxTitle {
  font-size: 11px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.6);
}

.vt-textBoxClose {
  appearance: none;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.55);
  padding: 2px 6px;
  border-radius: 10px;
}

.vt-textBoxClose:hover {
  background: rgba(15, 23, 42, 0.08);
  color: rgba(15, 23, 42, 0.8);
}

.vt-textBoxBody {
  min-height: 70px;
  padding: 10px;
  outline: none;
  font-size: 14px;
  line-height: 1.35;
  white-space: pre-wrap;
}

.vt-textBoxInline .vt-textBoxBody {
  min-height: 34px;
  padding: 4px 6px;
  border-radius: 10px;
  font-weight: 600;
}

.vt-textBoxInline .vt-textBoxBody:focus {
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.25);
}

.vt-docSurface {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #0a0f1c;
}

.vt-docHeader {
  padding: 14px 14px 10px;
  border-bottom: 1px solid #1e2a44;
  background: #121a2b;
}

.vt-docTitle {
  font-weight: 900;
  font-size: 14px;
}

.vt-docMeta {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.vt-docCanvas {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 22px;
  background: radial-gradient(circle at 40% 20%, rgba(255, 255, 255, 0.06), transparent 55%);
}

.vt-docPlaceholder {
  width: min(540px, 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  padding: 18px;
  background: rgba(30, 42, 68, 0.55);
}

.vt-docIcon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(96, 165, 250, 0.16);
  margin-bottom: 10px;
  font-size: 22px;
}

.vt-docPlaceholderTitle {
  font-weight: 900;
  font-size: 14px;
}

.vt-docPlaceholderSub {
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  line-height: 1.35;
}

/* Minimal equivalents for the Tailwind layout used inside the whiteboard */
.vt-board .max-w-3xl {
  max-width: 768px;
}

.vt-board .mx-auto {
  margin-left: auto;
  margin-right: auto;
}

.vt-board .relative {
  position: relative;
}

.vt-board .absolute {
  position: absolute;
}

.vt-board .top-32 {
  top: 8rem;
}

.vt-board .right-12 {
  right: 3rem;
}

.vt-right {
  width: 390px;
  flex: 0 0 390px;
  background: #0a0f1c;
  border-left: 1px solid #1e2a44;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.vt-videoPanel {
  padding: 16px;
  border-bottom: 1px solid #1e2a44;
}

.vt-panelTitle {
  font-size: 11px;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 900;
  margin-bottom: 10px;
}

.vt-videoGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.vt-videoTile {
  position: relative;
  background: #1a2538;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  aspect-ratio: 16/9;
}

.vt-videoTileTutor {
  box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.22);
}

.vt-videoTileStudent {
  box-shadow: inset 0 0 0 1px rgba(52, 211, 153, 0.18);
}

.vt-videoMount {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.07), transparent 55%);
}

.vt-videoPlaceholder {
  width: 74px;
  height: 74px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  font-size: 34px;
  background: linear-gradient(135deg, rgba(192, 132, 252, 0.9), rgba(251, 113, 133, 0.9));
}

.vt-videoTileStudent .vt-videoPlaceholder {
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.92), rgba(34, 211, 238, 0.9));
}

.vt-videoName {
  position: absolute;
  left: 10px;
  bottom: 10px;
  font-size: 12px;
  font-weight: 900;
  background: rgba(0, 0, 0, 0.45);
  padding: 2px 8px;
  border-radius: 999px;
}

.vt-videoBadge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #10b981;
  color: #02130b;
  font-size: 10px;
  font-weight: 900;
  padding: 2px 6px;
  border-radius: 999px;
}

.vt-videoRole {
  position: absolute;
  left: 10px;
  top: 8px;
  font-size: 10px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.45);
  padding: 2px 6px;
  border-radius: 999px;
}

.vt-videoControls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.vt-controlBtn {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #1e2a44;
  color: rgba(255, 255, 255, 0.86);
  border-radius: 14px;
  padding: 10px 10px;
  cursor: pointer;
  font-weight: 800;
  font-size: 12px;
}

.vt-controlBtn:hover {
  background: #2a3a5a;
}

.vt-controlBtn:active {
  transform: translateY(1px);
}

.vt-navitem {
  width: 100%;
  appearance: none;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.86);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 14px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease, transform 0.15s ease, color 0.15s ease;
  font-size: 13px;
  font-weight: 650;
}

.vt-navitem:hover {
  background: #1e2a44;
}

.vt-navitem:active {
  transform: translateY(1px);
}

.vt-navitem-active {
  background: rgba(30, 42, 68, 0.92);
  color: #93c5fd;
  box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.18);
}

.vt-navicon {
  width: 18px;
  display: inline-flex;
  justify-content: center;
}

.vt-navlabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Make the “Tailwind-only” layout still look good without Tailwind */
.vt-topbar button {
  appearance: none;
  border: 0;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 800;
  font-size: 13px;
  color: #fff;
}

.vt-topbar button:hover {
  filter: brightness(1.05);
}

.vt-topbar button:active {
  transform: translateY(1px);
}

@media (max-width: 1100px) {
  .vt-sidebar {
    display: none;
  }
}

@media (max-width: 900px) {
  .vt-right {
    display: none;
  }
}
</style>
