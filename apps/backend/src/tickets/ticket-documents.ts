import { BadRequestException, Controller, Get, Injectable, NotFoundException, Param, ParseIntPipe, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { hasPermission, ticketScopeWhere } from '../common/data-scope';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { buildDocx, DOCX_MIME } from '../common/docx';
import { RequestMeta, requestMeta } from '../common/http';
import { buildTablePdf, PDF_MIME } from '../common/pdf';
import { Permission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { CHANNEL_LABELS, formatExportDate, formatExportPhone, TYPE_LABELS } from './ticket-export';
import { STATUS_LABELS } from './ticket-workflow';

const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Yaratildi',
  ROUTED: "Yo'naltirildi",
  ASSIGNED: 'Ijrochiga berildi',
  RETURNED: 'Qaytarildi',
  ANSWERED: 'Javob yozildi',
  APPROVED: 'Tasdiqlandi va yopildi',
  REJECTED: 'Javob rad etildi',
  REOPENED: 'Qayta ochildi',
  CLOSED: 'Yopildi',
  ESCALATED: 'Eskalatsiya',
  COMMENT: 'Izoh',
};

const DOC_INCLUDE = {
  category: { select: { nameUz: true, parent: { select: { nameUz: true } } } },
  region: { select: { nameUz: true } },
  district: { select: { nameUz: true } },
  citizen: { select: { fullName: true, phone: true, address: true } },
  assignedOrgUnit: { select: { name: true } },
  assignee: { select: { fullName: true } },
  createdBy: { select: { fullName: true } },
  events: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: { actor: { select: { fullName: true } }, orgUnit: { select: { name: true } } },
  },
};

export interface TicketDocument {
  fileName: string;
  mime: string;
  body: Buffer;
}

/**
 * Murojaat hujjatlari (tafsilot panelidagi "Eksport"): murojaat kartasi (PDF) va fuqaroga javob xati (DOCX,
 * eksport shablonlaridagi "Javob xati"). Har bir yuklash audit jurnaliga yoziladi.
 */
@Injectable()
export class TicketDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async export(user: AuthUser, id: number, format: 'pdf' | 'docx', meta: RequestMeta): Promise<TicketDocument> {
    const ticket = await this.prisma.ticket.findFirst({ where: { AND: [{ id }, ticketScopeWhere(user)] }, include: DOC_INCLUDE });
    if (!ticket) throw new NotFoundException('Murojaat topilmadi');
    const citizen = ticket.isAnonymous && !hasPermission(user, Permission.TicketsConfidential) ? null : ticket.citizen;
    const topic = ticket.category ? [ticket.category.parent?.nameUz, ticket.category.nameUz].filter(Boolean).join(' · ') : ticket.subject;

    let doc: TicketDocument;
    if (format === 'docx') {
      if (!ticket.answer) throw new BadRequestException('Javob hali yozilmagan — javob xatini keyin yuklab oling');
      const name = citizen?.fullName ?? (ticket.isAnonymous ? 'Anonim murojaatchi' : 'Hurmatli fuqaro');
      const body = buildDocx([
        { text: 'Kadastr agentligi', bold: true, align: 'right', after: 0 },
        { text: ticket.assignedOrgUnit?.name ?? 'Call-markaz 1097', align: 'right', after: 18 },
        { text: `${name}ga`, bold: true, align: 'right', after: 0 },
        ...(citizen?.address ? [{ text: citizen.address, align: 'right' as const, after: 0 }] : []),
        ...(citizen?.phone ? [{ text: `Tel.: ${formatExportPhone(citizen.phone)}`, align: 'right' as const, after: 18 }] : [{ text: '', after: 12 }]),
        { text: `${formatExportDate(ticket.createdAt).slice(0, 10)} dagi ${ticket.number} raqamli murojaatingizga javob`, bold: true, align: 'center', after: 12 },
        { text: `Mavzu: ${topic}`, after: 12 },
        { text: ticket.answer, align: 'both', after: 18 },
        { text: ticket.assignedOrgUnit?.name ?? '', bold: true, after: 0 },
        { text: `Ijrochi: ${ticket.assignee?.fullName ?? '—'}`, after: 0 },
        { text: `Sana: ${formatExportDate(ticket.answeredAt ?? new Date()).slice(0, 10)}`, after: 0 },
      ]);
      doc = { fileName: `javob-xati-${ticket.number}.docx`, mime: DOCX_MIME, body };
    } else {
      const rows: [string, string][] = [
        ['Holat', STATUS_LABELS[ticket.status]],
        ['Turi', TYPE_LABELS[ticket.type]],
        ['Kanal', CHANNEL_LABELS[ticket.channel]],
        ['Qabul qilingan', formatExportDate(ticket.createdAt)],
        ['Mavzu', topic],
        ['Hudud', [ticket.region?.nameUz, ticket.district?.nameUz].filter(Boolean).join(', ') || '—'],
        ['Fuqaro', citizen?.fullName ?? (ticket.isAnonymous ? 'Anonim' : "Ko'rsatilmagan")],
        ['Telefon', citizen ? formatExportPhone(citizen.phone) : '—'],
        ...(citizen?.address ? ([['Manzil', citizen.address]] as [string, string][]) : []),
        ...(ticket.cadastreNumber ? ([['Kadastr raqami', ticket.cadastreNumber]] as [string, string][]) : []),
        ...(ticket.applicationNumber ? ([['Ariza raqami', ticket.applicationNumber]] as [string, string][]) : []),
        ['Tavsif', ticket.description],
        ["Mas'ul bo'linma", ticket.assignedOrgUnit?.name ?? 'Tayinlanmagan'],
        ['Ijrochi', ticket.assignee?.fullName ?? 'Tayinlanmagan'],
        ['Qabul qilgan operator', ticket.createdBy?.fullName ?? '—'],
        ['Ijro muddati', formatExportDate(ticket.dueAt) || '—'],
        ['Javob', ticket.answer ?? 'Hali yozilmagan'],
        ...ticket.events.map(
          (e) =>
            [
              `Tarix · ${formatExportDate(e.createdAt)}`,
              [EVENT_LABELS[e.type] ?? e.type, e.orgUnit ? `→ ${e.orgUnit.name}` : null, e.actor?.fullName ? `(${e.actor.fullName})` : null, e.comment].filter(Boolean).join(' '),
            ] as [string, string],
        ),
      ];
      const body = buildTablePdf({
        title: `Murojaat ${ticket.number}`,
        subtitle: `Kadastr agentligi · 1097 ishonch telefoni · ${STATUS_LABELS[ticket.status]}`,
        columns: ['Maydon', 'Qiymat'],
        rows,
        wrap: true,
        columnWeights: [1, 4],
        footer: `Yaratildi: ${formatExportDate(new Date())} · ${user.fullName}`,
      });
      doc = { fileName: `murojaat-${ticket.number}.pdf`, mime: PDF_MIME, body };
    }

    await this.audit.log({
      actorId: user.id,
      action: 'ticket.export',
      entityType: 'Ticket',
      entityId: ticket.id,
      details: { number: ticket.number, document: format === 'docx' ? 'Javob xati' : 'Murojaat kartasi', format: format.toUpperCase() },
      ...meta,
    });
    return doc;
  }
}

@ApiTags('tickets')
@Controller('tickets/:id/export')
export class TicketDocumentsController {
  constructor(private readonly documents: TicketDocumentsService) {}

  @Get()
  @RequirePermissions(Permission.TicketsRead)
  async export(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('format') format: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const doc = await this.documents.export(user, id, format === 'docx' ? 'docx' : 'pdf', requestMeta(req));
    res.set({
      'Content-Type': doc.mime,
      'Content-Length': String(doc.body.length),
      'Content-Disposition': `attachment; filename="${doc.fileName.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'no-store',
    });
    res.send(doc.body);
  }
}
