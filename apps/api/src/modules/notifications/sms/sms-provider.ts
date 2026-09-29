/** SMS gateway contract. Real providers implement this; the build ships mocks. */
export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<{ messageId: string }>;
  isHealthy(): boolean;
}

export const SMS_PROVIDERS = Symbol('SMS_PROVIDERS');

export class SmsSendError extends Error {}

/** Messages kept in memory so demo users can read OTPs offline. Never logged. */
export interface InboxMessage {
  to: string;
  text: string;
  provider: string;
  at: string;
}

export class MockSmsProvider implements SmsProvider {
  failing = false;
  private seq = 0;

  constructor(
    readonly name: string,
    private readonly inbox: InboxMessage[],
  ) {}

  send(to: string, text: string): Promise<{ messageId: string }> {
    if (this.failing) return Promise.reject(new SmsSendError(`${this.name} unavailable`));
    this.inbox.push({ to, text, provider: this.name, at: new Date().toISOString() });
    if (this.inbox.length > 500) this.inbox.shift();
    this.seq += 1;
    return Promise.resolve({ messageId: `${this.name}-${Date.now()}-${this.seq}` });
  }

  isHealthy(): boolean {
    return !this.failing;
  }
}
