// Preserve the original text while moving the existing book descriptions to Portable Text.
export function paragraphsToBlocks(text, prefix = 'description') {
  return text.trim().split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => ({
    _type: 'block', _key: `${prefix}-${index}`, style: prefix === 'endorsement' && /^[“"]/.test(paragraph) ? 'blockquote' : 'normal',
    markDefs: [], children: [{ _type: 'span', _key: 'text', text: paragraph, marks: [] }],
  }));
}

export function migratedBookFields(book) {
  if (typeof book.description !== 'string') return {};
  let description = book.description;
  let endorsements;
  // This is the existing book's explicit editorial heading, not a guess at where prose ends.
  const heading = 'Praise for The Social Anxiety Vortex: Why We Get Trapped and How to Break Free';
  if (book.title.startsWith('The Social Anxiety Vortex:')) {
    const split = description.indexOf(heading);
    if (split !== -1) {
      endorsements = paragraphsToBlocks(description.slice(split + heading.length), 'endorsement');
      description = description.slice(0, split);
    }
    if (book.year == null) description = description.replace(/^Coming Soon\s*\n\s*\n/, '');
  }
  return {
    ...(book.descriptionRichText === undefined ? { descriptionRichText: paragraphsToBlocks(description) } : {}),
    ...(endorsements?.length && book.endorsements === undefined ? { endorsements } : {}),
  };
}
