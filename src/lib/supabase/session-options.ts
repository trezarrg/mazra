export const sessionCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 400 * 24 * 60 * 60,
  secure: process.env.NODE_ENV === "production",
};
