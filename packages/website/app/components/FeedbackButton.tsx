import { useLanguage } from '../contexts/language-context';

const FEEDBACK_EMAIL = 'hello@kynantokoro.com';

interface FeedbackButtonProps {
  /** Article title, used to prefill the email subject. */
  title: string;
  /** Article slug, used to build the canonical URL referenced in the email body. */
  slug: string;
}

/**
 * A small "send your thoughts by email" prompt shown at the bottom of an entry.
 * It is a plain mailto: link — pressing it opens the reader's mail client with the
 * subject and a reference to the article prefilled, so they can just write and send.
 */
export default function FeedbackButton({ title, slug }: FeedbackButtonProps) {
  const { language } = useLanguage();

  const pageUrl = `https://kynantokoro.com/${language}/entry/${slug}`;
  const subject = language === 'ja' ? `「${title}」の感想` : `Feedback on "${title}"`;
  // Leading newlines put the cursor above the reference, so the reader writes first.
  const body =
    language === 'ja'
      ? `\n\n----------\n記事: ${title}\n${pageUrl}`
      : `\n\n----------\nArticle: ${title}\n${pageUrl}`;
  const mailtoHref = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-800 text-center">
      <p className="text-base font-serif text-gray-700 dark:text-gray-300 mb-4">
        {language === 'ja'
          ? '読んでいただきありがとうございます。感想をいただけると嬉しいです。'
          : 'Thanks for reading. I’d love to hear what you thought.'}
      </p>
      <a
        href={mailtoHref}
        className="focus-invert inline-flex items-center gap-2 text-sm font-serif text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-5 py-2.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        {language === 'ja' ? 'メールで感想を送る' : 'Send feedback by email'}
      </a>
    </div>
  );
}
