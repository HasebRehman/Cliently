import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../utils/sanitize.js';
import { sendVerificationEmail, sendInviteEmail } from '../lib/email.js';

describe('Email HTML Sanitization & Injection Prevention', () => {
  it('escapes dangerous HTML characters in user-provided input', () => {
    const maliciousInput = '<script>alert("xss")</script> & " \' >';
    const sanitized = escapeHtml(maliciousInput);

    expect(sanitized).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot; &#039; &gt;'
    );
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('</script>');
  });

  it('sanitizes malicious HTML payloads in organization name and inviter name during invite email composition', async () => {
    const maliciousOrgName = '<b onmouseover=alert("xss")>Evil Corp</b>';
    const maliciousInviter = '<img src=x onerror=alert(1)>';
    const email = 'victim@example.com';
    const token = 'safe_token_123';
    const role = 'MEMBER';

    // Verify escapeHtml transforms these cleanly
    expect(escapeHtml(maliciousOrgName)).toBe(
      '&lt;b onmouseover=alert(&quot;xss&quot;)&gt;Evil Corp&lt;/b&gt;'
    );
    expect(escapeHtml(maliciousInviter)).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );

    // Ensure sendInviteEmail does not throw
    await expect(
      sendInviteEmail(email, token, maliciousOrgName, maliciousInviter, role)
    ).resolves.not.toThrow();
  });

  it('sanitizes malicious first names during email verification email composition', async () => {
    const maliciousName = '<iframe src="javascript:alert(1)"></iframe>';
    const email = 'user@example.com';
    const token = 'verify_token_123';

    expect(escapeHtml(maliciousName)).toBe(
      '&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;&lt;/iframe&gt;'
    );

    await expect(
      sendVerificationEmail(email, token, maliciousName)
    ).resolves.not.toThrow();
  });
});
