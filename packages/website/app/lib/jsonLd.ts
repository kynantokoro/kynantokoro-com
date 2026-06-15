import type { TagEntry } from './tags';

export interface LdContext {
  lang: string;
  siteUrl?: string;
}

function pick(obj: { en?: string; ja?: string } | undefined, lang: string): string {
  if (!obj) return '';
  return (obj as Record<string, string | undefined>)[lang] || obj.en || obj.ja || '';
}

export function blogPostingLd(entry: TagEntry, ctx: LdContext) {
  const siteUrl = ctx.siteUrl ?? 'https://kynantokoro.com';
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: pick(entry.title, ctx.lang),
    description: pick(entry.summary, ctx.lang),
    datePublished: entry.date,
    inLanguage: ctx.lang,
    keywords: (entry.tags ?? []).join(', '),
    url: `${siteUrl}/${ctx.lang}/entry/${entry.slug}`,
    author: { '@type': 'Person', name: 'Kynan Tokoro' },
  };
}

export function blogLd(entries: TagEntry[], ctx: LdContext) {
  const siteUrl = ctx.siteUrl ?? 'https://kynantokoro.com';
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Kynan Tokoro',
    inLanguage: ctx.lang,
    url: `${siteUrl}/${ctx.lang}`,
    blogPost: entries.map((e) => ({
      '@type': 'BlogPosting',
      headline: pick(e.title, ctx.lang),
      datePublished: e.date,
      url: `${siteUrl}/${ctx.lang}/entry/${e.slug}`,
      keywords: (e.tags ?? []).join(', '),
    })),
  };
}
