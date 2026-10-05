import { DataScope } from '@prisma/client';

/** So'rov davomida request.user sifatida mavjud bo'lgan joriy foydalanuvchi. */
export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  orgUnitId: number;
  orgUnitPath: string;
  orgUnitName: string;
  sipExtension: string | null;
  roles: string[];
  permissions: string[];
  scope: DataScope;
  /** Ikki bosqichli himoya yoqilganmi */
  twoFactor: boolean;
}
