export type TemperatureUnit = 'fahrenheit' | 'celsius';
export type LanguagePreference = 'en' | 'es' | 'fr' | 'de' | 'pt';

export const languageOptions: Array<{ value: LanguagePreference; label: string }> = [
  { value: 'en', label: '🇺🇸 English (US)' },
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'pt', label: '🇵🇹 Português' },
];

export function getTemperatureUnit(value: unknown): TemperatureUnit {
  return value === 'celsius' ? 'celsius' : 'fahrenheit';
}

export function getLanguagePreference(value: unknown): LanguagePreference {
  return value === 'es' || value === 'fr' || value === 'de' || value === 'pt' ? value : 'en';
}

export function setSavedLanguagePreference(language: LanguagePreference) {
  window.dispatchEvent(new CustomEvent('landbaron-language-changed', { detail: language }));
}

export function formatTemperature(fahrenheit: number, unit: TemperatureUnit) {
  const value = unit === 'celsius' ? (fahrenheit - 32) * 5 / 9 : fahrenheit;
  return `${Math.round(value)}°${unit === 'celsius' ? 'C' : 'F'}`;
}
