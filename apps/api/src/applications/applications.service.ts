import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActionType, ApplicationStatus, ApprovalNode, FileCategory, Role, TaskStatus } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { DecisionDto, RejectDto, SaveApplicationDto } from './dto';

const applicationInclude = {
  applicant: { select: { id: true, name: true, managerId: true } },
  files: true,
  tasks: { include: { approver: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  actions: { include: { actor: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' as const } },
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

  async list(user: CurrentUser) {
    if (user.role === Role.ADMIN) {
      return this.prisma.application.findMany({ include: applicationInclude, orderBy: { updatedAt: 'desc' } });
    }
    const ccUsers = await this.ccUserIds();
    const where =
      user.role === Role.CC && ccUsers.includes(user.id)
        ? { status: { not: ApplicationStatus.DRAFT } }
        : { applicantId: user.id };
    return this.prisma.application.findMany({ where, include: applicationInclude, orderBy: { updatedAt: 'desc' } });
  }

  async todo(user: CurrentUser) {
    return this.prisma.approvalTask.findMany({
      where: { approverId: user.id, status: TaskStatus.PENDING },
      include: { application: { include: applicationInclude } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(user: CurrentUser, dto: SaveApplicationDto) {
    const creatorRoles: Role[] = [Role.EMPLOYEE, Role.ADMIN];
    if (!creatorRoles.includes(user.role as Role)) {
      throw new ForbiddenException('Only employees can create applications');
    }
    const app = await this.prisma.application.create({
      data: {
        applicantId: user.id,
        ...this.toData(dto),
        actions: { create: { actorId: user.id, action: ActionType.CREATED, round: 0 } },
      },
      include: applicationInclude,
    });
    return app;
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

  async detail(user: CurrentUser, id: number) {
    return this.findVisible(user, id);
  }

  async submit(user: CurrentUser, id: number) {
    const app = await this.findVisible(user, id);
    if (app.applicantId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException();
    const submittableStatuses: ApplicationStatus[] = [ApplicationStatus.DRAFT, ApplicationStatus.MANAGER_REJECTED, ApplicationStatus.FINANCE_REJECTED];
    if (!submittableStatuses.includes(app.status)) {
      throw new BadRequestException('Application cannot be submitted in current status');
    }
    const applicant = await this.prisma.user.findUnique({ where: { id: app.applicantId } });
    if (!applicant?.managerId) throw new BadRequestException('Applicant has no direct manager');
    const round = app.approvalRound + 1;
    await this.prisma.approvalTask.updateMany({
      where: { applicationId: id, status: TaskStatus.PENDING },
      data: { status: TaskStatus.CANCELLED },
    });
    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: ApplicationStatus.PENDING_MANAGER,
        approvalRound: round,
        tasks: { create: { approverId: applicant.managerId, node: ApprovalNode.MANAGER, round } },
        actions: { create: { actorId: user.id, action: app.approvalRound ? ActionType.RESUBMITTED : ActionType.SUBMITTED, round } },
      },
      include: applicationInclude,
    });
    await this.notifications.notify(applicant.managerId, '新的主管审批', `${user.name} 提交了达人合作申请`, id);
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
    await this.notifications.notify(updated.applicantId, '申请被驳回', dto.comment, id);
    await this.notifyCc('申请被驳回', `${user.name} 驳回了申请`, id);
    return updated;
  }

  async withdraw(user: CurrentUser, id: number) {
    const app = await this.findVisible(user, id);
    if (app.applicantId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException();
    const finalStatuses: ApplicationStatus[] = [ApplicationStatus.APPROVED];
    if (finalStatuses.includes(app.status)) {
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
    await this.notifyCc('申请已撤销', `${user.name} 撤销了申请`, id);
    return updated;
  }

  async attachFile(user: CurrentUser, id: number, category: FileCategory, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const app = await this.findVisible(user, id);
    if (app.applicantId !== user.id && user.role !== Role.ADMIN) throw new ForbiddenException();
    const imageTypes = ['image/jpeg', 'image/png'];
    const pdfTypes = ['application/pdf'];
    const wordTypes = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const allowedByCategory: Record<FileCategory, string[]> = {
      [FileCategory.CHAT_RECORD]: imageTypes,
      [FileCategory.VOUCHER]: imageTypes,
      [FileCategory.CONTRACT]: [...imageTypes, ...pdfTypes],
      [FileCategory.OTHER]: [...imageTypes, ...pdfTypes, ...wordTypes],
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
    const financeUsers = await this.prisma.user.findMany({ where: { role: Role.FINANCE, isActive: true }, select: { id: true } });
    if (!financeUsers.length) throw new BadRequestException('No active finance user');
    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: ApplicationStatus.PENDING_FINANCE,
        tasks: {
          update: { where: { id: task.id }, data: { status: TaskStatus.APPROVED, comment, decidedAt: new Date() } },
          createMany: { data: financeUsers.map((f) => ({ approverId: f.id, node: ApprovalNode.FINANCE, round: task.round })) },
        },
        actions: { create: { actorId: user.id, action: ActionType.APPROVED, node: ApprovalNode.MANAGER, round: task.round, comment } },
      },
      include: applicationInclude,
    });
    await this.notifications.notifyMany(financeUsers.map((f) => f.id), '新的财务审批', '主管已通过达人合作申请', id);
    await this.notifyCc('主管已通过', `${user.name} 已通过主管审批`, id);
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
    if (app.tasks.some((t) => t.approverId === user.id)) return app;
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

  private async ccUserIds() {
    const users = await this.prisma.user.findMany({ where: { OR: [{ email: 'kiki' }, { email: 'hailey' }, { role: Role.CC }], isActive: true }, select: { id: true } });
    return users.map((u) => u.id);
  }

  private async notifyCc(title: string, body: string, applicationId: number) {
    await this.notifications.notifyMany(await this.ccUserIds(), title, body, applicationId);
  }
}
