import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import ms from 'ms';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  ForgotPasswordDto,
  LoginDto,
  ChangePasswordDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateSecurityQuestionsDto,
  VerifyAnswersDto,
} from './auth.dto';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface RegisterResponse {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ForgotPasswordResponse {
  found: boolean;
  questions: { id: string; question: string }[];
}

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponse> {
    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const securityQuestions = await Promise.all(
      dto.securityQuestions.map(async (q) => ({
        question: q.question,
        answerHash: await bcrypt.hash(normalizeAnswer(q.answer), BCRYPT_ROUNDS),
      })),
    );

    // Concurrent duplicate registrations surface as P2002 → 409 via the
    // global exception filter (all-exceptions.filter.ts).
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        passwordHash,
        securityQuestions: { create: securityQuestions },
      },
    });

    // Registration only creates the account — it does not log the user in.
    return { user: { id: user.id, name: user.name, email: user.email } };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });
    if (!user) {
      return { found: false, questions: [] };
    }
    const questions = await this.prisma.securityQuestion.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, question: true },
    });
    return { found: true, questions };
  }

  async verifyAnswers(dto: VerifyAnswersDto): Promise<{ resetToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or security answers');
    }

    for (const submitted of dto.answers) {
      const stored = await this.prisma.securityQuestion.findUnique({
        where: { id: submitted.questionId },
      });
      if (!stored || stored.userId !== user.id) {
        throw new UnauthorizedException('Invalid email or security answers');
      }
      const valid = await bcrypt.compare(
        normalizeAnswer(submitted.answer),
        stored.answerHash,
      );
      if (!valid) {
        throw new UnauthorizedException('Invalid email or security answers');
      }
    }

    // One-time token; any previously issued (unused) tokens are invalidated.
    const { token, tokenHash } = generateResetTokenPair();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }),
    ]);
    return { resetToken: token };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: true }> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      // Force re-authentication everywhere: revoke all active sessions.
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotate: create the replacement, then revoke the presented token and
    // link it to its replacement (rotation chain).
    const { token: newToken, tokenHash: newHash } = generateRefreshTokenPair();
    const replacement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          expiresAt: this.refreshExpiry(),
        },
      });
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedByTokenId: created.id },
      });
      return created;
    });
    void replacement;

    return this.buildAuthResponse(user, newToken);
  }

  async logout(refreshToken: string): Promise<{ success: true }> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async getSecurityQuestions(
    userId: string,
  ): Promise<{ id: string; question: string }[]> {
    return this.prisma.securityQuestion.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, question: true },
    });
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    const { token, tokenHash } = generateRefreshTokenPair();
    await this.prisma.$transaction([
      // Revoke every session, then issue a fresh one for this device.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId,
          tokenHash,
          expiresAt: this.refreshExpiry(),
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
    ]);
    return this.buildAuthResponse(user, token);
  }

  async updateSecurityQuestions(
    userId: string,
    dto: UpdateSecurityQuestionsDto,
  ): Promise<{ success: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const questions = dto.securityQuestions.map((q) => q.question);
    if (new Set(questions).size !== questions.length) {
      throw new BadRequestException('Security questions must be unique');
    }

    const replacements = await Promise.all(
      dto.securityQuestions.map(async (q) => ({
        question: q.question,
        answerHash: await bcrypt.hash(normalizeAnswer(q.answer), BCRYPT_ROUNDS),
      })),
    );

    await this.prisma.$transaction([
      this.prisma.securityQuestion.deleteMany({ where: { userId } }),
      this.prisma.securityQuestion.createMany({
        data: replacements.map((q) => ({ ...q, userId })),
      }),
    ]);
    return { success: true };
  }

  private async buildAuthResponse(
    user: { id: string; name: string; email: string },
    refreshToken?: string,
  ): Promise<AuthResponse> {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });
    const { token, tokenHash } = generateRefreshTokenPair();
    const issuedToken = refreshToken ?? token;
    if (!refreshToken) {
      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: this.refreshExpiry(),
        },
      });
    }
    return {
      accessToken,
      refreshToken: issuedToken,
      user: { id: user.id, name: user.name, email: user.email },
    };
  }

  private refreshExpiry(): Date {
    const ttl = this.config.get<string>(
      'REFRESH_TOKEN_EXPIRES_IN',
      '30d',
    ) as import('ms').StringValue;
    return new Date(Date.now() + ms(ttl));
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRefreshTokenPair(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(48).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function generateResetTokenPair(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}
