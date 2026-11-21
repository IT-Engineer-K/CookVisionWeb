export const VIDEO_BETA_MAX_BYTES = 4_000_000;
export const VIDEO_BETA_MAX_SECONDS = 30;
export const VIDEO_BETA_DAILY_LIMIT = 2;
export const VIDEO_BETA_MAX_STEPS = 12;

export function videoBetaEmail(user: { email?: string; email_confirmed_at?: string } | null): string | null {
  const email = user?.email?.toLowerCase();
  if (!user?.email_confirmed_at || !email || email !== email.trim() ||
      !/^[^@\s]+@ms\.dendai\.ac\.jp$/.test(email)) return null;
  return email;
}
