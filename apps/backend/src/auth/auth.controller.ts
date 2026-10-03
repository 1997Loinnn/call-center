import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, Public } from '../common/decorators';
import { requestMeta } from '../common/http';
import { ACCESS_TOKEN_COOKIE, DEFAULT_TOKEN_TTL_SECONDS } from './auth.constants';
import { AuthService } from './auth.service';

export class LoginDto {
  @IsString()
  @MaxLength(64)
  username: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    const { token, user } = await this.auth.login(dto.username, dto.password, requestMeta(req));
    const ttl = Number(this.config.get('JWT_TTL_SECONDS') ?? DEFAULT_TOKEN_TTL_SECONDS);
    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.get('COOKIE_SECURE') === 'true',
      maxAge: ttl * 1000,
      path: '/',
    });
    return { user };
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
}
