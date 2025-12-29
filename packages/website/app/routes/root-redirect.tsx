import { redirect } from "react-router";
import type { Route } from "./+types/root-redirect";
import { detectLanguage } from "../lib/i18n";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  
  // Check if user has a stored language preference
  const cookies = request.headers.get("Cookie");
  const storedLang = cookies?.match(/lang=([^;]+)/)?.[1];
  
  if (storedLang && (storedLang === 'en' || storedLang === 'ja')) {
    return redirect(`/${storedLang}`);
  }
  
  // Detect language from Accept-Language header
  const acceptLanguage = request.headers.get("Accept-Language");
  const detectedLang = detectLanguage(acceptLanguage || undefined);
  
  return redirect(`/${detectedLang}`);
}