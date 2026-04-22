# Virtual Tutoring Platform – Vision & Design Specification

## Purpose

This document outlines the vision, structure, and functional goals for a next-generation virtual tutoring platform that integrates human instruction, artificial intelligence, and interactive learning tools into a unified experience.

The goal is to create a system that enhances learning outcomes, increases engagement, and provides real-time adaptive support for both tutors and students.

---

## Core Philosophy

### 1. Human + AI Collaboration

The platform is not intended to replace the tutor, but to enhance their effectiveness. The system should:

* Support tutors with insights, summaries, and recommendations
* Provide students with supplemental guidance when needed
* Maintain the tutor as the primary relational and instructional driver

### 2. Active Learning Over Passive Consumption

Students should continuously interact with the material through:

* Problem-solving
* Writing
* Responding to prompts
* Receiving feedback

### 3. Real-Time Adaptation

The system should dynamically adjust to the student’s performance by:

* Offering hints when needed
* Tracking confidence and accuracy
* Generating new practice opportunities

### 4. Integrated Ecosystem

All learning components should exist within a single environment:

* Video interaction
* Whiteboard instruction
* Documents and curriculum
* Practice activities
* AI support
* Progress tracking

---

## Interface Architecture

### 1. Left Sidebar – Navigation System

#### Visual Design

* Vertical layout with icons and labels
* Grouped sections for clarity

#### Functional Goals

* Provide access to all major tools and content types
* Allow seamless switching between learning modes

#### Key Sections

* Whiteboard (primary workspace)
* Documents
* Activities
* Videos
* Links
* Tools (calculator, graphing, notes)
* AI Tools

---

### 2. Top Bar – Session Context & Controls

#### Visual Design

* Session title and timer
* Live session indicator
* Control buttons (mute, camera, screen share, end session)

#### Functional Goals

* Provide clear session context
* Allow quick access to communication controls
* Reinforce structured session timing

---

### 3. Video Panel – Human Interaction Layer

#### Visual Design

* Video tiles for tutor and student
* Name labels and active indicators

#### Functional Goals

* Enable real-time face-to-face interaction
* Support rapport building and engagement monitoring

---

### 4. Central Whiteboard – Primary Learning Space

#### Visual Design

* Large, clean canvas
* Multi-color annotation tools
* Highlighted instructional notes

#### Functional Goals

* Serve as the main teaching medium
* Allow step-by-step problem solving
* Support visual learning and concept breakdown

---

### 5. AI Tutor Panel – Adaptive Support System

#### Visual Design

* Chat-style interface
* Tabs for hints, insights, and tutoring
* Confidence indicators

#### Functional Goals

* Provide real-time feedback
* Offer hints and alternative explanations
* Encourage independent problem solving
* Track understanding levels

---

### 6. Session Goals Panel – Objective Tracking

#### Visual Design

* Checklist format with progress indicators

#### Functional Goals

* Define session objectives
* Track completion in real time
* Reinforce goal-oriented learning

---

### 7. Activity Panel – Practice & Application

#### Visual Design

* Problem display with input field and submission controls

#### Functional Goals

* Allow immediate application of concepts
* Reinforce learning through practice

---

### 8. Document Panel – Curriculum Structure

#### Visual Design

* File viewer with outline navigation

#### Functional Goals

* Provide structured learning materials
* Allow quick navigation between sections

---

### 9. AI Summary Panel – Reinforcement Layer

#### Visual Design

* Bullet-point summaries
* Action button for generating practice

#### Functional Goals

* Reinforce key concepts
* Reduce tutor workload in summarizing
* Enable rapid review

---

### 10. Chat Panel – Communication Channel

#### Visual Design

* Message thread with input field

#### Functional Goals

* Allow asynchronous communication during sessions
* Support questions without interrupting flow

---

### 11. Progress Insights Panel – Analytics System

#### Visual Design

* Charts and percentage indicators
* Categorized metrics (understanding, accuracy, engagement)

#### Functional Goals

* Provide real-time performance tracking
* Inform tutor decision-making
* Offer recommendations for improvement

---

### 12. Bottom Control Bar – Quick Actions

#### Visual Design

* Icon-based controls

#### Functional Goals

* Provide quick access to essential tools
* Maintain familiarity with common video platforms

---

## System Capabilities

### 1. Real-Time Feedback Loop

* Student performs action
* System evaluates performance
* AI provides feedback
* Tutor adjusts instruction

### 2. Adaptive Learning Engine

* Tracks:

  * Accuracy
  * Speed
  * Confidence
* Adjusts:

  * Difficulty
  * Hint frequency
  * Content progression

### 3. AI-Assisted Instruction

* Suggests explanations
* Generates practice problems
* Summarizes sessions
* Identifies learning gaps

### 4. Engagement Optimization

* Visual progress indicators
* Interactive tasks
* Immediate feedback

---

## User Experience Goals

### For Students

* Feel supported but not dependent on AI
* Stay actively engaged
* Understand progress clearly
* Receive personalized guidance

### For Tutors

* Reduce cognitive load
* Gain real-time insights
* Focus on teaching and relationship building
* Use AI as an assistant, not a replacement

---

## Design Principles

### 1. Clarity Over Complexity

* Clean layout
* Minimal unnecessary elements

### 2. Accessibility

* Easy navigation
* Familiar controls

### 3. Responsiveness

* Real-time updates
* Immediate feedback

### 4. Modularity

* Components should function independently but cohesively

### 5. Scalability

* System should support:

  * Different subjects
  * Different age groups
  * Different learning styles

---

## End Goal

To build a platform where:

* A tutor can effectively teach without friction
* A student can actively learn and improve
* AI enhances both experiences in real time

This system should represent a shift from traditional tutoring toward a fully integrated, intelligent learning environment that maximizes engagement, understanding, and measurable progress.

---

## Updated Virtual Tutoring Dashboard Specification (April 2026)

### Dashboard Reference Image
The implementation must exactly match the attached `assets/ChatGPT_Image_Apr_22__2026__08_54_55_AM-8256f5f4-c837-44ea-94ed-efb1014d3f0f.png` (TutorFlow Math Tutoring interface):

- **Top Bar**: "Math Tutoring – Solving Linear Equations", live timer (00:24:18), "Live Session" badge, End Session button.
- **Left Sidebar (Learning Hub)**: Whiteboard (active), Documents, Activities, Code Lab, Videos, Links, Tools (Calculator, Graphing Tool, Sticky Notes, Mind Map), AI Tools (AI Tutor, Summary, Progress Insight).
- **Central Whiteboard**: Shows "Example 2: Solve for x" with step-by-step equation solving (3(x-4)+2x=20 → distributed → combined terms → 5x=32 → x=6.4). Includes "Remember!" bubble with step-by-step guidance.
- **Top-Right Video Panel**: Dual live video feeds (Ms. Ava tutor and student Ethan) with mute/camera controls.
- **Right Sidebar**:
  - **AI Tutor Panel**: Tabs (Tutor, Hints, Insights). Shows real-time feedback ("I noticed you did a great job distributing the 3! Want a hint on the next step?"), buttons ("Yes, give me a hint", "Explain another way", "Let me try on my own"), AI confidence bar (82%).
  - **Session Goals**: Checklist with progress (2/3 completed).
  - **Activity ("Solve It!")**: Current problem input field, Submit button.
  - **Document Outline**: Worksheet_LinEq.pdf with page navigation.
  - **AI Summary**: Bullet points of what was learned, "Generate Practice" button.
  - **Session Chat**: Live messaging.
  - **Progress Insights**: 78% Overall Progress donut, bar charts for Concept Understanding (82%), Practice Accuracy (76%), Engagement (88%), Homework Completion (65%). Recommendation: "Keep practicing word problems to boost your confidence!"

This is a **separate dashboard** from existing GroupClassSessionRoom, LearningClassWorkspaceView, SchoolPortal, or Guardian views. It is accessed exclusively after enrolling in "Individual Tutoring" via guardian registration, provider availability matching, and unique session login.

### Enrollment and Session Flow
1. Guardian enrolls child in **Individual Tutoring** program via GuardianPortalView.vue or public enrollment hub (extend existing `/api/guardian-portal/registration/learning-classes` and publicSkillBuilders flows).
2. System checks provider availability (reuse patterns from schoolPortalRedesign.js and publicProviderAvailability).
3. Upon booking, create session linked to `learning_class_sessions` (with `session_type = 'individual_tutoring'`) or dedicated `virtual_tutoring_sessions` table.
4. Student/guardian logs into unique session URL (`/tutoring-session/:sessionId`).
5. Dashboard loads with standards-aligned content from `learning_standards` (CAS/CMAS Colorado-informed), linked `learning_goals`, pre-populated worksheet from `learning_assignments`.

### Core Integrations
- **Video**: Use existing `vonageVideo.service.js` (via `/api/learning-class-sessions/:id/video-token` or dedicated endpoint). Dual video tiles with Vonage tokens for real-time tutor-student interaction. Support webhooks for session events.
- **Standards Alignment**: Every activity, goal, evidence, and homework must map to `learning_standards` (domains, subdomains, skills from `database/migrations/609_standards_aligned_learning_foundation.sql` and initiative doc). Auto-generate session goals from student profile and prior progress.
- **AI Tutor & Analysis**: Leverage `backend/src/controllers/agents.controller.js` (`POST /api/agents/assist`) with tutoring-specific agentConfig. Real-time hints, alternative explanations, confidence scoring. 
- **Transcripts**: Capture session discussion (speech-to-text via browser `useSpeechToText.js` or Vonage/voice webhook). Post-session, feed to transcript summary service (pattern from `supervisionTranscriptSummary.service.js` and `teamMeetingTranscriptSummary.service.js`). AI analyzes:
  - What student did well (strengths).
  - Areas needing more work (gaps).
  - Maps to Colorado/US Dept of Education standards.
  - Updates `learning_evidence`, `learning_progress`, and guardian view.
- **Guardian Portal**: Branded downloadable homework assignments (PDF generation aligned to standards using existing `learningAssignments` + orgBranding). Progress dashboard shows session summaries, transcripts, overall metrics, recommendations. Extend `GuardianPortalView.vue` with new tutoring-specific panels.
- **Whiteboard & Tools**: Interactive canvas for step-by-step solving (math equations, graphing). Integrate Calculator, Graphing Tool, Sticky Notes. Support document upload/outline (Worksheet_LinEq.pdf example).
- **Progress & Activity**: Real-time "Solve It" submission updates goals. Session Goals checklist, AI Summary with "Generate Practice", Progress Insights gauges (78% overall, category breakdowns).

### Technical Architecture
- **Frontend**: New `frontend/src/views/tutoring/VirtualTutoringSessionView.vue` as main container (dark theme matching image). Modular components under `frontend/src/components/tutoring/`:
  - TutoringLearningHub.vue (sidebar)
  - InteractiveWhiteboard.vue
  - AITutorPanel.vue (with confidence, hint buttons)
  - SessionProgressInsights.vue (gauges, recommendations)
  - GuardianHomeworkExporter.vue
- **Backend**: Extend `learningClassSessions.controller.js`, `learningStandards.controller.js`, `agents.controller.js`. Add tutoring-specific tools for homework generation, standards lookup, transcript analysis. New migration for session metadata if needed (`session_type`, `transcript_text`, `ai_summary_json`).
- **Data Flow**: Session start → Vonage video + whiteboard activity → real-time AI feedback via agents → transcript on end → AI summary service → update learning_progress/goals/evidence → guardian PDF exports and portal views.
- **Feature Flag**: `virtualTutoringEnabled` to control rollout.

### Phased Rollout (One Feature at a Time)
1. Update this guide + create UI skeleton matching dashboard image (static layout first).
2. Define data model (extend learning_class_sessions with tutoring type).
3. Implement core UI components + router integration with enrollment gating.
4. Integrate Vonage video feeds.
5. Build AI transcript analysis and standards mapping.
6. Update guardian portal with homework downloads, summaries, progress.
7. Full end-to-end testing with standards-aligned homework generation.

### Success Metrics
- 80%+ student engagement in live sessions.
- Accurate AI identification of strengths/needs mapped to standards (>85% alignment).
- Guardian satisfaction with branded homework and progress visibility.
- Measurable improvement in learning_progress metrics post-tutoring.

Cross-reference with [docs/STANDARDS_ALIGNED_LEARNING_SYSTEM_INITIATIVE.md](docs/STANDARDS_ALIGNED_LEARNING_SYSTEM_INITIATIVE.md) for full standards -> goals -> evidence -> assignments pipeline. This virtual tutoring dashboard is the primary consumer of that system for 1:1 live adaptive instruction.

---

**Summary:**
This platform is designed to combine the strengths of human instruction, artificial intelligence, and interactive technology into a seamless, adaptive, and highly engaging learning experience. The new dedicated Virtual Tutoring Dashboard, triggered exclusively through Individual Tutoring enrollment, delivers the integrated TutorFlow experience with full Vonage video, real-time AI tutoring, transcript-powered insights, Colorado/US standards alignment, and guardian portal homework/progress features.
