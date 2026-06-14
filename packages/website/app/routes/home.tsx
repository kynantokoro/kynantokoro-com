import type { Route } from "./+types/home";
import { Link } from "react-router";
import { useLanguage } from "../contexts/language-context";
import EntryCard from "../components/EntryCard";
import Header from "../components/Header";
import HomeHeader from "../components/HomeHeader";
import { createSanityClient, queries, type SanityEnv } from '../lib/sanity';
import { type TagEntry } from '../lib/tags';
import { blogLd } from '../lib/jsonLd';

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

  return (
    <div className="min-h-screen">
      <Header />
      <HomeHeader hueRotate={profileHue} />

      {/* Tag Search */}
      <section className="pb-8 px-8">
        <div className="max-w-4xl mx-auto">
          <Link
            to={`/${language}/tags`}
            className="focus-invert inline-flex items-center gap-2 text-sm font-serif text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
            {language === 'ja' ? 'タグサーチ' : 'Tag Search'}
            <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Entries */}
      <section className="pb-8 px-8">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-0">
            {entries.length > 0 ? (
              entries.map((entry: Entry) => (
                <EntryCard
                  key={entry.slug}
                  slug={entry.slug}
                  title={entry.metadata.title}
                  date={entry.metadata.date}
                  emoji={entry.metadata.emoji}
                  imageSeed={entry.metadata.imageSeed}
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
