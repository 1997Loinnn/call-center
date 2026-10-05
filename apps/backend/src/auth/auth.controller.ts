import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public } from '../common/decorators';
import { requestMeta } from '../common/http';
import { ACCESS_TOKEN_COOKIE, DEFAULT_TOKEN_TTL_SECONDS } from './auth.constants';
import { AuthService, LoginOutcome } from './auth.service';

export class LoginDto {
  @IsString()
  @MaxLength(64)
  username: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class UsernameDto {
  @IsString()
  @MaxLength(64)
  username: string;
}

export class CodeLoginDto extends UsernameDto {
  @Matches(/^\d{6}$/, { message: 'Kod 6 raqamdan iborat' })
  code: string;
}

export class ChallengeDto {
  @IsString()
  @MaxLength(2000)
  challenge: string;
}

export class ChallengeCodeDto extends ChallengeDto {
  @Matches(/^\d{6}$/, { message: 'Kod 6 raqamdan iborat' })
  code: string;
}

export class TotpCodeDto {
  @Matches(/^\d{6}$/, { message: 'Kod 6 raqamdan iborat' })
  code: string;
}

/** Javob: kirish yakunlansa — foydalanuvchi; ikkinchi bosqich kerak bo'lsa — challenge (cookie berilmaydi). */
type LoginResponse = { user: AuthUser } | { mfa: { challenge: string; setup: boolean } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private finish(outcome: LoginOutcome, res: Response): LoginResponse {
    if (outcome.status === 'mfa') return { mfa: { challenge: outcome.challenge, setup: outcome.setup } };
    const ttl = Number(this.config.get('JWT_TTL_SECONDS') ?? DEFAULT_TOKEN_TTL_SECONDS);
    res.cookie(ACCESS_TOKEN_COOKIE, outcome.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.get('COOKIE_SECURE') === 'true',
      maxAge: ttl * 1000,
      path: '/',
    });
    return { user: outcome.user };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
    return this.finish(await this.auth.login(dto.username, dto.password, requestMeta(req)), res);
  }

  /** SMS orqali kirish: kod so'rash (TZ: SMS-OTP). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('code/request')
  @HttpCode(200)
  requestCode(@Body() dto: UsernameDto, @Req() req: Request) {
    return this.auth.requestLoginCode(dto.username, requestMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('code/verify')
  @HttpCode(200)
  async verifyCode(@Body() dto: CodeLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
    return this.finish(await this.auth.verifyLoginCode(dto.username, dto.code, requestMeta(req)), res);
  }

  /** Ikkinchi bosqich: autentifikator ilovasidagi kod. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('2fa/verify')
  @HttpCode(200)
  async verifyTwoFactor(@Body() dto: ChallengeCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
    return this.finish(await this.auth.verifyTwoFactor(dto.challenge, dto.code, requestMeta(req)), res);
  }

  /** Rol talab qilgan, lekin ulanmagan 2FA: kirish jarayonida QR. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('2fa/setup')
  @HttpCode(200)
  setupTwoFactor(@Body() dto: ChallengeDto) {
    return this.auth.setupWithChallenge(dto.challenge);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('2fa/enable')
  @HttpCode(200)
  async enableTwoFactor(@Body() dto: ChallengeCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
    return this.finish(await this.auth.enableWithChallenge(dto.challenge, dto.code, requestMeta(req)), res);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  // ───────────── O'z hisobim: ikki bosqichli himoya ─────────────

  @Get('2fa')
  twoFactorStatus(@CurrentUser() user: AuthUser) {
    return this.auth.twoFactorStatus(user);
  }

  @Post('2fa/self-setup')
  @HttpCode(200)
  selfSetup(@CurrentUser() user: AuthUser) {
    return this.auth.selfSetup(user);
  }

  @Post('2fa/self-enable')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  selfEnable(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto, @Req() req: Request) {
    return this.auth.selfEnable(user, dto.code, requestMeta(req));
  }

  @Post('2fa/self-disable')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  selfDisable(@CurrentUser() user: AuthUser, @Body() dto: TotpCodeDto, @Req() req: Request) {
    return this.auth.selfDisable(user, dto.code, requestMeta(req));
  }
}
