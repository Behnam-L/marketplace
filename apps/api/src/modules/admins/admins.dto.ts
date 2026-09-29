import { ArrayUnique, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  ADMIN_STATUSES,
  PERMISSIONS,
  type CreateAdminRequest,
  type Permission,
  type RoleInput,
  type SetRolePermissionsRequest,
  type UpdateAdminRequest,
} from '@bajet/contracts';
import { IsIranPhone } from '../../shared/http/validators';
import { ListQueryDto } from '../../shared/http/list-query.dto';

export class CreateAdminDto implements CreateAdminRequest {
  @IsString() @MinLength(1) @MaxLength(100) firstName: string;
  @IsString() @MinLength(1) @MaxLength(100) lastName: string;
  @IsIranPhone() phone: string;
  @IsString() @MaxLength(40) roleId: string;
}

export class UpdateAdminDto implements UpdateAdminRequest {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @MaxLength(40) roleId?: string;
  @IsOptional() @IsIn(['Active', 'Inactive']) status?: 'Active' | 'Inactive';
}

export class AdminQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(ADMIN_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(40) roleId?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
}

export class RoleDto implements RoleInput {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsString() @MaxLength(300) description: string;
}

export class UpdateRoleDto implements Partial<RoleInput> {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class SetRolePermissionsDto implements SetRolePermissionsRequest {
  @IsArray() @ArrayUnique() @IsIn(PERMISSIONS, { each: true }) permissionCodes: Permission[];
}
