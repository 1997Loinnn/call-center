import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ACCESS_TOKEN_COOKIE } from './auth/auth.constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Nginx orqasida ishlaganda haqiqiy mijoz IP'si audit jurnaliga yozilishi uchun
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle('Call-markaz API')
    .setDescription('Kadastr agentligi "Zamonaviy Call-markaz" yagona axborot tizimi')
    .setVersion('0.1.0')
    .addCookieAuth(ACCESS_TOKEN_COOKIE)
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`Backend ishga tushdi: http://localhost:${port}/api (Swagger: /api/docs)`, 'Bootstrap');
}

void bootstrap();
