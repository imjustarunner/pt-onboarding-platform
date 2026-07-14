# Interactive Life Balance Wheel

## Product, Assessment, UX, and Engineering Specification

**Document status:** Implementation-ready
**Primary use case:** Life coaching assessment and progress tracking
**Recommended implementation:** Responsive SVG component
**Score range:** 1–10
**Default number of categories:** 10

---

# 1. Product Overview

The Life Balance Wheel is an interactive coaching assessment that helps a client evaluate satisfaction across important areas of life.

The experience should allow a client to:

1. Understand each life category.
2. answer a small set of reflection questions.
3. assign a score from 1 to 10.
4. watch the corresponding section of the wheel fill in real time.
5. review the completed wheel.
6. identify strengths and growth areas.
7. choose one or more coaching priorities.
8. create goals and action steps.
9. repeat the assessment later.
10. compare current results with previous assessments.

The wheel should not be implemented as a static image.

It should be generated mathematically as an SVG so that each category can:

* fill according to its score;
* animate when its score changes;
* respond to hover and selection;
* display historical values;
* resize without losing quality;
* support printing and exporting;
* work on desktop, tablet, and mobile;
* remain accessible to keyboard and screen-reader users.

---

# 2. Primary User Experience

The full experience should follow this sequence:

```text
Introduction
    ↓
Assessment instructions
    ↓
Category-by-category questions
    ↓
Score selection
    ↓
Wheel fills progressively
    ↓
Review completed wheel
    ↓
Identify strengths and growth areas
    ↓
Select coaching priorities
    ↓
Create goals and action steps
    ↓
Save assessment
    ↓
Review progress over time
```

The assessment should feel conversational rather than like a long clinical form.

The user should normally complete one category at a time.

---

# 3. Default Life Categories

The wheel contains ten equally sized categories.

Each category occupies 36 degrees of the circle.

| Order | Category                      | Default Color |
| ----: | ----------------------------- | ------------- |
|     1 | Physical Health & Energy      | `#BFD99B`     |
|     2 | Mental & Emotional Well-being | `#9FD5D4`     |
|     3 | Relationships & Family        | `#F2CF79`     |
|     4 | Friends & Social Life         | `#F2C28D`     |
|     5 | Career & Purpose              | `#EFA58F`     |
|     6 | Finances                      | `#B9A7D0`     |
|     7 | Personal Growth & Learning    | `#9EB6D6`     |
|     8 | Recreation & Fun              | `#9ED0D2`     |
|     9 | Environment & Home            | `#D9C6A4`     |
|    10 | Spirituality & Meaning        | `#C7B5D8`     |

These categories should be configurable at the organization, coach, assessment-template, or client level.

---

# 4. Scoring Model

Each category is scored from 1 to 10.

## 4.1 Score Definitions

| Score | General Interpretation                             |
| ----: | -------------------------------------------------- |
|     1 | Extremely dissatisfied or significantly struggling |
|     2 | Very dissatisfied                                  |
|     3 | Dissatisfied and needing attention                 |
|     4 | Below desired level                                |
|     5 | Mixed or inconsistent                              |
|     6 | Fairly stable but could improve                    |
|     7 | Generally satisfied                                |
|     8 | Strong and functioning well                        |
|     9 | Highly satisfied                                   |
|    10 | Thriving or fully aligned                          |

The score should represent the client’s present experience, not what they believe the score “should” be.

## 4.2 Score Guidance

Show this instruction before the assessment:

> Rate your current level of satisfaction in each area. Consider how the area feels overall, not whether it is objectively perfect. Choose the score that best represents your experience during the past two to four weeks.

## 4.3 Optional Timeframe

The assessment template should support a configurable timeframe:

```ts
type AssessmentTimeframe =
  | "today"
  | "past-week"
  | "past-two-weeks"
  | "past-month"
  | "current-season"
  | "custom";
```

Default recommendation:

```text
Consider your experience during the past two to four weeks.
```

---

# 5. Assessment Introduction

## 5.1 Welcome Screen

### Heading

```text
Explore Your Life Balance
```

### Supporting Text

```text
This assessment will help you reflect on ten important areas of your life.

There are no right or wrong answers. Your responses are a snapshot of how life feels right now and can help you and your coach decide where to focus next.
```

### Estimated Effort

```text
About 8–12 minutes
```

### Primary Button

```text
Begin Assessment
```

### Secondary Option

```text
Learn How It Works
```

---

# 6. Assessment Instructions

Before the first category, show a simple visual explanation.

```text
You will review one area of life at a time.

For each area:

1. Read the definition.
2. Answer a few reflection questions.
3. Choose a satisfaction score from 1 to 10.
4. Add an optional note.

As you answer, your Life Balance Wheel will fill in.
```

Additional guidance:

```text
A lower score does not mean failure. It simply helps identify areas that may deserve more attention.
```

---

# 7. Category Question Structure

Each category should contain:

1. category title;
2. short category definition;
3. two to four reflection questions;
4. satisfaction score;
5. optional importance score;
6. optional confidence score;
7. optional written note;
8. optional improvement prompt.

To keep the experience manageable, the default assessment should require only:

* one category score;
* one short reflection response or selectable question;
* one optional note.

Additional questions can be enabled by the coach or organization.

---

# 8. Assessment Questions by Category

## 8.1 Physical Health & Energy

### Definition

```text
Your physical well-being, sleep, movement, nutrition, daily energy, and ability to care for your body.
```

### Reflection Questions

* How satisfied are you with your current physical health?
* How consistent is your energy throughout a typical day?
* Are you getting enough restorative sleep?
* Are your movement, nutrition, and health routines supporting the life you want?

### Primary Score Question

```text
How satisfied are you with your physical health and energy right now?
```

### Optional Follow-Up

```text
What is having the greatest effect on your physical health or energy?
```

### Suggested Selectable Responses

* Sleep
* Physical activity
* Nutrition
* Pain or discomfort
* Medical needs
* Stress
* Workload
* Daily routine
* Other

---

## 8.2 Mental & Emotional Well-being

### Definition

```text
Your ability to understand and manage emotions, respond to stress, maintain stability, and feel mentally supported.
```

### Reflection Questions

* How emotionally steady have you felt recently?
* How effectively are you handling stress?
* Do you have enough space to process your feelings?
* Are your current coping strategies helping?

### Primary Score Question

```text
How satisfied are you with your mental and emotional well-being right now?
```

### Optional Follow-Up

```text
Which emotional experience has been most present recently?
```

### Suggested Selectable Responses

* Calm
* Stress
* Anxiety
* Motivation
* Sadness
* Irritability
* Confidence
* Overwhelm
* Hopefulness
* Other

---

## 8.3 Relationships & Family

### Definition

```text
The quality of your close relationships, family connections, communication, boundaries, trust, and support.
```

### Reflection Questions

* Do you feel supported by the people closest to you?
* Are you satisfied with communication in your important relationships?
* Are your boundaries respected?
* Do your close relationships contribute positively to your life?

### Primary Score Question

```text
How satisfied are you with your close relationships and family life?
```

### Optional Follow-Up

```text
What would most improve this area?
```

### Suggested Selectable Responses

* Better communication
* More quality time
* Stronger boundaries
* Conflict resolution
* Greater trust
* More support
* Repairing a relationship
* Creating distance
* Other

---

## 8.4 Friends & Social Life

### Definition

```text
Your friendships, sense of belonging, social support, community connection, and opportunities to interact with others.
```

### Reflection Questions

* Do you have people with whom you can be yourself?
* Are you satisfied with how often you connect socially?
* Do you feel included and supported?
* Is your social life energizing or draining?

### Primary Score Question

```text
How satisfied are you with your friendships and social life?
```

### Optional Follow-Up

```text
What type of social connection would feel most valuable right now?
```

### Suggested Selectable Responses

* Deeper friendships
* More frequent contact
* New friendships
* Community involvement
* Professional networking
* More time alone
* Healthier social boundaries
* Shared activities
* Other

---

## 8.5 Career & Purpose

### Definition

```text
Your satisfaction with work, contribution, direction, responsibilities, professional development, and sense of purpose.
```

### Reflection Questions

* Does your work feel meaningful?
* Are your strengths being used?
* Are you moving in a direction that feels right?
* Is your current workload sustainable?
* Do you understand what you want next?

### Primary Score Question

```text
How satisfied are you with your career, work, or sense of purpose?
```

### Optional Follow-Up

```text
Which part of this area needs the most attention?
```

### Suggested Selectable Responses

* Purpose
* Workload
* Compensation
* Advancement
* Leadership
* Work environment
* Career direction
* Skill development
* Work-life boundaries
* Other

---

## 8.6 Finances

### Definition

```text
Your sense of financial stability, control, preparedness, spending alignment, income, savings, and financial confidence.
```

### Reflection Questions

* Do you feel in control of your finances?
* Are your current financial habits aligned with your goals?
* Do you feel prepared for expected and unexpected expenses?
* Is money creating frequent stress or limiting important choices?

### Primary Score Question

```text
How satisfied are you with your current financial well-being?
```

### Optional Follow-Up

```text
What would create the most immediate improvement in this area?
```

### Suggested Selectable Responses

* Budgeting
* Increasing income
* Reducing expenses
* Paying debt
* Building savings
* Planning ahead
* Financial education
* Discussing money
* Reducing financial anxiety
* Other

The application should not present financial coaching responses as professional financial advice unless the provider is appropriately qualified.

---

## 8.7 Personal Growth & Learning

### Definition

```text
Your opportunities to learn, develop skills, challenge yourself, build self-awareness, and grow toward the person you want to become.
```

### Reflection Questions

* Are you continuing to learn and develop?
* Do you feel challenged in a healthy way?
* Are you making progress toward personal goals?
* Do your routines support reflection and growth?

### Primary Score Question

```text
How satisfied are you with your personal growth and learning?
```

### Optional Follow-Up

```text
What kind of growth feels most important right now?
```

### Suggested Selectable Responses

* Self-awareness
* Education
* Professional skills
* Confidence
* Leadership
* Creativity
* Discipline
* Communication
* New experiences
* Other

---

## 8.8 Recreation & Fun

### Definition

```text
Your access to enjoyment, play, hobbies, creativity, adventure, rest, and activities that are not based only on productivity.
```

### Reflection Questions

* Are you making enough time for enjoyment?
* Do you have activities that help you recharge?
* Are you able to be present during leisure time?
* Does your schedule include experiences you genuinely look forward to?

### Primary Score Question

```text
How satisfied are you with the amount of recreation and fun in your life?
```

### Optional Follow-Up

```text
What would make life feel more enjoyable?
```

### Suggested Selectable Responses

* Hobbies
* Travel
* Outdoor activity
* Creative activity
* Time with others
* Rest
* Play
* New experiences
* Less screen time
* Other

---

## 8.9 Environment & Home

### Definition

```text
The comfort, functionality, safety, organization, and emotional effect of your home and everyday surroundings.
```

### Reflection Questions

* Does your environment support your daily needs?
* Do you feel comfortable and safe at home?
* Is your space organized enough to reduce stress?
* Does your environment reflect the life you want to create?

### Primary Score Question

```text
How satisfied are you with your home and everyday environment?
```

### Optional Follow-Up

```text
What change would have the greatest positive effect?
```

### Suggested Selectable Responses

* Organization
* Cleanliness
* Privacy
* Safety
* Comfort
* Workspace
* Household responsibilities
* Location
* Design or atmosphere
* Other

---

## 8.10 Spirituality & Meaning

### Definition

```text
Your connection to meaning, values, faith, reflection, inner alignment, service, or something larger than yourself.
```

### Reflection Questions

* Do you feel connected to your values?
* Does your life feel meaningful?
* Do you have time for reflection?
* Are your actions aligned with what matters most to you?
* Do you feel connected to a spiritual, philosophical, or faith tradition, when relevant to you?

### Primary Score Question

```text
How satisfied are you with your sense of meaning, values, or spiritual connection?
```

### Optional Follow-Up

```text
What would help you feel more grounded or aligned?
```

### Suggested Selectable Responses

* Reflection
* Faith practice
* Values clarification
* Meditation
* Service
* Community
* Time in nature
* Gratitude
* Purpose
* Other

This category must be presented inclusively. It should not assume that the user follows a religion.

---

# 9. Score Entry Interaction

The user should be able to choose a score using one of the following interfaces:

## Recommended Desktop Interaction

* horizontal 1–10 scale;
* clickable numbered buttons;
* selected number clearly highlighted;
* optional slider below the numbers;
* keyboard arrow support.

## Recommended Mobile Interaction

* horizontally scrollable score buttons;
* large touch targets;
* visible selected value;
* optional plus and minus controls;
* no tiny radial clicking directly on the wheel.

## Score Labels

Show contextual labels at key values:

```text
1 — Extremely dissatisfied
3 — Needs significant attention
5 — Mixed or inconsistent
7 — Generally satisfied
10 — Thriving
```

Do not require the user to understand the colors to interpret their score.

---

# 10. Progressive Wheel Behavior

The wheel should remain visible during the assessment on desktop.

Recommended desktop layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Category Questions                    Live Balance Wheel      │
│                                                              │
│ Definition                            [SVG wheel]              │
│ Reflection questions                                           │
│ Score selector                       Current category: 7/10   │
│ Optional note                                                  │
│                                                              │
│ Back                                Save & Continue            │
└──────────────────────────────────────────────────────────────┘
```

Recommended mobile layout:

```text
Category title
Progress indicator
Compact wheel preview
Definition
Questions
Score selector
Optional note
Continue button
```

The wheel should fill after the score is selected.

Unanswered categories should remain neutral.

---

# 11. Wheel Geometry

## 11.1 SVG Dimensions

Use a responsive SVG with this base configuration:

```ts
const WHEEL_CONFIG = {
  viewBoxWidth: 800,
  viewBoxHeight: 800,
  centerX: 400,
  centerY: 400,
  innerRadius: 55,
  scoreMaxRadius: 265,
  categoryBandInnerRadius: 285,
  categoryBandOuterRadius: 365,
  categoryCount: 10,
  scoreMin: 1,
  scoreMax: 10,
};
```

SVG element:

```tsx
<svg
  viewBox="0 0 800 800"
  role="img"
  aria-labelledby="life-balance-wheel-title life-balance-wheel-description"
  preserveAspectRatio="xMidYMid meet"
>
```

## 11.2 Category Angle

```ts
const anglePerCategory = 360 / categories.length;
```

For ten categories:

```text
360 / 10 = 36 degrees
```

## 11.3 Recommended Rotation

Start the first category at the top of the circle.

SVG trigonometry normally treats zero degrees as pointing to the right.

Apply a negative 90-degree rotation:

```ts
const rotationOffset = -90;
```

For each category:

```ts
const startAngle = index * anglePerCategory + rotationOffset;
const endAngle = startAngle + anglePerCategory;
```

To create small visual gaps between categories:

```ts
const gapDegrees = 1.5;

const adjustedStartAngle = startAngle + gapDegrees / 2;
const adjustedEndAngle = endAngle - gapDegrees / 2;
```

---

# 12. Polar Coordinate Conversion

Use this utility:

```ts
type Point = {
  x: number;
  y: number;
};

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): Point {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}
```

---

# 13. Score Radius Calculation

A score determines how far the colored portion extends from the center.

Use:

```ts
function scoreToRadius(
  score: number,
  innerRadius: number,
  maxRadius: number,
  minScore = 1,
  maxScore = 10
): number {
  const clampedScore = Math.min(maxScore, Math.max(minScore, score));

  const normalizedScore =
    (clampedScore - minScore) / (maxScore - minScore);

  return innerRadius + normalizedScore * (maxRadius - innerRadius);
}
```

This maps:

```text
Score 1  → inner scoring boundary
Score 10 → maximum scoring radius
```

An alternative is to treat score zero as the center and scores 1–10 as ten equal radial bands.

```ts
function scoreToRadiusFromZero(
  score: number,
  innerRadius: number,
  maxRadius: number
): number {
  const clampedScore = Math.min(10, Math.max(0, score));
  return innerRadius + (clampedScore / 10) * (maxRadius - innerRadius);
}
```

The second method is recommended because it makes each point correspond to exactly 10% of the usable radius.

Unanswered categories should use `null`, not zero.

---

# 14. SVG Wedge Path

Use an annular sector so the wheel can retain a small open center.

```ts
function describeAnnularSector(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(
    centerX,
    centerY,
    outerRadius,
    startAngle
  );

  const outerEnd = polarToCartesian(
    centerX,
    centerY,
    outerRadius,
    endAngle
  );

  const innerEnd = polarToCartesian(
    centerX,
    centerY,
    innerRadius,
    endAngle
  );

  const innerStart = polarToCartesian(
    centerX,
    centerY,
    innerRadius,
    startAngle
  );

  const angleSize = endAngle - startAngle;
  const largeArcFlag = angleSize > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}
```

---

# 15. Wheel Layers

Render the SVG in this order:

1. neutral full-wheel category backgrounds;
2. circular scoring guide rings;
3. category divider lines;
4. completed score wedges;
5. previous-assessment comparison outlines;
6. selected-category highlight;
7. center label;
8. category outer band;
9. category icons and labels;
10. hover and focus interaction layer.

Example:

```tsx
<svg>
  <g id="background-wedges" />
  <g id="guide-rings" />
  <g id="divider-lines" />
  <g id="score-wedges" />
  <g id="comparison-outlines" />
  <g id="selection-state" />
  <g id="center-content" />
  <g id="category-band" />
  <g id="category-labels" />
  <g id="interaction-layer" />
</svg>
```

---

# 16. Unanswered State

Before a category is scored:

* use a pale neutral fill;
* do not treat the category as a zero;
* show the category color only in the outer label band;
* optionally use a dashed interior boundary;
* display “Not rated” in the tooltip;
* ensure the category is visibly different from a score of 1.

Suggested neutral colors:

```ts
const neutralColors = {
  backgroundWedge: "#F5F3EF",
  guideLine: "#D8D5CF",
  divider: "#FFFFFF",
  unansweredPattern: "#E9E6E0",
};
```

---

# 17. Filled Category State

When a category receives a score:

* calculate the outer score radius;
* generate the category wedge path;
* fill it with the assigned category color;
* animate from the previous radius to the new radius;
* update the score label;
* save the current response locally;
* update completion percentage.

Suggested animation duration:

```text
300–500 milliseconds
```

Suggested easing:

```css
cubic-bezier(0.22, 1, 0.36, 1)
```

Respect reduced-motion preferences.

```css
@media (prefers-reduced-motion: reduce) {
  .wheel-segment {
    transition: none;
  }
}
```

---

# 18. Alternative Display: Connected Balance Shape

The traditional Wheel of Life may also use one point per category, connected into a polygon.

Each point is positioned at the center angle of its category.

```ts
function getScorePoint(
  index: number,
  categoryCount: number,
  score: number
): Point {
  const anglePerCategory = 360 / categoryCount;
  const categoryCenterAngle =
    index * anglePerCategory + anglePerCategory / 2 - 90;

  const radius = scoreToRadiusFromZero(
    score,
    WHEEL_CONFIG.innerRadius,
    WHEEL_CONFIG.scoreMaxRadius
  );

  return polarToCartesian(
    WHEEL_CONFIG.centerX,
    WHEEL_CONFIG.centerY,
    radius,
    categoryCenterAngle
  );
}
```

Create the polygon:

```ts
const polygonPoints = categories
  .filter(category => category.score !== null)
  .map((category, index) => {
    const point = getScorePoint(
      index,
      categories.length,
      category.score
    );

    return `${point.x},${point.y}`;
  })
  .join(" ");
```

## Recommended Display Mode

Use radial wedge fills as the primary visual.

Optionally overlay a thin connected line between category score endpoints.

This gives the user both:

* individually colored category fills;
* an immediately recognizable overall balance shape.

---

# 19. Guide Rings

Render ten circular guide rings or five simplified rings.

## Full Mode

```text
1, 2, 3, 4, 5, 6, 7, 8, 9, 10
```

## Simplified Mode

```text
2, 4, 6, 8, 10
```

Ring radius calculation:

```ts
function getGuideRingRadius(score: number): number {
  return scoreToRadiusFromZero(
    score,
    WHEEL_CONFIG.innerRadius,
    WHEEL_CONFIG.scoreMaxRadius
  );
}
```

Guide rings should remain visually subtle.

Do not place all numbers on every axis.

Place score labels along one consistent radial axis or show them only on hover.

---

# 20. Category Labels and Icons

Labels should appear in the outer category band.

Each category may have:

* icon;
* short label;
* score;
* status;
* selected state.

Suggested icons:

| Category                      | Icon                           |
| ----------------------------- | ------------------------------ |
| Physical Health & Energy      | Activity, Heart Pulse, or Shoe |
| Mental & Emotional Well-being | Brain or Sparkles              |
| Relationships & Family        | Users or Heart Handshake       |
| Friends & Social Life         | User Group                     |
| Career & Purpose              | Briefcase or Compass           |
| Finances                      | Dollar Sign or Wallet          |
| Personal Growth & Learning    | Book Open or Trending Up       |
| Recreation & Fun              | Bike, Gamepad, or Smile        |
| Environment & Home            | House                          |
| Spirituality & Meaning        | Lotus, Mountain, or Sun        |

Use a consistent icon library such as Lucide.

Do not embed icon fonts into the SVG.

Use SVG icons or React components.

---

# 21. Center Content

Before completion:

```text
4 of 10
areas rated
```

After completion:

```text
Life Balance
7.1
```

The center can also show:

* average score;
* number of categories completed;
* comparison with previous assessment;
* currently selected category;
* assessment date.

Do not imply that the average is a clinical score.

---

# 22. Assessment Progress

Progress should be based on required categories completed.

```ts
const completedCount = categories.filter(
  category => category.score !== null
).length;

const completionPercentage =
  (completedCount / categories.length) * 100;
```

Display:

```text
Category 4 of 10
```

and:

```text
40% complete
```

Allow navigation backward without losing responses.

---

# 23. Data Model

## 23.1 Category Template

```ts
interface LifeBalanceCategoryTemplate {
  id: string;
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  questions: AssessmentQuestion[];
}
```

## 23.2 Question Model

```ts
type AssessmentQuestionType =
  | "score"
  | "single-select"
  | "multi-select"
  | "short-text"
  | "long-text"
  | "importance-score"
  | "confidence-score";

interface AssessmentQuestion {
  id: string;
  prompt: string;
  helperText?: string;
  type: AssessmentQuestionType;
  required: boolean;
  options?: AssessmentQuestionOption[];
  min?: number;
  max?: number;
  displayOrder: number;
  conditionalLogic?: QuestionCondition[];
}
```

## 23.3 Assessment Template

```ts
interface LifeBalanceAssessmentTemplate {
  id: string;
  organizationId?: string;
  coachId?: string;
  name: string;
  description?: string;
  version: number;
  timeframe: AssessmentTimeframe;
  categories: LifeBalanceCategoryTemplate[];
  settings: LifeBalanceAssessmentSettings;
  createdAt: string;
  updatedAt: string;
}
```

## 23.4 Assessment Settings

```ts
interface LifeBalanceAssessmentSettings {
  allowSkip: boolean;
  requireAllCategoryScores: boolean;
  showImportanceScore: boolean;
  showConfidenceScore: boolean;
  showNotes: boolean;
  showLiveWheel: boolean;
  showAverageScore: boolean;
  showAutomatedInsights: boolean;
  allowClientPrioritySelection: boolean;
  maxPrioritySelections: number;
  allowGoalCreation: boolean;
  enableHistoricalComparison: boolean;
}
```

## 23.5 Completed Assessment

```ts
type AssessmentStatus =
  | "not-started"
  | "in-progress"
  | "completed"
  | "archived";

interface LifeBalanceAssessment {
  id: string;
  templateId: string;
  templateVersion: number;
  organizationId: string;
  clientId: string;
  coachId?: string;
  status: AssessmentStatus;
  startedAt?: string;
  completedAt?: string;
  timeframeStart?: string;
  timeframeEnd?: string;
  responses: LifeBalanceCategoryResponse[];
  selectedPriorityCategoryIds: string[];
  summary?: LifeBalanceAssessmentSummary;
  createdAt: string;
  updatedAt: string;
}
```

## 23.6 Category Response

```ts
interface LifeBalanceCategoryResponse {
  categoryId: string;
  score: number | null;
  importanceScore?: number | null;
  confidenceScore?: number | null;
  selectedOptionIds?: string[];
  note?: string;
  desiredScore?: number | null;
  createdAt?: string;
  updatedAt?: string;
}
```

---

# 24. Recommended API Endpoints

```http
GET /api/life-balance/templates/:templateId
```

```http
POST /api/life-balance/assessments
```

```http
GET /api/life-balance/assessments/:assessmentId
```

```http
PATCH /api/life-balance/assessments/:assessmentId
```

```http
PUT /api/life-balance/assessments/:assessmentId/categories/:categoryId
```

```http
POST /api/life-balance/assessments/:assessmentId/complete
```

```http
GET /api/clients/:clientId/life-balance-assessments
```

```http
POST /api/life-balance/assessments/:assessmentId/goals
```

Update individual category responses rather than resubmitting the entire assessment after every answer.

---

# 25. Autosave

Autosave should occur:

* after the user selects a score;
* after a text field loses focus;
* after a selectable answer changes;
* before navigating between categories;
* before the browser closes when possible.

Use a debounced save for text responses.

```ts
const AUTOSAVE_DELAY_MS = 700;
```

Show subtle status messaging:

```text
Saving…
Saved
Unable to save
```

Do not interrupt the assessment with a modal for routine saves.

Store unsaved changes locally when network connectivity is lost.

---

# 26. Review Screen

After all required categories are rated, show a review screen.

## Heading

```text
Your Life Balance Snapshot
```

## Supporting Text

```text
This wheel reflects how satisfied you feel across the different areas of your life right now.
```

## Review Content

Display:

* completed wheel;
* each category score;
* average satisfaction score;
* highest-rated categories;
* lowest-rated categories;
* categories marked as important;
* written reflections;
* comparison with the previous assessment, when available.

## Recommended Category List

```text
Physical Health & Energy          7
Mental & Emotional Well-being    6
Relationships & Family           8
Friends & Social Life            5
Career & Purpose                 7
Finances                         4
Personal Growth & Learning       8
Recreation & Fun                 4
Environment & Home               9
Spirituality & Meaning           6
```

Clicking a category should return the user to that category for editing.

---

# 27. Summary Calculations

## 27.1 Average Score

```ts
function calculateAverageScore(
  responses: LifeBalanceCategoryResponse[]
): number | null {
  const scoredResponses = responses.filter(
    response => response.score !== null
  );

  if (!scoredResponses.length) {
    return null;
  }

  const total = scoredResponses.reduce(
    (sum, response) => sum + Number(response.score),
    0
  );

  return Number((total / scoredResponses.length).toFixed(1));
}
```

## 27.2 Highest-Rated Categories

```ts
const highestScore = Math.max(
  ...responses
    .filter(response => response.score !== null)
    .map(response => Number(response.score))
);

const highestRated = responses.filter(
  response => response.score === highestScore
);
```

## 27.3 Lowest-Rated Categories

Use the same logic with `Math.min`.

Avoid calling a category a weakness.

Preferred language:

* growth area;
* area needing attention;
* opportunity for support;
* lower-satisfaction area;
* current priority.

---

# 28. Balance Variability

An optional balance indicator can measure the difference between the highest and lowest score.

```ts
const scoreRange = highestScore - lowestScore;
```

Suggested internal interpretation:

| Range | Interpretation        |
| ----: | --------------------- |
|   0–2 | Relatively even       |
|   3–4 | Some variation        |
|   5–6 | Significant variation |
|   7–9 | Highly uneven         |

This should not be presented as a diagnosis.

Suggested client-facing language:

```text
Your scores vary considerably across life areas. This may help identify where focused changes could have the greatest effect.
```

---

# 29. Importance Score

Satisfaction and importance are different.

A client may score an area low but consider it unimportant at the moment.

Optionally ask:

```text
How important is it for you to improve this area right now?
```

Use a 1–5 scale:

| Score | Meaning                |
| ----: | ---------------------- |
|     1 | Not a current priority |
|     2 | Low priority           |
|     3 | Moderate priority      |
|     4 | High priority          |
|     5 | Very high priority     |

Priority should not be determined by the lowest satisfaction score alone.

---

# 30. Priority Recommendation Logic

A basic opportunity score can combine dissatisfaction and importance.

```ts
function calculateOpportunityScore(
  satisfactionScore: number,
  importanceScore: number
): number {
  const dissatisfaction = 11 - satisfactionScore;
  return dissatisfaction * importanceScore;
}
```

Example:

```text
Satisfaction: 4
Importance: 5

Dissatisfaction: 11 - 4 = 7
Opportunity score: 7 × 5 = 35
```

Use this only to support reflection.

Do not automatically choose the client’s priority.

---

# 31. Priority Selection

Ask:

```text
Which areas would you most like to focus on?
```

Allow one to three selections.

Recommended instruction:

```text
You do not need to choose the lowest-scoring areas. Select the areas where attention would feel most meaningful or useful.
```

Each priority card should show:

* category;
* current score;
* importance score;
* client note;
* optional desired score;
* “Select as priority” control.

---

# 32. Desired State Questions

For each selected priority, ask:

```text
If this area improved, what would be different?
```

```text
What would a score one point higher look like?
```

```text
What would you notice in your daily life?
```

```text
What might other people notice?
```

```text
What is already working that you want to preserve?
```

The “one point higher” question is particularly useful because it promotes realistic, observable change.

---

# 33. Goal Creation Flow

After priority selection:

```text
Selected area
    ↓
Desired outcome
    ↓
Current score
    ↓
Desired score
    ↓
Goal statement
    ↓
Action steps
    ↓
Obstacles
    ↓
Support needed
    ↓
Target date
    ↓
Confidence score
```

## Goal Questions

### Outcome

```text
What would you like to improve in this area?
```

### Desired Score

```text
What score would feel realistic over the next 30–90 days?
```

### Goal

```text
What specific result would show that progress is occurring?
```

### Action Steps

```text
What are the first three actions you can take?
```

### Obstacles

```text
What could make this difficult?
```

### Support

```text
What support, resources, or accountability would help?
```

### Confidence

```text
How confident are you that you can complete the first step?
```

Use a 1–10 confidence scale.

When confidence is below 7, ask:

```text
What would make this action easier or more realistic?
```

---

# 34. Goal Data Model

```ts
type GoalStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

interface LifeBalanceGoal {
  id: string;
  organizationId: string;
  clientId: string;
  coachId?: string;
  assessmentId: string;
  categoryId: string;
  title: string;
  description?: string;
  startingScore: number;
  desiredScore?: number;
  targetDate?: string;
  confidenceScore?: number;
  status: GoalStatus;
  actionSteps: LifeBalanceActionStep[];
  obstacles?: string;
  supportNeeded?: string;
  createdAt: string;
  updatedAt: string;
}
```

```ts
interface LifeBalanceActionStep {
  id: string;
  goalId: string;
  description: string;
  dueDate?: string;
  completedAt?: string;
  displayOrder: number;
}
```

---

# 35. Automated Insights

Automated insights should be descriptive, supportive, and non-diagnostic.

## Safe Insight Types

### Strengths

```text
Your highest-rated areas are Environment & Home and Relationships & Family.
```

### Growth Opportunities

```text
Finances and Recreation & Fun currently have the lowest satisfaction scores.
```

### Importance Mismatch

```text
Career & Purpose has a moderate satisfaction score but a high importance score, which may make it a meaningful coaching priority.
```

### Change Over Time

```text
Your Physical Health & Energy score increased from 5 to 7 since your previous assessment.
```

### Stability

```text
Your Relationships & Family score has remained stable across the past three assessments.
```

### Broad Pattern

```text
Your scores are strongest in connection and environment, while restoration and financial well-being may need more attention.
```

## Avoid

Do not generate statements such as:

* “You are depressed.”
* “Your relationships are unhealthy.”
* “You have financial problems.”
* “Your wheel proves that you are unbalanced.”
* “You need therapy.”
* “You should leave your job.”
* “You are failing in this category.”

---

# 36. Historical Comparison

After a client completes more than one assessment, support comparison.

## Comparison Modes

* current versus previous;
* current versus baseline;
* current versus selected date;
* trend across all assessments.

## Wheel Comparison

Render:

* current scores as solid category fills;
* prior scores as thin dashed outlines;
* improvement indicator next to each category;
* accessible text summary.

Example:

```text
Physical Health & Energy
Current: 7
Previous: 5
Change: +2
```

## Trend Chart

Use a line chart for category history.

Do not place ten overlapping lines on the default screen.

Allow the user to select one to three categories to compare.

---

# 37. Coach Dashboard Integration

The coach-facing view should include:

* latest completed wheel;
* date completed;
* changes since prior assessment;
* selected priorities;
* client reflections;
* active goals;
* overdue action steps;
* coaching notes;
* option to assign a reassessment.

## Coach Actions

* review assessment;
* add a private coaching note;
* discuss selected category;
* create a goal collaboratively;
* schedule reassessment;
* duplicate or customize a template;
* download or print summary;
* compare assessments;
* mark an insight for discussion.

Private coach notes must not be shown to the client unless explicitly shared.

---

# 38. Client Dashboard Integration

The client dashboard should show a compact Life Balance card.

```text
Life Balance

Overall satisfaction: 7.1

Strongest areas:
Environment & Home
Relationships & Family

Current priorities:
Finances
Recreation & Fun

[View Full Wheel] [Update Assessment]
```

Do not display sensitive reflections on the dashboard preview.

---

# 39. Reassessment Experience

Recommended reassessment intervals:

* 30 days;
* 60 days;
* 90 days;
* coach-selected date;
* milestone-based reassessment.

On reassessment, do not preselect the client’s previous scores.

It is acceptable to show previous scores after the new rating is entered.

Suggested flow:

```text
Rate the category based on how it feels now.
```

After score selection:

```text
Previous score: 5
Current score: 7
```

This reduces anchoring bias.

---

# 40. Draft and Completion Rules

## Draft

An assessment remains in progress when:

* at least one response exists;
* not all required category scores are complete;
* the user exits before submission.

## Completion

An assessment can be completed when:

* all required category scores are present;
* all required questions are answered;
* the user confirms the review screen.

After completion:

* lock the original assessment record;
* create an amendment or new version if edits are allowed;
* store template version;
* record completion timestamp.

Do not overwrite historical assessment results.

---

# 41. Accessibility

The wheel cannot be the only way information is conveyed.

Every visual score must also appear in text.

## Requirements

* keyboard-accessible score selection;
* visible focus indicators;
* semantic headings;
* descriptive button labels;
* sufficient color contrast;
* no color-only status indicators;
* screen-reader summaries;
* reduced-motion support;
* large touch targets;
* responsive text sizing;
* accessible validation messages.

## SVG Accessibility

```tsx
<svg
  role="img"
  aria-labelledby="wheel-title wheel-description"
>
  <title id="wheel-title">
    Life Balance Wheel
  </title>

  <desc id="wheel-description">
    A ten-category wheel showing the client's satisfaction ratings.
    Physical Health is rated 7 out of 10. Mental and Emotional
    Well-being is rated 6 out of 10.
  </desc>
</svg>
```

Each interactive wedge should have:

```tsx
<path
  role="button"
  tabIndex={0}
  aria-label={`${category.label}: ${
    category.score ?? "not rated"
  } out of 10`}
/>
```

Consider using transparent SVG buttons or an adjacent accessible list rather than relying on `path` keyboard behavior alone.

---

# 42. Responsive Design

## Desktop

* wheel and questions side by side;
* wheel width approximately 420–560 pixels;
* sticky wheel panel;
* category navigation visible.

## Tablet

* wheel above or beside questions depending on orientation;
* category labels may use short versions;
* tooltips become click popovers.

## Mobile

* compact wheel preview;
* questions below;
* full labels in cards rather than around the wheel;
* score buttons large enough for touch;
* wheel does not require precise tapping;
* sticky continue button;
* no clipped outer category labels.

At narrow widths, hide external SVG labels and show a category legend below the wheel.

---

# 43. Suggested React Component Architecture

```text
LifeBalanceAssessmentPage
├── AssessmentHeader
├── AssessmentProgress
├── AssessmentLayout
│   ├── CategoryQuestionPanel
│   │   ├── CategoryDefinition
│   │   ├── ReflectionQuestions
│   │   ├── ScoreSelector
│   │   ├── ImportanceSelector
│   │   └── CategoryNote
│   └── LifeBalanceWheelPanel
│       ├── LifeBalanceWheel
│       │   ├── GuideRings
│       │   ├── BackgroundWedges
│       │   ├── ScoreWedges
│       │   ├── ComparisonLayer
│       │   ├── CategoryBand
│       │   ├── CategoryLabels
│       │   └── WheelCenter
│       └── WheelLegend
├── AssessmentNavigation
└── AutosaveStatus
```

Review flow:

```text
LifeBalanceReviewPage
├── CompletedWheel
├── AssessmentSummary
├── CategoryScoreList
├── StrengthsPanel
├── GrowthAreasPanel
├── PrioritySelector
└── CompleteAssessmentButton
```

Goal flow:

```text
LifeBalanceGoalBuilder
├── PriorityCategoryHeader
├── DesiredStateQuestions
├── GoalStatementField
├── ActionStepBuilder
├── ObstaclesField
├── SupportField
├── TargetDateField
├── ConfidenceSelector
└── SaveGoalButton
```

---

# 44. Suggested Component Props

```ts
interface LifeBalanceWheelProps {
  categories: LifeBalanceWheelCategory[];
  selectedCategoryId?: string;
  previousScores?: Record<string, number>;
  showLabels?: boolean;
  showIcons?: boolean;
  showGuideRings?: boolean;
  showCenterScore?: boolean;
  interactive?: boolean;
  animated?: boolean;
  compact?: boolean;
  onCategorySelect?: (categoryId: string) => void;
}
```

```ts
interface LifeBalanceWheelCategory {
  id: string;
  label: string;
  shortLabel?: string;
  color: string;
  icon?: string;
  score: number | null;
}
```

Example:

```tsx
<LifeBalanceWheel
  categories={categories}
  selectedCategoryId={activeCategoryId}
  previousScores={previousScores}
  showLabels
  showIcons
  showGuideRings
  showCenterScore
  interactive
  animated
  onCategorySelect={setActiveCategoryId}
/>
```

---

# 45. Example Category Configuration

```ts
export const defaultLifeBalanceCategories = [
  {
    id: "physical-health",
    key: "physicalHealth",
    label: "Physical Health & Energy",
    shortLabel: "Health",
    color: "#BFD99B",
    icon: "heart-pulse",
    displayOrder: 1,
  },
  {
    id: "mental-emotional",
    key: "mentalEmotional",
    label: "Mental & Emotional Well-being",
    shortLabel: "Well-being",
    color: "#9FD5D4",
    icon: "brain",
    displayOrder: 2,
  },
  {
    id: "relationships-family",
    key: "relationshipsFamily",
    label: "Relationships & Family",
    shortLabel: "Relationships",
    color: "#F2CF79",
    icon: "heart-handshake",
    displayOrder: 3,
  },
  {
    id: "friends-social",
    key: "friendsSocial",
    label: "Friends & Social Life",
    shortLabel: "Social Life",
    color: "#F2C28D",
    icon: "users",
    displayOrder: 4,
  },
  {
    id: "career-purpose",
    key: "careerPurpose",
    label: "Career & Purpose",
    shortLabel: "Career",
    color: "#EFA58F",
    icon: "briefcase-business",
    displayOrder: 5,
  },
  {
    id: "finances",
    key: "finances",
    label: "Finances",
    shortLabel: "Finances",
    color: "#B9A7D0",
    icon: "wallet-cards",
    displayOrder: 6,
  },
  {
    id: "personal-growth",
    key: "personalGrowth",
    label: "Personal Growth & Learning",
    shortLabel: "Growth",
    color: "#9EB6D6",
    icon: "book-open",
    displayOrder: 7,
  },
  {
    id: "recreation-fun",
    key: "recreationFun",
    label: "Recreation & Fun",
    shortLabel: "Fun",
    color: "#9ED0D2",
    icon: "bike",
    displayOrder: 8,
  },
  {
    id: "environment-home",
    key: "environmentHome",
    label: "Environment & Home",
    shortLabel: "Home",
    color: "#D9C6A4",
    icon: "house",
    displayOrder: 9,
  },
  {
    id: "spirituality-meaning",
    key: "spiritualityMeaning",
    label: "Spirituality & Meaning",
    shortLabel: "Meaning",
    color: "#C7B5D8",
    icon: "sparkles",
    displayOrder: 10,
  },
];
```

---

# 46. Validation

## Category Score

```ts
const categoryScoreSchema = z
  .number()
  .int()
  .min(1)
  .max(10)
  .nullable();
```

## Assessment Completion

```ts
function canCompleteAssessment(
  assessment: LifeBalanceAssessment,
  template: LifeBalanceAssessmentTemplate
): boolean {
  if (!template.settings.requireAllCategoryScores) {
    return true;
  }

  return template.categories.every(category => {
    const response = assessment.responses.find(
      item => item.categoryId === category.id
    );

    return response?.score !== null && response?.score !== undefined;
  });
}
```

Validation messages should explain what is missing.

Preferred:

```text
Choose a satisfaction score before continuing.
```

Avoid:

```text
Invalid field.
```

---

# 47. Error States

## Save Failure

```text
We could not save your latest response. Your answer is stored on this device, and we will try again when the connection returns.
```

## Assessment Load Failure

```text
We could not load this assessment. Refresh the page or return to your dashboard.
```

## Template Changed

```text
This assessment template was updated after you started. You can finish the version you began or restart using the new version.
```

## No Historical Assessment

```text
Complete another assessment later to see changes over time.
```

---

# 48. Security and Privacy

The assessment may contain sensitive personal reflections.

Requirements:

* enforce organization and client authorization;
* encrypt data in transit and at rest;
* avoid placing reflection text in analytics events;
* use audit logs for access and edits;
* separate client-visible notes from coach-private notes;
* avoid exposing assessment identifiers in insecure contexts;
* sanitize all text input;
* apply data retention policies;
* support account export and deletion requirements;
* do not send sensitive answers to third-party AI services without proper authorization and disclosure.

The Life Balance Wheel is a coaching tool and should not be labeled as a diagnostic assessment.

---

# 49. Analytics Events

Track product usage without including sensitive written responses.

Suggested events:

```text
life_balance_assessment_started
life_balance_category_viewed
life_balance_category_scored
life_balance_category_updated
life_balance_assessment_saved
life_balance_assessment_completed
life_balance_priority_selected
life_balance_goal_started
life_balance_goal_created
life_balance_assessment_exported
life_balance_comparison_viewed
```

Safe properties:

```ts
{
  assessmentTemplateId,
  categoryId,
  categoryNumber,
  completionPercentage,
  deviceType,
  assessmentVersion
}
```

Do not send:

* free-text notes;
* exact sensitive reflections;
* client names;
* personally identifying details;
* coach notes.

---

# 50. Exporting

Support:

* printable summary;
* PDF export;
* PNG image export of the wheel;
* coach report;
* client-friendly summary.

The SVG should be used as the source for export.

Do not use the original concept image as the production asset.

For PNG export:

1. serialize the SVG;
2. render it to a canvas;
3. export the canvas as a PNG;
4. use sufficient pixel density;
5. include an accessible text report separately.

For PDF export, include:

* client name, when appropriate;
* assessment date;
* completed wheel;
* category score table;
* selected priorities;
* goals;
* comparison with previous assessment;
* disclaimer that it is a coaching reflection tool.

---

# 51. Printing

Create a print stylesheet.

```css
@media print {
  .assessment-navigation,
  .interactive-controls,
  .dashboard-sidebar {
    display: none;
  }

  .life-balance-report {
    width: 100%;
    box-shadow: none;
  }

  .life-balance-wheel {
    break-inside: avoid;
  }
}
```

Ensure the wheel remains understandable when printed in grayscale.

Include category names and numeric scores in a table.

---

# 52. Suggested Database Tables

```text
life_balance_templates
life_balance_template_categories
life_balance_template_questions
life_balance_assessments
life_balance_category_responses
life_balance_priorities
life_balance_goals
life_balance_action_steps
life_balance_coach_notes
```

Important fields:

```text
template_version
assessment_status
started_at
completed_at
category_score
importance_score
confidence_score
desired_score
response_note
display_order
created_at
updated_at
```

Historical assessments should remain immutable after finalization except through a documented amendment process.

---

# 53. Testing Requirements

## Geometry Tests

Confirm:

* ten categories create ten equal 36-degree sectors;
* first category begins at the top;
* score 1 maps correctly;
* score 5 maps to half the usable radius;
* score 10 reaches the maximum scoring radius;
* no wedge overlaps adjacent categories;
* category gaps remain consistent;
* paths remain valid at all supported scores.

## Interaction Tests

Confirm:

* clicking a score updates the wheel;
* arrow keys change scores;
* previous answers persist;
* back navigation retains values;
* autosave functions;
* offline responses recover;
* unanswered categories remain distinct from score 1;
* selected category is announced accessibly.

## Responsive Tests

Test:

* 320-pixel mobile width;
* standard mobile;
* tablet portrait;
* tablet landscape;
* laptop;
* wide desktop;
* browser zoom at 200%.

## Accessibility Tests

Test:

* keyboard-only completion;
* screen-reader category announcements;
* focus visibility;
* reduced motion;
* color contrast;
* score interpretation without color;
* form errors associated with controls.

## Persistence Tests

Test:

* draft creation;
* autosave;
* resume assessment;
* completion;
* immutable completed record;
* historical comparison;
* reassessment creation;
* template-version retention.

---

# 54. Acceptance Criteria

The feature is ready when:

1. The wheel is rendered as SVG rather than a static image.
2. Ten categories appear in the correct order.
3. Each category uses its assigned color.
4. An unanswered category is visibly different from a score of 1.
5. Each score from 1 to 10 maps precisely to the correct radius.
6. The wheel updates immediately when a score changes.
7. Responses autosave.
8. The user can move backward and forward without losing data.
9. The assessment can be resumed after leaving.
10. The completed wheel includes a text-based score summary.
11. The client can select coaching priorities.
12. The client can create at least one goal.
13. A coach can review the completed assessment.
14. Historical assessments are preserved.
15. The interface is usable on mobile.
16. The assessment can be completed using only a keyboard.
17. The assessment does not present diagnostic conclusions.
18. The wheel can be exported or printed clearly.
19. Previous scores can be compared without replacing current scores.
20. Organization-specific templates can be supported later without rebuilding the wheel.

---

# 55. Recommended Initial Release Scope

## Version 1

Build:

* ten fixed categories;
* category definitions;
* one satisfaction score per category;
* optional client note;
* progressive SVG wheel;
* autosave;
* review screen;
* priority selection;
* one goal per selected priority;
* coach review;
* assessment history;
* PDF-ready summary.

Do not make Version 1 overly complex.

## Version 2

Add:

* importance scores;
* confidence scores;
* custom templates;
* customizable categories;
* category question editor;
* automated insights;
* comparison overlays;
* reminders;
* trend charts;
* organization branding;
* coach-assigned reassessments.

## Version 3

Consider:

* category correlations;
* intelligent goal suggestions;
* check-in questions between assessments;
* progress forecasting;
* coach template marketplace;
* configurable assessment libraries;
* longitudinal outcome reporting.

---

# 56. Final Cursor Implementation Instruction

Use the following instruction as the primary Cursor prompt:

```text
Build an end-to-end interactive Life Balance Wheel assessment using React, TypeScript, and a responsive SVG.

Do not use the reference image as a production asset. Generate the wheel mathematically.

The assessment must contain ten configurable categories. Each category occupies an equal 36-degree sector. The first category begins at the top of the circle.

Each category has:
- an id;
- label;
- short label;
- description;
- color;
- icon;
- score from 1 to 10 or null;
- optional reflection answers;
- optional note;
- optional importance score;
- optional desired score.

Use an SVG viewBox of 0 0 800 800.

Use:
- centerX: 400
- centerY: 400
- innerRadius: 55
- maximum score radius: 265
- category label band: 285 to 365
- rotation offset: -90 degrees
- category gap: approximately 1.5 degrees

Convert polar coordinates to Cartesian coordinates.

Generate each score fill as an annular SVG sector. The outer radius of the sector must be determined by the category score.

Use this radius formula:

radius =
innerRadius +
(score / 10) * (maximumRadius - innerRadius)

Use null for unanswered categories. Do not treat unanswered as zero.

Render these layers:
1. neutral background wedges;
2. score guide rings;
3. category dividers;
4. colored score wedges;
5. optional historical comparison outlines;
6. selected category state;
7. center summary;
8. outer category bands;
9. category icons and labels;
10. accessible interaction targets.

Use these category colors:
- Physical Health & Energy: #BFD99B
- Mental & Emotional Well-being: #9FD5D4
- Relationships & Family: #F2CF79
- Friends & Social Life: #F2C28D
- Career & Purpose: #EFA58F
- Finances: #B9A7D0
- Personal Growth & Learning: #9EB6D6
- Recreation & Fun: #9ED0D2
- Environment & Home: #D9C6A4
- Spirituality & Meaning: #C7B5D8

Create the complete user flow:
1. introduction;
2. instructions;
3. category-by-category assessment;
4. live wheel updates;
5. autosave;
6. review;
7. priority selection;
8. desired-state questions;
9. goal creation;
10. completed assessment summary;
11. historical comparison.

Make the component responsive.

On desktop, show the questions beside a sticky wheel.

On mobile, show a compact wheel above the questions and use large score controls.

Include accessible text equivalents for every score. Do not rely only on color or the wheel graphic.

Support keyboard controls, screen readers, reduced motion, loading states, save states, validation, and offline-safe draft storage.

Store the assessment template version with every completed assessment.

Do not overwrite completed historical assessments.

Keep automated insights descriptive and non-diagnostic.

Organize the code into reusable components, geometry utilities, data hooks, schemas, and API functions.

Add unit tests for score-to-radius calculations, SVG paths, category angles, completion rules, and summary calculations.
```

---

# 57. Product Principle

The wheel should not merely display scores.

It should help the client move through four stages:

```text
Awareness
    ↓
Reflection
    ↓
Prioritization
    ↓
Action
```

The wheel is the visual entry point.

The actual value of the feature comes from connecting the client’s answers to meaningful coaching conversations, realistic goals, and measurable progress over time.
