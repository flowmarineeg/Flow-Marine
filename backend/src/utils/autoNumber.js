'use strict';

const Counter = require('../modules/counters/counter.model');

const formats = {
  round:         (seq) => `R${String(seq).padStart(6, '0')}`,
  booking:       (seq) => `BK-${String(seq).padStart(6, '0')}`,
  manualBooking: (seq) => `MB-${String(seq).padStart(6, '0')}`,
  invoice:       (seq) => `INV-${String(seq).padStart(6, '0')}`,
  creditNote:    (seq) => `CN-${String(seq).padStart(6, '0')}`, // Sprint051 V2
  debitNote:     (seq) => `DN-${String(seq).padStart(6, '0')}`, // Sprint051 V2
  handling:      (seq) => `HC-${String(seq).padStart(6, '0')}`, // Sprint052 V2
  journal:       (seq) => `JE-${String(seq).padStart(6, '0')}`, // Sprint050 V2
};

/**
 * Generate the next auto-number for a given key.
 * @param {string} key - 'round' | 'booking' | 'invoice'
 */
const nextNumber = async (key) => {
  if (!formats[key]) throw new Error(`Unknown counter key: ${key}`);
  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return formats[key](counter.seq);
};

/**
 * Generate a batch of N sequential auto-numbers in a single DB round-trip.
 * Sprint020 PERF-004: used by booking import bulkWrite to pre-allocate numbers.
 * @param {string} key   - 'round' | 'booking' | 'invoice'
 * @param {number} count - how many numbers to reserve
 * @returns {string[]}   - array of formatted numbers in sequence order
 */
const nextNumberBatch = async (key, count) => {
  if (!formats[key]) throw new Error(`Unknown counter key: ${key}`);
  if (!count || count < 1) return [];

  // Atomically increment by count — returns the NEW (final) seq value
  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: count } },
    { new: true, upsert: true }
  );

  // Numbers reserved: (finalSeq - count + 1) … finalSeq
  const finalSeq = counter.seq;
  const numbers  = [];
  for (let i = count; i >= 1; i--) {
    numbers.push(formats[key](finalSeq - i + 1));
  }
  return numbers;
};

module.exports = { nextNumber, nextNumberBatch };
