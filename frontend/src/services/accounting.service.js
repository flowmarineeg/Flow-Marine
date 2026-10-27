import api from '../config/axios';

export const accountingService = {
  listAccounts:  (params)   => api.get('/accounting/accounts', { params }),
  meta:          ()         => api.get('/accounting/meta'),
  createAccount: (data)     => api.post('/accounting/accounts', data),
  updateAccount: (id, data) => api.put(`/accounting/accounts/${id}`, data),
  // exchange rates live on the ledger module (perm `ledger`)
  listRates:     (params)   => api.get('/ledger/exchange-rates', { params }),
  setRate:       (data)     => api.put('/ledger/exchange-rates', data),
};
