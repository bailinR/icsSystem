import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

const safeUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  managerId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  manager: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: safeUser,
      orderBy: { createdAt: 'desc' },
    });
  }

  managers() {
    return this.prisma.user.findMany({
      where: { role: { in: [Role.MANAGER, Role.ADMIN] }, isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateUserDto) {
    if (dto.role === Role.EMPLOYEE && !dto.managerId) {
      throw new BadRequestException('Employee must have a direct manager');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const { password, ...rest } = dto;
    return this.prisma.user.create({
      data: { ...rest, passwordHash },
      select: safeUser,
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    const data: Prisma.UserUpdateInput = {
      email: dto.email,
      name: dto.name,
      role: dto.role,
      isActive: dto.isActive,
      manager: dto.managerId === undefined ? undefined : dto.managerId === null ? { disconnect: true } : { connect: { id: dto.managerId } },
    };
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.update({ where: { id }, data, select: safeUser });
  }
}
