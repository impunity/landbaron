export type TemperatureUnit = 'fahrenheit' | 'celsius';

export function getTemperatureUnit(value: unknown): TemperatureUnit {
  return value === 'celsius' ? 'celsius' : 'fahrenheit';
}

export function formatTemperature(fahrenheit: number, unit: TemperatureUnit) {
  const value = unit === 'celsius' ? (fahrenheit - 32) * 5 / 9 : fahrenheit;
  return `${Math.round(value)}°${unit === 'celsius' ? 'C' : 'F'}`;
}
