import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  notify(userId: number, title: string, body: string, applicationId?: number) {
    return this.prisma.notification.create({ data: { userId, title, body, applicationId } });
  }

  async notifyMany(userIds: number[], title: string, body: string, applicationId?: number) {
    const uniqueIds = [...new Set(userIds)].filter(Boolean);
    if (!uniqueIds.length) return;
    await this.prisma.notification.createMany({
      data: uniqueIds.map((userId) => ({ userId, title, body, applicationId })),
    });
  }

  list(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  markRead(userId: number, id: number) {
    return this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
  }

  markApplicationRead(userId: number, applicationId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, applicationId, isRead: false },
      data: { isRead: true },
    });
  }
}
