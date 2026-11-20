'use strict';

// FL-05: a Final Loading booking cannot be edited, but it can be cancelled. Pure rule (no DB).

/** True when `data` asks for status = Cancelled and nothing else (the only change a Final Loading booking may take). */
const isCancelOnly = (data) => !!data && data.status === 'Cancelled' && Object.keys(data).every((k) => k === 'status');

module.exports = { isCancelOnly };
