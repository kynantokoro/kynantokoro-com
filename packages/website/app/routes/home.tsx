import type { Route } from "./+types/home";
import { Link, useSearchParams, useRouteLoaderData } from "react-router";
import { useLanguage } from "../contexts/language-context";
import EntryCard from "../components/EntryCard";
import Header from "../components/Header";
import HomeHeader from "../components/HomeHeader";
import { createSanityClient, queries, type SanityEnv } from '../lib/sanity';
import { type TagEntry } from '../lib/tags';
import { blogLd } from '../lib/jsonLd';
import { getActiveTags, matchesAllTags, buildTagSearch } from '../lib/tagFilter';
import type { loader as languageLayoutLoader } from "./language-layout";

export function meta({ params, data }: Route.MetaArgs) {
  const title = "Kynan Tokoro";
  const description = "Building software, making music, hobby game dev. Works in Japanese and English. Based in Tokyo.";
  const url = "https://kynantokoro.com";
  const ogImage = `${url}/og-image.jpg`;
  const lang = params.lang === 'ja' ? 'ja' : 'en';
  const tagEntries: TagEntry[] = (data?.entries ?? []).map((e: any) => ({
    slug: e.slug,
    title: e.metadata.title,
    date: e.metadata.date,
    summary: e.metadata.summary,
    tags: e.metadata.tags,
  }));

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
    { "script:ld+json": blogLd(tagEntries, { lang }) },
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
      summary: entry.summary,
    },
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

type Entry = {
  slug: string;
  metadata: {
    title: { en: string; ja: string };
    date: string;
    tags: string[];
    emoji: number;
    imageSeed: number;
    summary?: { en?: string; ja?: string };
  };
  hasEn: boolean;
  hasJa: boolean;
};

export default function Home({ loaderData }: Route.ComponentProps) {
  const { language } = useLanguage();
  const { entries, profileHue } = loaderData;
  const [searchParams] = useSearchParams();
  const activeTags = getActiveTags(searchParams);
  const languageLayoutData = useRouteLoaderData<typeof languageLayoutLoader>('routes/language-layout');
  const isMobileUA = languageLayoutData?.isMobileUA ?? false;

  const visibleEntries = entries.filter((e: Entry) => matchesAllTags(e.metadata.tags, activeTags));

  return (
    <div className="min-h-screen">
      <Header />
      <HomeHeader hueRotate={profileHue} />

      {/* Entries */}
      <section className="pb-8 px-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h2 className="text-lg font-serif font-semibold text-gray-900 dark:text-gray-100 shrink-0">
                {language === 'ja' ? '記事' : 'Posts'}
              </h2>
              {activeTags.map((tag) => (
                <Link
                  key={tag}
                  to={`/${language}${buildTagSearch(searchParams, { remove: tag })}`}
                  viewTransition={!isMobileUA}
                  aria-label={language === 'ja' ? `タグ絞り込みを解除: #${tag}` : `Remove tag filter: #${tag}`}
                  className="focus-invert inline-flex items-center gap-1 min-w-0 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-serif text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <span className="truncate">{`#${tag}`}</span>
                  <svg className="w-3.5 h-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Link>
              ))}
            </div>
            <Link
              to={`/${language}/tags`}
              viewTransition={!isMobileUA}
              prefetch={isMobileUA ? "viewport" : "intent"}
              aria-label={language === 'ja' ? 'タグで探す' : 'Browse tags'}
              className="focus-invert inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm font-serif text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M3 5a2 2 0 012-2h5.586a1 1 0 01.707.293l8 8a2 2 0 010 2.828l-5.586 5.586a2 2 0 01-2.828 0l-8-8A1 1 0 013 10.586V5z" />
              </svg>
              <span>{language === 'ja' ? 'タグ' : 'Tags'}</span>
            </Link>
          </div>
          <div className="space-y-0">
            {visibleEntries.length > 0 ? (
              visibleEntries.map((entry: Entry) => (
                <EntryCard
                  key={entry.slug}
                  slug={entry.slug}
                  title={entry.metadata.title}
                  date={entry.metadata.date}
                  emoji={entry.metadata.emoji}
                  imageSeed={entry.metadata.imageSeed}
                  tags={entry.metadata.tags}
                />
              ))
            ) : (
              <p className="text-gray-600 dark:text-gray-300 font-serif py-4">
                {activeTags.length > 0
                  ? (language === 'ja' ? '該当する記事はありません。' : 'No posts match these tags.')
                  : (language === 'ja' ? 'まだ投稿がありません。' : 'No posts yet.')}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
