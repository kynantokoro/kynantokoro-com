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
    <>
      <header className="w-full py-6 px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Left side */}
          <div className="flex-1">
            {showBackButton && (
              <Link
                to={backUrl}
                viewTransition
                className="focus-invert hidden md:inline-flex items-center gap-2 text-base text-gray-700 dark:text-gray-300 hover:opacity-60 transition-opacity duration-200 font-serif"
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

      {/* Mobile floating back button */}
      {showBackButton && (
        <Link
          to={backUrl}
          viewTransition
          className="md:hidden fixed bottom-8 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-lg border border-gray-200 dark:border-gray-700 hover:opacity-80 transition-opacity duration-200 font-serif"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {language === 'ja' ? '戻る' : 'Back'}
        </Link>
      )}
    </>
  );
}
