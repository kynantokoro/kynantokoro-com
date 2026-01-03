import { useState, useEffect } from 'react';
import { Button, DialogTrigger, Popover } from 'react-aria-components';

type Theme = 'light' | 'dark' | 'system';

export default function ThemeToggle() {
  // Read from data-theme attribute immediately (no flash)
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'system';
    const dataTheme = document.documentElement.getAttribute('data-theme');
    return (dataTheme as Theme) || 'system';
  });
  const [isOpen, setIsOpen] = useState(false);

  // Ensure we have the correct theme on mount
  useEffect(() => {
    const dataTheme = document.documentElement.getAttribute('data-theme');
    if (dataTheme) {
      setThemeState(dataTheme as Theme);
    }
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    setThemeState(newTheme);
    setIsOpen(false);

    // Save to localStorage
    localStorage.setItem('theme', newTheme);

    // Apply theme immediately
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = newTheme === 'dark' || (newTheme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);

    // Update data attribute
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Icons controlled by CSS based on html[data-theme] attribute
  const iconClass = "w-5 h-5 text-gray-700 dark:text-gray-300";

  const ThemeIcon = () => (
    <>
      {/* Light icon - shown when data-theme="light" */}
      <svg className={`${iconClass} theme-icon-light`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
      {/* Dark icon - shown when data-theme="dark" */}
      <svg className={`${iconClass} theme-icon-dark`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
      {/* System icon - shown when data-theme="system" */}
      <svg className={`${iconClass} theme-icon-system`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    </>
  );

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
