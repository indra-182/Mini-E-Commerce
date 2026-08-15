import "reflect-metadata";

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NestFactory } from "@nestjs/core";
import { RequestMethod, type INestApplication, type LoggerService } from "@nestjs/common";
import { json, static as serveStatic, urlencoded, type Express } from "express";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";
import { AllowedOriginMiddleware, createParserErrorHandler, RequestContextMiddleware, SafeRequestLoggingInterceptor, type RequestWithContext } from "./common/request-context.js";
import { ProblemDetailsDto } from "./common/problem-details.js";
import { createValidationPipe } from "./common/validation.js";
import { loadEnvironment, type AppEnvironment } from "./config/environment.js";

export type CreateApplicationOptions = {
  environment?: AppEnvironment;
  logger?: LoggerService | false;
};

export function operationIdFactory(controllerKey: string, methodKey: string): string {
  const controller = controllerKey.replace(/Controller$/, "");
  return `${controller.charAt(0).toLowerCase()}${controller.slice(1)}_${methodKey}`;
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Mini E-Commerce API")
    .setDescription("HTTP foundation for the Mini E-Commerce purchase journey.")
    .setVersion("1.0.0")
    .addCookieAuth("guest_session", { type: "apiKey", in: "cookie", name: "guest_session" }, "guest_session")
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory,
    extraModels: [ProblemDetailsDto]
  });
}

export function setupOpenApi(app: INestApplication): OpenAPIObject {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup("docs", app, document, {
    jsonDocumentUrl: "docs-json",
    useGlobalPrefix: false
  });
  return document;
}

function isReservedPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    pathname === "/docs-json" ||
    pathname === "/health"
  );
}

function staticDirectory(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "public");
}

function setupStaticHosting(app: INestApplication): void {
  const root = staticDirectory();
  if (!existsSync(root)) return;

  const expressApp = app.getHttpAdapter().getInstance() as Express;
  const staticMiddleware = serveStatic(root, {
    index: "index.html",
    setHeaders: (response, filePath) => {
      response.setHeader(
        "Cache-Control",
        filePath.endsWith(".html")
          ? "no-cache"
          : "public, max-age=31536000, immutable"
      );
    }
  });

  expressApp.use((request, response, next) => {
    if (isReservedPath(request.path)) {
      next();
      return;
    }
    staticMiddleware(request, response, next);
  });

  const notFoundPage = join(root, "404.html");
  expressApp.use((request, response, next) => {
    if (isReservedPath(request.path) || !["GET", "HEAD"].includes(request.method)) {
      next();
      return;
    }

    response.status(404).sendFile(notFoundPage, (error) => {
      if (error && !response.headersSent) next(error);
    });
  });
}

export async function createApplication(options: CreateApplicationOptions = {}): Promise<{
  app: INestApplication;
  document: OpenAPIObject;
  environment: AppEnvironment;
}> {
  const environment = options.environment ?? loadEnvironment();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: options.logger,
    abortOnError: false
  });
  setupStaticHosting(app);

  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "docs", method: RequestMethod.ALL },
      { path: "docs-json", method: RequestMethod.GET }
    ]
  });

  const requestContext = new RequestContextMiddleware();
  app.use(requestContext.use.bind(requestContext));
  app.use(
    json({
      limit: "64kb",
      verify: (request, _response, buffer) => {
        (request as RequestWithContext).rawBody = Buffer.from(buffer);
      }
    })
  );
  app.use(urlencoded({ extended: false, limit: "64kb" }));
  const allowedOrigin = new AllowedOriginMiddleware(environment);
  app.use(allowedOrigin.use.bind(allowedOrigin));
  app.use(createParserErrorHandler());
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalInterceptors(new SafeRequestLoggingInterceptor());

  const document = setupOpenApi(app);
  await app.init();
  return { app, document, environment };
}
