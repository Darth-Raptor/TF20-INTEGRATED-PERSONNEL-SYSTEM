export function sendError(res, statusCode, code, message, meta = {}) {
  res.status(statusCode).json({
    error: {
      code,
      message,
    },
    meta,
  });
}

export function sendDetail(res, data, meta = {}) {
  res.status(200).json({ data, meta });
}
