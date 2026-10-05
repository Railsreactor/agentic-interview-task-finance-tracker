//
// Minimum password requirements for registration. Length is enforced in the
// Zod schema; this module rejects trivially guessable choices. A breached-
// password service (HIBP k-anonymity) can slot into checkPasswordPolicy later
// without changing callers.

// Top of the classic most-common-passwords lists, pre-filtered to >= 8 chars
// (shorter ones are already rejected by the length rule).
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "qwerty123",
  "iloveyou",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "trustno1",
  "welcome1",
  "admin123",
  "letmein1",
  "whatever",
  "starwars",
  "computer",
  "michelle",
  "jennifer",
  "11111111",
  "aa123456",
  "abc12345",
  "password!",
  "p@ssw0rd",
  "passw0rd",
  "changeme",
]);

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Returns an error message when the password violates policy, null when OK.
 * Length is assumed to be checked by the input schema but is re-verified
 * here so the policy is self-contained.
 */
export function checkPasswordPolicy(
  password: string,
  username?: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "This password is too common — pick something less guessable";
  }
  if (username && password.toLowerCase() === username.toLowerCase()) {
    return "Password must not equal the username";
  }
  return null;
}
