import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { BankCallLog, BankGateway, BankTransaction } from './payment.entity';
import { PaymentsService } from './payments.service';
import { MockGatewayController } from './mock-gateway.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BankGateway, BankTransaction, BankCallLog]), AccountingModule, ReconciliationModule],
  controllers: [MockGatewayController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
