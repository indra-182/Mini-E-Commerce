import { randomUUID } from "node:crypto";

import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor, type NestMiddleware } from "@nestjs/common";
import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { tap, type Observable } from "rxjs";

import { type AppEnvironment } from "../config/environment.js";
import { ProblemException, problemFromException, problemFromParserError, writeProblem } from "./problem-details.js";

export type RequestWithContext = Request & {
  requestId?: string;
  rawBody?: Buffer;
  safeLogContext?: {
    requestId: string;
    method: string;
  };
};

function isSafeRequestId(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: RequestWithContext, response: Response, next: NextFunction): void {
    const suppliedRequestId = request.get("X-Request-Id");
    const requestId = isSafeRequestId(suppliedRequestId) ? suppliedRequestId : randomUUID();
    request.requestId = requestId;
    request.safeLogContext = { requestId, method: request.method };
    response.setHeader("X-Request-Id", requestId);
    next();
  }
}

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function sameOrigin(value: string, expected: string): boolean {
  try {
    return new URL(value).origin === expected;
  } catch {
    return false;
  }
}

export class AllowedOriginMiddleware {
  constructor(private readonly environment: AppEnvironment) {}

  use(request: RequestWithContext, _response: Response, next: NextFunction): void {
    if (!unsafeMethods.has(request.method)) {
      next();
      return;
    }

    const origin = request.get("Origin");
    if (!origin || sameOrigin(origin, this.environment.publicBaseUrl.origin)) {
      next();
      return;
    }

    next(
      new ProblemException({
        status: 400,
        code: "MALFORMED_REQUEST",
        detail: "Origin is not allowed."
      })
    );
  }
}

export function createParserErrorHandler(): ErrorRequestHandler {
  return (error: unknown, request: RequestWithContext, response: Response, next: NextFunction): void => {
    if (!error) {
      next();
      return;
    }

    if (response.headersSent) {
      next(error);
      return;
    }

    const requestId = request.requestId ?? "unknown";
    const parserError = error as { type?: unknown };
    if (parserError.type === "entity.too.large" || error instanceof SyntaxError) {
      writeProblem(response, problemFromParserError(error, requestId));
      return;
    }

    writeProblem(response, problemFromException(error, requestId));
  };
}

@Injectable()
export class SafeRequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("http");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    const log = (): void => {
      this.logger.debug(
        JSON.stringify({
          requestId: request.requestId ?? "unknown",
          method: request.method,
          status: response.statusCode,
          durationMs: Date.now() - startedAt
        })
      );
    };

    return next.handle().pipe(tap({ next: log, error: log }));
  }
}
