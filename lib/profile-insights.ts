export type ProfileGender = 'female' | 'male' | 'non_binary';

const zodiacDates = [
  { name: 'Capricorn', startMonth: 12, startDay: 22 },
  { name: 'Aquarius', startMonth: 1, startDay: 20 },
  { name: 'Pisces', startMonth: 2, startDay: 19 },
  { name: 'Aries', startMonth: 3, startDay: 21 },
  { name: 'Taurus', startMonth: 4, startDay: 20 },
  { name: 'Gemini', startMonth: 5, startDay: 21 },
  { name: 'Cancer', startMonth: 6, startDay: 21 },
  { name: 'Leo', startMonth: 7, startDay: 23 },
  { name: 'Virgo', startMonth: 8, startDay: 23 },
  { name: 'Libra', startMonth: 9, startDay: 23 },
  { name: 'Scorpio', startMonth: 10, startDay: 23 },
  { name: 'Sagittarius', startMonth: 11, startDay: 22 },
];

const lifeTable = {
  female: [[0, 81.06], [10, 71.59], [20, 61.74], [30, 52.08], [40, 42.64], [50, 33.45], [60, 24.73], [70, 16.76], [80, 9.82], [90, 4.80], [100, 2.23], [110, 1.13], [119, 0.58]],
  male: [[0, 75.79], [10, 66.39], [20, 56.69], [30, 47.50], [40, 38.59], [50, 29.90], [60, 21.79], [70, 14.66], [80, 8.50], [90, 4.11], [100, 2.04], [110, 1.13], [119, 0.58]],
} as const;

export function getZodiacSign(birthdate: string) {
  const [, month, day] = birthdate.split('-').map(Number);
  if (!month || !day) return null;
  const date = month * 100 + day;
  if (date >= 1222 || date <= 119) return 'Capricorn';
  for (let index = zodiacDates.length - 1; index > 0; index -= 1) {
    const sign = zodiacDates[index];
    if (date >= sign.startMonth * 100 + sign.startDay) return sign.name;
  }
  return 'Aquarius';
}

export function getHoroscopeSlug(sign: string) {
  return sign.toLowerCase();
}

function getAge(birthdate: string, now: Date) {
  const [year, month, day] = birthdate.split('-').map(Number);
  const dateInYear = (targetYear: number) => new Date(targetYear, month - 1, Math.min(day, new Date(targetYear, month, 0).getDate()));
  const thisYearBirthday = dateInYear(now.getFullYear());
  const hasHadBirthday = now >= thisYearBirthday;
  const previousBirthday = hasHadBirthday ? thisYearBirthday : dateInYear(now.getFullYear() - 1);
  const nextBirthday = hasHadBirthday ? dateInYear(now.getFullYear() + 1) : thisYearBirthday;
  const ageAtBirthday = now.getFullYear() - year - (hasHadBirthday ? 0 : 1);
  const fractionOfYear = (now.getTime() - previousBirthday.getTime()) / (nextBirthday.getTime() - previousBirthday.getTime());
  return Math.max(0, ageAtBirthday + fractionOfYear);
}

function remainingYearsAtAge(age: number, gender: ProfileGender) {
  const ageTables = gender === 'non_binary'
    ? lifeTable.female.map(([tableAge, years], index) => [tableAge, (years + lifeTable.male[index][1]) / 2] as const)
    : lifeTable[gender];
  const boundedAge = Math.min(age, 119);
  for (let index = 1; index < ageTables.length; index += 1) {
    const [upperAge, upperYears] = ageTables[index];
    const [lowerAge, lowerYears] = ageTables[index - 1];
    if (boundedAge <= upperAge) {
      const progress = (boundedAge - lowerAge) / (upperAge - lowerAge);
      return lowerYears + (upperYears - lowerYears) * progress;
    }
  }
  return 0;
}

export function estimateRemainingDays(birthdate: string, gender: ProfileGender, now = new Date()) {
  const age = getAge(birthdate, now);
  return Math.max(0, Math.round(remainingYearsAtAge(age, gender) * 365.2425));
}