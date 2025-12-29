import { useState, useEffect } from 'react';
import { useFetcher, useRouteLoaderData } from 'react-router';
import { Button, DialogTrigger, Popover } from 'react-aria-components';

type Theme = 'light' | 'dark' | 'system';

export default function ThemeToggle() {
  const rootData = useRouteLoaderData('root') as { theme: Theme } | undefined;
  const [theme, setThemeState] = useState<Theme>(rootData?.theme || 'system');
  const [isOpen, setIsOpen] = useState(false);
  const fetcher = useFetcher();

  // Sync with server data
  useEffect(() => {
    if (rootData?.theme) {
      setThemeState(rootData.theme);
    }
  }, [rootData?.theme]);

  // Listen for system theme changes when using 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      // System preference changed, update the server
      const formData = new FormData();
      formData.append('theme', 'system');
      formData.append('prefersDark', String(e.matches));
      fetcher.submit(formData, { method: 'post', action: '/api/theme' });
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme, fetcher]);

  const handleThemeChange = (newTheme: Theme) => {
    setThemeState(newTheme);
    setIsOpen(false); // Close popover after selection

    // Send to server with system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const formData = new FormData();
    formData.append('theme', newTheme);
    formData.append('prefersDark', String(prefersDark));
    fetcher.submit(formData, { method: 'post', action: '/api/theme' });
    // After POST, React Router will revalidate and the server will return the resolved theme
  };

  // Icon based on current theme
  const ThemeIcon = () => {
    const iconClass = "w-5 h-5 text-gray-700 dark:text-gray-300";
    if (theme === 'dark') {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      );
    }
    if (theme === 'system') {
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    }
    // light theme
    return (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    );
  };

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        className="focus-invert p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
        aria-label="Toggle theme"
      >
        <ThemeIcon />
      </Button>
      <Popover
        placement="bottom end"
        isNonModal
        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[144px] relative z-50"
      >
        {/* Invisible overlay to capture outside clicks */}
        {isOpen && (
          <div
            className="fixed inset-0 -z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
        )}
        <div className="py-1 flex flex-col relative z-10" role="group" aria-label="Theme options">
          <Button
            autoFocus
            onPress={() => handleThemeChange('light')}
            className={`px-4 py-2 text-sm font-serif flex items-center gap-2 outline-none cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-inset hover:bg-gray-50 dark:hover:bg-gray-700 ${
              theme === 'light' ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Light
          </Button>
          <Button
            onPress={() => handleThemeChange('dark')}
            className={`px-4 py-2 text-sm font-serif flex items-center gap-2 outline-none cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-inset hover:bg-gray-50 dark:hover:bg-gray-700 ${
              theme === 'dark' ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            Dark
          </Button>
          <Button
            onPress={() => handleThemeChange('system')}
            className={`px-4 py-2 text-sm font-serif flex items-center gap-2 outline-none cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-inset hover:bg-gray-50 dark:hover:bg-gray-700 ${
              theme === 'system' ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            System
          </Button>
        </div>
      </Popover>
    </DialogTrigger>
  );
}
