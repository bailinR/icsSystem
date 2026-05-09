import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async list(userId: number, page = 1, pageSize = 10, keyword = '', readStatus = 'all') {
    const trimmedKeyword = keyword.trim();
    const matchedApplications = trimmedKeyword
      ? await this.prisma.application.findMany({
          where: { influencerName: { contains: trimmedKeyword } },
          select: { id: true },
        })
      : [];
    const matchedApplicationIds = matchedApplications.map((application) => application.id);
    const keywordOr: Prisma.NotificationWhereInput[] = trimmedKeyword
      ? [
          { title: { contains: trimmedKeyword } },
          { body: { contains: trimmedKeyword } },
          ...(matchedApplicationIds.length ? [{ applicationId: { in: matchedApplicationIds } }] : []),
        ]
      : [];
    const readWhere: Prisma.NotificationWhereInput =
      readStatus === 'read' ? { isRead: true } : readStatus === 'unread' ? { isRead: false } : {};
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safePageSize = Math.min(100, Math.max(1, Number.isFinite(pageSize) ? pageSize : 10));
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...readWhere,
      ...(keywordOr.length ? { OR: keywordOr } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    const applicationIds = [...new Set(items.map((item) => item.applicationId).filter((id): id is number => Boolean(id)))];
    const applications = applicationIds.length
      ? await this.prisma.application.findMany({
          where: { id: { in: applicationIds } },
          select: { id: true, influencerName: true },
        })
      : [];
    const applicationMap = new Map(applications.map((application) => [application.id, application]));
    return {
      items: items.map((item) => ({
        ...item,
        application: item.applicationId ? applicationMap.get(item.applicationId) || null : null,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
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
