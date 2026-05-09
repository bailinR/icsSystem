import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActionType, ApplicationStatus, ApprovalNode, FileCategory, Prisma, Role, TaskStatus } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DecisionDto, RejectDto, SaveApplicationDto } from './dto';

const applicationInclude = {
  applicant: { select: { id: true, name: true, managerId: true } },
  files: true,
  tasks: { include: { approver: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  actions: { include: { actor: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' as const } },
};

const statusGroups: Record<string, ApplicationStatus[]> = {
  all: [
    ApplicationStatus.DRAFT,
    ApplicationStatus.PENDING_MANAGER,
    ApplicationStatus.MANAGER_REJECTED,
    ApplicationStatus.PENDING_FINANCE,
    ApplicationStatus.FINANCE_REJECTED,
    ApplicationStatus.APPROVED,
  ],
  draft: [ApplicationStatus.DRAFT],
  in_progress: [ApplicationStatus.PENDING_MANAGER, ApplicationStatus.PENDING_FINANCE],
  rejected: [ApplicationStatus.MANAGER_REJECTED, ApplicationStatus.FINANCE_REJECTED],
  completed: [ApplicationStatus.APPROVED],
  withdrawn: [ApplicationStatus.WITHDRAWN],
};

function normalizeOriginalName(name: string) {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async list(user: CurrentUser, statusGroup = 'all', page = 1, pageSize = 10, keyword = '') {
    const statusWhere = { status: { in: statusGroups[statusGroup] || statusGroups.all } };
    const trimmedKeyword = keyword.trim();
    const keywordWhere: Prisma.ApplicationWhereInput | undefined = trimmedKeyword
      ? {
          OR: [
            { influencerName: { contains: trimmedKeyword } },
            { contact: { contains: trimmedKeyword } },
            { currency: { contains: trimmedKeyword } },
            { paymentMethod: { contains: trimmedKeyword } },
            { homepage: { contains: trimmedKeyword } },
            { remark: { contains: trimmedKeyword } },
          ],
        }
      : undefined;
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safePageSize = Math.min(100, Math.max(1, Number.isFinite(pageSize) ? pageSize : 10));
    const pagination = { skip: (safePage - 1) * safePageSize, take: safePageSize };
    let where: Prisma.ApplicationWhereInput;

    if (user.role === Role.ADMIN) {
      where = keywordWhere ? { AND: [statusWhere, keywordWhere] } : statusWhere;
    } else {
      const ccUsers = await this.ccUserIds();
      const visibilityWhere: Prisma.ApplicationWhereInput =
        user.role === Role.CC && ccUsers.includes(user.id)
          ? { status: { not: ApplicationStatus.DRAFT } }
          : { applicantId: user.id };
      where = { AND: [visibilityWhere, statusWhere, ...(keywordWhere ? [keywordWhere] : [])] };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({ where, include: applicationInclude, orderBy: { updatedAt: 'desc' }, ...pagination }),
      this.prisma.application.count({ where }),
    ]);
    return { items, total, page: safePage, pageSize: safePageSize };
  }

  async todo(user: CurrentUser, page = 1, pageSize = 10, keyword = '') {
    const trimmedKeyword = keyword.trim();
    const keywordWhere: Prisma.ApprovalTaskWhereInput | undefined = trimmedKeyword
      ? {
          application: {
            OR: [
              { influencerName: { contains: trimmedKeyword } },
              { contact: { contains: trimmedKeyword } },
              { currency: { contains: trimmedKeyword } },
              { paymentMethod: { contains: trimmedKeyword } },
              { homepage: { contains: trimmedKeyword } },
              { remark: { contains: trimmedKeyword } },
              { applicant: { name: { contains: trimmedKeyword } } },
            ],
          },
        }
      : undefined;
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safePageSize = Math.min(100, Math.max(1, Number.isFinite(pageSize) ? pageSize : 10));
    const where: Prisma.ApprovalTaskWhereInput = {
      approverId: user.id,
      status: TaskStatus.PENDING,
      ...(keywordWhere || {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.approvalTask.findMany({
        where,
        include: { application: { include: applicationInclude } },
        orderBy: { createdAt: 'asc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.approvalTask.count({ where }),
    ]);
    return { items, total, page: safePage, pageSize: safePageSize };
  }

  async create(user: CurrentUser, dto: SaveApplicationDto) {
    const creatorRoles: Role[] = [Role.EMPLOYEE, Role.MANAGER, Role.ADMIN];
    if (!creatorRoles.includes(user.role as Role)) {
      throw new ForbiddenException('Only employees, managers, and admins can create applications');
    }
    return this.prisma.application.create({
      data: {
        applicantId: user.id,
        ...this.toData(dto),
        actions: { create: { actorId: user.id, action: ActionType.CREATED, round: 0 } },
      },
      include: applicationInclude,
    });
  }

  async update(user: CurrentUser, id: number, dto: SaveApplicationDto) {
    const app = await this.findVisible(user, id);
    if (app.applicantId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException();
    const editableStatuses: ApplicationStatus[] = [ApplicationStatus.DRAFT, ApplicationStatus.MANAGER_REJECTED, ApplicationStatus.FINANCE_REJECTED];
    if (!editableStatuses.includes(app.status)) {
      throw new BadRequestException('Only draft or rejected applications can be edited');
    }
    return this.prisma.application.update({ where: { id }, data: this.toData(dto), include: applicationInclude });
  }

  async remove(user: CurrentUser, id: number) {
    const app = await this.findVisible(user, id);
    if (app.applicantId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException();
    if (app.status !== ApplicationStatus.DRAFT) {
      throw new BadRequestException('Only draft applications can be deleted');
    }
    await this.prisma.application.delete({ where: { id } });
    return { success: true };
  }

  detail(user: CurrentUser, id: number) {
    return this.findVisible(user, id);
  }

  async submit(user: CurrentUser, id: number) {
    const app = await this.findVisible(user, id);
    if (app.applicantId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException();

    const applicant = await this.prisma.user.findUnique({ where: { id: app.applicantId }, select: { managerId: true } });
    if (!applicant) throw new NotFoundException();
    const activeManager = await this.findNextActiveManager(applicant.managerId);
    const financeUsers = activeManager ? [] : await this.activeFinanceUsers();
    if (!activeManager && !financeUsers.length) throw new BadRequestException('没有可用主管或财务审批人');

    const submittableStatuses: ApplicationStatus[] = [ApplicationStatus.DRAFT, ApplicationStatus.MANAGER_REJECTED, ApplicationStatus.FINANCE_REJECTED];
    let didSubmit = false;
    const updated = await this.prisma.$transaction(async (tx) => {
      const nextStatus = activeManager ? ApplicationStatus.PENDING_MANAGER : ApplicationStatus.PENDING_FINANCE;
      const claimed = await tx.application.updateMany({
        where: { id, status: { in: submittableStatuses } },
        data: { status: nextStatus, approvalRound: { increment: 1 } },
      });

      if (!claimed.count) {
        const current = await tx.application.findUnique({ where: { id }, include: applicationInclude });
        if (!current) throw new NotFoundException();
        const alreadySubmitting: ApplicationStatus[] = [ApplicationStatus.PENDING_MANAGER, ApplicationStatus.PENDING_FINANCE];
        if (alreadySubmitting.includes(current.status)) return current;
        throw new BadRequestException('Application cannot be submitted in current status');
      }

      didSubmit = true;
      const submitted = await tx.application.findUnique({ where: { id }, select: { approvalRound: true } });
      if (!submitted) throw new NotFoundException();
      const round = submitted.approvalRound;

      await tx.approvalTask.updateMany({
        where: { applicationId: id, status: TaskStatus.PENDING },
        data: { status: TaskStatus.CANCELLED },
      });
      if (activeManager) {
        await tx.approvalTask.create({
          data: { applicationId: id, approverId: activeManager.id, node: ApprovalNode.MANAGER, round },
        });
      } else {
        await tx.approvalTask.createMany({
          data: financeUsers.map((finance) => ({ applicationId: id, approverId: finance.id, node: ApprovalNode.FINANCE, round })),
        });
      }
      await tx.approvalAction.create({
        data: {
          applicationId: id,
          actorId: user.id,
          action: app.approvalRound ? ActionType.RESUBMITTED : ActionType.SUBMITTED,
          round,
          comment: activeManager ? undefined : '没有可用主管，已直接进入财务审批',
        },
      });
      return tx.application.findUnique({ where: { id }, include: applicationInclude });
    });

    if (!updated) throw new NotFoundException();
    if (didSubmit) {
      if (activeManager) {
        await this.notifications.notify(activeManager.id, '新的主管审批', `${user.name} 提交了达人合作申请`, id);
      } else {
        await this.notifications.notifyMany(financeUsers.map((finance) => finance.id), '新的财务审批', '没有可用主管，申请已直接进入财务审批', id);
      }
    }
    return updated;
  }

  async approve(user: CurrentUser, id: number, dto: DecisionDto) {
    const task = await this.pendingTask(user.id, id);
    await this.notifications.markApplicationRead(user.id, id);
    if (task.node === ApprovalNode.MANAGER) return this.approveManager(user, id, dto.comment);
    return this.approveFinance(user, id, dto.comment);
  }

  async reject(user: CurrentUser, id: number, dto: RejectDto) {
    const task = await this.pendingTask(user.id, id);
    await this.notifications.markApplicationRead(user.id, id);
    const status = task.node === ApprovalNode.MANAGER ? ApplicationStatus.MANAGER_REJECTED : ApplicationStatus.FINANCE_REJECTED;
    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status,
        tasks: { update: { where: { id: task.id }, data: { status: TaskStatus.REJECTED, comment: dto.comment, decidedAt: new Date() } } },
        actions: { create: { actorId: user.id, action: ActionType.REJECTED, node: task.node, round: task.round, comment: dto.comment } },
      },
      include: applicationInclude,
    });
    const nodeLabel = task.node === ApprovalNode.MANAGER ? '主管' : '财务';
    const title = `申请已被${nodeLabel}驳回`;
    await this.notifications.notify(updated.applicantId, title, dto.comment, id);
    return updated;
  }

  async withdraw(user: CurrentUser, id: number) {
    const app = await this.findVisible(user, id);
    if (app.applicantId !== user.id) throw new ForbiddenException();
    if (app.status === ApplicationStatus.APPROVED) {
      throw new BadRequestException('Approved applications cannot be withdrawn');
    }
    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: ApplicationStatus.WITHDRAWN,
        tasks: { updateMany: { where: { status: TaskStatus.PENDING }, data: { status: TaskStatus.CANCELLED } } },
        actions: { create: { actorId: user.id, action: ActionType.WITHDRAWN, round: app.approvalRound } },
      },
      include: applicationInclude,
    });
    return updated;
  }

  async reopen(user: CurrentUser, id: number) {
    const app = await this.findVisible(user, id);
    if (app.applicantId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException();
    if (app.status !== ApplicationStatus.WITHDRAWN) {
      throw new BadRequestException('Only withdrawn applications can be reopened');
    }
    return this.prisma.application.update({
      where: { id },
      data: {
        status: ApplicationStatus.DRAFT,
        actions: { create: { actorId: user.id, action: ActionType.RESUBMITTED, round: app.approvalRound, comment: '重新提交为草稿' } },
      },
      include: applicationInclude,
    });
  }

  async attachFile(user: CurrentUser, id: number, category: FileCategory, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const app = await this.findVisible(user, id);
    if (app.applicantId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException();

    const imageTypes = ['image/jpeg', 'image/png'];
    const pdfTypes = ['application/pdf'];
    const wordTypes = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const excelTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const allowedByCategory: Record<FileCategory, string[]> = {
      [FileCategory.CHAT_RECORD]: imageTypes,
      [FileCategory.VOUCHER]: imageTypes,
      [FileCategory.CONTRACT]: [...imageTypes, ...pdfTypes],
      [FileCategory.OTHER]: [...imageTypes, ...pdfTypes, ...wordTypes, ...excelTypes],
    };
    const extOk = allowedByCategory[category].includes(file.mimetype);
    if (!extOk || file.size > 20 * 1024 * 1024) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('Unsupported file type or size');
    }
    if (file.mimetype.startsWith('image/')) {
      const count = await this.prisma.applicationFile.count({ where: { applicationId: id, mimeType: { startsWith: 'image/' } } });
      if (count >= 10) {
        await unlink(file.path).catch(() => undefined);
        throw new BadRequestException('Only 10 images are allowed');
      }
    }
    return this.prisma.applicationFile.create({
      data: {
        applicationId: id,
        category,
        originalName: normalizeOriginalName(file.originalname),
        storedName: file.filename || file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path || `uploads/${file.filename || file.originalname}`,
      },
    });
  }

  async file(user: CurrentUser, fileId: number) {
    const file = await this.prisma.applicationFile.findUnique({ where: { id: fileId }, include: { application: true } });
    if (!file) throw new NotFoundException();
    await this.findVisible(user, file.applicationId);
    return file;
  }

  private async approveManager(user: CurrentUser, id: number, comment?: string) {
    const task = await this.pendingTask(user.id, id);
    const financeUsers = await this.activeFinanceUsers();
    if (!financeUsers.length) throw new BadRequestException('No active finance user');
    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: ApplicationStatus.PENDING_FINANCE,
        tasks: {
          update: { where: { id: task.id }, data: { status: TaskStatus.APPROVED, comment, decidedAt: new Date() } },
          createMany: { data: financeUsers.map((finance) => ({ approverId: finance.id, node: ApprovalNode.FINANCE, round: task.round })) },
        },
        actions: { create: { actorId: user.id, action: ActionType.APPROVED, node: ApprovalNode.MANAGER, round: task.round, comment } },
      },
      include: applicationInclude,
    });
    await this.notifications.notifyMany(financeUsers.map((finance) => finance.id), '新的财务审批', '主管已通过达人合作申请', id);
    return updated;
  }

  private async approveFinance(user: CurrentUser, id: number, comment?: string) {
    const task = await this.pendingTask(user.id, id);
    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: ApplicationStatus.APPROVED,
        tasks: {
          updateMany: { where: { applicationId: id, node: ApprovalNode.FINANCE, status: TaskStatus.PENDING }, data: { status: TaskStatus.CANCELLED } },
          update: { where: { id: task.id }, data: { status: TaskStatus.APPROVED, comment, decidedAt: new Date() } },
        },
        actions: { create: { actorId: user.id, action: ActionType.APPROVED, node: ApprovalNode.FINANCE, round: task.round, comment } },
      },
      include: applicationInclude,
    });
    await this.notifications.notify(updated.applicantId, '申请已通过', `${user.name} 已通过财务审批`, id);
    await this.notifyCc('财务已通过', `${user.name} 已通过财务审批`, id);
    return updated;
  }

  private async pendingTask(userId: number, applicationId: number) {
    const task = await this.prisma.approvalTask.findFirst({ where: { applicationId, approverId: userId, status: TaskStatus.PENDING } });
    if (!task) throw new ForbiddenException('No pending approval task');
    return task;
  }

  private async findVisible(user: CurrentUser, id: number) {
    const app = await this.prisma.application.findUnique({ where: { id }, include: applicationInclude });
    if (!app) throw new NotFoundException();
    if (user.role === Role.ADMIN) return app;
    if (app.applicantId === user.id) return app;
    if (app.tasks.some((task) => task.approverId === user.id)) return app;
    if (user.role === Role.CC && (await this.ccUserIds()).includes(user.id) && app.status !== ApplicationStatus.DRAFT) return app;
    throw new ForbiddenException();
  }

  private toData(dto: SaveApplicationDto) {
    return {
      influencerName: dto.influencerName || null,
      contact: dto.contact || null,
      amount: dto.amount ? dto.amount : null,
      currency: dto.currency || null,
      paymentMethod: dto.paymentMethod || null,
      homepage: dto.homepage || null,
      remark: dto.remark || null,
    };
  }

  private async findNextActiveManager(managerId?: number | null) {
    const visited = new Set<number>();
    let currentId = managerId || undefined;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const manager = await this.prisma.user.findUnique({
        where: { id: currentId },
        select: { id: true, managerId: true, isActive: true, role: true },
      });
      if (!manager) return null;
      if (manager.isActive && (manager.role === Role.MANAGER || manager.role === Role.ADMIN)) return { id: manager.id };
      currentId = manager.managerId || undefined;
    }
    return null;
  }

  private activeFinanceUsers() {
    return this.prisma.user.findMany({ where: { role: Role.FINANCE, isActive: true }, select: { id: true } });
  }

  private async ccUserIds() {
    const users = await this.prisma.user.findMany({
      where: { OR: [{ email: 'kiki' }, { email: 'hailey' }, { role: Role.CC }], isActive: true },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  private async notifyCc(title: string, body: string, applicationId: number) {
    await this.notifications.notifyMany(await this.ccUserIds(), title, body, applicationId);
  }
}
