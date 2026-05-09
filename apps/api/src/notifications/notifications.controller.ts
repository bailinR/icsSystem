import { Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('readStatus') readStatus?: string,
  ) {
    return this.notifications.list(user.id, Number(page || 1), Number(pageSize || 10), keyword, readStatus);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.markRead(user.id, id);
  }
}
