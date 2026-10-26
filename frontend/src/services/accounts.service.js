import api from '../config/axios';

// Chart-of-accounts dropdown data for master-data forms. rule: 'revenue' | 'expense' | 'accrual'
export const accountsService = {
  lookup: (rule) => api.get('/ledger/account-lookup', { params: { rule } }),
};
