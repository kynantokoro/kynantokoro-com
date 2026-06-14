import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { TagGroup } from '../../lib/tags';

interface TagEntriesOverlayProps {
  tag: string;
  group: TagGroup;
  language: 'en' | 'ja';
  onClose: () => void;
}

export default function TagEntriesOverlay({ tag, group, language, onClose }: TagEntriesOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(true);
    const prev = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    node?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && node) {
        const focusables = node.querySelectorAll<HTMLElement>(
          'a[href],button,[tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={language === 'ja' ? `タグ: ${tag}` : `Tag: ${tag}`}
        tabIndex={-1}
        className={`relative w-full max-w-lg max-h-[80vh] overflow-auto rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 p-8 outline-none transition duration-200 motion-reduce:transition-none ${
          shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 font-serif">
            {tag}{' '}
            <span className="text-base font-normal text-gray-500 dark:text-gray-400">
              ({group.count})
            </span>
          </h2>
          <button
            onClick={onClose}
            aria-label={language === 'ja' ? '閉じる' : 'Close'}
            className="shrink-0 rounded-full w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        <ul className="space-y-4">
          {group.entries.map((entry) => {
            const title =
              entry.title?.[language] || entry.title?.en || entry.title?.ja || 'Untitled';
            const summary = entry.summary?.[language] || entry.summary?.en || entry.summary?.ja || '';
            return (
              <li key={entry.slug}>
                <Link
                  to={`/${language}/entry/${entry.slug}`}
                  className="text-lg text-gray-900 dark:text-gray-100 font-serif hover:opacity-60 outline-none focus-visible:underline"
                >
                  {title}
                </Link>
                {summary && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-serif mt-1">{summary}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
