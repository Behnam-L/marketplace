/**
 * External identity service (S-03): phone↔national-ID and national-ID↔DOB matching.
 * The offline build ships a deterministic mock.
 */
export type DobMatch = { match: true; firstName: string; lastName: string } | { match: false };

export interface IdentityVerifier {
  matchPhone(phoneE164: string, nationalId: string): Promise<boolean>;
  matchDob(nationalId: string, dateOfBirth: string): Promise<DobMatch>;
  isHealthy(): boolean;
}

export const IDENTITY_VERIFIER = Symbol('IDENTITY_VERIFIER');

export class IdentityUnavailableError extends Error {}

const FIRST = ['علی', 'مریم', 'رضا', 'زهرا', 'حسین', 'فاطمه', 'محمد', 'سارا', 'امیر', 'نگار'];
const LAST = ['رضایی', 'محمدی', 'حسینی', 'کریمی', 'احمدی', 'موسوی', 'جعفری', 'صادقی', 'رحیمی', 'نوری'];

/**
 * Mock rules: every valid national ID matches every phone and every DOB, except
 * IDs in `mismatchPhoneIds`, DOBs before 1920-01-01 (demo trigger for a mismatch),
 * and whatever tests configure. `down` simulates an outage.
 */
export class MockIdentityVerifier implements IdentityVerifier {
  down = false;
  mismatchPhoneIds = new Set<string>();
  mismatchDobIds = new Set<string>();

  private gate(): void {
    if (this.down) throw new IdentityUnavailableError('identity service unavailable');
  }

  matchPhone(_phone: string, nationalId: string): Promise<boolean> {
    this.gate();
    return Promise.resolve(!this.mismatchPhoneIds.has(nationalId));
  }

  matchDob(nationalId: string, dateOfBirth: string): Promise<DobMatch> {
    this.gate();
    if (this.mismatchDobIds.has(nationalId) || dateOfBirth < '1920-01-01') return Promise.resolve({ match: false });
    const n = [...nationalId].reduce((a, c) => a + Number(c), 0);
    return Promise.resolve({ match: true, firstName: FIRST[n % FIRST.length], lastName: LAST[(n * 7) % LAST.length] });
  }

  isHealthy(): boolean {
    return !this.down;
  }
}
