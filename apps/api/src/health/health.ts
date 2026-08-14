import { Controller, Get, HttpStatus, Inject, Res } from "@nestjs/common";
import { ApiExtraModels, ApiHeader, ApiOkResponse, ApiOperation, ApiProperty, ApiResponse, ApiTags, getSchemaPath } from "@nestjs/swagger";
import type { Response } from "express";

import { ProblemDetailsDto } from "../common/problem-details.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type HealthResponse = {
  status: "healthy" | "unavailable";
  database: "available" | "unavailable";
};

export class HealthResponseDto implements HealthResponse {
  @ApiProperty({ type: String, enum: ["healthy", "unavailable"], example: "healthy" })
  status!: HealthResponse["status"];

  @ApiProperty({ type: String, enum: ["available", "unavailable"], example: "available" })
  database!: HealthResponse["database"];
}

export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    let timeout: NodeJS.Timeout | undefined;
    const query = this.prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false
    );
    const timeoutResult = new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => resolve(false), 750);
    });

    try {
      const databaseAvailable = await Promise.race([query, timeoutResult]);
      return databaseAvailable
        ? { status: "healthy", database: "available" }
        : { status: "unavailable", database: "unavailable" };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}

@ApiExtraModels(ProblemDetailsDto, HealthResponseDto)
@ApiTags("Health")
@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get("health")
  @ApiOperation({ operationId: "health_check", summary: "Check API and database availability" })
  @ApiHeader({ name: "X-Request-Id", required: false, description: "Optional safe request ID to propagate." })
  @ApiOkResponse({
    type: HealthResponseDto,
    headers: { "X-Request-Id": { description: "Request ID propagated by the API.", schema: { type: "string" } } }
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "The API is running but the database is unavailable.",
    content: { "application/json": { schema: { $ref: getSchemaPath(HealthResponseDto) } } }
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    return this.healthService.check().then((result) => {
      if (result.status === "unavailable") response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return result;
    });
  }
}
