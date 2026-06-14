import { Link, useSearchParams, useRouteLoaderData } from 'react-router';
import { useLanguage } from '../contexts/language-context';
import { getEmojiColor } from '../lib/emojiColors';
import GeneratedKeyImage from './GeneratedKeyImage';
import type { loader as languageLayoutLoader } from '../routes/language-layout';

interface EntryCardProps {
  slug: string;
  title: {
    en: string;
    ja: string;
  };
  date: string;
  emoji?: number;
  imageSeed?: number;
}

export default function EntryCard({ slug, title, date, emoji, imageSeed }: EntryCardProps) {
  const { language } = useLanguage();
  const [searchParams] = useSearchParams();
  const languageLayoutData = useRouteLoaderData<typeof languageLayoutLoader>('routes/language-layout');
  const isMobileUA = languageLayoutData?.isMobileUA ?? false;

  const displayTitle = title[language as keyof typeof title] ||
                        title[language === 'en' ? 'ja' : 'en'];

  // All entries now use the unified /entry route
  const linkPath = `/entry/${slug}`;

  // Preserve current search params in the link
  const search = searchParams.toString();
  const linkWithParams = `/${language}${linkPath}${search ? `?${search}` : ''}`;

  // Get emoji color for backdrop
  const emojiColor = getEmojiColor(emoji || 2);

  return (
    <Link
      to={linkWithParams}
      viewTransition={!isMobileUA}
      prefetch={isMobileUA ? "viewport" : "intent"}
      className="focus-invert group block py-4 border-b border-gray-200 dark:border-gray-700"
    >
      <div className="flex items-center gap-4">
        {/* Generated key image on LEFT side */}
        <GeneratedKeyImage
          seed={imageSeed ?? 0}
          className="flex-shrink-0 w-20 h-20 rounded-lg"
          containerSize={80}
        />

        {/* Content on RIGHT side */}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 font-serif transition-opacity duration-200 group-hover:opacity-60">
            {displayTitle}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-serif mt-1 transition-opacity duration-200 group-hover:opacity-60">
            {new Date(date).toLocaleDateString(language === 'ja' ? 'ja-JP' : 'en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>
    </Link>
  );
}
