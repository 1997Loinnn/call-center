import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { hasPermission } from '../common/data-scope';
import { RequestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';

const HISTORY_LIMIT = 20;

@Injectable()
export class CitizensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Fuqaro kartasi (F-OP-02): qo'ng'iroq kelganda operatorga shu raqamning oldingi murojaatlari va qo'ng'iroqlari.
   * Operatorning ko'rish doirasi OWN bo'lsa ham, karta boshqa operatorlar qabul qilgan murojaatlarning
   * qisqa ma'lumotini ko'rsatadi: aks holda takroriy murojaatni aniqlab bo'lmaydi. Maxfiy murojaatlar
   * faqat tickets.confidential ruxsati bilan, anonim murojaatlar esa umuman ko'rsatilmaydi.
   */
  async cardByPhone(phoneInput: string, user: AuthUser, meta: RequestMeta) {
    const phone = normalizePhone(phoneInput);
    const citizen = await this.prisma.citizen.findUnique({
      where: { phone },
      include: { region: { select: { id: true, nameUz: true } }, district: { select: { id: true, nameUz: true } } },
    });

    const ticketWhere: Prisma.TicketWhereInput = {
      citizen: { phone },
      isAnonymous: false,
      ...(hasPermission(user, Permission.TicketsConfidential) ? {} : { isConfidential: false }),
    };
    const [tickets, calls] = await Promise.all([
      this.prisma.ticket.findMany({
        where: ticketWhere,
        select: {
          id: true,
          number: true,
          status: true,
          type: true,
          subject: true,
          createdAt: true,
          dueAt: true,
          category: { select: { id: true, nameUz: true } },
          assignedOrgUnit: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
      }),
      this.prisma.call.findMany({
        where: { callerNumber: { in: [phone, phone.replace(/^\+/, '')] } },
        select: { id: true, startedAt: true, talkSeconds: true, result: true, agent: { select: { id: true, fullName: true } } },
        orderBy: { startedAt: 'desc' },
        take: HISTORY_LIMIT,
      }),
    ]);

    await this.audit.log({ actorId: user.id, action: 'citizen.view', entityType: 'Citizen', entityId: citizen?.id ?? phone, ...meta });
    return { phone, citizen, tickets, calls };
  }

  /**
   * Murojaat raqami bo'yicha: shu murojaatni yozgan fuqaroning kartasi.
   * Anonim murojaat orqali karta ochilmaydi, maxfiysi — faqat tickets.confidential ruxsati bilan.
   */
  async cardByTicketNumber(numberInput: string, user: AuthUser, meta: RequestMeta) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        number: { equals: numberInput.trim(), mode: 'insensitive' },
        isAnonymous: false,
        ...(hasPermission(user, Permission.TicketsConfidential) ? {} : { isConfidential: false }),
      },
      select: { citizen: { select: { phone: true } } },
    });
    if (!ticket?.citizen) throw new NotFoundException("Bu raqamli murojaat yoki unga bog'langan fuqaro topilmadi");
    return this.cardByPhone(ticket.citizen.phone, user, meta);
  }
}
