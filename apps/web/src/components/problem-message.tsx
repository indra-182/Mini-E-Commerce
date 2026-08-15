import { ApiError, type ProblemDetails } from "@/lib/api-client";

export function ProblemMessage({
  problem,
}: Readonly<{ problem: ApiError | ProblemDetails | string }>) {
  if (typeof problem === "string") {
    return (
      <div className="problem-message" role="alert">
        <h2>Terjadi masalah</h2>
        <p>{problem}</p>
      </div>
    );
  }

  const details = problem instanceof ApiError ? problem.problem : problem;
  return (
    <div className="problem-message" role="alert">
      <h2>{details.title}</h2>
      <p>{details.detail}</p>
      {details.requestId !== "unknown" ? (
        <p className="muted">ID permintaan: {details.requestId}</p>
      ) : null}
    </div>
  );
}
