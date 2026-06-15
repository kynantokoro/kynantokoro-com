import type { Route } from "./+types/tags[.]json";
import { createSanityClient, queries, type SanityEnv } from '../lib/sanity';
import { aggregateTags, type TagEntry } from '../lib/tags';

export async function loader({ context }: Route.LoaderArgs) {
  const env = context?.cloudflare?.env as SanityEnv | undefined;
  const client = createSanityClient(env);
  const raw = (await client.fetch(queries.allEntries)) || [];

  const entries: TagEntry[] = raw.map((e: any) => ({
    slug: e.slug,
    title: e.title,
    date: e.date,
    summary: e.summary,
    tags: e.tags ?? [],
  }));

  const grouped = aggregateTags(entries);

  return new Response(JSON.stringify(grouped, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
    },
  });
}
