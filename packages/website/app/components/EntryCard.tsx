import { Link, useSearchParams } from 'react-router';
import { useLanguage } from '../contexts/language-context';
import { getEmojiColor } from '../lib/emojiColors';

interface EntryCardProps {
  slug: string;
  week?: number;
  title: {
    en: string;
    ja: string;
  };
  date: string;
  emoji?: number;
  tags: string[];
  contentType: 'weekly-project' | 'blog';
}

export default function EntryCard({ slug, week, title, date, emoji, tags, contentType }: EntryCardProps) {
  const { language } = useLanguage();
  const [searchParams] = useSearchParams();

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
      viewTransition
      className="focus-invert group block py-4 border-b border-gray-200 dark:border-gray-700"
    >
      <div className="flex items-center gap-4">
        {/* Emoji on LEFT side with backdrop */}
        <div
          className="flex-shrink-0 w-16 h-16 flex items-center justify-center rounded-lg p-2"
          style={{
            backgroundColor: `${emojiColor}20`, // 20% opacity
            border: `1px solid ${emojiColor}40` // 40% opacity border
          }}
        >
          <img
            src={`/emojis/Emojis_32x32_${emoji || 1}.png`}
            alt=""
            className="w-full h-full"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>

        {/* Content on RIGHT side */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            {contentType === 'weekly-project' && week && (
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 font-serif">
                Week {week}
              </span>
            )}
          </div>
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
          {tags.length > 0 && (
            <div className="flex gap-2 mt-2">
              {tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-serif transition-opacity duration-200 group-hover:opacity-60"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
