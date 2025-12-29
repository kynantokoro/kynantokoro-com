import { Link, useSearchParams } from 'react-router';
import { useLanguage } from '../contexts/language-context';
import LanguageSelector from './LanguageSelector';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  showBackButton?: boolean;
}

export default function Header({ showBackButton = false }: HeaderProps) {
  const { language } = useLanguage();
  const [searchParams] = useSearchParams();

  // Preserve search params when going back
  const search = searchParams.toString();
  const backUrl = `/${language}${search ? `?${search}` : ''}`;

  return (
    <header className="w-full py-6 px-8">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        {/* Left side */}
        <div className="flex-1">
          {showBackButton && (
            <Link
              to={backUrl}
              viewTransition
              className="focus-invert inline-flex items-center gap-2 text-base text-gray-700 dark:text-gray-300 hover:opacity-60 transition-opacity duration-200 font-serif"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {language === 'ja' ? '戻る' : 'Back'}
            </Link>
          )}
        </div>

        {/* Right side - Language & Theme */}
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
