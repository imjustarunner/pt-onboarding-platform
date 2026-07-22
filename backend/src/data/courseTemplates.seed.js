/**
 * Platform course templates grounded in common instructional-design patterns
 * used in workplace LMS (video-first microlearning, policy ack, scenario practice, etc.).
 * Example copy is intentionally concrete and easy to replace in Course Builder.
 */

function text(title, html) {
  return {
    contentType: 'text',
    title,
    contentData: { title, content: html, description: '' },
    settings: { required: false }
  };
}

function video(title, hint = '') {
  return {
    contentType: 'video',
    title,
    contentData: {
      title,
      videoUrl: '',
      placeholderHint:
        hint || 'Upload your video in the Media tab, then click Use (or paste a YouTube/Vimeo URL).'
    },
    settings: { required: true }
  };
}

function callout(title, content, calloutStyle = 'info') {
  return {
    contentType: 'callout',
    title,
    contentData: { title, content, calloutStyle, variant: 'callout' },
    settings: { required: false }
  };
}

function knowledgeCheck({ title, question, options, correctAnswer = 0, explanation }) {
  return {
    contentType: 'knowledge_check',
    title,
    contentData: {
      title,
      blockType: 'knowledge_check',
      knowledgeCheck: true,
      question,
      options,
      correctAnswer,
      explanation,
      shuffleOptions: false
    },
    settings: { required: true, explanation }
  };
}

function quiz({ title, description, minimumScore = 80, questions }) {
  return {
    contentType: 'quiz',
    title,
    contentData: {
      title,
      description,
      minimumScore,
      allowRetake: true,
      maxAttempts: 3,
      randomizeAnswers: false,
      questions
    },
    settings: { required: true }
  };
}

function acknowledgment(title, body) {
  return {
    contentType: 'acknowledgment',
    title,
    contentData: {
      title,
      text: body,
      requireSignature: false
    },
    settings: { required: true }
  };
}

function response(prompt) {
  return {
    contentType: 'response',
    title: 'Reflection',
    contentData: { prompt, responseType: 'textarea' },
    settings: { required: true }
  };
}

function divider() {
  return { contentType: 'divider', title: '', contentData: {}, settings: { required: false } };
}

export const PLATFORM_COURSE_TEMPLATES = [
  {
    slug: 'video_first_microlearning',
    title: 'Video-First Microlearning',
    description:
      'Best for 5–15 minute topics. Hook with video, reinforce with bullets, check understanding, close with a takeaway. The pattern most used for policy refreshers and soft-skills snippets.',
    category: 'skills',
    formatLabel: 'Watch → Read → Check → Remember',
    estimatedMinutes: 12,
    tags: ['microlearning', 'video-first', 'knowledge-check'],
    sortOrder: 10,
    lessons: [
      {
        title: 'Video-First Microlearning (Sample: Clear Email)',
        description: 'Replace the sample topic with yours. Keep the same block order.',
        estimatedMinutes: 12,
        blocks: [
          callout(
            'How to use this template',
            'Replace the sample copy below with your topic. Keep the order: video first, then key points, then a quick check, then a memorable close.',
            'tip'
          ),
          video(
            '1. Hook video (2–4 min)',
            'Upload your own clip in Media Library, then paste its URL here.'
          ),
          text(
            '2. Key points',
            `<p><strong>After the video, learners should walk away with 3–5 crisp points.</strong></p>
<ul>
  <li><strong>Lead with the ask</strong> — put the request or decision in the first two lines.</li>
  <li><strong>One idea per paragraph</strong> — skimmable beats dense.</li>
  <li><strong>Close with next step + owner + date</strong> — ambiguity creates follow-up email chains.</li>
</ul>
<p><em>Edit this list for your topic. Keep bullets short.</em></p>`
          ),
          knowledgeCheck({
            title: '3. Quick check',
            question: 'Where should the main request appear in a workplace email?',
            options: [
              'In the first two lines',
              'After a long personal story',
              'Only in the subject line',
              'In an attached PDF'
            ],
            correctAnswer: 0,
            explanation: 'Busy readers decide whether to act from the opening lines.'
          }),
          callout(
            '4. Takeaway',
            'If someone only has 10 seconds, they should still know what you need and by when.',
            'success'
          )
        ]
      }
    ]
  },
  {
    slug: 'policy_acknowledgment',
    title: 'Policy Acknowledgment',
    description:
      'Proven compliance format: why it matters → policy summary → realistic scenario → scored quiz → formal acknowledgment. Use for handbooks, HIPAA, code of conduct, and device policies.',
    category: 'policy',
    formatLabel: 'Why → Policy → Scenario → Quiz → Sign',
    estimatedMinutes: 20,
    tags: ['compliance', 'acknowledgment', 'policy'],
    sortOrder: 20,
    lessons: [
      {
        title: 'Policy Acknowledgment (Sample: Acceptable Use)',
        description: 'Swap in your policy language and keep the acknowledgment at the end.',
        estimatedMinutes: 20,
        blocks: [
          callout(
            'Why this matters',
            'This training protects clients, coworkers, and the organization. Completing it is required before system access is fully enabled.',
            'warning'
          ),
          text(
            'Policy summary',
            `<h3>Acceptable Use (sample — replace with your policy)</h3>
<p>Company systems, email, and data are for authorized work. You may not:</p>
<ul>
  <li>Share login credentials</li>
  <li>Store confidential client data on personal devices without approval</li>
  <li>Forward protected information to personal email</li>
</ul>
<p><strong>When unsure:</strong> ask your supervisor before acting. “I didn’t know” is not a defense.</p>
<p><em>Tip: attach your full PDF policy in a PDF block below if you have one.</em></p>`
          ),
          text(
            'Real workplace scenario',
            `<p><strong>Scenario:</strong> A coworker texts asking you to email a client roster to their personal Gmail “just for tonight’s shift.”</p>
<p><strong>Best response:</strong> Decline, explain that client lists are protected, and offer an approved alternative (shared drive folder, on-call supervisor).</p>
<p>Edit this scenario to match incidents your team has actually seen.</p>`
          ),
          quiz({
            title: 'Policy check',
            description: 'You need 80% to continue. Retakes allowed.',
            minimumScore: 80,
            questions: [
              {
                question: 'Is it OK to share your login so a coworker can “just finish one form”?',
                type: 'true_false',
                correctAnswer: 'false',
                explanation: 'Credentials are never shared. Use proper coverage handoff instead.',
                remediationHtml: '<p>Re-read the credential section of the policy summary.</p>'
              },
              {
                question: 'A coworker asks for a client roster on personal email. What should you do?',
                type: 'multiple_choice',
                options: [
                  'Decline and use an approved channel',
                  'Send it if they are trustworthy',
                  'Text a screenshot instead',
                  'Post it in a group chat'
                ],
                correctAnswer: 'Decline and use an approved channel',
                explanation: 'Protected data stays in approved systems only.',
                remediationHtml: '<p>Review the scenario block above.</p>'
              }
            ]
          }),
          acknowledgment(
            'I acknowledge this policy',
            'I have read and understand this policy. I agree to follow it and to ask my supervisor when I am unsure.'
          )
        ]
      }
    ]
  },
  {
    slug: 'new_hire_101',
    title: 'New Hire 101',
    description:
      'Onboarding classic: welcome → who we are → how the first weeks work → where to get help → check understanding. Create as a short course with two lessons.',
    category: 'onboarding',
    formatLabel: 'Welcome → Orient → Support → Check',
    estimatedMinutes: 25,
    tags: ['onboarding', 'new-hire', 'orientation'],
    sortOrder: 30,
    lessons: [
      {
        title: 'Welcome & who we are',
        description: 'Tone-setter. Keep it warm and short.',
        estimatedMinutes: 10,
        blocks: [
          video('Welcome from leadership (sample placeholder)'),
          text(
            'Who we are',
            `<p>Welcome to the team. In this lesson you’ll learn:</p>
<ul>
  <li>Our mission in one sentence</li>
  <li>Who you’ll work with in week one</li>
  <li>Where to find schedules, policies, and help</li>
</ul>
<p>Replace this with your agency’s real welcome language.</p>`
          ),
          callout(
            'Your first win',
            'By end of day one: log in, find your supervisor’s contact, and confirm your schedule for the week.',
            'success'
          )
        ]
      },
      {
        title: 'Your first two weeks',
        description: 'Practical orientation.',
        estimatedMinutes: 15,
        blocks: [
          text(
            'Week-one roadmap',
            `<ol>
  <li><strong>Day 1–2:</strong> Accounts, badge/access, shadow a peer</li>
  <li><strong>Day 3–5:</strong> Complete required training + policy acknowledgments</li>
  <li><strong>Week 2:</strong> First supervised client-facing or role-specific work</li>
</ol>
<p>Edit dates and steps for your role track.</p>`
          ),
          text(
            'Where to get help',
            `<ul>
  <li><strong>Supervisor:</strong> day-to-day questions</li>
  <li><strong>HR / Admin:</strong> pay, benefits, systems access</li>
  <li><strong>This platform:</strong> assigned training on your Dashboard → Training tab</li>
</ul>`
          ),
          knowledgeCheck({
            title: 'Orientation check',
            question: 'Where should new hires look for required onboarding training?',
            options: [
              'Dashboard → Training tab',
              'Personal email only',
              'Social media',
              'A coworker’s USB drive'
            ],
            correctAnswer: 0,
            explanation: 'Assigned training lives on the Training tab of the dashboard.'
          })
        ]
      }
    ]
  },
  {
    slug: 'scenario_best_response',
    title: 'Scenario: Choose the Best Response',
    description:
      'Behavioral / soft-skills format used in harassment prevention, de-escalation, and customer service. Context → situation → decision checks → debrief.',
    category: 'skills',
    formatLabel: 'Context → Scenario → Decide → Debrief',
    estimatedMinutes: 18,
    tags: ['scenario', 'soft-skills', 'decision'],
    sortOrder: 40,
    lessons: [
      {
        title: 'Scenario Practice (Sample: Difficult Conversation)',
        description: 'Rewrite the scenario for your workplace.',
        estimatedMinutes: 18,
        blocks: [
          text(
            'Context',
            `<p>You are covering the front desk. A visitor is upset about a scheduling change and raises their voice in the lobby.</p>
<p><strong>Your goals:</strong> keep everyone safe, protect privacy, and resolve or escalate appropriately.</p>`
          ),
          video('Watch a short model (optional placeholder)'),
          knowledgeCheck({
            title: 'Decision 1',
            question: 'What is the best first move?',
            options: [
              'Lower your voice, acknowledge the frustration, and move to a quieter private area if safe',
              'Match their volume so they feel heard',
              'Argue the policy details immediately',
              'Ignore them until they calm down'
            ],
            correctAnswer: 0,
            explanation: 'De-escalate tone, acknowledge emotion, protect privacy.'
          }),
          knowledgeCheck({
            title: 'Decision 2',
            question: 'The visitor demands another client’s appointment details. You should:',
            options: [
              'Refuse and explain privacy limits, then offer what you can share about their own appointment',
              'Share “just enough” to calm them',
              'Let them look at the schedule screen',
              'Post the schedule on the wall'
            ],
            correctAnswer: 0,
            explanation: 'Never disclose another person’s protected information.'
          }),
          callout(
            'Debrief',
            'Name the skill: calm tone + privacy boundary + clear next step. Paste a supervisor tip here for your team.',
            'info'
          ),
          response(
            'In 2–3 sentences, describe how you would handle a similar situation in your role.'
          )
        ]
      }
    ]
  },
  {
    slug: 'safety_briefing',
    title: 'Safety Briefing',
    description:
      'Field and clinic safety pattern: alert → demonstration → do/don’t → quiz → acknowledgment. Keep it under 20 minutes so people actually finish it.',
    category: 'safety',
    formatLabel: 'Alert → Demo → Rules → Quiz → Sign',
    estimatedMinutes: 15,
    tags: ['safety', 'briefing'],
    sortOrder: 50,
    lessons: [
      {
        title: 'Safety Briefing (Sample: Slip / Trip / Lift)',
        description: 'Replace with your site-specific hazards.',
        estimatedMinutes: 15,
        blocks: [
          callout(
            'Safety alert',
            'Most workplace injuries here are preventable: rushed lifts, wet floors, and blocked walkways. This briefing takes ~15 minutes.',
            'warning'
          ),
          video('Demo: safe lift / walkway check (placeholder)'),
          text(
            'Do / Don’t',
            `<table>
  <tr><th>Do</th><th>Don’t</th></tr>
  <tr><td>Check the path before moving equipment</td><td>Carry loads that block your view</td></tr>
  <tr><td>Use a second person for heavy or awkward loads</td><td>Twist while lifting</td></tr>
  <tr><td>Report hazards the same day</td><td>Assume “someone else will handle it”</td></tr>
</table>
<p>Edit the table for your environment (clinic, school, home visits).</p>`
          ),
          quiz({
            title: 'Safety quiz',
            description: 'Passing score 80%.',
            minimumScore: 80,
            questions: [
              {
                question: 'You see a wet floor with no sign. Best action?',
                type: 'multiple_choice',
                options: [
                  'Block/mark the area and report it',
                  'Walk carefully and say nothing',
                  'Wait for facilities tomorrow',
                  'Film it for social media'
                ],
                correctAnswer: 'Block/mark the area and report it',
                explanation: 'Immediate hazard control + report.',
                remediationHtml: '<p>Revisit the Do/Don’t table.</p>'
              },
              {
                question: 'True or false: Twisting while lifting is a common injury pattern.',
                type: 'true_false',
                correctAnswer: 'true',
                explanation: 'Keep the load close and turn with your feet.'
              }
            ]
          }),
          acknowledgment(
            'I understand these safety expectations',
            'I will follow these practices and report hazards promptly.'
          )
        ]
      }
    ]
  },
  {
    slug: 'skills_practice',
    title: 'Skills Practice',
    description:
      'Teach a repeatable skill: objective → demo → step list → learner practice response → self-check quiz. Great for documentation, phone scripts, and clinical workflows.',
    category: 'skills',
    formatLabel: 'Objective → Demo → Steps → Practice → Check',
    estimatedMinutes: 22,
    tags: ['skills', 'practice', 'workflow'],
    sortOrder: 60,
    lessons: [
      {
        title: 'Skills Practice (Sample: Session Note Basics)',
        description: 'Replace with your skill (billing note, intake call, etc.).',
        estimatedMinutes: 22,
        blocks: [
          text(
            'Learning objective',
            `<p>By the end of this lesson you can write a clear, complete session note with: who, what, clinical relevance, and next step.</p>`
          ),
          video('Demo: walk through a good note (placeholder)'),
          text(
            'Steps to follow',
            `<ol>
  <li><strong>Header:</strong> date, duration, participants</li>
  <li><strong>What happened:</strong> observable facts, not assumptions</li>
  <li><strong>Why it matters:</strong> link to goals / plan</li>
  <li><strong>Next step:</strong> who does what by when</li>
</ol>
<p>Paste your agency’s note template language here.</p>`
          ),
          response(
            'Practice: write a 4–6 sentence sample note for a routine check-in (use a fictional client name).'
          ),
          quiz({
            title: 'Self-check',
            description: 'Confirm the structure before you use this in production.',
            minimumScore: 75,
            questions: [
              {
                question: 'Which belongs in a strong note?',
                type: 'multiple_choice',
                options: [
                  'Observable facts + relevance to goals + next step',
                  'Only opinions about the client',
                  'Gossip from the waiting room',
                  'A blank “see above”'
                ],
                correctAnswer: 'Observable facts + relevance to goals + next step',
                explanation: 'Notes should be factual, relevant, and actionable.'
              }
            ]
          })
        ]
      }
    ]
  },
  {
    slug: 'compliance_recert',
    title: 'Annual Compliance Recert',
    description:
      'Recertification pattern: what’s changed → short refresh video → non-negotiables → harder quiz. Designed for yearly HIPAA / safety / ethics renewals.',
    category: 'compliance',
    formatLabel: 'What’s new → Refresh → Rules → Prove it',
    estimatedMinutes: 18,
    tags: ['recert', 'compliance', 'annual'],
    sortOrder: 70,
    lessons: [
      {
        title: 'Annual Recert (Sample: Privacy Refresh)',
        description: 'Update the “what’s changed” callout each year.',
        estimatedMinutes: 18,
        blocks: [
          callout(
            'What’s changed this year',
            'Example: tighter rules on messaging apps and personal-device photos of client materials. Replace with your real change log.',
            'info'
          ),
          video('5-minute privacy refresh (placeholder)'),
          text(
            'Non-negotiables',
            `<ul>
  <li>Minimum necessary access</li>
  <li>No protected data on personal email or SMS</li>
  <li>Report suspected breaches the same day</li>
</ul>`
          ),
          quiz({
            title: 'Recertification quiz',
            description: 'Higher bar (85%). Three attempts.',
            minimumScore: 85,
            questions: [
              {
                question: 'You suspect a privacy incident. When do you report it?',
                type: 'multiple_choice',
                options: [
                  'The same day',
                  'At annual review',
                  'Only if a client complains',
                  'Never — IT will notice'
                ],
                correctAnswer: 'The same day',
                explanation: 'Early reporting limits harm and is required.',
                remediationHtml: '<p>Re-read the non-negotiables list.</p>'
              },
              {
                question: 'True or false: Personal SMS is an approved channel for client PHI.',
                type: 'true_false',
                correctAnswer: 'false',
                explanation: 'Use approved systems only.'
              },
              {
                question: '“Minimum necessary” means:',
                type: 'multiple_choice',
                options: [
                  'Access only what you need to do your job',
                  'Download everything “just in case”',
                  'Share widely for convenience',
                  'Ignore role-based access'
                ],
                correctAnswer: 'Access only what you need to do your job',
                explanation: 'Limit access and disclosure to the minimum needed.'
              }
            ]
          })
        ]
      }
    ]
  }
];
