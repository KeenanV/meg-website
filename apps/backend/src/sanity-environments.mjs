// Public identifiers, never credentials. Keep provider permissions separated too.
export const SANITY_PROJECTS = Object.freeze({production: 'ap0mc9ri', staging: '77uvsyo1'});
export function sanityProject(dataset) {
  if (!Object.hasOwn(SANITY_PROJECTS, dataset)) throw new Error('Unknown Sanity environment');
  return SANITY_PROJECTS[dataset];
}
