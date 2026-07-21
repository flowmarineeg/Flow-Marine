'use strict';

/**
 * TEU Resolver — Sprint 022
 *
 * Derives the TEU value from a container size string.
 * Container TYPE (Dry, Reefer, etc.) is intentionally ignored — only SIZE matters.
 *
 * Business rules:
 *   20ft  → 1 TEU
 *   40ft  → 2 TEU
 *   40HC  → 2 TEU
 *   45ft  → 2 TEU
 *   unknown → 1 TEU (fail-safe) + matched: false
 *
 * Normalises the string before matching so future variants like '20RF',
 * '40OT', '40hc' are handled without code changes.
 *
 * @param {string} size
 * @returns {{ teu: number, matched: boolean }}
 */
function resolveTEU(size) {
  if (!size || typeof size !== 'string') {
    return { teu: 1, matched: false };
  }
  // Normalise: trim, uppercase, strip all whitespace
  const norm = size.trim().toUpperCase().replace(/\s+/g, '');

  // Extract the leading 2-3 digit numeric length (e.g. '20' from '20FT', '40' from '40HC')
  const m = norm.match(/^(\d{2,3})/);
  if (!m) return { teu: 1, matched: false };

  const len = Number(m[1]);

  if (len === 20)               return { teu: 1, matched: true };
  if (len === 40 || len === 45) return { teu: 2, matched: true };

  // Unknown numeric length — fail-safe to 1 TEU
  return { teu: 1, matched: false };
}

module.exports = { resolveTEU };
