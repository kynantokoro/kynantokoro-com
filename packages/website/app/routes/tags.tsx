import type { Route } from "./+types/tags";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouteLoaderData, useSearchParams } from "react-router";
import { useLanguage } from "../contexts/language-context";
import type { loader as languageLayoutLoader } from "./language-layout";
import { createSanityClient, queries, type SanityEnv } from '../lib/sanity';
import { aggregateTags, type TagEntry } from '../lib/tags';
import { buildBubbleNodes, parseTagLayout, MAP_WIDTH, MAP_HEIGHT, type TagLayout } from '../lib/tagLayout';
import tagLayoutData from '../data/tag-layout.json';

// Lazy so d3 + the map only load when the bubble view is actually shown.
const TagBubbleMap = lazy(() => import('../components/tag-search/TagBubbleMap'));

export function meta() {
  return [
    { title: "Tags · Kynan Tokoro" },
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const languageLayoutData = useRouteLoaderData<typeof languageLayoutLoader>('routes/language-layout');
  const isMobileUA = languageLayoutData?.isMobileUA ?? false;

  const view = searchParams.get('view') === 'list' ? 'list' : 'bubbles';
  // The bubble map is a client-only enhancement; SSR & no-JS get the list.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tags = useMemo(
    () => Object.keys(grouped).sort((a, b) => a.localeCompare(b)),
    [grouped]
  );
  const nodes = useMemo(
    () => buildBubbleNodes(grouped, layout, { width: MAP_WIDTH, height: MAP_HEIGHT }),
    [grouped, layout]
  );

  // Selecting a tag closes the explorer and filters the home feed by that tag.
  const tagHref = (tag: string) => `/${lang}?tag=${encodeURIComponent(tag)}`;
  const goToTag = (tag: string) => navigate(tagHref(tag), { viewTransition: !isMobileUA });

  const showBubbles = mounted && view === 'bubbles';
  const otherView = view === 'bubbles' ? 'list' : 'bubbles';

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-base font-serif font-semibold text-gray-900 dark:text-gray-100">
          {lang === 'ja' ? 'タグ' : 'Tags'}
        </h1>
        <Link
          to={`/${lang}`}
          viewTransition={!isMobileUA}
          aria-label={lang === 'ja' ? '閉じる' : 'Close'}
          className="focus-invert rounded-full w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Link>
      </div>

      {/* Content */}
      <div className="relative flex-1 min-h-0">
        {tags.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-600 dark:text-gray-400 font-serif">
              {lang === 'ja' ? 'タグがありません。' : 'No tags yet.'}
            </p>
          </div>
        ) : showBubbles ? (
          <Suspense fallback={<div className="w-full h-full" />}>
            <TagBubbleMap nodes={nodes} language={lang} onSelect={goToTag} />
          </Suspense>
        ) : (
          <div className="h-full overflow-auto px-6 py-6">
            <ul className="max-w-xl mx-auto divide-y divide-gray-200 dark:divide-gray-800">
              {tags.map((tag) => (
                <li key={tag}>
                  <Link
                    to={tagHref(tag)}
                    viewTransition={!isMobileUA}
                    className="focus-invert flex items-baseline justify-between gap-4 py-3 group"
                  >
                    <span className="text-lg font-serif text-gray-900 dark:text-gray-100 group-hover:opacity-60 transition-opacity">
                      {`#${tag}`}
                    </span>
                    <span className="text-sm font-serif text-gray-500 dark:text-gray-400">
                      {grouped[tag].count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Floating view toggle (bottom-right) */}
        {tags.length > 0 && (
          <Link
            to={`?view=${otherView}`}
            viewTransition={!isMobileUA}
            preventScrollReset
            className="focus-invert absolute bottom-6 right-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 text-sm font-serif hover:opacity-90 transition-opacity"
          >
            {otherView === 'list' ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {lang === 'ja' ? 'リスト表示' : 'List'}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="8" cy="9" r="4" />
                  <circle cx="17" cy="7" r="2.5" />
                  <circle cx="16" cy="16" r="3.5" />
                </svg>
                {lang === 'ja' ? 'バブル表示' : 'Bubbles'}
              </>
            )}
          </Link>
        )}
      </div>
    </div>
  );
}
