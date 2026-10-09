/**
 * Frontend Security Validation Utilities
 */

/**
 * Validates and sanitizes a redirect URL to prevent Open Redirect attacks.
 * Strictly permits only internal relative paths (e.g. "/dashboard", "/invoices/123").
 * Rejects protocol-relative URLs ("//evil.com"), scheme exploits ("javascript:", "data:"),
 * Windows path escapes ("/\evil.com"), and absolute URLs ("https://evil.com").
 */
export function validateRedirectUrl(url: string | null | undefined, defaultFallback = '/dashboard'): string {
  if (!url || typeof url !== 'string') {
    return defaultFallback;
  }

  const trimmed = url.trim();

  // Must start with a single slash "/" and not double slash "//" or backslash "/\"
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return defaultFallback;
  }

  // Reject URLs containing control characters or scheme indicators
  if (/[\r\n\t]/.test(trimmed)) {
    return defaultFallback;
  }

  // Reject dangerous schemes or protocol patterns anywhere in string
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return defaultFallback;
  }

  return trimmed;
}

/**
 * Validates external URLs from user data to ensure safe navigation.
 * Permits only http:// and https:// schemes.
 */
export function sanitizeExternalUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}
