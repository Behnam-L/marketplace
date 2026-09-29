import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PspSettlementLine, ProviderStatementLine, ReconciliationItem } from './reconciliation.entity';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReconciliationItem, PspSettlementLine, ProviderStatementLine])],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
