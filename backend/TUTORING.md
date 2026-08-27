Tutoring Learning System Blueprint

A Colorado-Aligned, AI-Assisted One-on-One Tutoring Platform

Purpose: Define a practical product and data model for initiating, planning, delivering, documenting, measuring, and reporting one-on-one tutoring services in Colorado.

Primary design principle: The system should not be organized around session notes. It should be organized around a continuously updated student learning record, with the Learning Plan at the center. Evaluations create the baseline; the Learning Plan turns the baseline into goals; each session executes part of the plan; each note produces evidence; progress monitoring updates the plan; reports explain progress to families and partners.

Core loop:

Assess -> Plan -> Teach -> Note -> Measure -> Adapt -> Report -> Reassess

1. Executive Summary

A strong tutoring system should make the tutor feel as if the platform already knows what needs to happen next.

When a tutor opens a student's profile, the system should know:

which subject or subjects the student is receiving tutoring in;

the student's school grade and current instructional level;

the Colorado Academic Standards relevant to the student's active goals;

what the student demonstrated on intake or baseline evaluation;

which strengths and challenges have been observed;

what the current Learning Plan says should be taught;

what happened in previous sessions;

what was planned for today's session;

which skills have enough evidence to be considered mastered;

which skills remain developing;

when the student should be reassessed;

how many sessions have been purchased, completed, missed, or remain in a package;

what should be communicated to the parent or guardian.

The tutor should not have to reconstruct this history manually.

The product should therefore operate as a Learning Operating System rather than a digital notebook.

For each student, create one overall academic profile containing one or more Subject Learning Tracks. A student could have Reading, Writing, Mathematics, Algebra, Study Skills, Science, or another supported academic subject at the same time. Each subject track has its own baseline, goals, standards alignment, Learning Plan, sessions, progress measures, and outcome history while still appearing in one unified student profile.

AI should reduce workload, but it should not become the ultimate decision-maker. The recommended pattern is:

Human collects or verifies evidence.

System converts evidence into structured data.

AI proposes an interpretation or next step.

Tutor approves or edits it.

Approved information becomes part of the official student record.

This is particularly important for minors, educational records, assessment results, and any automated determination that could be interpreted as diagnosing a disability or determining eligibility for special education services.

2. Source-of-Truth Framework: Colorado First, Federal Evidence Second

Because the program operates in Colorado, the product should use Colorado Department of Education (CDE) resources as its primary academic standards framework.

The U.S. Department of Education should not be treated as a national curriculum database. Instead, federal resources—especially the Institute of Education Sciences (IES) and What Works Clearinghouse (WWC)—are useful for evidence-informed instructional practices, intervention approaches, technology guidance, privacy, and responsible AI.

A practical hierarchy is:

Level 1 — What students should know

Colorado Academic Standards (CAS)

Use CAS for:

grade-level expectations;

standards and evidence outcomes;

subject organization;

alignment of tutoring goals;

alignment of practice items and lesson objectives;

standards-based progress reporting.

The standards engine should be versioned. Do not hard-code a single permanent standards set. Colorado approved revisions to high-school mathematics standards on May 14, 2026, while Reading, Writing and Communicating standards were re-adopted without revision in December 2024. The application should therefore store the standards version attached to each goal, item, and plan.

Level 2 — How tutoring should be delivered

Use CDE's High-Impact / High-Dosage Tutoring resources and IES/WWC practice guides to inform:

repeated tutor-student interaction;

data-driven instruction;

diagnostic selection of tutoring content;

frequent progress assessment;

systematic instruction;

reading intervention practices;

mathematical language;

representations and number lines;

word-problem instruction;

fluency-building activities;

comprehension practices.

CDE describes high-impact tutoring as targeted, repeated, data-driven support and its strategy guidance emphasizes matching tutoring content to diagnostic data and assessing learning frequently. The platform should operationalize those ideas even when a private-pay student's schedule does not meet the formal dosage characteristics of a state high-impact tutoring program.

Level 3 — Assessment context

For Colorado K-3 reading, the READ Act is especially important. CDE maintains an approved list of interim and diagnostic assessments. If the company wants to make claims such as "READ Act approved," "diagnostic," or "state-approved screening," it should integrate or license an approved instrument rather than treating a homegrown AI quiz as equivalent.

The system may still contain its own informal tutoring evaluations, curriculum-based skill checks, and progress probes. Those should be clearly labeled as internal instructional measures rather than state assessments or formal diagnostic instruments.

Level 4 — AI and data governance

Use U.S. Department of Education guidance on AI, education technology, FERPA, and student privacy to establish guardrails. The Department's 2024 developer guidance emphasizes safety, security, trust, evidence, civil rights, and privacy. Its education-leader toolkit likewise emphasizes safe, ethical, equitable AI integration and transparency.

For Colorado school partnerships, also plan for Colorado's Student Data Transparency and Security requirements applicable to school service contract providers.

3. The Student Profile Should Become the Academic Home Base

The student profile should have a dedicated Learning area.

Recommended tabs:

Overview

Subjects

Learning Plan

Evaluations & Testing

Sessions

Assignments & Resources

Progress

Reports

School / Academic Documents

Billing & Package

The student should have one profile even if receiving multiple tutoring services.

3.1 Overview

The overview answers five questions immediately:

What is the student working on?

Why are they working on it?

Are they improving?

What happens next?

Is anything overdue or needing attention?

Suggested cards:

Academic Snapshot

School grade: Grade 5

School: Optional

Primary tutoring focus: Mathematics

Additional subject: Reading

Current math instructional focus: Fraction operations

Current reading focus: Main idea and evidence

Active tutor(s)

Sessions completed

Sessions remaining

Next session

Current Learning Goals

Show the top one or two active goals per subject.

Example:

Mathematics

Add and subtract fractions with unlike denominators with at least 80% independent accuracy across two consecutive probes.

Reading

Identify a text's main idea and support it with two relevant details in 4 of 5 opportunities.

Progress Status

Use simple categories:

On Track

Progressing

Needs Review

Goal Met

Baseline Needed

Do not use a single AI-created "student score" as the main outcome. Different skills progress at different rates.

Upcoming Actions

Examples:

Math progress probe due in 2 sessions

Reading plan review due September 15

Parent progress report available after next session

Package has 2 sessions remaining

4. Subject Learning Tracks

Every subject should function as its own longitudinal learning record.

A student might have:

Mathematics

Reading

Writing

Each subject track should store:

Identity

Subject name

School grade

Course, if relevant (e.g., Algebra I)

Instructional level if different from school grade

Active / paused / completed status

Primary tutor

Additional tutor(s)

Start date

Baseline

Evaluation date

Evaluation type

Overall result

Domain results

Skill-level results

Confidence / quality of evidence

Uploaded school assessment results, if provided

Tutor observations

Current Learning Plan

Priority needs

Active goals

Supporting objectives

Standards alignment

Progress measures

Review date

Recommended instructional strategies

Initial session sequence

Ongoing Evidence

Session evidence

Practice-set accuracy

oral reading metrics where applicable

written response rubric scores

tutor observations

progress-probe scores

formal outside assessment results

Outcome History

Goals met

Goals discontinued

Goals revised

skill mastery history

plan-review history

subject discharge / completion summary

5. The Learning Plan Is the Center of the System

The Learning Plan should be a structured object, not merely a text document.

It should contain both human-readable narrative and machine-readable fields.

5.1 Learning Plan Header

Student

Subject

Tutor

Plan start date

Next review date

Plan status

School grade

Instructional level

Source of baseline evidence

Standards version

5.2 Student Strengths

Examples:

Strong verbal reasoning

Persists with difficult tasks

Reads accurately when text is familiar

Strong number sense

Responds well to visual models

Asks clarifying questions

Learns quickly from worked examples

These can be selected from structured tags and supplemented with free text.

5.3 Priority Learning Needs

Each need should be specific enough to teach.

Poor:

"Needs help in math."

Better:

"Has difficulty identifying a common denominator before adding fractions."

"Accurately decodes grade-level words but loses meaning across longer passages."

"Can identify a main idea orally but does not reliably support it with textual evidence."

5.4 Goals

Each goal should include:

goal title;

baseline;

target skill;

success criterion;

measurement method;

target review date;

linked Colorado standard(s);

status;

progress history.

Example:

Goal: Fraction Addition and Subtraction

Baseline: Student solved 3 of 10 unlike-denominator fraction problems independently.

Target: Student will solve addition and subtraction problems involving unlike denominators with at least 80% independent accuracy on two consecutive skill probes.

Measure: 10-item tutor-administered standards-aligned probe.

Review: After 8 sessions or 6 weeks, whichever occurs first.

5.5 Objectives / Micro-Skills

A goal should break into teachable steps.

Example:

Identify equivalent fractions.

Determine least/common denominators.

Rename fractions using equivalent forms.

Add fractions with unlike denominators.

Subtract fractions with unlike denominators.

Simplify answers.

Apply the procedure in word problems.

Each micro-skill can have a status:

Not Assessed

Emerging

Developing

Nearly Secure

Secure

Generalized

"Generalized" means the student demonstrated the skill in a different task or context, not simply repeated the same worksheet.

5.6 Instructional Strategies

AI may recommend strategies based on the subject and the documented error pattern, but recommendations should come from an approved internal strategy library derived from credible sources rather than unrestricted model improvisation.

For example, elementary mathematics recommendations may include systematic instruction, mathematical language, representations, number lines, word problems, and fluency activities consistent with IES/WWC guidance.

5.7 Progress-Monitoring Plan

Every Learning Plan should specify:

what will be measured;

how often;

what constitutes meaningful improvement;

when the plan should be reviewed.

The system could default to a quick skill check every 2-4 sessions and a broader plan review after approximately 6-8 weeks or a defined number of sessions, while allowing the program to configure its own cadence.

6. Evaluation-to-Learning-Plan Workflow

This should be one of the application's most valuable workflows.

Step 1 — Select the subject

Example:

Create Evaluation

Student: Ava Thompson

Subject:

Mathematics

Grade:

School grade: 5

Reason for tutoring:

Parent concern

School concern

General enrichment

Course support

Test preparation

Skill recovery

Other

Step 2 — Gather existing information

The system asks whether the family has:

report card;

teacher notes;

CMAS score report;

MAP / i-Ready / Star / DIBELS / Acadience or other assessment report;

IEP or 504 information relevant to tutoring accommodations;

current assignments;

writing samples;

other school documentation.

The platform should allow upload but should not require it.

AI can extract structured academic information from documents after appropriate privacy controls and user permission.

Examples of extracted fields:

grade;

subject;

percentile or scale score;

subdomain scores;

teacher comments;

listed accommodations;

identified strengths;

identified concerns.

A tutor should confirm extracted information before it becomes official.

Step 3 — Choose an evaluation path

Three paths should be available.

A. Quick Placement Check

Purpose: Get enough information to start tutoring safely and intelligently.

Length: Approximately 10-15 minutes.

Useful for:

homework/course support;

older students with clear needs;

families who already have reliable school assessment data.

B. Full Tutoring Baseline

Purpose: Create a more complete skill profile.

Length: Approximately 20-40 minutes, potentially split across sessions for younger students.

Useful for:

unclear concerns;

skill gaps spanning multiple domains;

long-term tutoring packages;

students without recent assessment information.

C. External / Approved Assessment Import

Purpose: Use a licensed or school-provided assessment result rather than recreate it.

Useful for:

K-3 reading when a family provides READ Act assessment results;

students with recent school diagnostic information;

programs that license a CDE-approved assessment platform.

Step 4 — Administer the evaluation

The app presents one item at a time and records both correctness and useful process information.

Depending on the item, it can capture:

selected answer;

numeric answer;

typed response;

written work upload;

tutor-scored rubric;

number of prompts;

response time;

confidence;

oral response;

reading audio, only where consent and policy allow;

observed strategy;

observed error type.

Step 5 — Convert results into a skill map

Instead of only returning "72%," the evaluation should produce a map such as:

Domain

Skill

Result

Evidence

Priority

Fractions

Equivalent fractions

80%

Moderate

Maintain

Fractions

Common denominators

40%

Strong

High

Fractions

Add unlike denominators

30%

Strong

High

Fractions

Word problems

50%

Moderate

Medium

Operations

Whole-number multiplication

90%

Strong

Low

The system can calculate item accuracy automatically, while AI categorizes error patterns and drafts an explanation.

Step 6 — AI generates a proposed Learning Plan

The AI receives only approved structured information:

student's grade;

subject;

evaluation evidence;

confirmed external results;

family/tutor priorities;

active accommodations;

relevant Colorado Academic Standards;

approved instructional strategy library;

desired tutoring frequency and package length.

It produces a draft, not a final plan.

Draft output should include:

summary of baseline;

student strengths;

1-3 priority needs;

1-3 measurable goals;

micro-skills/objectives;

standards alignment;

recommended progress measures;

recommended instructional strategies;

proposed first 4-6 sessions;

review point.

Step 7 — Tutor review

The tutor sees:

AI Draft Learning Plan

Accept

Edit

Remove

Add Goal

Change Priority

Change Target

Change Review Date

The plan should not become active until the tutor clicks Approve Learning Plan.

Step 8 — Parent-facing summary

The system generates a simpler version:

Ava demonstrated strong foundational number sense and understands equivalent fractions. The greatest current need is working accurately and independently with unlike denominators. Over the next several sessions, tutoring will focus on building a reliable process for finding common denominators, adding and subtracting fractions, and applying those skills to word problems. Progress will be checked regularly and the plan will be adjusted as she improves.

This summary should be editable before sharing.

7. In-App Evaluation and Testing Engine

The application can implement meaningful evaluation directly, but it should distinguish among:

informal skill checks;

curriculum-based progress measures;

program-created baseline evaluations;

licensed standardized or state-approved assessments.

The first three can be built in-house with appropriate expertise and validation. The fourth generally requires licensing/integration and should not be imitated by AI.

7.1 Assessment Item Architecture

Every internal item should store:

subject;

grade or instructional band;

domain;

skill;

Colorado standard ID/version;

item type;

difficulty level;

expected answer;

scoring method;

misconception tags;

accommodations supported;

item source;

whether AI-generated;

human-review status;

revision history.

7.2 AI-Generated Items

AI can be useful for generating:

reading passages;

comprehension questions;

vocabulary tasks;

math computation problems;

word problems;

short-writing prompts;

sentence-editing tasks;

practice sets;

alternate versions of a mastered or developing skill.

However, every generated assessment item should be traceable to:

a specific standard;

a specific skill;

an intended difficulty;

an answer key or rubric;

the model/version that generated it;

a human approval status if it enters the reusable item bank.

For high-stakes or placement decisions, prefer vetted item banks over one-time live generation.

7.3 Scoring Model

Use deterministic scoring wherever possible.

Automatically scored

multiple choice;

matching;

numeric responses;

equation responses;

spelling / word recognition when unambiguous;

structured short answers with validated answer sets.

AI-assisted scoring with human confirmation

constructed reading responses;

writing samples;

explanations of mathematical reasoning;

oral summaries;

open-ended problem solving.

The tutor should see:

proposed score;

rubric evidence;

AI rationale;

ability to override;

final tutor-approved score.

7.4 Adaptive Evaluation

Eventually, the engine can be adaptive without pretending to be psychometrically equivalent to a standardized computerized adaptive test.

A useful internal adaptation method:

Start at the student's school grade.

Give 3-5 representative tasks in a domain.

If performance is consistently strong, increase complexity.

If performance is consistently weak, step backward to prerequisite skills.

Stop when the system has enough evidence to identify the likely instructional starting point.

This is a routing assessment, not an IQ test, disability evaluation, or state accountability assessment.

8. Recommended Evaluation by Age / Grade Band

Preschool / Pre-K

Keep testing extremely brief and relational.

Appropriate areas:

oral language;

rhyme awareness;

beginning sound awareness;

letter-name familiarity when developmentally appropriate;

counting;

quantity comparison;

simple patterns;

shape recognition;

ability to follow simple academic directions.

Recommended format:

tutor-administered;

visual and game-like;

5-10 minute segments;

minimal independent screen use.

Avoid creating a broad numerical "readiness score" that overstates precision.

Kindergarten through Grade 1

Reading

Potential internal skill checks:

letter identification;

letter-sound association;

phonological awareness;

phonemic awareness;

blending;

segmenting;

beginning decoding;

high-frequency word recognition;

oral language and listening comprehension.

Mathematics

counting sequence;

one-to-one correspondence;

numeral identification;

quantity comparison;

composing/decomposing small numbers;

addition/subtraction concepts;

simple story problems;

mathematical language.

Use short blocks and tutor observation.

Grades 2-3

Reading

phonics / decoding as needed;

word reading;

oral reading accuracy;

oral reading fluency;

vocabulary;

literal comprehension;

inferential comprehension;

written response at an age-appropriate level.

For Colorado public-school READ Act purposes, approved interim and diagnostic tools have specific roles. An internal tutoring evaluation should be labeled as instructional unless the program actually licenses and administers a state-approved tool under its applicable conditions.

Mathematics

place value;

addition/subtraction;

multiplication/division foundations;

fact fluency;

mathematical vocabulary;

representations;

word-problem reasoning.

Grades 4-5

Reading / ELA

multisyllabic decoding if indicated;

fluency;

vocabulary;

main idea;

details/evidence;

inference;

text structure;

summarization;

constructed response;

short writing sample.

Mathematics

multi-digit operations;

multiplication/division fluency;

fractions;

decimals;

place value;

measurement;

geometry;

word problems;

explanation of reasoning.

Grades 6-8

Reading / Writing

comprehension of informational and literary text;

vocabulary in context;

evidence selection;

inference;

summarization;

argument / explanatory writing;

sentence structure and conventions where relevant.

Mathematics

rational numbers;

ratios and proportional reasoning;

expressions/equations;

geometry;

statistics;

pre-algebra / algebra readiness;

multistep problem solving.

At this level, the system should identify prerequisite gaps rather than simply assigning lower-grade content wholesale.

Grades 9-12

Evaluation should become course-specific.

Potential tracks:

Algebra / Foundational Mathematics

Geometry

Statistics

Advanced Algebra

Reading / Writing

Academic writing

ACT/SAT preparation, where offered

Study / executive academic skills

Colorado's revised high-school mathematics standards approved in May 2026 include foundational mathematics and advanced pathways with increased emphasis on statistics, modeling, and technology. The standards source used by the app should therefore be version-aware.

For SAT/PSAT preparation, use official practice resources and licensed/allowed content rather than representing AI-generated questions as official College Board items.

9. Reading Evaluation Inside the App

Reading is an area where the platform can become unusually useful.

9.1 Silent Reading

The system displays a passage and asks:

main idea;

supporting detail;

inference;

vocabulary in context;

author's purpose;

text structure;

constructed response.

AI can generate alternate passages aligned to a selected skill, but reusable evaluation passages should be reviewed by a human and stored in the item bank.

9.2 Oral Reading

Possible workflow:

Display a short passage.

Tutor starts the oral-reading probe.

Student reads aloud.

System timer begins.

Speech-to-text creates a proposed transcript.

System highlights suspected substitutions, omissions, insertions, and hesitations.

Tutor confirms/corrects the detected miscues.

App calculates instructional metrics.

Potential metrics:

words attempted;

words correct;

accuracy percentage;

approximate words correct per minute;

types of miscues;

comprehension following oral reading.

Important: Automated speech recognition should not be treated as authoritative. Accents, dialect, speech-language differences, background noise, microphones, and disability-related factors can affect recognition. Tutor confirmation is necessary.

Audio retention should be configurable and off by default unless there is a defined educational reason, consent, and retention policy.

9.3 Writing Sample

Prompt example:

Read the short passage and explain the author's main idea. Use at least two details from the text.

Scoring dimensions:

addresses prompt;

organization;

evidence;

reasoning;

sentence clarity;

conventions.

AI proposes rubric scores and highlights evidence. Tutor confirms.

10. Mathematics Evaluation Inside the App

Math testing should not be only multiple-choice.

Use several response types:

numeric response;

equation entry;

multiple choice;

drag/order where the UI supports it;

choose a representation;

short explanation;

worked problem with tutor-observed strategy;

word problem.

Error Pattern Capture

The best tutoring value comes from identifying why the student missed the problem.

Possible error tags:

operation selection;

place value;

fact retrieval;

sign error;

denominator misconception;

procedural sequence;

conceptual misunderstanding;

calculation slip;

reading the problem;

vocabulary;

incomplete response;

rushed response;

needed prompting.

The AI can suggest the likely error tag, but the tutor should confirm it.

Example Result

Instead of:

Fractions: 50%

Show:

Fractions — Developing

Equivalent fractions: Secure

Finding common denominators: Emerging

Adding unlike denominators: Emerging

Subtracting unlike denominators: Developing

Word-problem transfer: Developing

Likely instructional starting point: common denominators using visual fraction models before returning to abstract procedures.

11. Session Preparation: The Tutor Should Start With a Plan Already Built

When a tutor opens an upcoming session, the app should display a Session Brief.

Example:

Today's Session

Student: Ava Thompson
Subject: Mathematics
Length: 60 minutes

Active Learning Goal

Master addition and subtraction of fractions with unlike denominators with 80% independent accuracy.

Last Session

Partially met objective

Strong effort

Asked questions

Needed prompting

Concept confusion with subtraction

Planned for Today

Automatically proposed from the Learning Plan:

5-minute retrieval/warm-up

Review common denominators

Model two subtraction examples

Complete five guided problems

Complete three independent problems

Exit check

Buttons:

Use Plan

Edit Plan

AI: Adjust Based on Last Session

Materials

visual fraction model

generated practice set

assigned worksheet

Quick Alert

Progress probe due today.

The tutor should be able to prepare in under one minute.

12. The Tutoring Session Note

The note should be short because most of its information should already exist elsewhere.

12.1 Session Header

Auto-populate:

student;

subject;

date;

tutor;

start/end time;

duration;

session type;

attendance status;

linked Learning Plan.

12.2 Learning Plan Goal

Read-only summary with link:

Learning Plan Goal: Add and subtract fractions with unlike denominators with 80% independent accuracy.

12.3 Planned for This Session

Automatically pull the planned objectives from the Learning Plan / Session Brief.

Example:

Review unlike denominators

Solve five guided problems

Explain steps aloud

Complete independent word problem

The last item could remain unchecked because time ran out.

12.4 How It Went

One click:

Exceeded Goal

Met Goal

Partially Met

Not Yet

Not Addressed

This selection refers to today's objective, not the student's entire Learning Plan.

12.5 Strengths Observed

Selectable chips:

Strong Effort

Stayed Engaged

Asked Questions

Worked Independently

Applied Strategy

Improved Accuracy

Explained Thinking

Self-Corrected

Persisted Through Difficulty

Strong Recall

Strong Comprehension

Allow custom tags.

12.6 Challenges Observed

Selectable chips:

Needed Prompting

Concept Confusion

Attention / Focus

Frustration

Slow Processing

Assignment Incomplete

Difficulty Generalizing

Vocabulary / Language

Calculation Accuracy

Reading Accuracy

Reading Comprehension

Written Expression

Organization

Test Anxiety / Performance Hesitation

Avoid labeling a child with a diagnosis from a session note.

12.7 Quick Evidence

This is more useful than a long narrative.

Examples:

7/10 independent problems correct

9/10 with one prompt

oral reading accuracy: 96%

84 approximate words correct/minute after tutor verification

constructed response rubric: 3/4

The exact measure depends on the goal.

12.8 Quick Summary

This can be mostly AI-generated.

Tutor clicks Generate Summary after completing the structured fields.

Example:

Ava worked on adding and subtracting fractions with unlike denominators. She partially met today's objective and demonstrated strong effort, engagement, and willingness to ask questions. She can identify common denominators with increasing independence but still needs prompting during subtraction. Next session will continue the current goal with additional guided-to-independent practice.

The tutor can edit and save.

Target documentation time: 30-90 seconds once selections are made.

12.9 Next Step

Dropdown:

Continue Current Goal

Repeat / Reinforce Skill

Advance to Next Objective

Administer Progress Probe

Revise Learning Plan

Tutor Recommendation

If "Tutor Recommendation" is selected, allow brief text.

12.10 Resources / Homework

Optional:

assign a generated practice set;

select a resource from library;

attach worksheet;

no homework.

12.11 Save Behavior

The primary button should be:

Save Note & Update Progress

When clicked:

save official note;

create skill evidence;

update the relevant objective trend;

update package/session ledger;

determine whether a progress check is due;

draft a parent-facing update if enabled;

suggest the next session plan.

The AI should never silently change the Learning Plan. It may display:

Suggested Plan Update: Ava has met the common-denominator objective across three sessions. Consider moving this objective to Secure and advancing to subtraction with unlike denominators.

Buttons:

Approve

Review Evidence

Not Yet

13. Skill Evidence: The Hidden Engine Underneath Everything

Every meaningful student action should create a small Skill Evidence record.

Fields:

student;

subject;

skill;

standard;

date;

source;

score/value;

independence level;

prompt level;

evidence quality;

tutor;

related session/evaluation;

note.

Sources could include:

baseline evaluation;

session activity;

progress probe;

homework;

uploaded school assessment;

writing sample;

oral reading probe;

tutor observation.

This allows the system to answer:

Why does the app think this skill is improving?

The user should be able to click the trend and see the evidence.

14. Mastery Logic

Do not allow one correct answer to equal mastery.

A simple initial mastery model can combine:

accuracy;

independence;

recency;

repeated demonstration;

variety of tasks;

tutor confirmation.

Example rules:

Emerging

limited evidence;

less than approximately 50% success;

substantial prompting.

Developing

partial success;

skill appears with support;

inconsistent independent performance.

Nearly Secure

generally accurate;

occasional prompting or errors;

not yet stable across repeated opportunities.

Secure

target criterion met on at least two meaningful independent measures.

Generalized

skill demonstrated in a new context or a more complex integrated task.

These are program operational definitions, not state proficiency classifications.

15. Automated Session Planning

Once the Learning Plan is active, AI can generate a session plan from:

active goal;

most recent evidence;

previous challenge tags;

available time;

upcoming assessment date;

age/grade;

tutor preferences;

approved strategy library.

Example AI output for a 60-minute session:

Warm-Up — 5 minutes

3 equivalent-fraction retrieval items.

Explicit Review — 10 minutes

Use a fraction bar model to review why denominators must represent equal-sized parts.

Guided Practice — 15 minutes

Four unlike-denominator addition problems with decreasing prompts.

Target Skill — 15 minutes

Four subtraction problems, including one requiring regrouping if appropriate.

Application — 10 minutes

Two word problems requiring the student to determine the operation.

Exit Check — 5 minutes

Three independent problems scored for accuracy and prompting.

The tutor can regenerate at easier/harder levels without changing the plan itself.

16. AI Tutor Copilot

Create an AI tool available inside the student profile, but restrict it to that student's approved academic context.

Suggested actions:

Before Session

Prepare Today's Session

Generate Practice Problems

Create Reading Passage

Explain Last Session's Error Pattern

Suggest Materials

During Session

Generate Another Example

Make This Easier

Make This Harder

Show a Different Representation

Create a Word Problem

Generate an Exit Ticket

After Session

Draft Session Summary

Suggest Strengths / Challenges from entered evidence

Suggest Next Step

Draft Parent Update

Recommend Whether to Progress-Monitor

At Plan Review

Summarize Progress

Compare Baseline to Current Performance

Suggest Goal Update

Identify Skills With Insufficient Evidence

Draft Next Learning Plan

17. AI Knowledge Architecture

The AI should not rely only on a generic model prompt such as "be a Colorado tutor."

Build a controlled education knowledge layer.

17.1 Standards Repository

Store:

source agency;

content area;

grade;

standard ID;

standard text;

evidence outcome / expectation;

effective/adoption version;

source URL;

source retrieval date;

active / superseded status.

CDE publishes standards in several machine-friendly formats, including spreadsheets and markdown/plain text for some content areas. These are good candidates for a versioned ingestion pipeline.

17.2 Instructional Strategy Repository

Curate instructional recommendations from:

CDE instructional support;

CDE high-impact/high-dosage tutoring guidance;

IES/WWC practice guides;

program-approved curricula;

internally approved instructional practices.

Each strategy should have:

subject/domain;

age/grade range;

when to use;

contraindications / cautions where relevant;

source;

evidence level if available;

example implementation.

17.3 Assessment Repository

Separate:

internal item bank;

licensed item banks;

state practice/released content;

tutor-created content;

AI-generated content.

Never blur their provenance.

17.4 Retrieval-Augmented Generation

When AI generates a plan or session, retrieve only relevant authoritative content.

Example request:

Generate a fifth-grade fraction intervention session for a student who can identify equivalent fractions but is developing common-denominator skills.

Retrieved context might include:

active Colorado math standard(s);

relevant prerequisite standard(s);

approved internal fraction strategy;

IES guidance on representations and mathematical language;

student's last three evidence records.

The output should show a small source indicator such as:

Aligned to: Colorado Academic Standards · Math · Grade 5

For internal users, allow View Alignment to see the exact standards used.

18. AI Guardrails

AI should be prohibited from independently:

diagnosing dyslexia, ADHD, a learning disability, intellectual disability, or another condition;

determining special-education eligibility;

changing an IEP or 504 plan;

representing an internal tutoring quiz as CMAS, READ Act, SAT, PSAT, or another official assessment;

changing a student's official Learning Plan without human approval;

sending a high-stakes parent/school communication without configured review;

creating unsupported claims about grade-level proficiency from weak evidence;

making placement decisions based only on demographic information;

training on student PII unless there is a separately approved lawful arrangement.

The UI should use phrases such as:

"AI suggestion"

"Draft"

"Tutor review required"

"Instructional measure — not a standardized diagnostic assessment"

19. Progress Monitoring

A tutoring program becomes far more credible when progress monitoring is built into normal sessions.

19.1 Micro Progress Checks

Use 2-5 item checks frequently.

Examples:

3 fraction problems;

one short reading passage with two questions;

one paragraph writing response;

10 math facts;

60-second reading probe when appropriate.

These should take only a few minutes.

19.2 Formal Program Progress Probes

Every few sessions or weeks, use a slightly larger check.

The plan defines the measure.

Example:

10-item unlike-denominator fraction probe every 3 sessions.

19.3 Reassessment

A broader reassessment should occur when:

plan review date arrives;

major goal is completed;

tutor suspects the initial baseline was inaccurate;

student is not responding to instruction;

new academic concerns arise;

a new package is purchased after a substantial gap.

20. Progress Dashboard

For each subject, show:

Goal Progress

Example:

Fraction Operations — 72% toward target

Baseline: 30%

Current probe: 70%

Goal: >=80% on two consecutive probes

Skill Map

Equivalent fractions — Secure

Common denominators — Secure

Add unlike denominators — Nearly Secure

Subtract unlike denominators — Developing

Fraction word problems — Developing

Evidence Trend

Chart scores over time but keep raw evidence visible.

Tutoring Dosage

Sessions scheduled

Sessions attended

Total tutoring minutes

Average sessions/week

Tutor consistency

If the program describes a service as "high-impact tutoring," add a configuration that verifies whether the actual implementation meets the program's defined criteria before using that label in reporting.

Plan vs. Session Completion

Show whether planned objectives were actually addressed.

Example:

12 planned objectives

10 completed

2 deferred

This prevents the plan from becoming a static document nobody follows.

21. Parent / Guardian Reporting

Parents should not receive the tutor's entire internal record by default. Give them a clear learning summary.

After-Session Update

Optional configuration:

Today Ava worked on: subtraction of fractions with unlike denominators.

How it went: Partially met today's objective.

Strengths: strong effort, stayed engaged, asked questions.

Next: continue subtraction practice with decreasing prompts.

Every 4-6 Sessions

Generate a progress snapshot:

sessions completed;

attendance;

goals being addressed;

skills improved;

current needs;

assessment/probe changes;

next focus.

Learning Plan Review Report

More detailed:

baseline;

goals;

evidence;

progress;

goals met;

goals continued;

new goals;

tutor recommendation.

Use plain language alongside standards codes.

Bad parent report:

CO.MA.5.NF.A.1 progressing.

Better:

Adding fractions with different denominators: Ava has progressed from requiring step-by-step support to solving most problems independently. This work aligns with her Colorado grade-level fraction standards.

22. School Partner Reporting

If services are school-linked and the appropriate privacy/contract conditions exist, offer school-facing reports.

Possible fields:

student name / ID as permitted;

tutoring subject;

start date;

attendance / dosage;

goals;

standards addressed;

baseline and progress measure;

current status;

tutor notes appropriate for school sharing;

plan review date.

For administrators, aggregate:

enrolled students;

tutoring hours;

average attendance;

goals active;

goals met;

students on track / needing review;

subject distribution;

grade distribution;

assessment growth summaries.

Do not expose unnecessary individual student data in aggregate dashboards.

23. Tutor Workflow: Make the System Fast

The system should aim for the following tutor workload.

New Student

Baseline/evaluation: 15-40 minutes depending on pathway.

Learning Plan: AI draft plus approximately 3-5 minutes of tutor review.

Before Each Session

Preparation: approximately 30-60 seconds.

Tutor opens the session and sees:

previous outcome;

active goal;

recommended session plan;

materials;

whether a probe is due.

After Each Session

Documentation: approximately 30-90 seconds.

Tutor selects:

planned items completed;

outcome;

strengths;

challenges;

quick evidence;

next step.

AI drafts the summary.

Every Few Sessions

Progress check: 3-10 minutes embedded in the session.

Plan Review

Review: AI summarizes evidence and proposes revisions; tutor approves.

This is how AI should create leverage: it should reduce repetitive writing and searching, not replace the instructional relationship.

24. Tutor Home Dashboard

The tutor dashboard should focus on action, not analytics overload.

Today

For every student:

time;

student;

subject;

today's planned goal;

preparation status;

progress probe due badge.

Button: Open Session Brief

Needs Attention

Learning Plan needs approval

Evaluation incomplete

Progress probe overdue

Plan review due

Student has not progressed across 3 measures

Parent report ready for review

Package nearly depleted

My Students

Each row:

student;

subject(s);

current goal;

progress status;

next session.

25. Academic Quality Dashboard for Supervisors / Program Leads

This is where the system can improve tutoring quality at scale.

Metrics:

students without a baseline;

students without an active Learning Plan;

overdue plan reviews;

sessions missing notes;

sessions without evidence attached to an active goal;

percentage of sessions aligned to current plan;

progress-probe completion rate;

average time to first plan;

goal attainment rate;

time to mastery;

tutoring dosage;

retention / package renewal;

tutor-level documentation timeliness;

tutor-level student progress trends, interpreted cautiously.

Do not rank tutors solely by student score growth without accounting for starting point, subject, student need, dosage, attendance, and sample size.

26. Payment and Package Integration

Academic and payment records should connect without becoming the same thing.

Student Purchase Options

Single Session

4-Session Package

8-Session Package

12-Session Package

Recurring Monthly Package

Custom / School-Funded

Each package can specify:

allowed subject(s);

session length;

expiration, if any;

number of sessions;

price;

cancellation/no-show rules;

whether evaluation is included;

whether progress report is included.

Session Ledger

When a session is completed:

session status becomes Completed;

package balance decreases;

note becomes due;

learning evidence is saved;

receipt/invoice logic occurs separately.

The academic record should remain intact if payment status changes.

Package Renewal Trigger

When 1-2 sessions remain:

Package ending soon

Ava has completed 6 of 8 sessions. Her current Learning Plan recommends continued work on fraction subtraction and word-problem transfer.

This creates an ethically useful renewal conversation tied to documented learning needs rather than a generic sales prompt.

27. Data Model / Core Entities

A scalable backend should separate these entities.

Student

Demographics and profile-level information.

StudentSubject

One record for each active tutoring subject.

Fields:

student_id

subject_id

school_grade

instructional_level

status

primary_tutor_id

start_date

StandardsSourceVersion

authority

subject

version

effective date

source

ingestion date

Standard

standards_source_version_id

standard_code

grade

domain

statement

parent_standard_id

Evaluation

student_subject_id

type

date

administrator

status

source

standardized_flag

instrument_name

EvaluationItem

subject

grade band

skill

standard_id

item type

scoring key

difficulty

provenance

EvaluationResponse

evaluation_id

item_id

response

score

prompt_level

response_time

tutor_verified

Skill

A program-defined teachable skill mapped to one or more standards.

SkillEvidence

student_subject_id

skill_id

source_type

source_id

date

value

independence

prompt_level

evidence_strength

verified_by

LearningPlan

student_subject_id

start_date

review_date

status

approved_by

standards_version

LearningGoal

learning_plan_id

title

baseline

target

success_criterion

measurement_method

target_date

status

GoalObjective

learning_goal_id

skill_id

sequence

status

Session

student_id

subject_id

tutor_id

schedule data

attendance

duration

package ledger reference

SessionPlanItem

session_id

goal/objective reference

planned activity

completed flag

SessionNote

session_id

outcome

strengths

challenges

summary

next_step

tutor_verified_at

Assignment

student_subject_id

session_id

resource

due date

completion

ProgressMeasure

student_subject_id

learning_goal_id

measure type

date

score

target

AIArtifact

Store AI provenance for meaningful generated outputs:

type;

source object;

model/version;

prompt template/version;

retrieved sources;

generated content;

human approver;

approval timestamp;

superseded status.

28. Student Subject State Machine

A subject track can have a simple workflow status:

Enrollment Started

Baseline Needed

Baseline In Progress

Learning Plan Draft

Learning Plan Review

Active Tutoring

Plan Review Due

Reassessment

Goals Met / Maintenance

Completed / Discharged

This allows the app to know what action belongs on the dashboard.

29. Automation Rules

Examples of useful automation:

On New Subject Enrollment

create StudentSubject record;

request relevant intake data;

recommend evaluation path;

schedule baseline;

create "Learning Plan Needed" task.

On Evaluation Completion

score deterministic items;

request tutor scoring where needed;

generate skill map;

generate AI Learning Plan draft;

notify tutor to review.

On Learning Plan Approval

activate goals;

create progress monitoring schedule;

create proposed first-session plan;

update parent portal.

Before Session

summarize last session;

pull current goal;

generate proposed activities;

attach materials;

flag overdue measures.

After Note Completion

create skill evidence;

update progress trend;

generate next-session recommendation;

draft parent update;

check whether plan review is needed.

If Progress Stalls

Example trigger:

no measurable improvement across 3 progress measures;

Then:

Learning Plan Review Suggested

Performance has remained stable across three measures. Review instructional approach, prerequisite skills, attendance, and whether the current measure is appropriate.

Do not have AI automatically conclude a disability.

On Goal Criterion Met

Goal may be ready for completion.

Student met the success criterion on two consecutive independent measures.

Tutor chooses:

Mark Goal Met

Continue for Generalization

Keep Active

30. Example: Complete Student Journey

Enrollment

A parent purchases an 8-session mathematics package for a fifth-grade student.

Parent selects concerns:

fractions;

homework takes too long;

math confidence.

They upload a recent report card.

Baseline

Tutor administers a 25-minute in-app baseline.

Results:

whole-number operations: strong;

equivalent fractions: strong;

common denominators: developing;

adding unlike denominators: emerging;

subtracting unlike denominators: emerging;

fraction word problems: developing.

AI Plan Draft

AI recommends one primary goal and a sequence of five micro-skills.

Tutor edits the target from 85% to 80% and approves.

Session 1

Planned:

fraction representations;

equivalent fractions;

common denominators.

Outcome: Met Goal.

Evidence: 8/10 independent.

Next: Advance.

Session 2

Planned:

common denominators;

adding unlike denominators.

Outcome: Partially Met.

Challenges:

Needed Prompting

Concept Confusion

Evidence: 5/10 independent, 8/10 with prompt.

AI suggests keeping the same objective.

Session 3

Tutor uses visual models and mathematical language recommendations.

Evidence: 8/10 independent.

Session 4

Progress probe: 9/10 independent.

System marks common-denominator skill "Secure" after tutor confirmation and shifts emphasis to subtraction.

Parent Report

Ava has made measurable progress with common denominators and is now completing most addition problems independently. Tutoring is moving next toward subtraction and applying fraction skills to word problems.

Session 8

Broader reassessment.

If target is met:

mark goal met;

generate completion summary;

recommend either discharge, maintenance, or next goal.

If not met:

revise plan using evidence;

show parent what improved and what remains.

31. Use of CMAS and State Practice Resources

CDE provides state-sanctioned CMAS practice resources, including released questions, tutorials, scoring guides, and rubrics.

Potential product uses:

link families/tutors to official practice resources;

allow a tutor to record results from a released practice item;

use test-design and performance-level information to understand assessment context;

use released rubrics to inform internal rubric design where allowed.

Do not scrape or reproduce restricted testing content.

Do not call program-created quizzes "CMAS diagnostics."

A safer product label is:

Colorado Standards-Aligned Skill Check

32. K-3 Reading and the Colorado READ Act

This deserves its own design treatment.

CDE's READ Act framework requires approved interim assessments for K-3 public-school implementation and approved diagnostic assessment when applicable. The 2026 assessment review process is active during 2026, so the platform should not permanently hard-code the current approved vendor list.

Recommended Product Design

For a K-3 reading student, show:

Reading Assessment Source

School READ Act results uploaded

CDE-approved assessment integrated

Program instructional baseline

No current reading assessment

If a family uploads a school assessment, let the tutor record:

assessment name;

administration date;

overall result;

subskill results;

school-provided designation if present;

relevant recommendations.

The app can then use those results to plan tutoring.

If Building an Internal Early-Literacy Check

Call it something like:

Early Literacy Skill Check

Include appropriate domains such as:

phonological/phonemic awareness;

decoding;

word reading;

fluency;

vocabulary;

comprehension.

Add the UI disclosure:

This tutoring skill check is used to guide instruction and is not a substitute for a CDE-approved READ Act assessment or a clinical/special-education evaluation.

33. Accessibility, Accommodations, and Student Context

The student profile should allow relevant instructional supports without forcing tutors to interpret legal plans.

Possible fields:

extended time;

breaks;

reduced visual load;

large text;

text-to-speech where appropriate;

read-aloud permitted for specified tasks;

speech-to-text;

calculator use;

alternative response method;

language support;

preferred language;

bilingual materials;

other tutor instructions.

The evaluation engine must know whether an accommodation changes what a task measures.

For example, reading a comprehension passage aloud may be appropriate when measuring comprehension but inappropriate if the intended measure is decoding or independent reading.

34. English Learners and Multilingual Students

The platform should distinguish academic skill from English-language proficiency.

Useful fields:

preferred language;

language used at home;

language of school instruction;

whether assessment was administered in English, Spanish, or another supported language;

whether vocabulary/language may have affected performance.

AI should avoid automatically interpreting second-language features as academic deficits.

For Spanish-supported assessments, use appropriately developed/normed instruments when making standardized claims. CDE's READ Act assessment list identifies certain Spanish assessment options; the system can store that information dynamically rather than guessing equivalence.

35. Privacy and Student Data

Because the platform serves minors, privacy architecture should be designed before adding large-scale AI features.

Direct-to-Family Services

The company should clearly disclose:

what information is collected;

why it is collected;

how assessment data are used;

how AI is used;

whether student work is sent to external AI processors;

retention periods;

deletion/request procedures;

recording practices;

who can access records.

For children under 13 using an online service, COPPA considerations can apply. The FTC explains that schools may sometimes consent on parents' behalf when an online service is used solely for the school's educational benefit, but that school authorization is limited to the educational context. A direct-to-family tutoring product should not assume a school can always supply consent.

School Partnerships

When operating as a third party using education records, FERPA may permit school disclosure under the school-official exception only when the relevant conditions are met, including direct control over use and maintenance of records and limits on use/redisclosure.

Colorado school-service-provider requirements can add obligations concerning transparency, authorized use, privacy-policy changes, breach notification, subcontractors, and restrictions on selling or using student PII for targeted advertising.

Obtain education/privacy counsel before representing the product as legally compliant for all school deployments.

AI Data Controls

Recommended controls:

do not use student data for model training by default;

minimize data sent to the model;

separate student identity from instructional prompt data where feasible;

use enterprise/API arrangements with appropriate data controls;

log AI actions;

document subprocessors;

role-based access;

audit logs;

configurable retention;

encryption in transit and at rest;

parent/school deletion workflows;

human approval for official records.

36. What the AI Should Show the Tutor

Transparency makes the system more trustworthy.

When AI recommends a plan item, provide:

Why this was suggested

Baseline: 4/10 common-denominator items correct

Last session: needed prompting

Current objective: common denominators

Colorado alignment: Grade 5 mathematics standard

Strategy source: approved mathematics intervention guidance

Then:

Accept

Modify

Dismiss

This is better than a mysterious "AI says do this" experience.

37. Reporting Outcomes at the Program Level

The program should report more than revenue and completed sessions.

Academic outcomes could include:

percentage of students with an active Learning Plan;

baseline completion rate;

percentage of students showing positive trend on active goals;

goals met;

median sessions to goal attainment;

average change on program progress measures;

attendance rate;

package completion rate;

subject-specific progress;

grade-band progress;

plan-review completion;

parent satisfaction;

school-partner satisfaction.

Avoid mixing incompatible assessments into one average "percent growth."

If one student uses a 10-item fraction probe and another uses an oral-reading measure, those should not be combined as if they were the same scale.

38. Recommended Product Screens

Student > Learning Overview

Contains:

subject cards;

current goals;

progress status;

recent session outcome;

next session;

next evaluation;

package status.

Student > Subject

Contains:

subject summary;

grade/instructional level;

current Learning Plan;

active goals;

skill map;

progress chart;

recent sessions;

evaluations;

resources.

Student > Evaluations

Contains:

baseline;

progress probes;

uploaded assessment results;

create evaluation;

compare results.

Student > Learning Plan

Contains:

baseline summary;

strengths;

needs;

goals;

objectives;

standards alignment;

progress-monitoring schedule;

plan history.

Session Brief

Contains:

prior session summary;

active goal;

today's plan;

materials;

progress check due;

AI session preparation.

Session Note

Contains:

plan items completed;

how it went;

strengths;

challenges;

quick evidence;

generated summary;

next step;

resource/homework.

Progress Report

Contains:

baseline vs current;

goals;

skill status;

tutoring dosage;

narrative summary;

recommendations.

39. Suggested Visual Hierarchy for the Session Note

A concise note should visually follow the instructional process.

STUDENT / SUBJECT / DATE / TUTOR / LENGTH

LEARNING PLAN GOAL
"Add and subtract fractions with unlike denominators..."

1. PLANNED FOR THIS SESSION
   [x] Review common denominators
   [x] Guided practice
   [ ] Independent word problem

2. HOW IT WENT
   ( ) Exceeded   ( ) Met   (x) Partially Met   ( ) Not Yet

3. QUICK EVIDENCE
   7 / 10 independently correct

4. STRENGTHS
   [Strong Effort] [Asked Questions] [Stayed Engaged]

5. CHALLENGES
   [Needed Prompting] [Concept Confusion]

6. QUICK SUMMARY
   [Generate with AI]
   Ava demonstrated...

7. NEXT STEP
   [Continue Current Goal v]

8. RESOURCE / HOMEWORK
   Worksheet #4

                    [Save Note & Update Progress]

40. The Learning Plan Generator: Exact AI Output Contract

Do not ask the model to return arbitrary prose. Require structured output.

Conceptual schema:

{
  "baseline_summary": "...",
  "strengths": ["..."],
  "priority_needs": [
    {
      "skill": "...",
      "evidence": "...",
      "priority": "high"
    }
  ],
  "goals": [
    {
      "title": "...",
      "baseline": "...",
      "target": "...",
      "success_criterion": "...",
      "measure": "...",
      "standards": ["..."],
      "objectives": ["..."],
      "recommended_strategies": ["..."]
    }
  ],
  "first_sessions": [
    {
      "session": 1,
      "focus": "...",
      "activities": ["..."],
      "exit_measure": "..."
    }
  ],
  "review_recommendation": "..."
}

Backend validates the schema before presenting it to a tutor.

41. Assessment Generation Contract

When asking AI to generate an internal item, require:

{
  "subject": "Mathematics",
  "grade": 5,
  "standard_id": "...",
  "skill": "Find common denominators",
  "difficulty": "developing",
  "item_type": "numeric_response",
  "prompt": "...",
  "correct_answer": "...",
  "worked_solution": "...",
  "misconception_tags": ["..."],
  "scoring_rule": "...",
  "accessibility_notes": "..."
}

Then run automated checks where possible:

answer correctness;

impossible/ambiguous item detection;

grade-appropriateness checks;

duplicate detection;

prohibited content;

standards reference validity.

High-value reusable items should receive human approval.

42. Quality Assurance

Create a content QA workflow.

Statuses:

AI Draft

Tutor Created

Reviewer Approved

Needs Revision

Retired

For the shared assessment/item bank, reviewer approval should be required.

Track item statistics over time:

number administered;

percent correct;

average response time;

common distractor;

tutor-reported ambiguity;

flagged errors.

If an item behaves poorly, retire it.

43. Suggested MVP

Do not try to build adaptive testing, speech scoring, standards ingestion, payments, and AI automation simultaneously.

MVP 1 — Learning Record

Build:

student profile;

multiple subjects;

subject page;

manual baseline entry;

Learning Plan;

goals/objectives;

session brief;

fast structured session note;

strengths/challenges;

quick evidence;

progress chart;

parent progress summary;

package/session ledger.

MVP 2 — AI Assistance

Add:

CDE standards repository;

standards search/alignment;

AI Learning Plan draft;

AI session-plan draft;

AI summary generation;

AI parent update;

AI next-step suggestion;

plan review suggestions.

MVP 3 — Evaluation Engine

Add:

internal item bank;

evaluation builder;

automated scoring;

reading passages;

math problems;

writing rubrics;

progress probes;

baseline-to-plan automation.

MVP 4 — Advanced Measurement

Add:

adaptive routing;

oral reading support;

speech-to-text with tutor verification;

advanced analytics;

licensed assessment integrations;

school partner reporting;

document result extraction.

44. The First Version I Would Actually Build

If development needs a clear starting point, begin with these six objects:

StudentSubject

EvaluationSummary

LearningPlan

LearningGoal

Session + SessionNote

SkillEvidence

Then build this single happy-path workflow:

Add Subject
   ↓
Enter or Complete Baseline
   ↓
Generate Learning Plan Draft
   ↓
Tutor Approves Plan
   ↓
System Generates Session Brief
   ↓
Tutor Completes Session
   ↓
60-Second Session Note
   ↓
Skill Evidence Updates Goal
   ↓
System Suggests Next Session
   ↓
Periodic Progress Probe
   ↓
Parent Progress Report

If this loop works extremely well, almost every advanced feature can be added later without changing the basic architecture.

45. Non-Negotiable Product Rules

Every session belongs to a subject.

Every planned instructional session should connect to at least one active goal/objective unless marked as general course/homework support.

Every active goal has a measurable baseline and success criterion.

Every goal identifies how progress will be measured.

Every evaluation result creates structured skill evidence.

Every session note should take less than two minutes under normal conditions.

AI drafts; humans approve official academic plans and high-impact interpretations.

Standards are versioned.

Assessment provenance is visible.

Internal instructional measures are never represented as state or standardized assessments.

Parents see understandable progress, not just codes and percentages.

The system can always explain what evidence supports a progress status.

Student data are not used for unrelated advertising or model training by default.

Tutor workflow should become easier as more data accumulate, not harder.

46. Recommended Terminology

Use consistent user-facing terms:

Student Profile — whole student

Subject — one academic track

Evaluation — baseline or broader skill check

Progress Check — shorter repeated measure

Learning Plan — current instructional plan

Goal — measurable learning outcome

Objective — smaller teachable step

Session Brief — pre-session plan

Session Note — post-session documentation

Skill Evidence — data point supporting progress

Progress Report — family/school summary

Avoid using "diagnosis" for ordinary tutoring evaluation results.

Use "instructional level" carefully and explain how it was determined.

47. Recommended AI Features by Priority

Highest Value

Learning Plan generation from evaluation evidence

Session preparation from active plan + prior session

Session summary from structured selections

Next-step recommendation

Parent progress-summary drafting

Standards alignment

Next Highest

Practice problem generation

Reading passage generation

Progress-probe generation from vetted templates

Misconception categorization

Writing-response rubric assistance

Later / Higher Risk

Automated oral-reading scoring

fully adaptive evaluation

automated placement recommendation

cross-student predictive analytics

Build high-trust, low-risk automation first.

48. A Strong Product Promise

The system should ultimately be able to make this promise to a tutor:

Tell us what the student knows. We will help organize what to teach next, prepare the session, track what happened, measure whether it worked, and keep the Learning Plan and family informed—while you remain the educator making the decisions.

And to a parent:

You will always be able to see what your child is working on, why it matters, what progress has been made, and what comes next.

That is significantly more valuable than simply storing tutoring notes.

49. Primary Reference Framework

The architecture above is a product recommendation, not a statement that CDE or the U.S. Department of Education endorses the application. The following official or government-supported resources should form the initial source library and be reviewed periodically for updates.

Colorado Department of Education

Colorado Academic Standards and Essential Skills
https://ed.cde.state.co.us/standardsandinstruction/standards

Colorado Academic Standards Online
https://sites.cde.state.co.us/apps/standards/

Standards and Instructional Support
https://ed.cde.state.co.us/standardsandinstruction

High-Impact Tutoring Program
https://www.cde.state.co.us/standardsandinstruction/highimpacttutoringprogram

High Dosage Tutoring Strategy Guide
https://ed.cde.state.co.us/uip/strategyguide-highdosagetutoring

Colorado READ Act — Approved Assessments
https://ed.cde.state.co.us/coloradoliteracy/readact-programming/readactassessments

2026 READ Act Advisory List Assessment Review
https://ed.cde.state.co.us/coloradoliteracy/readact-programming/2026readactadvisorylist-assessmentreviewprocess

CMAS State Summative Assessments / Practice Resources
https://ed.cde.state.co.us/assessment/cmas

Reading, Writing and Communicating Standards
https://ed.cde.state.co.us/coreadingwriting/cas-rw-2018

Mathematics Standards / 2026 Revision Information
https://ed.cde.state.co.us/standardsandinstruction/casreviewandrevision/group3-mathematicscommittee

U.S. Department of Education / IES / What Works Clearinghouse

Artificial Intelligence and the Future of Teaching and Learning
https://www.ed.gov/sites/ed/files/documents/ai-report/ai-report.pdf

Designing for Education with Artificial Intelligence: An Essential Guide for Developers
https://eric.ed.gov/?id=ED661949

Empowering Education Leaders: A Toolkit for Safe, Ethical, and Equitable AI Integration
https://eric.ed.gov/?id=ED661924

WWC — Assisting Students Struggling with Mathematics: Intervention in the Elementary Grades
https://ies.ed.gov/ncee/wwc/practiceguide/26

WWC — Providing Reading Interventions for Students in Grades 4-9
https://ies.ed.gov/ncee/WWC/PracticeGuide/29

WWC — Assisting Students Struggling with Reading: RtI and Multi-Tier Intervention in the Primary Grades
https://ies.ed.gov/ncee/wwc/PracticeGuide/3

Student Privacy — Privacy and Education Technology
https://studentprivacy.ed.gov/privacy-and-education-technology

Responsibilities of Third-Party Service Providers under FERPA
https://studentprivacy.ed.gov/resources/responsibilities-third-party-service-providers-under-ferpa

Other Federal / Colorado Privacy References

FTC — COPPA Frequently Asked Questions, including schools and EdTech
https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions

Colorado Student Data Transparency and Security statutory framework
Review the current version of Colorado Revised Statutes Title 22, Article 16 and obtain legal review for current contractual obligations before school deployment.

50. Final Product Direction

The best system is not:

Student -> Sessions -> Notes

It is:

Student -> Subject -> Evidence -> Learning Plan -> Session Plan -> Session -> Evidence -> Progress -> Adaptation -> Report

That structure gives AI something meaningful to work with and gives tutors a workflow that becomes faster over time.

The Learning Plan becomes the academic brain of the student profile.

The Evaluation Engine determines the starting point.

The Session Brief tells the tutor what to do.

The Session Note records only the smallest amount of new information needed.

Skill Evidence creates the longitudinal record.

Progress monitoring determines whether instruction is working.

AI performs the repetitive synthesis and generation.

The tutor remains responsible for professional instructional judgment.

The family receives a clear explanation of progress.

The program receives measurable outcomes across students, subjects, tutors, and services.

That is the foundation I would use to build a modern one-on-one tutoring platform in Colorado.







Yes. The MVP gives you the bones of the learning system. The next phase should turn those records into an actual learning operating system that decides what should happen next, prepares the tutor, captures evidence with minimal effort, and continuously updates the student's plan.

1. What comes immediately after the MVP

I would call the next stage Phase 2: Learning Plan Execution Engine.

The MVP establishes these core records:

StudentSubject → Evaluation → Learning Plan → Learning Goal → Session → Session Note → Skill Evidence

Phase 2 makes them actively work together.

The student's lifecycle should become:

Enroll → Select Subject(s) → Evaluate → Generate Learning Plan → Tutor Reviews → Plan Activates → Session Planned → Tutor Teaches → Quick Note → Evidence Recorded → Progress Updated → Next Session Generated → Reassess → Adjust Plan → Goal Mastered

That workflow should essentially run itself unless a tutor needs to intervene.

Phase 2A — The Subject Workspace

Each student should have a Learning tab in their profile.

Inside it:

Student	Ava Thompson
Grade	5
School	Cheyenne Mountain Elementary
Active subjects	Reading • Mathematics
Overall status	Making Progress
Next evaluation	Oct. 15
Sessions completed	11
Package	8 of 12 sessions remaining

Then each subject becomes its own miniature learning program.

For example:

Mathematics

Current level: approximately Grade 4.6
Enrolled grade: Grade 5
Primary concern: Fractions
Learning Plan: Active
Current goal: Fraction operations
Progress: 64%
Current skill: Unlike denominators
Next session: Thursday
Recent trend: Improving

Reading

Current level: approximately Grade 5
Primary concern: Comprehension
Learning Plan: Active
Current goal: Inferential comprehension
Progress: 52%

Reading and Mathematics should never be forced into the same Learning Plan.

2. Make the Learning Plan an active object

Right now, most tutoring software would treat the Learning Plan as a document.

Don't.

Treat it as a program the software is executing.

A Learning Plan might internally look like:

Goal 1 — Fractions

Student will independently solve addition and subtraction problems involving fractions with unlike denominators at ≥80% accuracy across three measures.

Underneath it:

Skill	Status	Evidence	Confidence
Equivalent fractions	Mastered	5 measures	High
Common denominators	Proficient	4 measures	High
Add unlike denominators	Developing	3 measures	Medium
Subtract unlike denominators	Emerging	2 measures	Medium
Mixed numbers	Not started	—	—

This becomes vastly more powerful than a progress bar.

Suggested skill states

Not Assessed → Emerging → Developing → Proficient → Mastered

And preferably:

Needs Review

when previously mastered material starts deteriorating.

3. Create the Evidence Engine

This is probably the most important feature after the MVP.

Every interaction with the child can produce Skill Evidence.

A tutor should not have to manually update a progress bar.

For example:

Today's session

Planned:

Common denominator review
5 guided addition problems
3 independent problems
Explain strategy aloud

Results:

Guided problems: 5/5
Independent: 2/3
Tutor support: Minimal
Exit ticket: 3/4

Selections:

Strength

Applied strategy independently

Challenge

Calculation error

The system converts that into evidence.

Addition with unlike denominators
Evidence: 83% overall
Independence: Moderate/High
Date: Aug. 26
Source: Tutoring Session
Confidence: Medium

The tutor does not manually calculate the student's mastery.

4. Don't let AI determine mastery by itself

I would separate:

Deterministic system

Handles:

scores
percentages
number correct
number attempted
response time
independence
repeated evidence
mastery thresholds
session frequency
missed sessions
evaluation scores
AI

Handles:

interpreting patterns
drafting recommendations
explaining misconceptions
suggesting activities
generating session plans
creating practice
writing summaries
recommending whether a goal may need adjustment

That distinction is extremely important.

You don't want:

"AI thinks Ava mastered fractions."

You want:

Mastery criteria met: 3 independent measures ≥80%.

Then AI can say:

Ava has demonstrated consistent success across three independent measures. Consider advancing to mixed-number operations.

5. Automatically create the next tutoring session

Once the Learning Plan is operating correctly, the tutor shouldn't start with an empty screen.

Opening Ava's Thursday session could show:

Recommended Session

Learning Plan Goal
Fraction operations

Today's objective
Increase independent accuracy adding fractions with unlike denominators.

Why this was selected

Ava demonstrated 83% accuracy last session but required prompting on 2 problems. Additional independent practice is recommended before advancing.

Suggested 60-minute session
Time	Activity
5 min	Warm-up / retrieval
10 min	Review common denominator strategy
15 min	Guided problems
15 min	Independent practice
10 min	Word problems
5 min	Exit ticket

Then buttons:

Accept Plan

Modify

Generate Another

Tutor's Own Plan

That alone could make your tutoring platform substantially better for tutors.

6. The session note becomes almost effortless

Your mockup is headed in exactly the right direction.

The system already knows:

student
subject
Learning Plan
goal
skill
tutor
session
planned activities

The tutor only tells the system what actually happened.

Planned for Session

Automatically populated.

☑ Review unlike denominators
☑ Guided practice
☑ Independent practice
☑ Exit ticket

How did the student do?

Exceeded | Met | Partially Met | Not Yet

Strengths

Selectable chips:

Strong Effort
Independent Work
Asked Questions
Applied Strategy
Improved Accuracy
Stayed Engaged
Self-Corrected
Explained Reasoning
Persisted Through Difficulty

Challenges

Needed Prompting
Concept Confusion
Attention / Focus
Calculation Errors
Reading Directions
Slow Processing
Frustration
Low Confidence
Incomplete Work

Evidence

Independent problems

7 / 10

Support

None | Minimal | Moderate | Significant

Next

Continue | Reinforce | Advance | Reassess | Modify Plan

And AI produces:

Ava practiced adding fractions with unlike denominators and completed 7 of 10 problems independently. She demonstrated strong effort and used the common-denominator strategy with minimal prompting. Additional practice is recommended before advancing.

Tutor clicks:

Approve & Save

Done.

7. Phase 2B — Build the Evaluation Engine

After the session/plan engine works, I would build your own Evaluation Center.

This is different from simply having a form where a tutor writes evaluation results.

The software actually administers activities.

Preschool–Kindergarten

Keep these relatively observational and low-pressure.

Possible activities include:

letter recognition, letter sounds, phonological awareness, counting, quantity comparison, number recognition, patterns, shapes, oral language, following directions, and basic writing/fine-motor observations.

I would avoid producing fake "grade-equivalent" scores for very young children.

K–3

This becomes more structured.

Reading can examine things such as:

phonemic awareness, phonics, decoding, high-frequency words, oral reading, fluency, vocabulary, literal comprehension and inferential comprehension.

Math can examine:

number sense, counting, place value, addition/subtraction, operations, early multiplication/division and mathematical reasoning.

Colorado deserves special handling here because READ Act requirements involve approved assessments for K–3 public-school use. CDE currently maintains approved interim, diagnostic, and summative assessment lists; the 2026 review cycle is underway, with its State Board approval window scheduled from June through October 2026.

Your internal product can absolutely have:

Next Level Up Reading Skill Check

but don't present an internally generated test as a CDE-approved READ Act assessment unless the particular assessment/tool is actually approved and you have the necessary licensing/implementation rights.

Grades 3–5

This is where your assessment engine can become particularly useful.

Reading:

comprehension
vocabulary
fluency where relevant
informational text
literary analysis
written response

Math:

operations
multiplication/division
fractions
decimals
measurement
geometry
word problems

Writing:

sentence construction
organization
grammar
evidence
paragraph composition
Grades 6–8

Shift from foundational screening toward skill-gap identification.

Example:

Student is enrolled in Grade 7 mathematics but is demonstrating a Grade 5-level gap in fraction operations that is interfering with rational-number work.

That becomes enormously valuable to tutors.

Grades 9–12

Assess by course/competency, not primarily by "grade level."

For example:

Algebra I
Geometry
Algebra II
Statistics
Reading comprehension
Academic writing
SAT preparation

Colorado's high-school mathematics standards are particularly important to version carefully right now: the State Board approved revised high-school math standards on May 14, 2026, while CDE's primary download page still identifies the currently downloadable math documents as the 2018-adopted set and notes that revised documents will be posted.

8. Phase 2C — Build an Item Bank, not just an AI question generator

This is another place I would change the obvious approach.

Don't have ChatGPT randomly invent the student's evaluation every time.

Create an Item Bank.

Each item has metadata:

Field	Example
Subject	Math
Grade	5
Domain	Number & Quantity
Skill	Unlike denominators
Difficulty	3/5
Standard	Colorado standard ID
Item type	Multiple choice
Answer	B
Misconception A	Added denominators
Misconception C	Incorrect equivalent fraction
AI generated	Yes
Human reviewed	Yes
Approved	Yes

AI can create candidate questions.

But an administrator/tutor approves good questions into your permanent bank.

Over time you might have:

20,000 vetted instructional items

instead of asking AI to reinvent the wheel constantly.

9. Assess the misconception, not merely the answer

This could become one of your strongest differentiators.

Suppose the problem is:

1/3 + 1/4

Student answers:

2/7

The software shouldn't simply record:

Incorrect.

It should understand:

Likely misconception: Student is adding numerators and denominators independently.

That automatically changes the Learning Plan.

Instead of:

Practice fractions.

you get:

Re-teach conceptual meaning of fraction addition and common denominators.

That is much closer to how a good one-on-one tutor thinks.

10. Phase 2D — Student Progress Intelligence

Once enough evidence accumulates, create a Progress Intelligence Engine.

It should continuously look for patterns.

Examples:

Possible breakthrough
Multiplication facts have been ≥90% across the last four sessions.

Possible plateau
Inferential comprehension has remained between 55–65% across five measures.

Possible regression
Previously mastered fraction-equivalence performance declined on the last two checks.

Possible plan mismatch
Ava consistently exceeds the current target. Consider increasing difficulty.

Attendance concern
Three sessions were missed during the current goal period.

These become tutor alerts—not automatic changes.

11. Phase 2E — Automated Progress Reports

Don't make tutors write these separately.

Everything already exists.

The system generates:

Parent Progress Report

What we're working on

What Ava can now do

Skills still developing

Progress since starting

Recent accomplishments

What we're doing next

Activities families can practice

Graphs can display:

Baseline → Current

and:

Emerging → Developing → Proficient → Mastered

You could generate these:

monthly, after X sessions, at package completion, upon reevaluation, or manually.

12. Package completion becomes academically meaningful

This is where the business side and academic side should communicate.

For example:

12-session package

Session 1
Baseline Evaluation

Sessions 2–5
Goal A

Session 6
Progress Check

Sessions 7–10
Goal A/B

Session 11
Reassessment

Session 12
Progress Review + next recommendations

The interface could tell the tutor:

2 sessions remaining in Ava's package.
A progress reassessment is recommended before completion.

Now your package isn't merely twelve appointments.

It's an instructional program.

13. How to make the app "know CDE"

This should be its own backend capability:

CDE Knowledge Service

I would not allow every AI request to browse the CDE website live.

Instead:

CDE → Controlled Import → Structured Standards Database → Search/Retrieval Layer → AI

CDE's online standards architecture already gives you the conceptual structure to mirror:

Prepared Graduate → Grade Level Expectation → Evidence Outcome → Academic Context & Connections.

And CDE conveniently publishes many content standards in machine-friendly alternative formats such as CSV, Excel and Markdown/plain text, including Mathematics and Reading, Writing and Communicating.

Your database

I would create these entities:

CDEStandardSet

CDEStandard

CDEEvidenceOutcome

CDEContextConnection

CDESource

InternalSkill

StandardSkillMap

StandardsVersion

For example:

{
  "jurisdiction": "Colorado",
  "agency": "Colorado Department of Education",
  "content_area": "Mathematics",
  "grade": "5",
  "standard_id": "CDE-MA-...",
  "standard_text": "...",
  "evidence_outcomes": [],
  "internal_skills": [],
  "adoption_version": "2018",
  "status": "active",
  "source_url": "...",
  "source_hash": "...",
  "retrieved_at": "2026-08-26"
}
14. Keep Colorado standards and your internal skill taxonomy separate

This is extremely important.

CDE standards tell you broadly what students are expected to know and do.

Your tutoring platform needs smaller instructional units.

For example:

Colorado standard

Fractions / operations.

Your internal map might be:

Fractions
→ Understand numerator/denominator
→ Equivalent fractions
→ Compare fractions
→ Common denominators
→ Add like denominators
→ Add unlike denominators
→ Subtract unlike denominators
→ Improper fractions
→ Mixed numbers
→ Fraction word problems

Each internal skill then maps upward to one or more Colorado standards.

That means your tutor works with something useful like:

Current Skill: Finding Common Denominators

while the parent report can say:

Aligned with Colorado Grade 5 Mathematics expectations.

15. Give CDE data a versioning pipeline

CDE standards change.

CDE says standards are reviewed on recurring revision cycles, and the current cycle itself demonstrates why versioning matters: Reading, Writing and Communicating was re-adopted without changes in December 2024, while revised high-school mathematics standards were approved in May 2026.

So build:

Sources → Import → Compare → Review → Publish

Not:

Download → overwrite database.

When your sync process detects changes:

CDE Update Detected

Math — High School
Current application version: 2018
New CDE revision: 2026
Status: Approved / awaiting finalized import

Admin options:

Review Changes

Map Skills

Publish

Delay

Existing Learning Plans should retain the standard version against which they were created.

New Learning Plans can use the newly published version.

Don't silently rewrite history.

16. Have a CDE Source Registry

Create an admin page called:

Education Knowledge Sources

It might show:

Source	Status	Version	Last checked
CDE Mathematics	Active	2018	Aug 26
CDE RWC	Active	2018 / reaffirmed 2024	Aug 26
CDE Science	Active	2025 revision	Aug 26
CDE High-Impact Tutoring	Active	Current	Aug 26
CDE READ Assessments	Monitored	2026 review	Aug 26

CDE itself recommends tutoring content be aligned to identified student needs, use diagnostic assessment results, reinforce classroom instruction, and include frequent assessment. That is almost exactly the architecture we're building.

17. Give the AI retrieval rules

Every AI planning request should first retrieve:

Student information

Subject

Active Learning Plan

Relevant internal skills

Recent Skill Evidence

Relevant CDE standards

Tutor/session context

Then generate.

Not:

"Make a fifth-grade math lesson."

Instead the internal request becomes conceptually:

Ava is enrolled in Grade 5 Mathematics.
Active Learning Plan goal: Fraction operations.
Internal skill: unlike denominators.
Last three evidence scores: 65%, 75%, 83%.
Independence trend: moderate → minimal support.
Retrieve applicable Colorado Academic Standards.
Generate an appropriate next session without advancing beyond demonstrated readiness.

Much better.

18. Require the AI to cite its curricular reasoning internally

Every AI output should return something like:

{
  "recommendation": "Continue current goal",
  "reason": "Accuracy is improving but mastery threshold has not yet been met.",
  "skills": [
    "fraction.common_denominator",
    "fraction.add_unlike"
  ],
  "standards": [
    {
      "standard_id": "CDE...",
      "version": "2018"
    }
  ],
  "evidence_used": [
    "EV-1822",
    "EV-1841",
    "EV-1859"
  ],
  "confidence": "high"
}

Your UI doesn't necessarily need to show all that.

But your database should retain it.

That gives you explainable AI.

19. Put hard limits around CDE claims

Your AI should know:

Aligned with CDE ≠ approved by CDE

and:

Generated reading skill check ≠ READ Act approved assessment

Colorado requires public-school K–3 READ Act assessment use from the approved advisory list for those statutory purposes.

Your system can still produce excellent instructional assessments.

Just label them accurately.

20. The mockups I would create

I would design these in roughly this order. ★ means I would consider it essential before your post-MVP build gets far.

★ Student Learning Overview — the Learning tab inside the student's profile showing all subjects, overall status, active plans, progress, evaluations, upcoming sessions and package status.
★ Subject Workspace — dedicated Math/Reading/Writing page containing current goal, skills, progress, tutor, last evaluation, sessions and next recommendation.
Add / Enroll Subject — select subject, reason for tutoring, current grade/course, school information, tutor assignment and evaluation requirement.
★ Learning Timeline — evaluation → plan created → goals → sessions → progress checks → mastered skills → reassessment.
★ Evaluation Setup — tutor selects subject, grade/course, reason, evaluation type and appropriate modules.
★ Student Evaluation Player — distraction-free interface the child actually uses to answer questions.
Tutor-Led Evaluation Mode — evaluator sees instructions, responses, prompts, scoring and observations.
★ Reading Evaluation Interface — passages, oral reading, miscues, comprehension questions, fluency observations and tutor verification.
★ Math Evaluation Interface — question, student's answer/work, correct answer, skill, possible misconception and tutor observation.
Writing Evaluation Interface — writing prompt, student response, rubric, grammar/structure/content scoring and AI-assisted rubric recommendations.
Early Learner Evaluation — visual/observational interface appropriate for preschool–Grade 1 activities.
★ Evaluation Results Dashboard — strengths, gaps, scores, skill map, recommended priorities and standards alignment.
★ Evaluation → Learning Plan Review — left side evaluation evidence; right side AI-generated proposed Learning Plan with approve/edit/reject controls.
★ Learning Plan — goals, objectives, target skills, mastery criteria, standards, baseline, target, interventions and progress.
Learning Plan Editor — manually add/reorder goals, skills, mastery rules, standards and planned measures.
★ Skill Map — visual hierarchy showing Not Assessed / Emerging / Developing / Proficient / Mastered.
Skill Detail Drawer — all evidence, evaluations, sessions, scores, tutor observations and standards associated with one skill.
★ Tutor Session Prep — what was planned, why it was selected, materials, suggested sequence, Learning Plan context and accept/modify/generate controls.
Active Tutoring Session — minimal live-session interface with activities, quick evidence capture, timer and Learning Plan context.
★ Quick Session Note — the mockup we have already developed: planned work, how it went, strengths, challenges, evidence, quick summary and next step.
AI Summary Review — generated session narrative with approve/edit/regenerate before saving.
Exit Ticket Interface — 1–5 quick problems automatically linked to the day's target skill.
★ Evidence History — chronological view of every piece of evidence supporting or contradicting skill mastery.
★ Student Progress Dashboard — baseline/current, skill mastery, progress trends, goals achieved, session consistency and attention-needed indicators.
Progress Intelligence / Alerts — plateau, regression, mastery candidate, reassessment due and possible plan mismatch.
★ Reassessment Interface — recommended skills to retest, previous baseline, current results and changes.
Learning Plan Review / Revision — compare old vs proposed goals after reassessment.
Goal Mastered Celebration / Transition — record mastery and identify the next recommended skill/goal.
★ Parent Progress Report Preview — plain-language accomplishments, current focus, graphs, next steps and home recommendations.
Parent Learning Portal — simplified subjects, upcoming sessions, recent progress, tutor updates, Learning Plan summary and assigned practice.
Homework / Practice Assignment — tutor assigns app-generated or library practice linked directly to a skill.
Student Practice Player — child completes reading, math or writing practice inside the portal.
★ Tutor Caseload Dashboard — students today, sessions to prepare, notes due, evaluations due, plateaus, mastery candidates and package completion warnings.
Tutor Student Handoff — new tutor receives current Learning Plan, recent progress, strengths, challenges and important teaching observations.
★ Item Bank — searchable questions/passages/prompts by grade, subject, domain, skill, difficulty, standard and approval status.
AI Item Generator — generate candidate questions/passages/problems with grade/skill/difficulty controls.
Item Review / Approval — human reviews AI content, correct answer, misconception mappings, wording and standards alignment before admitting it to the bank.
Assessment Builder — select skills, difficulty, item count, question types and scoring rules to construct an evaluation.
Activity / Worksheet Generator — generate session materials from Learning Plan targets.
Resource Library — approved lessons, passages, worksheets, games, manipulatives and tutor-created resources tagged to skills.
★ Colorado Standards Browser — filter by content area, grade, standard, Grade Level Expectation and Evidence Outcome.
Standard Detail Panel — official text, version, source, mapped internal skills and where the standard is currently being used.
★ CDE Knowledge Source Admin — source name, CDE URL, content type, version, retrieval date, status and sync health.
★ CDE Update Detected / Review Changes — show old/new differences and require approval before publishing a standards revision.
Standards Version Migration — identify which Learning Plans, skills and content may be affected by a newly published standard set.
Internal Skill Taxonomy Admin — build the smaller skill hierarchy beneath Colorado standards.
Standard ↔ Skill Mapping Interface — map internal tutoring skills to one or more CDE standards and review AI suggestions.
AI Decision Inspector — admin can see exactly which Learning Plan, evidence, skill records and CDE standards AI used for a recommendation.
AI Quality / Flag Queue — tutors flag a generated lesson, question, recommendation or summary as incorrect/inappropriate.
★ Package + Academic Progress View — sessions purchased, sessions used, sessions remaining, evaluation milestones and recommended reassessment before package completion.
Package Builder — define 4/8/12/etc. session programs and optionally attach evaluation/progress-report milestones.
Tutor Assignment Interface — match student subject needs with tutor specialties and availability.
School / Teacher Input Page — capture current classroom curriculum, teacher concerns, assignments and school performance without making it the Learning Plan itself.
School Progress Report — appropriate academic summary for school partners where authorization exists.
★ Admin Learning Quality Dashboard — percentage of students evaluated, active Learning Plans, plans overdue for review, progress rates, mastered goals, tutor documentation completion and students needing attention.
Program Outcomes Dashboard — aggregate Reading/Math/Writing improvement, sessions to mastery, retention, package completion and evaluation-to-reassessment growth.
Learning Plan Closeout — goals achieved, final evaluation, remaining recommendations and discharge/continue decision.
Completed Program Report — baseline vs final results plus a concise record of what was accomplished.
The 15 I would mock up first

From that larger set, the visual chain I would design before anything else is essentially:

Student Learning Overview → Subject Workspace → Evaluation Setup → Student Evaluation → Evaluation Results → AI Learning Plan Generation → Learning Plan → Skill Map → Session Prep → Session Note → Evidence History → Progress Dashboard → Reassessment → Parent Progress Report → Tutor Caseload

If those screens make sense together, you will have visually defined almost the entire core product.

And I would add the CDE Standards Browser + CDE Source Admin immediately afterward, because those two mockups will force the engineering team to understand that CDE integration is a real system component—not merely text added to an AI prompt.

What this ultimately turns into

The tutor's experience should eventually be:

Open today's student.

The application tells them:

Here's what you're teaching today and why.

They teach.

The application asks:

How did it go?

They make 5–8 selections and enter perhaps one score.

The system responds:

Here's what changed in the student's learning record, here's what we recommend next, and here's the next session.

That is the product I would build.

CDE's own high-dosage tutoring guidance emphasizes matching content to identified student needs, using diagnostic information, maintaining alignment with classroom instruction, and performing frequent assessment; the broader CDE High-Impact Tutoring program similarly characterizes the model as targeted, repeated, and data-driven.

So you can build something that feels extremely modern and AI-driven while actually having a defensible educational philosophy underneath it: evaluate → target → instruct → measure → adapt.

Because the CDE standards and assessment lists are changing right now, I can also monitor those sources and surface meaningful changes for your build.