export function libraryQuickLinks(library) {
  const path = String(library.to || '/library');
  return [
    ['handbook', 'Workplace Handbook', path.replace(/\/library$/, '/workplace-handbook'), 'Read your organization’s workplace policies.'],
    ['mine', 'My Files', `${path}?section=mine`, 'Keep your own files and documents together in the Library.'],
    ['favorites', 'Favorites', `${path}?section=favorites`, 'Return to documents you have saved as favorites.'],
    ['guides', 'Handbooks & Guides', `${path}?section=guides`, 'Find policies and practical guides.']
  ].map(([id, label, to, description]) => ({ id: `library_${id}`, label, to, description, kind: 'link', iconUrl: library.iconUrl }));
}

export function flattenExpandedRail(cards, isExpanded, parent = null, depth = 0) {
  return (cards || []).flatMap(card => [
    { ...card, ...(parent ? { nestedUnder: parent } : {}), depth },
    ...(isExpanded(card.id) ? flattenExpandedRail(card.children, isExpanded, card.id, depth + 1) : [])
  ]);
}
