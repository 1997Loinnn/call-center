import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { ACCESS_TOKEN_COOKIE, JwtPayload } from '../auth/auth.constants';
import { AuthService } from '../auth/auth.service';
import { readCookie } from '../common/http';
import { Permission } from '../common/permissions';

/**
 * Operator paneli va monitoring ekranlari uchun real vaqt kanali (Socket.IO, /ws).
 * Xonalar: "user:<id>" — shaxsiy hodisalar (kiruvchi qo'ng'iroq, yangi murojaat),
 * "monitoring" — supervisor va rahbariyat (operator holatlari, navbat),
 * "omni" — omnikanal suhbatlari bilan ishlovchi operatorlar.
 */
@WebSocketGateway({ namespace: '/ws' })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        readCookie(client.handshake.headers.cookie, ACCESS_TOKEN_COOKIE) ??
        (client.handshake.auth?.token as string | undefined);
      if (!token) throw new Error('token berilmagan');

      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.auth.loadAuthUser(payload.sub);
      if (!user) throw new Error('foydalanuvchi topilmadi yoki faol emas');

      client.data.user = user;
      await client.join(`user:${user.id}`);
      if (user.permissions.includes(Permission.MonitoringView)) await client.join('monitoring');
      // Omnikanal: yangi xabarlar va suhbat o'zgarishlari operatorlarga
      if (user.permissions.includes(Permission.TicketsCreate)) await client.join('omni');
      // Qayta qo'ng'iroq so'rovlari va boshqa telefoniya ro'yxatlari
      if (user.permissions.includes(Permission.TelephonyUse)) await client.join('telephony');
    } catch (err) {
      this.logger.debug(`WebSocket ulanishi rad etildi: ${err instanceof Error ? err.message : String(err)}`);
      client.disconnect(true);
    }
  }

  emitToUser(userId: number, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server?.to(room).emit(event, payload);
  }
}
