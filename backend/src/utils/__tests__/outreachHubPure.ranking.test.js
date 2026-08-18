import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detourExtraMiles,
  rankSchoolsBetweenAnchors,
  bestInsertIndexBetween,
  stopColorForOrder,
  OUTREACH_STOP_COLORS
} from '../outreachHubPure.js';

describe('outreachHubPure dual-origin ranking', () => {
  const A = { lat: 38.85, lng: -104.80 };
  const B = { lat: 38.90, lng: -104.75 };
  const onWay = { id: 1, name: 'On Way', lat: 38.875, lng: -104.775 };
  const far = { id: 2, name: 'Far', lat: 39.1, lng: -104.5 };

  it('detourExtraMiles is near zero for a point on the segment', () => {
    const extra = detourExtraMiles(A, onWay, B);
    assert.notEqual(extra, null);
    assert.ok(extra < 2);
  });

  it('detourExtraMiles is larger for a far point', () => {
    const onWayExtra = detourExtraMiles(A, onWay, B);
    const farExtra = detourExtraMiles(A, far, B);
    assert.notEqual(farExtra, null);
    assert.ok(farExtra > onWayExtra);
  });

  it('rankSchoolsBetweenAnchors sorts by extra miles', () => {
    const ranked = rankSchoolsBetweenAnchors([far, onWay], A, B);
    assert.equal(ranked[0].id, 1);
    assert.ok(ranked[0].extra_miles < ranked[1].extra_miles);
    assert.notEqual(ranked[0].miles_to_a, null);
    assert.notEqual(ranked[0].miles_to_b, null);
  });

  it('rankSchoolsBetweenAnchors respects excludeIds', () => {
    const ranked = rankSchoolsBetweenAnchors([onWay, far], A, B, { excludeIds: [1] });
    assert.ok(ranked.every((s) => s.id !== 1));
  });

  it('bestInsertIndexBetween inserts between first and last', () => {
    const stops = [
      { id: 10, name: 'A', ...A },
      { id: 20, name: 'B', ...B }
    ];
    assert.equal(bestInsertIndexBetween(stops, onWay, 0, 1), 1);
  });

  it('stopColorForOrder cycles the palette', () => {
    assert.equal(stopColorForOrder(0), OUTREACH_STOP_COLORS[0]);
    assert.equal(stopColorForOrder(6), OUTREACH_STOP_COLORS[0]);
    assert.equal(stopColorForOrder(2), OUTREACH_STOP_COLORS[2]);
  });
});
