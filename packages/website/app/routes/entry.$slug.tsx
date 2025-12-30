import type { Route } from "./+types/entry.$slug";
import { Link } from "react-router";
import { useLanguage } from "../contexts/language-context";
import Header from "../components/Header";
import { createSanityClient, queries, type SanityEnv } from '../lib/sanity';
import { getEmojiColor } from '../lib/emojiColors';
import { PortableText } from '@portabletext/react';
import { createPortableTextComponents } from '../components/portable-text/portableTextComponents';
import GeneratedKeyImage from '../components/GeneratedKeyImage';

export function meta({ params, data }: Route.MetaArgs) {
  const title = data?.entry?.metadata?.title?.en;
  const url = `https://kynantokoro.com/en/entry/${params.slug}`;
  const ogImage = "https://kynantokoro.com/og-image.jpg";

  return [
    { title },
    { property: "og:type", content: "article" },
    { property: "og:url", content: url },
    { property: "og:title", content: title },
    { property: "og:image", content: ogImage },
    { property: "og:site_name", content: "Kynan Tokoro" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:image", content: ogImage },
  ];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = context?.cloudflare?.env as SanityEnv | undefined;

  // Get Sanity configuration from env
  const projectId = env?.SANITY_PROJECT_ID;
  const dataset = env?.SANITY_DATASET;

  const client = createSanityClient(env);
  const sanityEntry = await client.fetch(queries.entryBySlug, { slug: params.slug });

  if (!sanityEntry) {
    throw new Response("Not Found", { status: 404 });
  }

  const entry = {
    slug: sanityEntry.slug,
    type: sanityEntry.entryType,
    metadata: {
      title: sanityEntry.title,
      week: sanityEntry.week,
      date: sanityEntry.date,
      tags: sanityEntry.tags || [],
      emoji: sanityEntry.emoji || 1,
      imageSeed: sanityEntry.imageSeed ?? 0,
      enIsTranslated: sanityEntry.enIsTranslated || false,
      jaIsTranslated: sanityEntry.jaIsTranslated || false,
    },
    content: sanityEntry.content,
    hasEn: sanityEntry.hasEn,
    hasJa: sanityEntry.hasJa,
  };

  return { entry, projectId, dataset };
}

export default function EntryPage({ loaderData }: Route.ComponentProps) {
  const { language } = useLanguage();
  const { entry, projectId, dataset } = loaderData;

  const displayTitle = entry.metadata.title?.[language as keyof typeof entry.metadata.title] ||
                        entry.metadata.title?.[language === 'en' ? 'ja' : 'en'] ||
                        'Untitled';

  // Create portable text components with Sanity config from loader
  const portableTextComponents = projectId && dataset
    ? createPortableTextComponents(projectId, dataset)
    : undefined;

  const isWeeklyProject = entry.type === 'weekly-project';

  return (
    <div className="min-h-screen">
      <Header showBackButton />

      <div className="max-w-3xl mx-auto px-8 pb-24">
        {/* Generated key image */}
        <div className="mb-8 flex justify-center">
          <GeneratedKeyImage
            seed={entry.metadata.imageSeed}
            className="w-32 h-32 rounded-2xl"
            containerSize={128}
          />
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-baseline gap-3 mb-2">
            {/* Show week number only for Weekly Project entries */}
            {isWeeklyProject && entry.metadata.week && (
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 font-serif">
                Week {entry.metadata.week}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500 font-serif">
              {new Date(entry.metadata.date).toLocaleDateString(language === 'ja' ? 'ja-JP' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
          <h1 className="text-4xl font-semibold text-gray-900 dark:text-gray-100 font-serif mb-4">
            {displayTitle}
          </h1>
          {entry.metadata.tags && entry.metadata.tags.length > 0 && (
            <div className="flex gap-2">
              {entry.metadata.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded font-serif"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Translation notice */}
        {((language === 'en' && entry.metadata.enIsTranslated) ||
          (language === 'ja' && entry.metadata.jaIsTranslated)) && (
          <div
            role="note"
            className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-400 p-4 mb-8"
          >
            <p className="text-sm text-gray-700 dark:text-gray-300 font-serif">
              {language === 'ja'
                ? '⚠️ この日本語コンテンツは英語から機械翻訳されたものです。'
                : '⚠️ This English content was machine-translated from Japanese.'}
            </p>
          </div>
        )}

        {/* Content */}
        {entry.content[language] && entry.content[language].length > 0 ? (
          <div lang={language} className="max-w-none">
            {portableTextComponents ? (
              <PortableText
                value={entry.content[language]}
                components={portableTextComponents}
              />
            ) : (
              <p className="text-gray-600 dark:text-gray-400 font-serif">
                Unable to render content
              </p>
            )}
          </div>
        ) : (
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-base text-gray-700 dark:text-gray-300 font-serif">
              {language === 'ja'
                ? 'このコンテンツはまだ作成されていません。'
                : 'This content has not been created yet.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
