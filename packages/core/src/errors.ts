export class ContextParcelError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "ContextParcelError";
  }
}

export class ProjectNotFoundError extends ContextParcelError {
  constructor(projectId: string) {
    super(`Registered project not found: ${projectId}`, "PROJECT_NOT_FOUND", 404);
    this.name = "ProjectNotFoundError";
  }
}

export class PathSecurityError extends ContextParcelError {
  constructor(message = "Path is outside the registered project root.") {
    super(message, "PATH_NOT_ALLOWED", 403);
    this.name = "PathSecurityError";
  }
}

export class AuthenticationError extends ContextParcelError {
  constructor(message = "Pairing token is missing or invalid.") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "AuthenticationError";
  }
}

export class OriginError extends ContextParcelError {
  constructor(message = "Request origin is not an authorized browser extension.") {
    super(message, "ORIGIN_NOT_ALLOWED", 403);
    this.name = "OriginError";
  }
}
