import { URL } from "node:url";

export const APP_ENVIRONMENT = Symbol("APP_ENVIRONMENT");

export type AppNodeEnvironment = "development" | "test" | "production";

export type AppEnvironment = {
  nodeEnv: AppNodeEnvironment;
  port: number;
  databaseUrl: string;
  directUrl: string;
  cookieSecret: string;
  fakePaymentWebhookSecret: string;
  publicBaseUrl: URL;
};

function required(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }
  return port;
}

function parseDatabaseUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }
  return value;
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const nodeEnv = required(source, "NODE_ENV");
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new Error("NODE_ENV must be development, test, or production.");
  }

  const publicBaseUrlValue = required(source, "PUBLIC_BASE_URL");
  let publicBaseUrl: URL;
  try {
    publicBaseUrl = new URL(publicBaseUrlValue);
  } catch {
    throw new Error("PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }

  if (publicBaseUrl.protocol !== "http:" && publicBaseUrl.protocol !== "https:") {
    throw new Error("PUBLIC_BASE_URL must be a valid HTTP(S) URL.");
  }

  const databaseUrl = required(source, "DATABASE_URL");
  const directUrl = required(source, "DIRECT_URL");

  return {
    nodeEnv,
    port: parsePort(required(source, "PORT")),
    databaseUrl: parseDatabaseUrl(databaseUrl, "DATABASE_URL"),
    directUrl: parseDatabaseUrl(directUrl, "DIRECT_URL"),
    cookieSecret: required(source, "COOKIE_SECRET"),
    fakePaymentWebhookSecret: required(source, "FAKE_PAYMENT_WEBHOOK_SECRET"),
    publicBaseUrl
  };
}

export const environmentProvider = {
  provide: APP_ENVIRONMENT,
  useFactory: (): AppEnvironment => loadEnvironment()
};
