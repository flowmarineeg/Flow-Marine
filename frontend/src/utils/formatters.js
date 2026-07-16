// Date formatters
export const formatDate = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB'); // DD/MM/YYYY
};

export const formatDateTime = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-GB');
};

// Number formatters
export const formatNumber = (num) => {
  if (num === null || num === undefined) return '—';
  return Number(num).toLocaleString();
};

export const formatCurrency = (amount, currency = 'USD') => {
  if (amount === null || amount === undefined) return '—';
  return `${Number(amount).toLocaleString()} ${currency}`;
};

// Truncate long strings
export const truncate = (str, len = 40) => {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '...' : str;
};
