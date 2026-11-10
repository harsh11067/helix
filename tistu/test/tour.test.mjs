// F9 guided tour: six stops, skippable at every step, ends on the Ops panel.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TOUR_STEPS, tourCardHTML } from '../js/tour.js';

test('F9 tour: every stop is skippable; the last one ends on the Ops panel', () => {
  assert.equal(TOUR_STEPS.length, 6);
  for (let i = 0; i < TOUR_STEPS.length; i++) {
    const h = tourCardHTML(i);
    assert.match(h, new RegExp(`tour · ${i + 1} / 6`));
    assert.match(h, /data-tour="skip"/);
  }
  assert.match(tourCardHTML(5), /href="ops\.html"/);
  assert.match(tourCardHTML(0), /data-tour="next"/);
  assert.ok(TOUR_STEPS.every((s) => s.route === null || /^#\//.test(s.route)));
});
