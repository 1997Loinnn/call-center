import { Body, Controller, Get, HttpCode, Module, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { TelephonyModule } from '../telephony/telephony.module';
import { ContactResultDto, ContactsSourceDto, CreateCampaignDto, UpdateCampaignDto } from './campaigns.dto';
import { CampaignsService } from './campaigns.service';

/** Telefoniya → Chiquvchi qo'ng'iroqlar: kampaniyalarni boshqarish va operator terish oqimi. */
@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequireAnyPermission(Permission.TelephonyUse, Permission.CampaignsManage)
  list() {
    return this.campaigns.list();
  }

  @Get(':id')
  @RequireAnyPermission(Permission.TelephonyUse, Permission.CampaignsManage)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.campaigns.get(id, user);
  }

  @Post()
  @RequirePermissions(Permission.CampaignsManage)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CampaignsManage)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(user, id, dto);
  }

  @Post(':id/contacts')
  @RequirePermissions(Permission.CampaignsManage)
  importContacts(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ContactsSourceDto) {
    return this.campaigns.importContacts(user, id, dto);
  }

  @Post(':id/next')
  @HttpCode(200)
  @RequirePermissions(Permission.TelephonyUse)
  next(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.campaigns.next(user, id);
  }

  @Post(':id/contacts/:contactId/skip')
  @HttpCode(204)
  @RequirePermissions(Permission.TelephonyUse)
  skip(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Param('contactId', ParseIntPipe) contactId: number) {
    return this.campaigns.skip(user, id, contactId);
  }

  @Post(':id/contacts/:contactId/call')
  @HttpCode(200)
  @RequirePermissions(Permission.TelephonyUse)
  call(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Param('contactId', ParseIntPipe) contactId: number) {
    return this.campaigns.call(user, id, contactId);
  }

  @Post(':id/contacts/:contactId/result')
  @HttpCode(200)
  @RequirePermissions(Permission.TelephonyUse)
  result(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @Body() dto: ContactResultDto,
  ) {
    return this.campaigns.result(user, id, contactId, dto);
  }
}

@Module({
  imports: [TelephonyModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
