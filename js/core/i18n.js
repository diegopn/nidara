import messages from "./translations.json" with { type: "json" };

const DEFAULT_LANGUAGE = "pt-BR";
const SUPPORTED_LANGUAGES = new Set(Object.keys(messages));
let currentLanguage = DEFAULT_LANGUAGE;

export function setLanguage(language) {
  currentLanguage = SUPPORTED_LANGUAGES.has(language) ? language : DEFAULT_LANGUAGE;
  document.documentElement.lang = currentLanguage;

  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  }
  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  }

  document.title = t("documentTitle");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("description"));
  const selector = document.querySelector("#language-switcher");
  if (selector) selector.value = currentLanguage;
  return currentLanguage;
}

export function getLanguage() {
  return currentLanguage;
}

export function t(key, values = {}) {
  const template = messages[currentLanguage]?.[key] || messages[DEFAULT_LANGUAGE]?.[key] || key;
  return template.replace(/\{([\w]+)\}/g, (match, name) => String(values[name] ?? match));
}

export function formatNumber(value) {
  return new Intl.NumberFormat(currentLanguage).format(value);
}

export function pluralMessage(key, count) {
  const category = new Intl.PluralRules(currentLanguage).select(count);
  const messageKey = category === "one" ? key + "One" : key + "Other";
  return t(messageKey, { count: formatNumber(count) });
}

export function basePath() {
  const appScript = document.querySelector('script[type="module"][src]');
  if (appScript) return new URL(appScript.src).pathname.replace(/js\/app\.js$/, "");
  return new URL(document.querySelector('link[rel="canonical"]').href).pathname;
}
