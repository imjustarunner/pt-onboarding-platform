export const contentTemplates = [
  {
    id: 'document-quiz',
    name: 'Document + Quiz',
    description: 'Upload a document at the top, followed by quiz questions',
    structure: [
      { type: 'document', orderIndex: 0 },
      { type: 'quiz', orderIndex: 1 }
    ]
  },
  {
    id: 'video-quiz',
    name: 'Video + Quiz',
    description: 'Embed a video at the top, followed by quiz questions',
    structure: [
      { type: 'video', orderIndex: 0 },
      { type: 'quiz', orderIndex: 1 }
    ]
  },
  {
    id: 'rich-text-quiz',
    name: 'Rich Text + Quiz',
    description: 'Formatted content at the top, followed by quiz questions',
    structure: [
      { type: 'rich-text', orderIndex: 0 },
      { type: 'quiz', orderIndex: 1 }
    ]
  },
  {
    id: 'sequential',
    name: 'Sequential Blocks',
    description: 'Multiple content blocks in sequence',
    structure: [
      { type: 'rich-text', orderIndex: 0 },
      { type: 'video', orderIndex: 1 },
      { type: 'quiz', orderIndex: 2 }
    ]
  },
  {
    id: 'blank',
    name: 'Blank Template',
    description: 'Start from scratch with an empty canvas',
    structure: []
  }
];

export const getTemplateById = (id) => {
  return contentTemplates.find(t => t.id === id);
};

