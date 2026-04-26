import { describe, expect, it } from 'vitest';

import { BCRYPT_COST, hashPassword, verifyPassword, WeakPasswordError } from './password.js';

describe('password', () => {
  it('hashPassword produces a bcrypt hash that verifies', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).toContain(`$${BCRYPT_COST}$`);

    await expect(verifyPassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('verifyPassword rejects wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('verifyPassword tolerates malformed hashes without throwing', async () => {
    await expect(verifyPassword('whatever', 'not-a-real-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', '')).resolves.toBe(false);
  });

  it('hashPassword rejects passwords shorter than the minimum length', async () => {
    await expect(hashPassword('short')).rejects.toBeInstanceOf(WeakPasswordError);
  });
});
