export const MAX_ABOUT_ME_WORDS = 30;
export const MAX_ABOUT_ME_CHARACTERS = 250;
export const countWords = (value: string) => value.trim() ? value.trim().split(/\s+/u).length : 0;

export function validateAboutMe(value: unknown): string | null {
  if (typeof value !== 'string') return 'Enter text for 30 Words About Me.';
  if (value.trim().length > MAX_ABOUT_ME_CHARACTERS || countWords(value) > MAX_ABOUT_ME_WORDS) {
    return '30 Words About Me must be no more than 30 words and 250 characters.';
  }
  return null;
}
