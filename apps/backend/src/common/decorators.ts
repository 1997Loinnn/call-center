import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser } from './auth-user';
import { PermissionCode } from './permissions';

export const IS_PUBLIC_KEY = 'isPublic';
/** Autentifikatsiyasiz ochiq endpoint. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
/** Endpoint uchun talab qilinadigan ruxsatlar (barchasi bo'lishi shart). */
export const RequirePermissions = (...permissions: PermissionCode[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const ANY_PERMISSIONS_KEY = 'anyPermissions';
/** Ruxsatlardan kamida bittasi bo'lishi shart (masalan, ko'rish hisobotchiga ham, administratorga ham ochiq). */
export const RequireAnyPermission = (...permissions: PermissionCode[]) => SetMetadata(ANY_PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
