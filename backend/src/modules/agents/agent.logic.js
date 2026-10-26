'use strict';

// Pure agent rules (unit-tested).
// An agent can be chosen as a booking source unless it is explicitly Port-only. Older agents have roles: []
// (treated as plain commercial agents) so existing data keeps working; only roles exactly ['Port'] are excluded.
const isBookingSource = (agent) => {
  const roles = agent?.roles || [];
  return !(roles.length > 0 && roles.every((r) => r === 'Port'));
};

module.exports = { isBookingSource };
