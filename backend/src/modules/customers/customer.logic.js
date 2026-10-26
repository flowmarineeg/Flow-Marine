'use strict';

// Pure list-query builder (unit-tested). The type filter is applied in the Mongo query, before pagination,
// so it filters the whole result set - not only the rows currently on screen.
const { escapeRegex } = require('../../utils/escapeRegex');
const TYPES = ['Commercial Agent', 'NVOCC', 'Freight Forwarder'];

const buildListQuery = ({ search = '', status = '', customerType = '' } = {}) => {
  const query = {};
  if (status) query.status = status;
  // "All Types" arrives as empty or "all"; anything that is not a known type is ignored rather than matching nothing
  if (customerType && TYPES.includes(customerType)) query.customerType = customerType;
  if (search) {
    const rx = escapeRegex(String(search));
    query.$or = [{ customerName: { $regex: rx, $options: 'i' } }, { customerCode: { $regex: rx, $options: 'i' } }];
  }
  return query;
};

module.exports = { buildListQuery, TYPES };
