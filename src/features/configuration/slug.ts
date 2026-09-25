/** A town slug suggested from its name: lowercase ASCII words joined by dashes. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}
