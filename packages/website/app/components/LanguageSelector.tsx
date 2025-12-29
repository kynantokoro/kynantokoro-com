import { useState } from 'react';
import { useLanguage } from '../contexts/language-context';
import { type Language } from '../lib/i18n';
import { Button, DialogTrigger, Popover } from 'react-aria-components';

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    setIsOpen(false); // Close popover after selection
  };

  const languageLabel = language === 'en' ? 'EN' : 'JA';

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        className="focus-invert p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
        aria-label="Select language"
      >
        <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
        </svg>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{languageLabel}</span>
      </Button>
      <Popover
        placement="bottom end"
        isNonModal
        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[128px] relative z-50"
      >
        {/* Invisible overlay to capture outside clicks */}
        {isOpen && (
          <div
            className="fixed inset-0 -z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
        )}
        <div className="py-1 flex flex-col relative z-10" role="group" aria-label="Language options">
          <Button
            autoFocus
            onPress={() => handleLanguageChange('en')}
            className={`px-4 py-2 text-sm font-serif outline-none cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-inset hover:bg-gray-50 dark:hover:bg-gray-700 ${
              language === 'en' ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            English
          </Button>
          <Button
            onPress={() => handleLanguageChange('ja')}
            className={`px-4 py-2 text-sm font-serif outline-none cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-inset hover:bg-gray-50 dark:hover:bg-gray-700 ${
              language === 'ja' ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            日本語
          </Button>
        </div>
      </Popover>
    </DialogTrigger>
  );
}
