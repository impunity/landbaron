export function isPlatformAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return Boolean(normalized && (process.env.PLATFORM_ADMIN_EMAILS ?? '')
    .split(',')
    .some((entry) => entry.trim().toLowerCase() === normalized));
}
