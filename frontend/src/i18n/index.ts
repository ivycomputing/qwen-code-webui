import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

const resources = {
  en: {
    translation: en,
  },
  'zh-CN': {
    translation: zhCN,
  },
};

/**
 * Language mapping from open-ace to qwen-code-webui
 * open-ace uses: en, zh, ja, ko
 * qwen-code-webui uses: en, zh-CN
 */
const mapOpenAceLanguage = (lang: string): string => {
  switch (lang) {
    case 'zh':
      return 'zh-CN';
    case 'en':
      return 'en';
    case 'ja':
    case 'ko':
      // Fallback to English for unsupported languages
      return 'en';
    default:
      return lang;
  }
};

// Custom language detector for open-ace URL parameter (lang=)
const openAceUrlLanguageDetector = {
  name: 'openAceUrlLanguage',
  lookup(): string | undefined {
    // Check URL parameter 'lang' from open-ace
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    if (langParam) {
      return mapOpenAceLanguage(langParam);
    }
    return undefined;
  },
  cacheUserLanguage(): void {
    // No need to cache back to URL parameter
  },
};

// Custom language detector for open-ace localStorage (when same-origin)
const openAceLocalStorageDetector = {
  name: 'openAceLocalStorage',
  lookup(): string | undefined {
    // Check if running in iframe (embedded in open-ace)
    const isInIframe = window.self !== window.top;
    if (!isInIframe) {
      return undefined;
    }

    // Try to read open-ace language from localStorage (works only when same-origin)
    try {
      const openAceLang = localStorage.getItem('language');
      if (openAceLang) {
        return mapOpenAceLanguage(openAceLang);
      }
    } catch {
      // localStorage might not be accessible when cross-origin
    }
    return undefined;
  },
  cacheUserLanguage(lng: string): void {
    // Only sync if we're in an iframe (embedded in open-ace)
    const isInIframe = window.self !== window.top;
    if (!isInIframe) {
      return;
    }

    // Try to save back to localStorage (works only when same-origin)
    try {
      const reverseMap: Record<string, string> = {
        'zh-CN': 'zh',
        'en': 'en',
      };
      const openAceLang = reverseMap[lng] || lng;
      localStorage.setItem('language', openAceLang);
    } catch {
      // localStorage might not be accessible when cross-origin
    }
  },
};

// Create LanguageDetector instance and add custom detectors
const languageDetector = new LanguageDetector();
languageDetector.addDetector(openAceUrlLanguageDetector);
languageDetector.addDetector(openAceLocalStorageDetector);

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      // Check URL parameter first, then localStorage sync, then standard localStorage, then navigator
      order: ['openAceUrlLanguage', 'openAceLocalStorage', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;