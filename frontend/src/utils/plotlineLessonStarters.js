export const plotlineLessonStarters = [
  { id: 'blank', label: 'Blank lesson', description: 'Build your own sequence.', blocks: [] },
  {
    id: 'welcome', label: 'First-day welcome', description: 'Introduce the team, the first week, and who to ask for help.',
    blocks: [
      { type: 'text', title: 'Welcome to the team' },
      { type: 'text', title: 'Your first week' },
      { type: 'callout', title: 'Where to get help' }
    ]
  },
  {
    id: 'process', label: 'Teach a process', description: 'Explain when to use a process, walk through it, and add a practice question.',
    blocks: [
      { type: 'text', title: 'When to use this process' },
      { type: 'text', title: 'Walk through the steps' },
      { type: 'knowledge_check', title: 'Try it yourself' }
    ]
  }
];
