import { Outlet, useNavigate, useParams, redirect } from "react-router";
import type { Route } from "./+types/language-layout";
import { LanguageProvider } from "../contexts/language-context";
import { isValidLanguage, type Language } from "../lib/i18n";

export function meta({ params }: Route.MetaArgs) {
  const lang = params.lang;
  return [
    { name: "language", content: lang },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const lang = params.lang;

  // Validate language parameter on the server
  if (!lang || !isValidLanguage(lang)) {
    throw redirect('/en');
  }

  // Detect mobile device from User-Agent
  const userAgent = request.headers.get('User-Agent') || '';
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

  return { isMobileUA };
}

export default function LanguageLayout() {
  const params = useParams();
  const navigate = useNavigate();

  const lang = params.lang as Language;
  
  const handleLanguageChange = (newLang: Language) => {
    // Store preference in cookie
    document.cookie = `lang=${newLang}; path=/; max-age=${60 * 60 * 24 * 365}`; // 1 year

    // Save current scroll position
    const scrollY = window.scrollY;

    // Navigate to new language with View Transition
    const currentPath = window.location.pathname.replace(`/${lang}`, '');
    navigate(`/${newLang}${currentPath}`, {
      preventScrollReset: true,
      viewTransition: true
    });

    // Restore scroll position after navigation
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  };
  
  return (
    <LanguageProvider language={lang} onLanguageChange={handleLanguageChange}>
      <Outlet />
    </LanguageProvider>
  );
}