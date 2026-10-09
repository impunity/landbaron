export const hasAvatarPhoto = (url?: string | null) => Boolean(
  url?.trim()
  && !url.startsWith('data:image/svg+xml')
  && !/^https?:\/\/ui-avatars\.com(?:\/|$)/i.test(url),
);

export function AvatarPhotoBadge({ avatarUrl }: { avatarUrl?: string | null }) {
  if (hasAvatarPhoto(avatarUrl)) return null;

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-white bg-teal-700 text-sm font-bold leading-none text-white shadow-sm"
    >
      +
    </span>
  );
}
