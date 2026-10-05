import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Req, Res } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { requestMeta } from '../common/http';
import { Permission } from '../common/permissions';
import { parseRange } from './range';
import { RecordingsService } from './recordings.service';

const MIME: Record<string, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', opus: 'audio/ogg' };

export class HoldDto {
  @IsBoolean()
  hold: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

@ApiTags('calls')
@Controller('calls')
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  /** Yozuvni oqim bilan beradi; Range qo'llanadi (pleyerda o'rtaga o'tish). ?download=1 — fayl sifatida. */
  @Get(':id/recording')
  @RequirePermissions(Permission.RecordingsPlay)
  async stream(
    @Param('id', ParseIntPipe) id: number,
    @Query('download') download: string | undefined,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const header = req.headers.range;
    const asFile = download === '1';
    // Pleyer faylni bo'laklab so'raydi: auditga faqat boshidan so'ralgani yoziladi
    const fromStart = !header || /^bytes=0-/.test(header.trim());
    const file = await this.recordings.open(user, id, { audit: fromStart, download: asFile }, requestMeta(req));

    const range = parseRange(header, file.size);
    if (range === 'invalid') {
      res.status(416).setHeader('Content-Range', `bytes */${file.size}`).end();
      return;
    }
    res.setHeader('Content-Type', MIME[file.format] ?? 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');
    if (asFile) res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);

    const stream = range ? file.read(range) : file.read();
    if (range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`);
      res.setHeader('Content-Length', String(range.end - range.start + 1));
    } else {
      res.setHeader('Content-Length', String(file.size));
    }
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  /** Nizoli yozuvni saqlab qo'yish yoki belgini olib tashlash (supervisor, rahbariyat). */
  @Post(':id/recording/hold')
  @HttpCode(200)
  @RequirePermissions(Permission.RecordingsPlay, Permission.MonitoringView)
  hold(@Param('id', ParseIntPipe) id: number, @Body() dto: HoldDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.recordings.setHold(user, id, dto.hold, dto.reason, requestMeta(req));
  }
}
