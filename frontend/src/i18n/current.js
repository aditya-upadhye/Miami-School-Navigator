// The language currently shown. ProfileProvider keeps it in sync (during render, so it is correct before any child effect runs);
// plain functions that are not React components, such as the API client and the field formatters, read it from here.
let current = 'en';
export const getLang = () => current;
export const setCurrentLang = (lang) => {
  current = lang === 'es' || lang === 'ht' ? lang : 'en';
};
