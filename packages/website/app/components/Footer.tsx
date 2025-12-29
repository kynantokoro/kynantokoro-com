interface FooterProps {
  className?: string;
}

export default function Footer({ className = '' }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`bg-white dark:bg-gray-900 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400 font-serif">
            © {currentYear} Kynan Tokoro. All rights reserved.
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 font-serif">
            <a
              href="https://github.com/kynantokoro/kynantokoro-com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:opacity-60 transition-opacity duration-200 rounded outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
            >
              View source on GitHub
              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
