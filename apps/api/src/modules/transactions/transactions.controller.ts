import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { BankTransactionDetail, BankTransactionListItem, Page, ProviderTransactionListItem } from '@bajet/contracts';
import { notFound } from '../../shared/errors/app-error';
import { AdminAuth } from '../../shared/http/auth-context';
import { PaymentsService } from '../payments/payments.service';
import { WalletService } from '../wallet/wallet.service';
import { BankTxQueryDto, ProviderTxQueryDto } from './transactions.dto';

/** FR-111/112: read-only monitoring of bank and provider transactions. */
@ApiTags('admin: transactions')
@Controller('admin')
export class TransactionsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
  ) {}

  @Get('bank-transactions')
  @AdminAuth('transactions.read')
  bank(@Query() q: BankTxQueryDto): Promise<Page<BankTransactionListItem>> {
    return this.payments.list(q);
  }

  @Get('bank-transactions/:id')
  @AdminAuth('transactions.read')
  bankDetail(@Param('id') id: string): Promise<BankTransactionDetail> {
    return this.payments.detail(id);
  }

  /** `stuck=true`: reservation Reserved/ReleasePending/AllocationPending older than paymentDeadlineAt + 5 min. */
  @Get('provider-transactions')
  @AdminAuth('transactions.read')
  provider(@Query() q: ProviderTxQueryDto): Promise<Page<ProviderTransactionListItem>> {
    return this.wallet.listPtx(q);
  }

  @Get('provider-transactions/:id')
  @AdminAuth('transactions.read')
  async providerDetail(@Param('id') id: string): Promise<ProviderTransactionListItem & { callLog: unknown[] }> {
    const d = await this.wallet.ptxDetail(id);
    if (!d) throw notFound('Provider transaction');
    return d;
  }
}
