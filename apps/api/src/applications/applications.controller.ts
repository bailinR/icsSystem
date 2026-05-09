import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseIntPipe, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileCategory } from '@prisma/client';
import { Response } from 'express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { ApplicationsService } from './applications.service';
import { DecisionDto, RejectDto, SaveApplicationDto } from './dto';

const uploadDir = 'uploads';
mkdirSync(uploadDir, { recursive: true });

@UseGuards(JwtGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private applications: ApplicationsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUser,
    @Query('statusGroup') statusGroup?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.applications.list(user, statusGroup, Number(page || 1), Number(pageSize || 10), keyword);
  }

  @Get('todo')
  todo(
    @CurrentUser() user: CurrentUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.applications.todo(user, Number(page || 1), Number(pageSize || 10), keyword);
  }

  @Post()
  create(@CurrentUser() user: CurrentUser, @Body() dto: SaveApplicationDto) {
    return this.applications.create(user, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number) {
    return this.applications.detail(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SaveApplicationDto) {
    return this.applications.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number) {
    return this.applications.remove(user, id);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number) {
    return this.applications.submit(user, id);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DecisionDto) {
    return this.applications.approve(user, id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RejectDto) {
    return this.applications.reject(user, id, dto);
  }

  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number) {
    return this.applications.withdraw(user, id);
  }

  @Post(':id/reopen')
  reopen(@CurrentUser() user: CurrentUser, @Param('id', ParseIntPipe) id: number) {
    return this.applications.reopen(user, id);
  }

  @Post(':id/files/:category')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, callback) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          callback(null, `${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  upload(
    @CurrentUser() user: CurrentUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('category', new ParseEnumPipe(FileCategory)) category: FileCategory,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.applications.attachFile(user, id, category, file);
  }

  @Get('files/:fileId')
  async file(@CurrentUser() user: CurrentUser, @Param('fileId', ParseIntPipe) fileId: number, @Res() res: Response) {
    const file = await this.applications.file(user, fileId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `${file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf' ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.originalName)}"`);
    return res.sendFile(file.path, { root: process.cwd() });
  }
}
