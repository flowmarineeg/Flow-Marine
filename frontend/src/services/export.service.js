import api from '../config/axios';

const BASE = '/export';

/**
 * When responseType:'blob' is used, Axios wraps error responses as Blobs.
 * This helper reads the Blob as text and parses the JSON message.
 */
const readBlobError = async (error) => {
  try {
    if (error.response?.data instanceof Blob) {
      const text = await error.response.data.text();
      const json = JSON.parse(text);
      return json.message || 'Export failed';
    }
    return error.response?.data?.message || error.message || 'Export failed';
  } catch {
    return 'Export failed';
  }
};

export const exportService = {
  /**
   * Download a single module as Excel (.xlsx).
   */
  exportExcel: ({ module, filters = {}, selectedIds = [] }) =>
    api.post(`${BASE}/excel`, { module, filters, selectedIds }, { responseType: 'blob' }),

  /**
   * Download multiple modules as a ZIP.
   * @param {Array<{module, filters, selectedIds}>} exportList
   */
  exportZip: (exportList) =>
    api.post(`${BASE}/zip`, { exports: exportList }, { responseType: 'blob' }),

  // Helper exposed so components can show proper error messages
  readBlobError,
};
