import type { Route } from "./+types/home";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { useLanguage } from "../contexts/language-context";
import EntryCard from "../components/EntryCard";
import Header from "../components/Header";
import HomeHeader from "../components/HomeHeader";
import { createSanityClient, queries, type SanityEnv } from '../lib/sanity';

export function meta() {
  const title = "Kynan Tokoro";
  const description = "Building software, making music, hobby game dev. Works in Japanese and English. Based in Tokyo.";
  const url = "https://kynantokoro.com";
  const ogImage = `${url}/og-image.jpg`;

  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: ogImage },
    { property: "og:site_name", content: "Kynan Tokoro" },
    { property: "og:locale", content: "en_US" },
    { property: "og:locale:alternate", content: "ja_JP" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = context?.cloudflare?.env as SanityEnv | undefined;

  const client = createSanityClient(env);
  const sanityEntries = await client.fetch(queries.allEntries);

  // Map Sanity data to expected format
  const entries = sanityEntries.map((entry: any) => ({
    slug: entry.slug,
    metadata: {
      title: entry.title,
      date: entry.date,
      tags: entry.tags || [],
      emoji: entry.emoji || 1,
      imageSeed: entry.imageSeed ?? 0,
      week: entry.week,
    },
    type: entry.entryType,
    hasEn: entry.hasEn,
    hasJa: entry.hasJa,
  }));

  // Generate random hue on each page load (server-side to avoid hydration mismatch)
  const profileHue = Math.floor(Math.random() * 360);

  return { entries, profileHue };
}

// Public cache since theme is managed client-side
export function headers() {
  return {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=3600",
  };
}

type Filter = 'all' | 'weekly-project' | 'blog';

type Entry = {
  slug: string;
  metadata: {
    title: { en: string; ja: string };
    date: string;
    tags: string[];
    emoji: number;
    imageSeed: number;
    week?: number;
  };
  type: 'weekly-project' | 'blog';
  hasEn: boolean;
  hasJa: boolean;
};

export default function Home({ loaderData }: Route.ComponentProps) {
  const { language } = useLanguage();
  const { entries, profileHue } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();

  // Get filter from URL, default to 'all'
  const filterFromUrl = searchParams.get('filter') as Filter | null;
  const [filter, setFilter] = useState<Filter>(
    filterFromUrl && ['all', 'weekly-project', 'blog'].includes(filterFromUrl)
      ? filterFromUrl
      : 'all'
  );

  // Sync filter with URL whenever it changes (including back/forward navigation)
  useEffect(() => {
    const urlFilter = searchParams.get('filter') as Filter | null;
    if (urlFilter && ['all', 'weekly-project', 'blog'].includes(urlFilter)) {
      setFilter(urlFilter);
    } else {
      setFilter('all'); // Reset to 'all' if no filter param
    }
  }, [searchParams]);

  const filteredEntries = entries.filter((entry: Entry) => {
    // Filter by content type (all/weekly-project/blog)
    if (filter === 'all') return true;
    return entry.type === filter;
  });

  const filterLabels = {
    all: { en: 'All', ja: 'すべて' },
    'weekly-project': { en: 'Weekly Project', ja: '週次プロジェクト' },
    blog: { en: 'Blog', ja: 'ブログ' },
  };

  return (
    <div className="min-h-screen">
      <Header />
      <HomeHeader hueRotate={profileHue} />

      {/* Filter */}
      <section className="pb-4 px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            {(['all', 'weekly-project', 'blog'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  // Update URL with filter parameter (replace, not push)
                  if (f === 'all') {
                    setSearchParams({}, { replace: true, preventScrollReset: true });
                  } else {
                    setSearchParams({ filter: f }, { replace: true, preventScrollReset: true });
                  }
                }}
                className={`px-4 py-2 text-sm font-serif rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 ${
                  filter === f
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {filterLabels[f][language as keyof typeof filterLabels[typeof f]]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Entries */}
      <section className="pb-8 px-8">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-0">
            {filteredEntries.length > 0 ? (
              filteredEntries.map((entry: Entry) => (
                <EntryCard
                  key={entry.slug}
                  slug={entry.slug}
                  week={entry.metadata.week}
                  title={entry.metadata.title}
                  date={entry.metadata.date}
                  emoji={entry.metadata.emoji}
                  imageSeed={entry.metadata.imageSeed}
                  tags={entry.metadata.tags || []}
                  contentType={entry.type}
                />
              ))
            ) : (
              <p className="text-gray-600 dark:text-gray-400 font-serif">
                {language === 'ja' ? 'まだ投稿がありません。' : 'No posts yet.'}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
