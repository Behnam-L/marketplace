import { randomUUID } from 'node:crypto';
import { envOptional, envString } from '../../config/env';
import { signRequest } from '../../modules/merchants/merchant-signing';
import { DEMO_MERCHANT_KEY_ID } from '../seeds/demo.seed';

/**
 * Plays the merchant backend: signs `POST /v1/merchant/checkouts` with the demo key
 * and prints the consumer checkout URL.
 *   npm run demo:checkout -- [amountToman] [phone]
 */
async function main(): Promise<void> {
  const amount = Number(process.argv[2] ?? 2_500_000);
  const phone = process.argv[3] ?? '09121234567';
  const api = (envOptional('DEMO_API_URL') ?? `http://127.0.0.1:${envOptional('PORT') ?? '3000'}`).replace(/\/$/, '');
  const secret = envString('DEMO_MERCHANT_SECRET');
  const path = '/v1/merchant/checkouts';
  const body = JSON.stringify({
    orderNumber: `DEMO-${Date.now()}`,
    amount,
    phoneNumber: phone,
    returnUrl: 'https://shop.example.com/checkout/return',
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
      'X-Bajet-Key-Id': DEMO_MERCHANT_KEY_ID,
      'X-Bajet-Timestamp': ts,
      'X-Bajet-Signature': signRequest(secret, ts, 'POST', path, body),
    },
    body,
  });
  const json = (await res.json()) as { checkoutUrl?: string };
  if (!res.ok) {
    console.error(res.status, JSON.stringify(json));
    process.exit(1);
  }
  console.log(`Checkout created for ${phone}, ${amount.toLocaleString('en')} Toman:`);
  console.log(json.checkoutUrl);
}

void main();
