export interface LogFields {
  [key: string]: boolean | number | string | null | undefined;
}

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export class StructuredLogger implements Logger {
  constructor(private readonly output: NodeJS.WritableStream = process.stderr) {}

  info(event: string, fields: LogFields = {}): void {
    this.write("info", event, fields);
  }

  warn(event: string, fields: LogFields = {}): void {
    this.write("warn", event, fields);
  }

  error(event: string, fields: LogFields = {}): void {
    this.write("error", event, fields);
  }

  private write(level: string, event: string, fields: LogFields): void {
    this.output.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields })}\n`
    );
  }
}
