import { Controller, Get, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUser) {
    return this.notifications.list(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.markRead(user.id, id);
  }
}
