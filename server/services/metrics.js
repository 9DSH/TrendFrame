const HOUR_MS = 3_600_000;
export const MIN_DELTA_HOURS = 0.5; // shorter gaps are too noisy for a rate
export const MIN_AGE_HOURS = 1;     // younger videos give meaningless lifetime averages

export function computeSnapshotMetrics({ current, previous, publishedAt, capturedAt }) {
  const capturedMs = Date.parse(capturedAt);
  const videoAgeHours = Math.max((capturedMs - Date.parse(publishedAt)) / HOUR_MS, 0);

  const views = current.viewCount;
  const likes = current.likeCount ?? null;       // null when the creator hides likes
  const comments = current.commentCount ?? null; // null when comments are disabled
  const engagementRate = views > 0 && likes !== null ? (likes + (comments ?? 0)) / views : null;

  let viewsGained = null;
  let hoursSincePrev = null;
  if (previous) {
    hoursSincePrev = (capturedMs - Date.parse(previous.captured_at)) / HOUR_MS;
    const gained = views - previous.view_count;
    if (gained >= 0) viewsGained = gained; // negative = YouTube view correction, ignore
  }

  let viewsPerHour = null;
  let velocityBasis = 'none';
  if (viewsGained !== null && hoursSincePrev >= MIN_DELTA_HOURS) {
    viewsPerHour = viewsGained / hoursSincePrev;
    velocityBasis = 'snapshot_delta';
  } else if (videoAgeHours >= MIN_AGE_HOURS) {
    viewsPerHour = views / videoAgeHours;
    velocityBasis = 'lifetime_average';
  }

  return {
    viewsGained,
    hoursSincePrev,
    viewsPerHour,
    viewsPerDay: viewsPerHour === null ? null : viewsPerHour * 24,
    engagementRate,
    videoAgeHours,
    velocityBasis,
  };
}