export type SolarRange = 'day' | 'week' | 'month' | 'year';

export function solarToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function shiftSolarDate(value: string, range: SolarRange, direction: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (range === 'day' || range === 'week') {
    date.setUTCDate(day + direction * (range === 'week' ? 7 : 1));
  } else {
    date.setUTCDate(1);
    date.setUTCMonth(month - 1 + direction * (range === 'year' ? 12 : 1));
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

export function solarWindow(value: string, range: SolarRange) {
  const date = new Date(`${value}T00:00:00Z`);
  if (range === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  if (range === 'month' || range === 'year') date.setUTCDate(1);
  if (range === 'year') date.setUTCMonth(0);
  const start = date.toISOString().slice(0, 10);
  return { start, end: shiftSolarDate(start, range, 1), previousStart: shiftSolarDate(start, range, -1) };
}