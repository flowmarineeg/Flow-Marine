import api from '../config/axios';

export const routesService = {
  getRoute:  (serviceId)        => api.get(`/services/${serviceId}/route`),
  saveRoute: (serviceId, legs)  => api.post(`/services/${serviceId}/route`, { legs }),
};
