import type { Route } from "./+types/entry-md";
import { createSanityClient, createUrlFor, queries, type SanityEnv } from '../lib/sanity';
import { portableTextToMarkdown, type PtImage } from '../lib/portableTextToMarkdown';

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = context?.cloudflare?.env as SanityEnv | undefined;
  const lang = params.lang === 'ja' ? 'ja' : 'en';

  const client = createSanityClient(env);
  const entry = await client.fetch(queries.entryBySlug, { slug: params.slug });
  if (!entry) {
    throw new Response("Not Found", { status: 404 });
  }

  const urlFor = createUrlFor(client);
  const blocks = entry.content?.[lang] ?? [];
  const body = portableTextToMarkdown(blocks, {
    resolveImageUrl: (img: PtImage) => urlFor(img).url(),
  });

  const title = entry.title?.[lang] || entry.title?.en || entry.title?.ja || 'Untitled';
  const tagsLine = (entry.tags ?? []).join(', ');
  const summary = entry.summary?.[lang] || entry.summary?.en || entry.summary?.ja || '';

  const frontmatter = [
    '---',
    `title: ${title}`,
    `date: ${entry.date}`,
    tagsLine ? `tags: ${tagsLine}` : null,
    summary ? `summary: ${summary}` : null,
    '---',
  ].filter(Boolean).join('\n');

  const markdown = `${frontmatter}\n\n# ${title}\n\n${body}\n`;

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
    },
  });
}
