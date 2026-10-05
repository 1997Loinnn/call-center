import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthUser } from './auth-user';
import { ANY_PERMISSIONS_KEY, IS_PUBLIC_KEY, PERMISSIONS_KEY } from './decorators';

// Global guard'lar WebSocket gateway'ga ham qo'llanadi; WebSocket ulanishi
// RealtimeGateway.handleConnection'da alohida tekshiriladi, shuning uchun bu yerda faqat HTTP.

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, targets) ?? [];
    const anyOf = this.reflector.getAllAndOverride<string[] | undefined>(ANY_PERMISSIONS_KEY, targets) ?? [];
    if (required.length === 0 && anyOf.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) return false;
    const missing = required.filter((permission) => !user.permissions.includes(permission));
    if (missing.length > 0) {
      throw new ForbiddenException(`Ruxsat yetarli emas: ${missing.join(', ')}`);
    }
    if (anyOf.length > 0 && !anyOf.some((permission) => user.permissions.includes(permission))) {
      throw new ForbiddenException(`Ruxsat yetarli emas: ${anyOf.join(' yoki ')}`);
    }
    return true;
  }
}

@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return context.getType() !== 'http';
  }
}
