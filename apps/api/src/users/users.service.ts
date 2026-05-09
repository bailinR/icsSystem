import { BadRequestException, Injectable } from '@nestjs/common';
import { ActionType, ApplicationStatus, ApprovalNode, Prisma, Role, TaskStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
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
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async list(page = 1, pageSize = 10, keyword = '') {
    const trimmedKeyword = keyword.trim();
    const normalizedRole = trimmedKeyword.toUpperCase() as Role;
    const roleWhere = Object.values(Role).includes(normalizedRole) ? [{ role: { equals: normalizedRole } }] : [];
    const keywordWhere: Prisma.UserWhereInput | undefined = trimmedKeyword
      ? {
          OR: [
            { name: { contains: trimmedKeyword } },
            { email: { contains: trimmedKeyword } },
            { manager: { name: { contains: trimmedKeyword } } },
            ...roleWhere,
          ],
        }
      : undefined;
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safePageSize = Math.min(100, Math.max(1, Number.isFinite(pageSize) ? pageSize : 10));
    const where: Prisma.UserWhereInput = keywordWhere || {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: safeUser,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: safePage, pageSize: safePageSize };
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
      throw new BadRequestException('外国员工必须选择直属主管');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const { password, ...rest } = dto;
    return this.prisma.user.create({
      data: { ...rest, passwordHash },
      select: safeUser,
    });
  }

  async update(actor: CurrentUser, id: number, dto: UpdateUserDto) {
    const previous = await this.prisma.user.findUnique({ where: { id }, select: { isActive: true } });
    const data: Prisma.UserUpdateInput = {
      email: dto.email,
      name: dto.name,
      role: dto.role,
      isActive: dto.isActive,
      manager: dto.managerId === undefined ? undefined : dto.managerId === null ? { disconnect: true } : { connect: { id: dto.managerId } },
    };
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    const updated = await this.prisma.user.update({ where: { id }, data, select: safeUser });

    if (previous?.isActive && updated.isActive === false) {
      await this.reroutePendingTasks(actor.id, id);
    }
    return updated;
  }

  private async reroutePendingTasks(actorId: number, disabledUserId: number) {
    const disabledUser = await this.prisma.user.findUnique({
      where: { id: disabledUserId },
      select: { id: true, name: true, managerId: true },
    });
    if (!disabledUser) return;

    const pendingTasks = await this.prisma.approvalTask.findMany({
      where: { approverId: disabledUserId, status: TaskStatus.PENDING },
      include: { application: { select: { id: true, status: true } } },
    });
    if (!pendingTasks.length) return;

    for (const task of pendingTasks) {
      if (task.node === ApprovalNode.MANAGER) {
        await this.reroutePendingManagerTask(actorId, disabledUser, task);
      } else {
        await this.reroutePendingFinanceTask(actorId, disabledUser, task);
      }
    }
  }

  private async reroutePendingManagerTask(
    actorId: number,
    disabledUser: { id: number; name: string; managerId: number | null },
    task: { id: number; applicationId: number; round: number; application: { id: number; status: ApplicationStatus } },
  ) {
    if (task.application.status !== ApplicationStatus.PENDING_MANAGER) return;

    const activeManager = await this.findNextActiveManager(disabledUser.managerId);
    if (activeManager) {
      const comment = `流程转接：原主管 ${disabledUser.name} 已停用，审批已转给上级主管 ${activeManager.name}`;
      await this.prisma.$transaction([
        this.prisma.approvalTask.updateMany({
          where: { id: task.id, status: TaskStatus.PENDING },
          data: { status: TaskStatus.CANCELLED, comment },
        }),
        this.prisma.approvalTask.create({
          data: { applicationId: task.applicationId, approverId: activeManager.id, node: ApprovalNode.MANAGER, round: task.round },
        }),
        this.prisma.approvalAction.create({
          data: { applicationId: task.applicationId, actorId, action: ActionType.RESUBMITTED, node: ApprovalNode.MANAGER, round: task.round, comment },
        }),
      ]);
      await this.notifications.notify(activeManager.id, '新的主管审批', `${disabledUser.name} 已停用，审批已自动转给你处理`, task.applicationId);
      return;
    }

    const financeUsers = await this.activeFinanceUsers();
    if (!financeUsers.length) {
      throw new BadRequestException('没有可用财务用户，无法跳过停用主管');
    }
    const financeNames = financeUsers.map((finance) => finance.name).join('、');
    const comment = `流程转接：原主管 ${disabledUser.name} 已停用，且无可用上级主管，审批已转入财务审批（${financeNames}）`;
    await this.prisma.$transaction([
      this.prisma.approvalTask.updateMany({
        where: { id: task.id, status: TaskStatus.PENDING },
        data: { status: TaskStatus.CANCELLED, comment },
      }),
      this.prisma.application.update({
        where: { id: task.applicationId },
        data: { status: ApplicationStatus.PENDING_FINANCE },
      }),
      this.prisma.approvalTask.createMany({
        data: financeUsers.map((finance) => ({
          applicationId: task.applicationId,
          approverId: finance.id,
          node: ApprovalNode.FINANCE,
          round: task.round,
        })),
      }),
      this.prisma.approvalAction.create({
        data: { applicationId: task.applicationId, actorId, action: ActionType.RESUBMITTED, node: ApprovalNode.FINANCE, round: task.round, comment },
      }),
    ]);
    await this.notifications.notifyMany(financeUsers.map((finance) => finance.id), '新的财务审批', '没有可用主管，申请已直接进入财务审批', task.applicationId);
  }

  private async reroutePendingFinanceTask(
    actorId: number,
    disabledUser: { id: number; name: string },
    task: { id: number; applicationId: number; round: number; application: { id: number; status: ApplicationStatus } },
  ) {
    if (task.application.status !== ApplicationStatus.PENDING_FINANCE) return;

    const activePendingFinanceCount = await this.prisma.approvalTask.count({
      where: {
        applicationId: task.applicationId,
        node: ApprovalNode.FINANCE,
        status: TaskStatus.PENDING,
        approverId: { not: disabledUser.id },
        approver: { isActive: true },
      },
    });
    const financeUsers = activePendingFinanceCount ? [] : await this.activeFinanceUsers();
    if (!activePendingFinanceCount && !financeUsers.length) {
      throw new BadRequestException('没有可用财务用户，无法转接财务审批');
    }

    const targetText = activePendingFinanceCount
      ? '其他启用财务审批人继续处理'
      : `已重新分配给启用财务：${financeUsers.map((finance) => finance.name).join('、')}`;
    const comment = `流程转接：原财务审批人 ${disabledUser.name} 已停用，${targetText}`;
    await this.prisma.$transaction([
      this.prisma.approvalTask.updateMany({
        where: { id: task.id, status: TaskStatus.PENDING },
        data: { status: TaskStatus.CANCELLED, comment },
      }),
      ...(financeUsers.length
        ? [
            this.prisma.approvalTask.createMany({
              data: financeUsers.map((finance) => ({
                applicationId: task.applicationId,
                approverId: finance.id,
                node: ApprovalNode.FINANCE,
                round: task.round,
              })),
            }),
          ]
        : []),
      this.prisma.approvalAction.create({
        data: { applicationId: task.applicationId, actorId, action: ActionType.RESUBMITTED, node: ApprovalNode.FINANCE, round: task.round, comment },
      }),
    ]);
    if (financeUsers.length) {
      await this.notifications.notifyMany(financeUsers.map((finance) => finance.id), '新的财务审批', `${disabledUser.name} 已停用，财务审批已重新分配`, task.applicationId);
    }
  }

  private async findNextActiveManager(managerId?: number | null) {
    const visited = new Set<number>();
    let currentId = managerId || undefined;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const manager = await this.prisma.user.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, managerId: true, isActive: true, role: true },
      });
      if (!manager) return null;
      if (manager.isActive && (manager.role === Role.MANAGER || manager.role === Role.ADMIN)) return { id: manager.id, name: manager.name };
      currentId = manager.managerId || undefined;
    }
    return null;
  }

  private activeFinanceUsers() {
    return this.prisma.user.findMany({ where: { role: Role.FINANCE, isActive: true }, select: { id: true, name: true } });
  }
}
