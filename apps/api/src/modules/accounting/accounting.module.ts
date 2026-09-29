import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry, LedgerLine } from './ledger.entity';
import { LedgerService } from './ledger.service';

@Module({
  imports: [TypeOrmModule.forFeature([JournalEntry, LedgerLine])],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class AccountingModule {}
