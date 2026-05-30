class AppError extends Error {
  constructor(message, status = 500, options = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.statusCode = status;
    this.code = options.code || undefined;
    this.title = options.title || undefined;
    this.expose = options.expose !== undefined ? options.expose : status < 500;
    this.details = options.details;
  }
}

module.exports = AppError;
