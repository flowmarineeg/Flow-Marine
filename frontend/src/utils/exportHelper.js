/**
 * Trigger a file download in the browser from a Blob.
 * Works with Excel (.xlsx) and ZIP (.zip) responses.
 *
 * @param {Blob}   blob     – response.data from axios (responseType: 'blob')
 * @param {string} filename – suggested filename including extension
 */
export const downloadFile = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Build a date-stamped filename.
 * @param {string} module  e.g. 'bookings'
 * @param {string} ext     e.g. 'xlsx' or 'zip'
 */
export const exportFilename = (module, ext = 'xlsx') => {
  const date = new Date().toISOString().split('T')[0];
  return `${module}-export-${date}.${ext}`;
};
