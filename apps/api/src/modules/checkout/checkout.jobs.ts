import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { JobsGate } from '../../shared/util/jobs-gate';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { OrdersService } from '../orders/orders.service';
import { WalletService } from '../wallet/wallet.service';
import { CheckoutPaymentsService } from './checkout-payments.service';
import { CheckoutFlowService } from './checkout-flow.service';
import { CheckoutSessionService } from './checkout-session.service';

/** In-process background jobs for the checkout flow (@nestjs/schedule). */
@Injectable()
export class CheckoutJobs {
  private readonly logger = new Logger(CheckoutJobs.name);

  constructor(
    private readonly jobs: JobsGate,
    private readonly orders: OrdersService,
    private readonly payments: CheckoutPaymentsService,
    private readonly flow: CheckoutFlowService,
    private readonly wallet: WalletService,
    private readonly sessions: CheckoutSessionService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** FR-060: every 15 s (requests also expire lazily, E-25). */
  @Interval('order-expiry', 15_000)
  async expiry(): Promise<void> {
    await this.jobs.run('order-expiry', () => this.payments.runExpiry());
  }

  /** BR-BANK-04 (PaymentVerifying) and FR-045 (CancellationRequested) resolution. */
  @Interval('payment-resolution', 15_000)
  async resolution(): Promise<void> {
    await this.jobs.run('payment-resolution', async () => {
      for (const o of await this.orders.byStatus(['PaymentVerifying'])) {
        await this.payments.resolveVerifying(o).catch((e: unknown) => this.logger.error(`verify ${o.id}: ${(e as Error).message}`));
      }
      for (const o of await this.orders.byStatus(['CancellationRequested'])) {
        await this.payments.resolveCancellation(o.id).catch((e: unknown) => this.logger.error(`cancel ${o.id}: ${(e as Error).message}`));
      }
    });
  }

  /** Recovery after a restart: finish stale inquiries; complete orders left in AllocationInProgress. */
  @Interval('checkout-recovery', 30_000)
  async recovery(): Promise<void> {
    await this.jobs.run('checkout-recovery', async () => {
      for (const orderId of await this.wallet.finishStaleInquiries(60_000)) await this.flow.enterSelection(orderId);
      for (const o of await this.orders.byStatus(['CreditInquiryInProgress'])) {
        if (o.updatedAt.getTime() < Date.now() - 120_000) await this.flow.enterSelection(o.id);
      }
      for (const o of await this.orders.byStatus(['AllocationInProgress'])) {
        if (o.updatedAt.getTime() < Date.now() - 60_000) await this.orders.allocateAndComplete(o.id);
      }
    });
  }

  @Interval('checkout-housekeeping', 3_600_000)
  async housekeeping(): Promise<void> {
    await this.jobs.run('checkout-housekeeping', async () => {
      await this.sessions.purgeExpiredSessions();
      await this.idempotency.purgeExpired();
    });
  }
}
