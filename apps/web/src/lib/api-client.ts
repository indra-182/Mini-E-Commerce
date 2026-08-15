import type { components, paths } from "@mini-ecommerce/api-types";

export type ProblemDetails = components["schemas"]["ProblemDetailsDto"];
export type ApiPath = keyof paths;
type SuccessStatus = 200 | 201 | 202 | 204;

type OperationFor<Path extends ApiPath> = {
  [Method in keyof paths[Path]]: paths[Path][Method] extends {
    responses: unknown;
  }
    ? paths[Path][Method]
    : never;
}[keyof paths[Path]];

type SuccessResponse<Responses> =
  Extract<keyof Responses, SuccessStatus> extends infer Status
    ? Status extends keyof Responses
      ? Responses[Status]
      : never
    : never;

type SuccessBody<Operation> = Operation extends { responses: infer Responses }
  ? SuccessResponse<Responses> extends infer Response
    ? Response extends { content: { "application/json": infer Body } }
      ? Body
      : never
    : never
  : never;

export type ApiResponse<Body> = {
  data: Body;
  headers: Headers;
  requestId: string | null;
  etag: string | null;
};

export type ApiRequestInit<Body = unknown> = Omit<RequestInit, "body"> & {
  query?: Record<string, boolean | number | string | undefined>;
  body?: Body;
};

export class ApiError extends Error {
  readonly name = "ApiError";

  constructor(
    readonly problem: ProblemDetails,
    readonly status: number,
    readonly requestId: string | null,
    readonly etag: string | null,
    readonly headers: Headers,
  ) {
    super(problem.detail);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.detail === "string" &&
    typeof value.status === "number" &&
    typeof value.code === "string" &&
    typeof value.requestId === "string"
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function withQuery(path: string, query?: ApiRequestInit["query"]): string {
  if (!query) return path;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }

  const suffix = search.toString();
  return suffix ? `${path}${path.includes("?") ? "&" : "?"}${suffix}` : path;
}

function fallbackProblem(
  status: number,
  requestId: string | null,
): ProblemDetails {
  return {
    type: "urn:mini-e-commerce:problem:INTERNAL_ERROR",
    title: "Request failed",
    status,
    code: "INTERNAL_ERROR",
    detail: `The request failed with status ${status}.`,
    requestId: requestId ?? "unknown",
  };
}

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);

export async function apiFetch<Path extends ApiPath>(
  path: Path,
  init?: ApiRequestInit,
): Promise<ApiResponse<SuccessBody<OperationFor<Path>>>>;
export async function apiFetch<Body>(
  path: string,
  init?: ApiRequestInit,
): Promise<ApiResponse<Body>>;
export async function apiFetch<Body>(
  path: string,
  init: ApiRequestInit = {},
): Promise<ApiResponse<Body>> {
  const { body, query, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  headers.set("Accept", "application/json");
  if (body !== undefined && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  const response = await fetch(`${apiBaseUrl}${withQuery(path, query)}`, {
    ...requestInit,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: requestInit.credentials ?? "include",
    headers,
  });
  const requestId = response.headers.get("X-Request-Id");
  const etag = response.headers.get("ETag");
  const payload = await readJson(response);

  if (!response.ok) {
    const problem = isProblemDetails(payload)
      ? payload
      : fallbackProblem(response.status, requestId);
    throw new ApiError(
      problem,
      response.status,
      requestId ?? problem.requestId,
      etag,
      response.headers,
    );
  }

  return { data: payload as Body, headers: response.headers, requestId, etag };
}
