import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { normalisePhone, type MessageEventDto, type MessageLogDto, type MessageTemplateDto as TemplateView, type Page } from '@bajet/contracts';
import { AdminAuth } from '../../shared/http/auth-context';
import { setAuditBefore } from '../../shared/http/audit-context';
import { NotificationsService } from './notifications.service';
import { MessageLogQueryDto, MessageTemplateDto, UpdateMessageTemplateDto } from './notifications.dto';

@ApiTags('admin: messages')
@Controller('admin')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('message-events')
  @AdminAuth('messages.read')
  events(): MessageEventDto[] {
    return this.notifications.events();
  }

  @Get('message-templates')
  @AdminAuth('messages.read')
  templates(): Promise<TemplateView[]> {
    return this.notifications.listTemplates();
  }

  @Get('message-templates/:id')
  @AdminAuth('messages.read')
  template(@Param('id') id: string): Promise<TemplateView> {
    return this.notifications.getTemplate(id);
  }

  @Post('message-templates')
  @AdminAuth('messages.manage')
  create(@Body() body: MessageTemplateDto): Promise<TemplateView> {
    return this.notifications.createTemplate(body);
  }

  @Patch('message-templates/:id')
  @AdminAuth('messages.manage')
  async update(@Param('id') id: string, @Body() body: UpdateMessageTemplateDto, @Req() req: Request): Promise<TemplateView> {
    const { before, after } = await this.notifications.updateTemplate(id, body);
    setAuditBefore(req, before, 'MessageTemplate', id);
    return after;
  }

  @Get('message-logs')
  @AdminAuth('messages.read')
  logs(@Query() q: MessageLogQueryDto): Promise<Page<MessageLogDto>> {
    const recipient = q.recipient ? (normalisePhone(q.recipient) ?? q.recipient) : undefined;
    return this.notifications.listLogs({ ...q, recipient });
  }
}
