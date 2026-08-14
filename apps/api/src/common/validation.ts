import { ValidationPipe, type Type } from "@nestjs/common";

import { ProblemException } from "./problem-details.js";

export function createValidationPipe(expectedType?: Type<unknown>): ValidationPipe {
  return new ValidationPipe({
    expectedType,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) =>
      new ProblemException({
        status: 422,
        code: "VALIDATION_FAILED",
        detail: "Request validation failed.",
        errors: errors.reduce<Record<string, string[]>>((result, error) => {
          const messages = error.constraints ? Object.values(error.constraints) : [];
          if (messages.length > 0) result[error.property] = messages;
          return result;
        }, {})
      })
  });
}
