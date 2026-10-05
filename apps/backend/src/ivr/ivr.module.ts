import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { Permission } from '../common/permissions';
import { LocalRecordingStorage } from '../recordings/recording-storage';
import { TelephonyModule } from '../telephony/telephony.module';
import { IvrSettingsDto, MembersDto, MenuDto, OptionsDto, PromptDto, QueueDto, SimulateDto, TicketStatusQueryDto } from './ivr.dto';
import { IvrService, MAX_AUDIO_BYTES, type UploadedAudio, VOICE_PROMPT_STORAGE } from './ivr.service';

/**
 * Telefoniya → Navbatlar va IVR. Ko'rish: administrator va supervisor/rahbariyat (monitoring),
 * o'zgartirish va PBX'ga yuklash — faqat settings.manage.
 */
@ApiTags('ivr')
@Controller('ivr')
export class IvrController {
  constructor(private readonly ivr: IvrService) {}

  @Get()
  @RequireAnyPermission(Permission.SettingsManage, Permission.MonitoringView)
  overview() {
    return this.ivr.overview();
  }

  @Put('settings')
  @RequirePermissions(Permission.SettingsManage)
  saveSettings(@CurrentUser() user: AuthUser, @Body() dto: IvrSettingsDto) {
    return this.ivr.saveSettings(user, dto);
  }

  @Post('simulate')
  @HttpCode(200)
  @RequireAnyPermission(Permission.SettingsManage, Permission.MonitoringView)
  simulate(@Body() dto: SimulateDto) {
    return this.ivr.simulate(dto);
  }

  @Get('ticket-status')
  @RequireAnyPermission(Permission.SettingsManage, Permission.MonitoringView)
  ticketStatus(@Query() query: TicketStatusQueryDto) {
    return this.ivr.ticketStatus(query.number);
  }

  @Post('publish')
  @HttpCode(200)
  @RequirePermissions(Permission.SettingsManage)
  publish(@CurrentUser() user: AuthUser) {
    return this.ivr.publish(user);
  }

  // ── Menyular

  @Post('menus')
  @RequirePermissions(Permission.SettingsManage)
  createMenu(@CurrentUser() user: AuthUser, @Body() dto: MenuDto) {
    return this.ivr.createMenu(user, dto);
  }

  @Put('menus/:id')
  @RequirePermissions(Permission.SettingsManage)
  updateMenu(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MenuDto) {
    return this.ivr.updateMenu(user, id, dto);
  }

  @Delete('menus/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.SettingsManage)
  deleteMenu(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.ivr.deleteMenu(user, id);
  }

  @Put('menus/:id/options')
  @RequirePermissions(Permission.SettingsManage)
  setOptions(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: OptionsDto) {
    return this.ivr.setOptions(user, id, dto);
  }

  // ── Ovozli xabarlar

  @Post('prompts')
  @RequirePermissions(Permission.SettingsManage)
  createPrompt(@CurrentUser() user: AuthUser, @Body() dto: PromptDto) {
    return this.ivr.createPrompt(user, dto);
  }

  @Patch('prompts/:id')
  @RequirePermissions(Permission.SettingsManage)
  updatePrompt(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: PromptDto) {
    return this.ivr.updatePrompt(user, id, dto);
  }

  @Delete('prompts/:id')
  @HttpCode(204)
  @RequirePermissions(Permission.SettingsManage)
  deletePrompt(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.ivr.deletePrompt(user, id);
  }

  @Post('prompts/:id/audio')
  @RequirePermissions(Permission.SettingsManage)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } }))
  uploadAudio(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @UploadedFile() file: UploadedAudio | undefined) {
    return this.ivr.uploadAudio(user, id, file);
  }

  @Delete('prompts/:id/audio')
  @RequirePermissions(Permission.SettingsManage)
  removeAudio(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.ivr.removeAudio(user, id);
  }

  @Get('prompts/:id/audio')
  @RequireAnyPermission(Permission.SettingsManage, Permission.MonitoringView)
  async audio(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const file = await this.ivr.openAudio(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    file.stream.on('error', () => res.destroy());
    file.stream.pipe(res);
  }

  // ── Navbatlar

  @Get('queues')
  @RequireAnyPermission(Permission.SettingsManage, Permission.MonitoringView)
  queues() {
    return this.ivr.queues();
  }

  @Get('agents')
  @RequireAnyPermission(Permission.SettingsManage, Permission.MonitoringView)
  agents() {
    return this.ivr.agents();
  }

  @Post('queues')
  @RequirePermissions(Permission.SettingsManage)
  createQueue(@CurrentUser() user: AuthUser, @Body() dto: QueueDto) {
    return this.ivr.createQueue(user, dto);
  }

  @Put('queues/:id')
  @RequirePermissions(Permission.SettingsManage)
  updateQueue(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: QueueDto) {
    return this.ivr.updateQueue(user, id, dto);
  }

  @Put('queues/:id/members')
  @RequirePermissions(Permission.SettingsManage)
  setMembers(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MembersDto) {
    return this.ivr.setMembers(user, id, dto);
  }
}

@Module({
  imports: [TelephonyModule],
  controllers: [IvrController],
  providers: [
    IvrService,
    {
      provide: VOICE_PROMPT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new LocalRecordingStorage(config.get<string>('VOICE_PROMPTS_DIR') ?? 'storage/prompts'),
    },
  ],
})
export class IvrModule {}
