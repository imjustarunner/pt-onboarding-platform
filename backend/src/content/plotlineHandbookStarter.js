export const PLOTLINE_HANDBOOK_STARTER = {
  key: 'workplace-handbook',
  version: 'plotline-1.0.0',
  title: 'Workplace Handbook',
  owner: 'PlotTwistCo',
  minimumTier: 'basic',
  description: 'A guided workplace handbook for your company.',
  adaptationNotes: 'Replace each prompt with your company’s actual policy. Review the whole handbook before publishing it to your team.',
  sections: [
    { slug: 'welcome', title: 'Welcome to {{company}}', paragraphs: ['Use this handbook to find your company’s workplace policies and contacts.'] },
    { slug: 'company-foundations', title: 'How we work', required: true, setupPrompt: 'Describe what your company does, your workplace expectations, and who maintains this handbook.' },
    { slug: 'workplace-contacts', title: 'Where to get help', required: true, setupPrompt: 'List the contacts for workplace questions, concerns, accessibility requests, and urgent issues.' },
    { slug: 'work-hours-and-pay', title: 'Work hours, time records, and pay', required: true, setupPrompt: 'Enter your scheduling, time reporting, pay schedule, and pay correction procedures.' },
    { slug: 'leave-and-benefits', title: 'Time away and benefits', required: true, setupPrompt: 'Describe how to request time away and how to find current eligibility and benefit information.' },
    { slug: 'workplace-conduct', title: 'Respect and conduct', required: true, setupPrompt: 'Add your expectations for conduct, how to report a concern, and how the company follows up.' },
    { slug: 'workplace-safety', title: 'Safety and emergencies', required: true, setupPrompt: 'Add workplace safety contacts, incident reporting, and the emergency procedures for your work locations.' },
    { slug: 'information-and-devices', title: 'Information, equipment, and security', required: true, setupPrompt: 'Describe who can access company information, how to use company equipment, and how to report a security issue.' }
  ]
};
