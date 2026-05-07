import { Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Matches(/^[^@\s]+$/, { message: 'Account cannot be an email address' })
  email!: string;

  @IsString()
  name!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsInt()
  managerId?: number;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Matches(/^[^@\s]+$/, { message: 'Account cannot be an email address' })
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsInt()
  managerId?: number | null;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
