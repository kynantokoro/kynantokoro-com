import { useState } from "react";
import { Button, DialogTrigger, Popover } from "react-aria-components";
import { useShader } from "../contexts/shader-context";
import { useLanguage } from "../contexts/language-context";
import { OFF_LABEL, SHADERS, type ShaderId } from "../lib/shaders";

/**
 * Menu-bar control for picking the interactive shader wallpaper.
 * Mirrors the ThemeToggle popover pattern for a consistent look.
 */
export default function BackgroundToggle() {
  const { shader, setShader } = useShader();
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const lang = language === "ja" ? "ja" : "en";
  const options: { id: ShaderId; label: string }[] = [
    { id: "off", label: OFF_LABEL[lang] },
    ...SHADERS.map((s) => ({ id: s.id as ShaderId, label: lang === "ja" ? s.ja : s.en })),
  ];

  const choose = (id: ShaderId) => {
    setShader(id);
    setIsOpen(false);
  };

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        className="focus-invert p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
        aria-label={lang === "ja" ? "背景" : "Background"}
      >
        <svg
          className="w-5 h-5 text-gray-700 dark:text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </Button>
      <Popover
        placement="bottom end"
        isNonModal
        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[160px] relative z-50"
      >
        {/* Invisible overlay to capture outside clicks */}
        {isOpen && (
          <div
            className="fixed inset-0 -z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
        )}
        <div
          className="py-1 flex flex-col relative z-10"
          role="group"
          aria-label={lang === "ja" ? "背景オプション" : "Background options"}
        >
          {options.map((option, index) => (
            <Button
              key={option.id}
              autoFocus={index === 0}
              onPress={() => choose(option.id)}
              className={`px-4 py-2 text-sm font-serif flex items-center gap-2 outline-none cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-yellow-500 focus-visible:ring-inset hover:bg-gray-50 dark:hover:bg-gray-700 ${
                shader === option.id
                  ? "text-gray-900 dark:text-gray-100 font-medium"
                  : "text-gray-600 dark:text-gray-400"
              }`}
            >
              <span className="w-4 h-4 inline-flex items-center justify-center" aria-hidden="true">
                {shader === option.id ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
              </span>
              {option.label}
            </Button>
          ))}
        </div>
      </Popover>
    </DialogTrigger>
  );
}
