import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import Backend from 'i18next-http-backend'

import { resources } from './resources'

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // archie-kitd i18n (I18N-TRACK-SPEC L47): los catálogos EMITIDOS por la conversión.
    resources,
    supportedLngs: ['en-US', 'es-ES'],
    // Sólo la elección EXPLÍCITA del usuario (selector → localStorage) sobreescribe el idioma
    // por defecto del proyecto. La detección del idioma del navegador queda fuera a propósito (spec 2026-09-03 D2).
    detection: { order: ['localStorage'], caches: ['localStorage'] },
    fallbackLng: ['en-US'],
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n

