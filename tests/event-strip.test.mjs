import assert from 'node:assert/strict';
import { axisTicks } from '../web/js/earth/EventStrip.js';
import { clockParts, longDate } from '../web/js/DateText.js';

// A year reads as twelve abbreviated months, each label centred in its month.
const year = axisTicks(Date.UTC(2018, 0, 1), Date.UTC(2019, 0, 1));
assert.deepEqual(year.map(t => t.label), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
assert.equal(year[1].ms, Date.UTC(2018, 1, 1));
assert.equal(year[1].endMs, Date.UTC(2018, 2, 1));

// A year cut short by the catalog end keeps only the months it reaches.
const partial = axisTicks(Date.UTC(2026, 0, 1), Date.UTC(2026, 9, 7));
assert.equal(partial.at(-1).label, 'Oct');
assert.equal(partial.at(-1).endMs, Date.UTC(2026, 9, 7));

// Short ranges switch to days, then to clock times, never more than eight labels.
const week = axisTicks(Date.UTC(2018, 3, 2), Date.UTC(2018, 3, 10));
assert.equal(week[0].label, 'Apr 2');
assert.ok(week.length <= 9);
const hours = axisTicks(Date.UTC(2018, 3, 2, 11, 35), Date.UTC(2018, 3, 2, 15, 35));
assert.ok(hours.every(t => /^\d\d:\d\d$/.test(t.label)) && hours.length <= 9);

// Dates spell the month and keep the year separate.
assert.deepEqual(clockParts(Date.UTC(2018, 8, 5, 7, 4)), { year: '2018', day: 'September 5', time: '07:04 UTC' });
assert.equal(longDate(Date.UTC(2018, 3, 2)), 'April 2, 2018');
console.log('event strip axis ok');
