import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('账号或密码不正确');
    if (!user.isActive) throw new UnauthorizedException('账号已被停用');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('账号或密码不正确');

    const payload = { sub: user.id, email: user.email, role: user.role, name: user.name };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_SECRET') || 'dev-secret',
      expiresIn: '8h',
    });
    const { passwordHash, ...safeUser } = user;
    return { token, user: safeUser };
  }
}
