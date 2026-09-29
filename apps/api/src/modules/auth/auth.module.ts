import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminsModule } from '../admins/admins.module';
import { AdminSession } from './admin-session.entity';
import { AuthRegistry } from './auth-registry';
import { GlobalAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AdminSession]), AdminsModule],
  controllers: [AuthController],
  providers: [AuthRegistry, AuthService, { provide: APP_GUARD, useClass: GlobalAuthGuard }],
  exports: [AuthRegistry, AuthService],
})
export class AuthModule {}
