export const VIDEO_TYPES = ['both', 'short', 'long'];

/** 'short' | 'long' | 'unknown'. Live streams and premieres report 0 s, so they are 'unknown'. */
export function classifyVideo(durationSeconds, shortMax) {
  if (durationSeconds == null || durationSeconds <= 0) return 'unknown';
  return durationSeconds <= shortMax ? 'short' : 'long';
}

/** 'both' accepts everything; 'short' / 'long' accept only that class. */
export const matchesType = (durationSeconds, type, shortMax) =>
  !type || type === 'both' || classifyVideo(durationSeconds, shortMax) === type;

export const normalizeType = (v) => (v === 'short' || v === 'long' ? v : null);

/** SQL expression for the class. Bind @shortMax. */
export const TYPE_SQL = (col = 'v.duration_seconds') =>
  `(CASE WHEN ${col} IS NULL OR ${col} <= 0 THEN 'unknown' WHEN ${col} <= @shortMax THEN 'short' ELSE 'long' END)`;

/** Optional filter. Bind @shortMax and @vtype (NULL = no filter). */
export const TYPE_FILTER_SQL = (col = 'v.duration_seconds') => `(@vtype IS NULL OR ${TYPE_SQL(col)} = @vtype)`;