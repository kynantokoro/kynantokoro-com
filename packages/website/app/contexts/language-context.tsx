import React, { createContext, useContext } from 'react';
import { type Language } from '../lib/i18n';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

interface LanguageProviderProps {
  children: React.ReactNode;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

export function LanguageProvider({ children, language, onLanguageChange }: LanguageProviderProps) {
  return (
    <LanguageContext.Provider value={{
      language,
      setLanguage: onLanguageChange,
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}