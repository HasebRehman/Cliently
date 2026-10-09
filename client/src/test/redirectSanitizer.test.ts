import { describe, it, expect } from 'vitest';
import { validateRedirectUrl, sanitizeExternalUrl } from '../lib/security.js';

describe('Open Redirect Prevention and Sanitizer', () => {
  it('allows safe internal relative URLs', () => {
    expect(validateRedirectUrl('/dashboard')).toBe('/dashboard');
    expect(validateRedirectUrl('/clients/123')).toBe('/clients/123');
    expect(validateRedirectUrl('/invoices?status=PAID&page=2')).toBe('/invoices?status=PAID&page=2');
  });

  it('rejects external absolute URLs and defaults to /dashboard', () => {
    expect(validateRedirectUrl('https://evil.com')).toBe('/dashboard');
    expect(validateRedirectUrl('http://attacker.org/phishing')).toBe('/dashboard');
    expect(validateRedirectUrl('ftp://server.com')).toBe('/dashboard');
  });

  it('rejects protocol-relative and backslash bypass attempts', () => {
    expect(validateRedirectUrl('//evil.com')).toBe('/dashboard');
    expect(validateRedirectUrl('///evil.com')).toBe('/dashboard');
    expect(validateRedirectUrl('/\\evil.com')).toBe('/dashboard');
    expect(validateRedirectUrl('\\evil.com')).toBe('/dashboard');
  });

  it('rejects JavaScript and data URIs', () => {
    expect(validateRedirectUrl('javascript:alert(document.cookie)')).toBe('/dashboard');
    expect(validateRedirectUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe('/dashboard');
    expect(validateRedirectUrl('vbscript:msgbox(1)')).toBe('/dashboard');
  });

  it('sanitizes external URLs to only allow http and https', () => {
    expect(sanitizeExternalUrl('https://valid-client.com')).toBe('https://valid-client.com/');
    expect(sanitizeExternalUrl('http://insecure-site.org/docs')).toBe('http://insecure-site.org/docs');
    expect(sanitizeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeExternalUrl('data:image/svg+xml,...')).toBeNull();
    expect(sanitizeExternalUrl('not-a-url')).toBeNull();
  });
});
