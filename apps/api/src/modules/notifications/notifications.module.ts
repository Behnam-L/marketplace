import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageLog, MessageTemplate } from './message.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { DemoInboxController } from './demo-inbox.controller';
import { InboxMessage, MockSmsProvider, SMS_PROVIDERS } from './sms/sms-provider';
import { SMS_INBOX } from './notifications.tokens';

@Module({
  imports: [TypeOrmModule.forFeature([MessageTemplate, MessageLog])],
  controllers: [NotificationsController, DemoInboxController],
  providers: [
    { provide: SMS_INBOX, useValue: [] as InboxMessage[] },
    {
      provide: SMS_PROVIDERS,
      inject: [SMS_INBOX],
      useFactory: (inbox: InboxMessage[]) => [
        new MockSmsProvider('mock-sms-primary', inbox),
        new MockSmsProvider('mock-sms-secondary', inbox),
      ],
    },
    NotificationsService,
  ],
  exports: [NotificationsService, SMS_PROVIDERS, SMS_INBOX],
})
export class NotificationsModule {}
