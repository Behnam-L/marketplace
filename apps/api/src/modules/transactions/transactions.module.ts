import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionsController } from './transactions.controller';

/** Read-only transaction monitoring; owns no tables (uses payments and wallet services). */
@Module({
  imports: [PaymentsModule, WalletModule],
  controllers: [TransactionsController],
})
export class TransactionsModule {}
