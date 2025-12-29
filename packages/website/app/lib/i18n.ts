export type Language = 'en' | 'ja';

export const languages: Language[] = ['en', 'ja'];

export const defaultLanguage: Language = 'en';

export function isValidLanguage(lang: string): lang is Language {
  return languages.includes(lang as Language);
}

export function detectLanguage(acceptLanguage?: string): Language {
  if (!acceptLanguage) return defaultLanguage;
  
  const preferredLanguages = acceptLanguage
    .split(',')
    .map(lang => lang.split(';')[0].toLowerCase())
    .map(lang => lang.split('-')[0]); // en-US -> en
  
  for (const lang of preferredLanguages) {
    if (isValidLanguage(lang)) {
      return lang;
    }
  }
  
  return defaultLanguage;
}

export const translations = {
  en: {},
  ja: {},
};

export function getTranslation(lang: Language, key: string): string {
  const keys = key.split('.');
  let value: any = translations[lang];
  
  for (const k of keys) {
    value = value?.[k];
  }
  
  return value || key;
}