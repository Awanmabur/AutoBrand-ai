const AppError = require('../utils/AppError');

const MAX_DEPTH = 12;
const MAX_KEYS = 5000;

function inspect(value, path = 'request', depth = 0, state = { keys: 0 }) {
  if (depth > MAX_DEPTH) throw new AppError('Request payload is too deeply nested.', 400);
  if (typeof value === 'string' && value.includes('\0')) throw new AppError('Request contains invalid characters.', 400);
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    state.keys += 1;
    if (state.keys > MAX_KEYS) throw new AppError('Request payload contains too many fields.', 400);
    if (key.startsWith('$') || key.includes('.') || ['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new AppError(`Invalid request field at ${path}.`, 400);
    }
    inspect(child, `${path}.${key}`, depth + 1, state);
  }
}

function requestSanitizer(req, _res, next) {
  try {
    inspect(req.body, 'body');
    inspect(req.query, 'query');
    inspect(req.params, 'params');
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = requestSanitizer;
