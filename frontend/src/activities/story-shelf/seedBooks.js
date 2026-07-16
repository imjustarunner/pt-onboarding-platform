/**
 * Seed catalog for StoryShelf PDF books (Jar of Ocean Jewels series).
 *
 * Mobile PDFs (compressed, commit-ready):
 *   frontend/public/branding/activities/story-shelf/books/*-mobile.pdf
 * Full-resolution sources (~347MB) stay local and gitignored as *.pdf.
 * Covers:
 *   frontend/public/branding/activities/story-shelf/covers/
 */

export const SEED_CATEGORIES = [
  { id: 'feelings', displayName: 'Feelings', status: 'coming_soon', displayOrder: 1 },
  { id: 'anxiety', displayName: 'Anxiety', status: 'available', displayOrder: 2 },
  { id: 'self-esteem', displayName: 'Self-Esteem', status: 'coming_soon', displayOrder: 3 },
  { id: 'friendship', displayName: 'Friendship', status: 'coming_soon', displayOrder: 4 },
  { id: 'change', displayName: 'Change', status: 'coming_soon', displayOrder: 5 },
  { id: 'mindfulness', displayName: 'Mindfulness', status: 'coming_soon', displayOrder: 6 },
  { id: 'grief', displayName: 'Grief', status: 'available', displayOrder: 7 },
  { id: 'anger', displayName: 'Anger', status: 'available', displayOrder: 8 },
  { id: 'stress', displayName: 'Stress', status: 'coming_soon', displayOrder: 9 },
  { id: 'hope', displayName: 'Hope', status: 'available', displayOrder: 10 },
  { id: 'courage', displayName: 'Courage', status: 'coming_soon', displayOrder: 11 },
  { id: 'belonging', displayName: 'Belonging', status: 'coming_soon', displayOrder: 12 },
  // Extra series category (not in original 12) — has a published edition
  { id: 'sadness', displayName: 'Sadness', status: 'available', displayOrder: 13 }
];

function book({
  id,
  edition,
  categoryId,
  shortDescription,
  contentNotes,
  providerGuidance,
  shelfPosition = 1
}) {
  const slug = id.replace(/^jar-of-ocean-jewels-/, '');
  return {
    id,
    title: 'The Jar of Ocean Jewels',
    edition,
    shortDescription,
    author: 'Michael Mendez',
    primaryCategoryId: categoryId,
    language: 'en',
    pageCount: 10,
    status: 'published',
    shelfPosition,
    cover: {
      assetUrl: `/branding/activities/story-shelf/covers/jar-of-ocean-jewels-${slug}.png`,
      alternativeText: `Cover for The Jar of Ocean Jewels, ${edition}`
    },
    pdf: {
      fileName: `jar-of-ocean-jewels-${slug}-mobile.pdf`,
      localUrl: `/branding/activities/story-shelf/books/jar-of-ocean-jewels-${slug}-mobile.pdf`,
      // Ghostscript /ebook @ 150dpi — suitable for mobile/session use
      profile: 'mobile',
      sourceFileName: `jar-of-ocean-jewels-${slug}.pdf`,
      version: 1
    },
    contentNotes,
    providerGuidance,
    availability: {
      platforms: ['mobile', 'web'],
      liveSession: true,
      outsideSession: false
    }
  };
}

/** @type {Array<Record<string, unknown>>} */
export const SEED_BOOKS = [
  book({
    id: 'jar-of-ocean-jewels-anxiety',
    edition: 'Anxiety Edition',
    categoryId: 'anxiety',
    shortDescription: 'A story about a boy who works through anxiety.',
    contentNotes: ['Discusses anxiety and worry'],
    providerGuidance: 'Preview before using with a client currently in acute anxiety.'
  }),
  book({
    id: 'jar-of-ocean-jewels-grief',
    edition: 'Grief Edition',
    categoryId: 'grief',
    shortDescription: 'A story about a boy who works through grief.',
    contentNotes: ['Discusses grief and loss', 'Themes of remembrance'],
    providerGuidance: 'Preview before using with a client who has experienced a recent loss.'
  }),
  book({
    id: 'jar-of-ocean-jewels-anger',
    edition: 'Anger Edition',
    categoryId: 'anger',
    shortDescription: 'A story about a boy who works through anger.',
    contentNotes: ['Discusses anger and frustration'],
    providerGuidance: 'Preview before using when anger is a current presenting concern.'
  }),
  book({
    id: 'jar-of-ocean-jewels-hope',
    edition: 'Hope Edition',
    categoryId: 'hope',
    shortDescription: 'A story about a boy who finds hope.',
    contentNotes: ['Themes of hope and resilience'],
    providerGuidance: 'Useful for building optimism and looking forward.'
  }),
  book({
    id: 'jar-of-ocean-jewels-sadness',
    edition: 'Sadness Edition',
    categoryId: 'sadness',
    shortDescription: 'A story about a boy who works through sadness.',
    contentNotes: ['Discusses sadness and low mood'],
    providerGuidance: 'Preview before using when sadness or low mood is present.'
  })
];

export function seedBooksForCategory(categoryId) {
  return SEED_BOOKS.filter((b) => b.primaryCategoryId === categoryId && b.status === 'published');
}

export function resolveCategoryStatus(category) {
  const count = seedBooksForCategory(category.id).length;
  if (count > 0) return { ...category, status: 'available', publishedBookCount: count };
  return { ...category, status: 'coming_soon', publishedBookCount: 0 };
}
