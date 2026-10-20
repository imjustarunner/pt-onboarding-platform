// Public program copy transcribed and adapted from the supplied Skill Builders mockups.
// This module has no API or application-state dependencies.
export const SKILL_BUILDERS_BASE = '/skillbuilders';
export const SKILL_BUILDERS_ORIGIN = 'https://www.itsco.health';
export const SKILL_BUILDERS_ENROLLMENT = 'https://app.itsco.health/p/skillbuilders';
export const skillBuildersPages = {
  home: { slug: '', label: 'Home', title: 'Skill Builders | Building Skills for Brighter Futures', description: 'Help children and young learners build interpersonal skills, personal growth, and emotional well-being with the Skill Builders program.' },
  about: { slug: 'about', label: 'About', title: 'About Skill Builders | Stronger Skills. Brighter Futures.', description: 'Discover the mission, vision, and practical approach behind the Skill Builders program.' },
  program: { slug: 'program-overview', label: 'Program Overview', title: 'Program Overview | Skill Builders', description: 'Explore three domains, 17 topics, and an engaging approach to practicing skills for everyday life.' },
  domains: { slug: 'domains', label: 'Domains', title: 'Three Domains. Real-Life Skills. | Skill Builders', description: 'Explore interpersonal skills, personal development, and emotional well-being in the Skill Builders program.' },
  resources: { slug: 'resources', label: 'Resources', title: 'Family & School Resources | Skill Builders', description: 'Download the Skill Builders program guide, explore everyday practice ideas, and find answers to common questions.' },
  contact: { slug: 'contact', label: 'Contact', title: 'Get Started | Skill Builders', description: 'Find a Skill Builders program or connect with the ITSCO team about options for your child or school.' }
};
export const skillBuildersDomains = [
  {
    id: 'interpersonal-skills', name: 'Interpersonal Skills', color: 'yellow', icon: 'puzzle', photo: 'friends',
    summary: 'Build positive relationships, work together, and communicate with confidence.',
    description: 'Develop the ability to interact effectively with others. Children learn to build positive relationships, work collaboratively, resolve conflicts, and understand communication cues, helping them navigate social situations with confidence and empathy.',
    practice: 'Take turns planning a shared activity. Practice listening to each idea, choosing a plan together, and asking for help when you need it.',
    topics: [
      ['Collaboration', 'Working together to achieve common goals.'],
      ['Building Positive Relationships', 'Initiating, developing, and maintaining healthy relationships.'],
      ['Conflict Resolution', 'Managing disagreements constructively.'],
      ['Active Listening and Communication', 'Listening attentively and communicating effectively.'],
      ['Verbal and Nonverbal Cues', 'Recognizing and interpreting communication signals.'],
      ['Problem-Solving', 'Identifying challenges and exploring possible solutions.']
    ]
  },
  {
    id: 'personal-development', name: 'Personal Development', color: 'teal', icon: 'sprout', photo: 'growth',
    summary: 'Discover your strengths, set meaningful goals, and grow a positive sense of self.',
    description: 'Focus on self-improvement and personal growth. Children explore their values, set and work toward goals, build self-esteem, and learn to advocate for themselves, developing a positive self-image and a clear sense of direction.',
    practice: 'Choose one small goal for the week. Name a first step, celebrate the effort, and reflect together on what you learned.',
    topics: [
      ['Gratitude', 'Recognizing and appreciating the good in life.'],
      ['Self-Esteem', 'Building a positive self-image and confidence.'],
      ['Goal Setting and Self Reflection', 'Identifying goals, planning steps, and reflecting on progress.'],
      ['Values Exploration', 'Understanding core values and aligning actions.'],
      ['Self Advocacy', 'Expressing needs, desires, and boundaries effectively.']
    ]
  },
  {
    id: 'emotional-well-being', name: 'Emotional Well-Being', color: 'green', icon: 'heart', photo: 'calm',
    summary: 'Understand emotions, practice coping skills, and meet challenges with resilience.',
    description: 'Focus on understanding and managing emotions. Children learn to identify their feelings, develop coping skills, practice mindfulness, and navigate emotional challenges with resilience and calmness.',
    practice: 'Make room for a daily feelings check-in. Name an emotion, notice how it feels in your body, and choose a calming activity together.',
    topics: [
      ['Thinking Traps', 'Recognizing and challenging unhelpful thought patterns.'],
      ['Emotional Identification', 'Naming and understanding emotions accurately.'],
      ['Emotional Regulation', 'Managing emotions in healthy and constructive ways.'],
      ['Coping Skills', 'Building strategies to handle stress and challenges.'],
      ['Tolerating Frustration/Disappointment', 'Developing resilience when things are hard.'],
      ['Mindful Practices', 'Using mindfulness to stay present and calm.']
    ]
  }
];
export const skillBuildersSteps = [
  ['people', 'Engaging Sessions', 'Interactive activities, discussions, and practice scenarios.'],
  ['sun', 'Skill Development', 'Age-appropriate learning across three key domains.'],
  ['sprout', 'Real-Life Application', 'Practice at school, at home, and in the community.'],
  ['star', 'Continued Growth', 'Keep building confidence, connection, and emotional resilience.']
];
export const skillBuildersFaqs = [
  ['Who is Skill Builders for?', 'Skill Builders is designed for children and young learners. Contact the team to discuss your child’s needs and find out which current programs may be a good fit.'],
  ['What skills does the program cover?', 'The program covers 17 topics across three domains: interpersonal skills, personal development, and emotional well-being. Explore the Program Overview for the full outline.'],
  ['How can I find available programs?', 'Use Find a Program to visit the Skill Builders program listing. The team can help you confirm availability, location, scheduling, and enrollment details.'],
  ['Can families practice these skills at home?', 'Yes. Everyday conversations, shared activities, and time for reflection offer opportunities to practice. The ideas on this page are simple starting points to adapt with your child and their program team.'],
  ['How can a school learn more?', 'Contact the ITSCO team with your school name and a brief description of what you are looking for. The team can discuss options and next steps with you.']
];
export function skillBuildersPath(key = 'home') {
  const page = skillBuildersPages[key];
  return `${SKILL_BUILDERS_BASE}${page.slug ? `/${page.slug}` : ''}`;
}
export function skillBuildersPageForPath(pathname = '') {
  const clean = pathname.replace(/\/$/, '');
  return Object.entries(skillBuildersPages).find(([, page]) =>
    clean === `${SKILL_BUILDERS_BASE}${page.slug ? `/${page.slug}` : ''}`
  )?.[1] || null;
}
