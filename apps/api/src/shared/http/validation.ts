import { ValidationError, ValidationPipe } from '@nestjs/common';
import type { FieldError } from '@bajet/contracts';
import { AppError } from '../errors/app-error';

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  const out: FieldError[] = [];
  for (const e of errors) {
    const field = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) {
      for (const message of Object.values(e.constraints)) out.push({ field, message });
    }
    if (e.children?.length) out.push(...flatten(e.children, field));
  }
  return out;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => {
      const fields = flatten(errors);
      return new AppError('VALIDATION_ERROR', fields[0]?.message ?? 'Invalid request.', { fields });
    },
  });
}
