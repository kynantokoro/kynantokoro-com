import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { aggregateTags, type TagEntry } from '../../lib/tags';
import {
  buildBubbleNodes,
  parseTagLayout,
  MAP_WIDTH,
  MAP_HEIGHT,
  type TagLayout,
} from '../../lib/tagLayout';
import { buildTagSearch } from '../../lib/tagFilter';
import tagLayoutData from '../../data/tag-layout.json';

// Lazy so d3 + the bubble map only load when the tag-map mode is shown.
const TagBubbleMap = lazy(() => import('../tag-search/TagBubbleMap'));

export interface SearchItem {
  slug: string;
  title: { en: string; ja: string };
  tags: string[];
}

interface SearchPaletteProps {
  items: SearchItem[];
  language: 'en' | 'ja';
  isMobileUA: boolean;
  onClose: () => void;
}

type Mode = 'text' | 'tagmap';

export default function SearchPalette({ items, language, isMobileUA, onClose }: SearchPaletteProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>('text');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const tagEntries = useMemo<TagEntry[]>(
    () => items.map((i) => ({ slug: i.slug, title: i.title, date: '', tags: i.tags })),
    [items]
  );
  const grouped = useMemo(() => aggregateTags(tagEntries), [tagEntries]);
  const layout = useMemo<TagLayout>(() => {
    try {
      return parseTagLayout(tagLayoutData);
    } catch {
      return { hash: '', generatedAt: '', model: '', clusters: [] };
    }
  }, []);
  const nodes = useMemo(
    () => buildBubbleNodes(grouped, layout, { width: MAP_WIDTH, height: MAP_HEIGHT }),
    [grouped, layout]
  );

  const q = query.trim().toLowerCase();
  const matchedTags = useMemo(
    () =>
      q
        ? Object.keys(grouped)
            .filter((t) => t.toLowerCase().includes(q))
            .sort((a, b) => a.localeCompare(b))
        : [],
    [q, grouped]
  );
  const matchedItems = useMemo(() => {
    if (!q) return items;
    return items.filter((i) => {
      const title = `${i.title.en} ${i.title.ja}`.toLowerCase();
      return title.includes(q) || i.tags.some((t) => t.toLowerCase().includes(q));
    });
  }, [q, items]);
  const mapNodes = useMemo(
    () => (q && mode === 'tagmap' ? nodes.filter((n) => n.tag.toLowerCase().includes(q)) : nodes),
    [q, mode, nodes]
  );

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href],button,input,[tabindex]:not([tabindex="-1"])'
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
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

  const selectTag = (tag: string) => {
    navigate(`/${language}${buildTagSearch(searchParams, { add: tag })}`, {
      viewTransition: !isMobileUA,
    });
    onClose();
  };
  const openEntry = (slug: string) => {
    navigate(`/${language}/entry/${slug}`, { viewTransition: !isMobileUA });
    onClose();
  };

  const titleOf = (i: SearchItem) => i.title[language] || i.title.en || i.title.ja || 'Untitled';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={language === 'ja' ? '検索' : 'Search'}
        className="relative w-[90vw] max-w-3xl h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
      >
        {/* Action bar */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 shrink-0" role="tablist">
            {(['text', 'tagmap'] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-serif rounded-md transition-colors ${
                  mode === m
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {m === 'text'
                  ? language === 'ja' ? 'テキスト' : 'Text'
                  : language === 'ja' ? 'タグマップ' : 'Tag map'}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === 'tagmap'
                  ? language === 'ja' ? 'タグを絞り込み…' : 'Filter tags…'
                  : language === 'ja' ? 'タイトル・タグを検索…' : 'Search title or tag…'
              }
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-serif text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
          <button
            onClick={onClose}
            aria-label={language === 'ja' ? '閉じる' : 'Close'}
            className="focus-invert shrink-0 rounded-full w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0">
          {mode === 'text' ? (
            <div className="h-full overflow-auto p-3">
              {matchedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {matchedTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => selectTag(tag)}
                      className="focus-invert text-xs font-serif text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      {`#${tag}`} <span className="opacity-60">({grouped[tag].count})</span>
                    </button>
                  ))}
                </div>
              )}
              {matchedItems.length > 0 ? (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {matchedItems.map((i) => (
                    <li key={i.slug}>
                      <button
                        onClick={() => openEntry(i.slug)}
                        className="focus-invert w-full text-left py-2.5 px-1 group"
                      >
                        <span className="block text-sm font-serif text-gray-900 dark:text-gray-100 group-hover:opacity-60">
                          {titleOf(i)}
                        </span>
                        {i.tags.length > 0 && (
                          <span className="block mt-0.5 text-xs font-serif text-gray-400">
                            {i.tags.map((t) => `#${t}`).join(' ')}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 font-serif p-4 text-center">
                  {language === 'ja' ? '一致する記事がありません。' : 'No matching posts.'}
                </p>
              )}
            </div>
          ) : (
            <div className="relative h-full">
              <Suspense fallback={<div className="w-full h-full" />}>
                <TagBubbleMap nodes={mapNodes} language={language} onSelect={selectTag} />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
