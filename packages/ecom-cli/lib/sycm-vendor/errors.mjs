export class CliError extends Error {
  constructor(code, message, { exitCode = 1, details, hint } = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
    this.hint = hint;
  }

  toJSON() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
        ...(this.hint ? { hint: this.hint } : {})
      }
    };
  }
}

export function invariant(condition, code, message, options) {
  if (!condition) throw new CliError(code, message, options);
}
