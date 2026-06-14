import type { Route } from "./+types/tags";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useLanguage } from "../contexts/language-context";
import Header from "../components/Header";
import { createSanityClient, queries, type SanityEnv } from '../lib/sanity';
import { aggregateTags, type TagEntry } from '../lib/tags';
import { buildBubbleNodes, parseTagLayout, MAP_WIDTH, MAP_HEIGHT, type TagLayout } from '../lib/tagLayout';
import TagEntriesOverlay from '../components/tag-search/TagEntriesOverlay';
import tagLayoutData from '../data/tag-layout.json';

// Lazy so d3 + the map only load when the bubble view is actually shown.
const TagBubbleMap = lazy(() => import('../components/tag-search/TagBubbleMap'));

export function meta() {
  return [
    { title: "Tag Search · Kynan Tokoro" },
    { name: "description", content: "Explore posts by tag." },
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

  let layout: TagLayout;
  try {
    layout = parseTagLayout(tagLayoutData);
  } catch {
    layout = { hash: '', generatedAt: '', model: '', clusters: [] };
  }

  return { grouped: aggregateTags(entries), layout };
}

export function headers() {
  return { "Cache-Control": "public, max-age=60, stale-while-revalidate=3600" };
}

export default function Tags({ loaderData }: Route.ComponentProps) {
  const { language } = useLanguage();
  const lang = language === 'ja' ? 'ja' : 'en';
  const { grouped, layout } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  const view = searchParams.get('view') === 'list' ? 'list' : 'bubbles';
  // The bubble map is a client-only enhancement; SSR / no-JS gets the list.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const showBubbles = mounted && view === 'bubbles';

  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const tags = useMemo(
    () => Object.keys(grouped).sort((a, b) => a.localeCompare(b)),
    [grouped]
  );
  const nodes = useMemo(
    () => buildBubbleNodes(grouped, layout, { width: MAP_WIDTH, height: MAP_HEIGHT }),
    [grouped, layout]
  );

  const setView = (next: 'bubbles' | 'list') =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'bubbles') p.delete('view');
        else p.set('view', 'list');
        return p;
      },
      { replace: true, preventScrollReset: true }
    );

  const toggleBtn = (key: 'bubbles' | 'list', label: string) => (
    <button
      onClick={() => setView(key)}
      aria-pressed={view === key}
      className={`px-4 py-2 text-sm font-serif rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 ${
        view === key
          ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen">
      <Header showBackButton />
      <div className="max-w-3xl mx-auto px-8 pb-24">
        <div className="flex items-baseline justify-between gap-4 my-8 flex-wrap">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 font-serif">
            {lang === 'ja' ? 'タグサーチ' : 'Tag Search'}
          </h1>
          {tags.length > 0 && (
            <div className="flex gap-2">
              {toggleBtn('bubbles', lang === 'ja' ? 'バブル' : 'Bubbles')}
              {toggleBtn('list', lang === 'ja' ? 'リスト' : 'List')}
            </div>
          )}
        </div>

        {tags.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 font-serif">
            {lang === 'ja' ? 'タグがありません。' : 'No tags yet.'}
          </p>
        ) : showBubbles ? (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-serif mb-3">
              {lang === 'ja'
                ? 'バブルをクリックで記事一覧。ドラッグで移動、ホイールで拡大縮小。'
                : 'Click a bubble for its posts. Drag to pan, scroll to zoom.'}
            </p>
            <Suspense
              fallback={
                <div className="w-full h-[70vh] rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800" />
              }
            >
              <TagBubbleMap nodes={nodes} language={lang} onSelect={setSelectedTag} />
            </Suspense>
          </>
        ) : (
          <div>
            {tags.map((tag) => (
              <section key={tag} className="mb-10">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 font-serif">
                  {`#${tag}`}{' '}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({grouped[tag].count})
                  </span>
                </h2>
                <ul className="mt-3 space-y-2">
                  {grouped[tag].entries.map((entry) => {
                    const title =
                      entry.title?.[lang] || entry.title?.en || entry.title?.ja || 'Untitled';
                    const summary = entry.summary?.[lang] || '';
                    return (
                      <li key={entry.slug}>
                        <Link
                          to={`/${lang}/entry/${entry.slug}`}
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
            ))}
          </div>
        )}
      </div>

      {selectedTag && grouped[selectedTag] && (
        <TagEntriesOverlay
          tag={selectedTag}
          group={grouped[selectedTag]}
          language={lang}
          onClose={() => setSelectedTag(null)}
        />
      )}
    </div>
  );
}
