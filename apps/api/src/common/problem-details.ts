import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Request, Response } from "express";

export const PROBLEM_CODES = [
  "MALFORMED_REQUEST",
  "GUEST_SESSION_REQUIRED",
  "PRODUCT_NOT_FOUND",
  "ARTICLE_NOT_FOUND",
  "CART_ITEM_NOT_FOUND",
  "ORDER_NOT_FOUND",
  "CHECKOUT_CART_CHANGED",
  "INSUFFICIENT_STOCK",
  "IDEMPOTENCY_KEY_REUSED",
  "INVALID_ORDER_TRANSITION",
  "CART_VERSION_MISMATCH",
  "VALIDATION_FAILED",
  "PRECONDITION_REQUIRED",
  "PAYMENT_GATEWAY_UNAVAILABLE",
  "INTERNAL_ERROR"
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

const problemTitles: Record<ProblemCode, string> = {
  MALFORMED_REQUEST: "Malformed request",
  GUEST_SESSION_REQUIRED: "Guest session required",
  PRODUCT_NOT_FOUND: "Product not found",
  ARTICLE_NOT_FOUND: "Article not found",
  CART_ITEM_NOT_FOUND: "Cart item not found",
  ORDER_NOT_FOUND: "Order not found",
  CHECKOUT_CART_CHANGED: "Cart changed",
  INSUFFICIENT_STOCK: "Insufficient stock",
  IDEMPOTENCY_KEY_REUSED: "Idempotency key reused",
  INVALID_ORDER_TRANSITION: "Invalid order transition",
  CART_VERSION_MISMATCH: "Cart version mismatch",
  VALIDATION_FAILED: "Validation failed",
  PRECONDITION_REQUIRED: "Precondition required",
  PAYMENT_GATEWAY_UNAVAILABLE: "Payment gateway unavailable",
  INTERNAL_ERROR: "Internal error"
};

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail: string;
  requestId: string;
  errors?: Record<string, string[]>;
  currentCart?: Record<string, unknown>;
  order?: Record<string, unknown>;
  paymentAttempt?: Record<string, unknown>;
};

type ProblemInit = Omit<ProblemDetails, "type" | "title" | "requestId"> &
  Partial<Pick<ProblemDetails, "type" | "title">>;

export class ProblemDetailsDto {
  @ApiProperty({ type: String, format: "uri", example: "urn:mini-e-commerce:problem:VALIDATION_FAILED" })
  type!: string;

  @ApiProperty({ type: String, example: "Validation failed" })
  title!: string;

  @ApiProperty({ type: Number, example: 422 })
  status!: number;

  @ApiProperty({ type: String, enum: PROBLEM_CODES, example: "VALIDATION_FAILED" })
  code!: ProblemCode;

  @ApiProperty({ type: String, example: "Request validation failed." })
  detail!: string;

  @ApiProperty({ type: String, example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" })
  requestId!: string;

  @ApiPropertyOptional({ type: "object", additionalProperties: { type: "array", items: { type: "string" } } })
  errors?: Record<string, string[]>;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  currentCart?: Record<string, unknown>;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  order?: Record<string, unknown>;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  paymentAttempt?: Record<string, unknown>;
}

function problemType(code: ProblemCode): string {
  return `urn:mini-e-commerce:problem:${code}`;
}

export class ProblemException extends HttpException {
  readonly problem: Omit<ProblemDetails, "requestId">;

  constructor(init: ProblemInit) {
    const problem = {
      type: init.type ?? problemType(init.code),
      title: init.title ?? problemTitles[init.code],
      status: init.status,
      code: init.code,
      detail: init.detail,
      ...(init.errors ? { errors: init.errors } : {}),
      ...(init.currentCart ? { currentCart: init.currentCart } : {}),
      ...(init.order ? { order: init.order } : {}),
      ...(init.paymentAttempt ? { paymentAttempt: init.paymentAttempt } : {})
    } satisfies Omit<ProblemDetails, "requestId">;

    super(problem, problem.status);
    this.problem = problem;
  }
}

function isProblemCode(value: unknown): value is ProblemCode {
  return typeof value === "string" && (PROBLEM_CODES as readonly string[]).includes(value);
}

function problemCodeForStatus(status: number): ProblemCode {
  if (status === HttpStatus.UNAUTHORIZED) return "GUEST_SESSION_REQUIRED";
  if (status === HttpStatus.UNPROCESSABLE_ENTITY) return "VALIDATION_FAILED";
  if (status === HttpStatus.PRECONDITION_FAILED) return "CART_VERSION_MISMATCH";
  if (status === HttpStatus.PRECONDITION_REQUIRED) return "PRECONDITION_REQUIRED";
  if (status === HttpStatus.BAD_GATEWAY) return "PAYMENT_GATEWAY_UNAVAILABLE";
  if (status >= 500) return "INTERNAL_ERROR";
  return "MALFORMED_REQUEST";
}

function safeValidationErrors(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(value)) {
    if (!Array.isArray(messages) || !messages.every((message) => typeof message === "string")) continue;
    result[field] = messages;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function problemFromException(exception: unknown, requestId: string): ProblemDetails {
  if (exception instanceof ProblemException) {
    return { ...exception.problem, requestId };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const responseObject = typeof response === "object" && response !== null ? response : undefined;
    const responseCode = responseObject && "code" in responseObject ? responseObject.code : undefined;
    const code = isProblemCode(responseCode) ? responseCode : problemCodeForStatus(status);
    const responseErrors = responseObject && "errors" in responseObject ? responseObject.errors : undefined;
    const errors = safeValidationErrors(responseErrors);

    return {
      type: problemType(code),
      title: problemTitles[code],
      status,
      code,
      detail: status >= 500 ? "An unexpected error occurred." : "The request could not be processed.",
      requestId,
      ...(errors ? { errors } : {})
    };
  }

  return {
    type: problemType("INTERNAL_ERROR"),
    title: problemTitles.INTERNAL_ERROR,
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: "INTERNAL_ERROR",
    detail: "An unexpected error occurred.",
    requestId
  };
}

export function problemFromParserError(error: unknown, requestId: string): ProblemDetails {
  const parserError = error as { type?: unknown };
  const status = parserError.type === "entity.too.large" ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
  return {
    type: problemType("MALFORMED_REQUEST"),
    title: problemTitles.MALFORMED_REQUEST,
    status,
    code: "MALFORMED_REQUEST",
    detail: status === HttpStatus.PAYLOAD_TOO_LARGE ? "Request body exceeds the 64 KB limit." : "Request body is not valid JSON.",
    requestId
  };
}

export function writeProblem(response: Response, problem: ProblemDetails): void {
  if (response.headersSent) return;
  response.status(problem.status);
  response.setHeader("Content-Type", "application/problem+json");
  response.setHeader("X-Request-Id", problem.requestId);
  response.json(problem);
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { requestId?: string }>();
    const response = context.getResponse<Response>();
    const requestId = request.requestId ?? "unknown";
    writeProblem(response, problemFromException(exception, requestId));
  }
}
