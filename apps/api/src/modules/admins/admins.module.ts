import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminUser, PermissionEntity, Role, RolePermission } from './admin.entity';
import { AdminsService } from './admins.service';
import { RolesService } from './roles.service';
import { AdminsController, RolesController } from './admins.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser, Role, PermissionEntity, RolePermission]), NotificationsModule],
  controllers: [AdminsController, RolesController],
  providers: [AdminsService, RolesService],
  exports: [AdminsService, RolesService],
})
export class AdminsModule {}
