import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { rialToToman } from '@bajet/contracts';
import { PaymentsService } from './payments.service';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string): string {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{font-family:system-ui,Tahoma,sans-serif;background:#faf8ff;color:#1a1b23;margin:0;padding:16px;display:flex;justify-content:center}
main{max-width:412px;width:100%;background:#fff;border:1px solid #e0e1f2;border-radius:16px;padding:24px}
.demo{background:#ffddb3;color:#291800;border-radius:8px;padding:8px 12px;font-size:14px;margin-bottom:16px}
h1{font-size:22px;margin:0 0 8px}.amount{font-size:28px;font-weight:600;margin:16px 0}
button{display:block;width:100%;min-height:48px;border-radius:12px;border:0;font-size:16px;margin-top:12px;cursor:pointer}
.pay{background:#3e69e0;color:#fff}.fail{background:#ededf7;color:#1a1b23}.cancel{background:transparent;color:#ba1a1a;border:1px solid #747685}
</style></head><body><main>${body}</main></body></html>`;
}

/**
 * Demo PSP payment page (MOCK gateway). Lets the offline build complete, fail or
 * cancel a bank payment and exercises the real callback path.
 */
@ApiExcludeController()
@Controller('mock-gateway')
export class MockGatewayController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':code/:token')
  show(@Param('code') code: string, @Param('token') token: string, @Res() res: Response): void {
    const p = this.payments.adapter(code).payments.get(token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!p) {
      res.status(404).send(page('درگاه نمایشی', '<h1>تراکنش یافت نشد</h1>'));
      return;
    }
    const toman = new Intl.NumberFormat('fa-IR').format(rialToToman(p.amountRial));
    const action = `/v1/mock-gateway/${esc(code)}/${esc(token)}/complete`;
    res.send(
      page(
        'درگاه پرداخت نمایشی',
        `<div class="demo">درگاه نمایشی — هیچ پولی جابه‌جا نمی‌شود. اطلاعات واقعی کارت وارد نکنید.</div>
<h1>پرداخت با کارت بانکی</h1><div>مبلغ قابل پرداخت</div><div class="amount">${toman} تومان</div>
<form method="post" action="${action}"><input type="hidden" name="action" value="pay"><button class="pay" type="submit">پرداخت موفق</button></form>
<form method="post" action="${action}"><input type="hidden" name="action" value="fail"><button class="fail" type="submit">پرداخت ناموفق</button></form>
<form method="post" action="${action}"><input type="hidden" name="action" value="cancel"><button class="cancel" type="submit">انصراف</button></form>`,
      ),
    );
  }

  @Post(':code/:token/complete')
  complete(@Param('code') code: string, @Param('token') token: string, @Body() body: { action?: string }, @Res() res: Response): void {
    const action = body.action === 'pay' || body.action === 'fail' ? body.action : 'cancel';
    const r = this.payments.adapter(code).complete(token, action);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!r) {
      res.status(404).send(page('درگاه نمایشی', '<h1>تراکنش یافت نشد</h1>'));
      return;
    }
    const inputs = Object.entries(r.fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
    res.send(
      page(
        'بازگشت به فروشگاه',
        `<h1>در حال بازگشت…</h1><form id="f" method="post" action="${esc(r.callbackUrl)}">${inputs}<button class="pay" type="submit">ادامه</button></form>
<script>document.getElementById('f').submit()</script>`,
      ),
    );
  }
}
