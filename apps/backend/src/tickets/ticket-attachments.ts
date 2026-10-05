import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { TicketStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { hasPermission, managesOrgUnit, ticketScopeWhere } from '../common/data-scope';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { RequestMeta, requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { LocalRecordingStorage } from '../recordings/recording-storage';

export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_PER_TICKET = 30;

/**
 * Ruxsat etilgan turlar: Content-Type mijoz yuborganidan emas, kengaytmadan olinadi.
 * inline — brauzerda ochiladi (rasm, PDF), qolganlari faqat yuklab olinadi.
 */
export const ATTACHMENT_TYPES: Record<string, { mime: string; inline: boolean }> = {
  '.pdf': { mime: 'application/pdf', inline: true },
  '.jpg': { mime: 'image/jpeg', inline: true },
  '.jpeg': { mime: 'image/jpeg', inline: true },
  '.png': { mime: 'image/png', inline: true },
  '.webp': { mime: 'image/webp', inline: true },
  '.tif': { mime: 'image/tiff', inline: false },
  '.tiff': { mime: 'image/tiff', inline: false },
  '.heic': { mime: 'image/heic', inline: false },
  '.doc': { mime: 'application/msword', inline: false },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false },
  '.xls': { mime: 'application/vnd.ms-excel', inline: false },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: false },
  '.txt': { mime: 'text/plain; charset=utf-8', inline: false },
  '.zip': { mime: 'application/zip', inline: false },
  '.mp3': { mime: 'audio/mpeg', inline: false },
  '.ogg': { mime: 'audio/ogg', inline: false },
};

interface UploadedBlob {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** Fayl haqiqatan e'lon qilingan turdami: rasm va PDF uchun "sehrli baytlar" tekshiriladi (nomini almashtirilgan fayl o'tmaydi). */
export function matchesSignature(ext: string, head: Buffer): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  switch (ext) {
    case '.pdf':
      return head.subarray(0, 5).toString('latin1') === '%PDF-';
    case '.png':
      return starts(0x89, 0x50, 0x4e, 0x47);
    case '.jpg':
    case '.jpeg':
      return starts(0xff, 0xd8, 0xff);
    case '.webp':
      return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
    case '.docx':
    case '.xlsx':
    case '.zip':
      return starts(0x50, 0x4b);
    default:
      return true;
  }
}

/**
 * Murojaat fayllari (F-CRM-06): fuqaro hujjati nusxasi, javob xati, dalolatnoma. Lokal papka yoki NAS
 * (ATTACHMENTS_DIR); ko'rish doirasidagi xodimlar yuklaydi va ko'radi, har bir amal audit jurnaliga yoziladi.
 */
@Injectable()
export class TicketAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: LocalRecordingStorage,
  ) {}

  private async ticketFor(user: AuthUser, ticketId: number) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id: ticketId }, ticketScopeWhere(user)] },
      select: { id: true, number: true, status: true, assigneeId: true, createdById: true, assignedOrgUnit: { select: { path: true } } },
    });
    if (!ticket) throw new NotFoundException('Murojaat topilmadi');
    return ticket;
  }

  async upload(user: AuthUser, ticketId: number, file: UploadedBlob | undefined, meta: RequestMeta) {
    const ticket = await this.ticketFor(user, ticketId);
    if (ticket.status === TicketStatus.CLOSED) throw new BadRequestException("Yopilgan murojaatga fayl qo'shilmaydi: avval qayta oching");
    if (!file || file.size === 0) throw new BadRequestException('Fayl tanlanmagan');
    if (file.size > MAX_ATTACHMENT_BYTES) throw new BadRequestException('Fayl 20 MB dan katta');
    // multer fayl nomini latin1 deb o'qiydi: o'zbek va kirill harflari buzilmasligi uchun UTF-8 ga qaytaramiz
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[\\/\0]/g, '_').slice(0, 200);
    const ext = extname(fileName).toLowerCase();
    const type = ATTACHMENT_TYPES[ext];
    if (!type) throw new BadRequestException(`Bu turdagi fayl qabul qilinmaydi. Ruxsat: ${Object.keys(ATTACHMENT_TYPES).join(', ')}`);
    if (!matchesSignature(ext, file.buffer.subarray(0, 16))) throw new BadRequestException("Fayl mazmuni kengaytmasiga mos emas");
    if ((await this.prisma.attachment.count({ where: { ticketId } })) >= MAX_PER_TICKET) {
      throw new BadRequestException(`Bitta murojaatga ko'pi bilan ${MAX_PER_TICKET} ta fayl`);
    }

    const now = new Date();
    const storageKey = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${ticket.id}/${randomUUID()}${ext}`;
    await this.storage.write(storageKey, file.buffer);
    const attachment = await this.prisma.attachment.create({
      data: { ticketId, storageKey, fileName, mimeType: type.mime, sizeBytes: file.size, uploadedById: user.id },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, uploadedBy: { select: { id: true, fullName: true } } },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.attachment.add',
      entityType: 'Ticket',
      entityId: ticket.id,
      details: { number: ticket.number, fileName, sizeBytes: file.size },
      ...meta,
    });
    return attachment;
  }

  async open(user: AuthUser, ticketId: number, attachmentId: number, download: boolean, meta: RequestMeta) {
    const ticket = await this.ticketFor(user, ticketId);
    const attachment = await this.prisma.attachment.findFirst({ where: { id: attachmentId, ticketId } });
    if (!attachment) throw new NotFoundException('Fayl topilmadi');
    const size = await this.storage.size(attachment.storageKey);
    if (size === null) {
      throw new NotFoundException(
        attachment.storageKey.startsWith('demo/')
          ? "Demo yozuv: sinov ma'lumotlari generatori faqat fayl haqidagi yozuvni yaratgan, faylning o'zi yo'q"
          : "Fayl arxivda topilmadi (ko'chirilgan yoki o'chirilgan)",
      );
    }
    const ext = extname(attachment.fileName).toLowerCase();
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.attachment.download',
      entityType: 'Ticket',
      entityId: ticket.id,
      details: { number: ticket.number, fileName: attachment.fileName },
      ...meta,
    });
    return {
      stream: this.storage.read(attachment.storageKey),
      size,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      inline: !download && (ATTACHMENT_TYPES[ext]?.inline ?? false),
    };
  }

  /** O'chirish: yuklagan xodim (yopilmagan murojaatda) yoki bo'linma rahbari. */
  async remove(user: AuthUser, ticketId: number, attachmentId: number, meta: RequestMeta): Promise<void> {
    const ticket = await this.ticketFor(user, ticketId);
    const attachment = await this.prisma.attachment.findFirst({ where: { id: attachmentId, ticketId } });
    if (!attachment) throw new NotFoundException('Fayl topilmadi');
    const isUploader = attachment.uploadedById === user.id && ticket.status !== TicketStatus.CLOSED;
    const isManager = hasPermission(user, Permission.TicketsAssign) && managesOrgUnit(user, ticket.assignedOrgUnit?.path);
    if (!isUploader && !isManager) throw new ForbiddenException("Faylni yuklagan xodim yoki bo'linma rahbari o'chiradi");
    await this.prisma.attachment.delete({ where: { id: attachment.id } });
    await this.storage.remove(attachment.storageKey).catch(() => undefined);
    await this.audit.log({
      actorId: user.id,
      action: 'ticket.attachment.delete',
      entityType: 'Ticket',
      entityId: ticket.id,
      details: { number: ticket.number, fileName: attachment.fileName },
      ...meta,
    });
  }
}

@ApiTags('tickets')
@Controller('tickets/:id/attachments')
export class TicketAttachmentsController {
  constructor(private readonly attachments: TicketAttachmentsService) {}

  @Post()
  @RequirePermissions(Permission.TicketsRead)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @UploadedFile() file: UploadedBlob | undefined, @Req() req: Request) {
    return this.attachments.upload(user, id, file, requestMeta(req));
  }

  @Get(':attachmentId')
  @RequirePermissions(Permission.TicketsRead)
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Query('download') download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.attachments.open(user, id, attachmentId, download === '1', requestMeta(req));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Cache-Control', 'private, no-store');
    // Rasm va boshqa fayllar "sandbox" da: skript ishga tushmaydi. Chrome PDF ko'ruvchisi sandbox va
    // object-src 'none' bilan ishlamaydi — PDF uchun faqat o'zining ko'ruvchisiga ruxsat
    res.setHeader(
      'Content-Security-Policy',
      file.mimeType === 'application/pdf' ? "default-src 'none'; object-src 'self'; plugin-types application/pdf" : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    );
    res.setHeader('Content-Disposition', `${file.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    file.stream.on('error', () => res.destroy());
    file.stream.pipe(res);
  }

  @Delete(':attachmentId')
  @HttpCode(204)
  @RequirePermissions(Permission.TicketsRead)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Param('attachmentId', ParseIntPipe) attachmentId: number, @Req() req: Request) {
    return this.attachments.remove(user, id, attachmentId, requestMeta(req));
  }
}
