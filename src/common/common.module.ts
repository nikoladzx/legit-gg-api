import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from '#/common/filters/all-exceptions.filter.js';
import { PrismaClientExceptionFilter } from '#/common/filters/prisma-client-exception.filter.js';

@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_FILTER, useClass: PrismaClientExceptionFilter },
  ],
})
export class CommonModule {}
