import api from '../config/axios';

export const locationsService = {
  // Countries
  getCountries:   (params)     => api.get('/locations/countries', { params }),
  getCountry:     (id)         => api.get(`/locations/countries/${id}`),
  createCountry:  (data)       => api.post('/locations/countries', data),
  updateCountry:  (id, data)   => api.put(`/locations/countries/${id}`, data),
  removeCountry:  (id)         => api.delete(`/locations/countries/${id}`),

  // Cities
  getCities:      (params)     => api.get('/locations/cities', { params }),
  getCity:        (id)         => api.get(`/locations/cities/${id}`),
  createCity:     (data)       => api.post('/locations/cities', data),
  updateCity:     (id, data)   => api.put(`/locations/cities/${id}`, data),
  removeCity:     (id)         => api.delete(`/locations/cities/${id}`),

  // Ports
  getPorts:       (params)     => api.get('/locations/ports', { params }),
  getPort:        (id)         => api.get(`/locations/ports/${id}`),
  createPort:     (data)       => api.post('/locations/ports', data),
  updatePort:     (id, data)   => api.put(`/locations/ports/${id}`, data),
  removePort:     (id)         => api.delete(`/locations/ports/${id}`),

  // Terminals
  getTerminals:   (params)     => api.get('/locations/terminals', { params }),
  getTerminal:    (id)         => api.get(`/locations/terminals/${id}`),
  createTerminal: (data)       => api.post('/locations/terminals', data),
  updateTerminal: (id, data)   => api.put(`/locations/terminals/${id}`, data),
  removeTerminal: (id)         => api.delete(`/locations/terminals/${id}`),
};
