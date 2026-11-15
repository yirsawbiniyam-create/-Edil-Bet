import React, { createContext, useContext, useEffect, useState } from 'react';

export type AppLanguage = 'am' | 'en';

const LANG_STORAGE_KEY = 'edilbet_lang';

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (next: AppLanguage) => void;
  toggleLang: () => void;
  bi: (am: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'am',
  setLang: () => undefined,
  toggleLang: () => undefined,
  bi: (am) => am,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'en' || saved === 'am') return saved;
    } catch {
      // ignore storage errors
    }
    return 'am';
  });

  const setLang = (next: AppLanguage) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  const toggleLang = () => {
    setLang(lang === 'am' ? 'en' : 'am');
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const bi = (am: string, en: string) => (lang === 'en' ? en : am);

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, bi }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
