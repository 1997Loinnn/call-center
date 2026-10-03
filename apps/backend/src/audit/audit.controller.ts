import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
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
}
