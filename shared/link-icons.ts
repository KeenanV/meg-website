export const linkIcons = [
  { title: 'LinkedIn', value: 'linkedin' },
  { title: 'Amazon', value: 'amazon' },
  { title: 'Instagram', value: 'instagram' },
  { title: 'Bluesky', value: 'bluesky' },
  { title: 'Home', value: 'home' },
  { title: 'Contact / envelope', value: 'contact' },
  { title: 'Sight On Stress (vertical SOS)', value: 'blog' },
  { title: 'News', value: 'news' },
  { title: 'Book', value: 'book' },
  { title: 'Website / globe', value: 'website' },
  { title: 'Link', value: 'link' },
  { title: 'Custom image', value: 'custom' },
] as const;

export type LinkIconName = typeof linkIcons[number]['value'];
export function linkIconName(value: unknown): LinkIconName {
  return linkIcons.find(icon => icon.value === value)?.value ?? 'link';
}
