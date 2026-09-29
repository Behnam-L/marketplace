import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { MerchantOrderResponse, OrderDetail, OrderListItem, Page } from '@bajet/contracts';
import { AdminAuth, CurrentAdmin, CurrentMerchant, MerchantAuth, type AdminPrincipal, type MerchantPrincipal } from '../../shared/http/auth-context';
import { OrdersService } from './orders.service';
import { MerchantOrderQueryDto, OrderQueryDto } from './orders.dto';

@ApiTags('admin: orders')
@Controller('admin/orders')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @AdminAuth('orders.read')
  list(@Query() q: OrderQueryDto): Promise<Page<OrderListItem>> {
    return this.orders.list(q);
  }

  /** In-progress orders render missing data as null ("—" in the UI). */
  @Get(':id')
  @AdminAuth('orders.read')
  detail(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal): Promise<OrderDetail> {
    return this.orders.detail(id, admin.permissions.has('consumers.pii'));
  }
}

@ApiTags('merchant API')
@Controller('merchant/orders')
export class MerchantOrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** FR-003: look up by `orderNumber` (latest attempt). */
  @Get()
  @MerchantAuth()
  byNumber(@Query() q: MerchantOrderQueryDto, @CurrentMerchant() merchant: MerchantPrincipal): Promise<MerchantOrderResponse> {
    return this.orders.merchantView(merchant.merchantId, { orderNumber: q.orderNumber });
  }

  /** FR-003: call this (or rely on webhooks) before fulfilment. Another merchant's order → 404. */
  @Get(':orderId')
  @MerchantAuth()
  byId(@Param('orderId') orderId: string, @CurrentMerchant() merchant: MerchantPrincipal): Promise<MerchantOrderResponse> {
    return this.orders.merchantView(merchant.merchantId, { id: orderId });
  }
}
