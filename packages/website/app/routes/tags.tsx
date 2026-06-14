import type { Route } from "./+types/tags";
import { Link } from "react-router";
import { useLanguage } from "../contexts/language-context";
import Header from "../components/Header";
import { createSanityClient, queries, type SanityEnv } from '../lib/sanity';
import { aggregateTags, type TagEntry } from '../lib/tags';

export function meta() {
  return [
    { title: "Tags · Kynan Tokoro" },
    { name: "description", content: "Browse posts by tag." },
  ];
}

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
  return { grouped: aggregateTags(entries) };
}

export function headers() {
  return { "Cache-Control": "public, max-age=60, stale-while-revalidate=3600" };
}

export default function Tags({ loaderData }: Route.ComponentProps) {
  const { language } = useLanguage();
  const { grouped } = loaderData;
  const tags = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  return (
    <div className="min-h-screen">
      <Header showBackButton />
      <div className="max-w-3xl mx-auto px-8 pb-24">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 font-serif my-8">
          {language === 'ja' ? 'タグ' : 'Tags'}
        </h1>
        {tags.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 font-serif">
            {language === 'ja' ? 'タグがありません。' : 'No tags yet.'}
          </p>
        ) : (
          tags.map((tag) => (
            <section key={tag} className="mb-10">
              <Link
                to={`/${language}?tag=${encodeURIComponent(tag)}`}
                className="text-xl font-semibold text-gray-900 dark:text-gray-100 font-serif hover:opacity-60"
              >
                {tag}{' '}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({grouped[tag].count})
                </span>
              </Link>
              <ul className="mt-3 space-y-2">
                {grouped[tag].entries.map((entry) => {
                  const title =
                    entry.title?.[language as 'en' | 'ja'] || entry.title?.en || entry.title?.ja || 'Untitled';
                  const summary = entry.summary?.[language as 'en' | 'ja'] || '';
                  return (
                    <li key={entry.slug}>
                      <Link
                        to={`/${language}/entry/${entry.slug}`}
                        className="text-gray-800 dark:text-gray-200 font-serif hover:opacity-60"
                      >
                        {title}
                      </Link>
                      {summary && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 font-serif">{summary}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
