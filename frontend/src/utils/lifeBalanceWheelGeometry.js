/**
 * Life Balance Wheel geometry (Spec §§11–14).
 * viewBox 0 0 800 800; rotation offset -90° so first category starts at top.
 */

export const WHEEL = Object.freeze({
  size: 800,
  centerX: 400,
  centerY: 400,
  innerRadius: 72,
  maxScoreRadius: 270,
  labelInner: 288,
  labelOuter: 372,
  labelTextRadius: 330,
  rotationOffsetDeg: -90,
  categoryGapDeg: 1.5,
  categoryCount: 10
});

export function degToRad(deg) {
  return (Number(deg) * Math.PI) / 180;
}

export function polarToCartesian(cx, cy, radius, angleDeg) {
  const rad = degToRad(angleDeg);
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad)
  };
}

export function scoreToRadius(score, {
  innerRadius = WHEEL.innerRadius,
  maxScoreRadius = WHEEL.maxScoreRadius
} = {}) {
  if (score == null || Number.isNaN(Number(score))) return null;
  const s = Math.min(10, Math.max(1, Number(score)));
  return innerRadius + (s / 10) * (maxScoreRadius - innerRadius);
}

export function categoryAngles(index, {
  categoryCount = WHEEL.categoryCount,
  gapDeg = WHEEL.categoryGapDeg,
  rotationOffsetDeg = WHEEL.rotationOffsetDeg
} = {}) {
  const sweep = 360 / categoryCount;
  const start = rotationOffsetDeg + index * sweep + gapDeg / 2;
  const end = rotationOffsetDeg + (index + 1) * sweep - gapDeg / 2;
  return { start, end, mid: (start + end) / 2, sweep: end - start };
}

/**
 * Annular sector path (donut wedge) from innerR to outerR between start/end degrees.
 */
export function annularSectorPath(cx, cy, innerR, outerR, startDeg, endDeg) {
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, outerR, startDeg);
  const p2 = polarToCartesian(cx, cy, outerR, endDeg);
  const p3 = polarToCartesian(cx, cy, innerR, endDeg);
  const p4 = polarToCartesian(cx, cy, innerR, startDeg);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    'Z'
  ].join(' ');
}

export function buildCategoryGeometry(categories = []) {
  const list = Array.isArray(categories) ? categories : [];
  return list.map((cat, index) => {
    const angles = categoryAngles(index);
    const score = cat.score == null ? null : Number(cat.score);
    const outerR = scoreToRadius(score) ?? WHEEL.maxScoreRadius;
    const fillPath =
      score == null
        ? null
        : annularSectorPath(
          WHEEL.centerX,
          WHEEL.centerY,
          WHEEL.innerRadius,
          outerR,
          angles.start,
          angles.end
        );
    const bgPath = annularSectorPath(
      WHEEL.centerX,
      WHEEL.centerY,
      WHEEL.innerRadius,
      WHEEL.maxScoreRadius,
      angles.start,
      angles.end
    );
    const labelPos = polarToCartesian(
      WHEEL.centerX,
      WHEEL.centerY,
      WHEEL.labelTextRadius,
      angles.mid
    );
    const scorePos = polarToCartesian(
      WHEEL.centerX,
      WHEEL.centerY,
      WHEEL.labelTextRadius + 22,
      angles.mid
    );
    const bandPath = annularSectorPath(
      WHEEL.centerX,
      WHEEL.centerY,
      WHEEL.labelInner,
      WHEEL.labelOuter,
      angles.start,
      angles.end
    );
    return {
      ...cat,
      index,
      angles,
      score,
      fillPath,
      bgPath,
      bandPath,
      labelPos,
      scorePos,
      answered: score != null
    };
  });
}

export function averageScore(categories = []) {
  const scores = (categories || [])
    .map((c) => c.score)
    .filter((s) => s != null && !Number.isNaN(Number(s)))
    .map(Number);
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}
