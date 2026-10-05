import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { XLSX_MIME } from '../common/xlsx';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(Permission.AuditRead)
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }

  /** Foydalanuvchi filtri uchun qidiruv (auditorda foydalanuvchilarni boshqarish huquqi yo'q) */
  @Get('actors')
  @RequirePermissions(Permission.AuditRead)
  actors(@Query('search') search?: string) {
    return this.audit.actors(search);
  }

  @Get('export')
  @RequirePermissions(Permission.AuditRead)
  async export(@CurrentUser() user: AuthUser, @Query() query: AuditQueryDto, @Req() req: Request, @Res() res: Response) {
    const body = await this.audit.exportXlsx(user, query, requestMeta(req));
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Length': String(body.length),
      'Content-Disposition': `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Cache-Control': 'no-store',
    });
    res.send(body);
  }
}
