import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateUserDto, UpdateUserDto } from './dto';
import { UsersService } from './users.service';

@UseGuards(JwtGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Roles(Role.ADMIN)
  @Get()
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('keyword') keyword?: string) {
    return this.users.list(Number(page || 1), Number(pageSize || 10), keyword);
  }

  @Roles(Role.ADMIN)
  @Get('managers')
  managers() {
    return this.users.managers();
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto);
  }
}
