'use strict';

// Pure route-leg rules (RV-08/09/10/11/12). No DB access: route.service.js loads the
// referenced master data in batches and hands it to checkLegReferences.

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const isId = (v) => OBJECT_ID.test(String(v ?? ''));
const bad = (message) => ({ status: 400, message });

/** Shape: >= 2 legs, country/city/port present and well-formed, optional ids well-formed. */
const assertLegShape = (legs) => {
  if (!Array.isArray(legs) || legs.length < 2) throw bad('A route must have at least 2 legs');
  legs.forEach((leg, i) => {
    const n = i + 1;
    if (!leg || !leg.countryId || !leg.cityId || !leg.portId) throw bad(`Leg ${n}: country, city, and port are required`);
    for (const f of ['countryId', 'cityId', 'portId']) {
      if (!isId(leg[f])) throw bad(`Leg ${n}: ${f} is not a valid id`);
    }
    for (const f of ['terminalId', 'agentId']) {
      if (leg[f] && !isId(leg[f])) throw bad(`Leg ${n}: ${f} is not a valid id`);
    }
  });
};

/** The same port may repeat (A-B-C-A) but never on two consecutive legs (it would generate POL = POD). */
const assertNoConsecutivePorts = (legs) => {
  for (let i = 0; i < legs.length - 1; i++) {
    if (String(legs[i].portId) === String(legs[i + 1].portId)) {
      throw bad(`Legs ${i + 1} and ${i + 2} use the same port; consecutive legs must be different ports`);
    }
  }
};

/** Distinct ids per kind, for the batch loads. */
const collectRefIds = (legs) => {
  const pick = (f) => [...new Set(legs.map((l) => l[f]).filter(Boolean).map(String))];
  return { countries: pick('countryId'), cities: pick('cityId'), ports: pick('portId'), terminals: pick('terminalId'), agents: pick('agentId') };
};

/**
 * maps: { countries, cities, ports, terminals, agents } -> Map<idString, doc>.
 * port: { cityId, countryId }, city: { countryId }, terminal: { portId }.
 */
const checkLegReferences = (legs, maps) => {
  legs.forEach((leg, i) => {
    const n = i + 1;
    const country = maps.countries.get(String(leg.countryId));
    if (!country) throw bad(`Leg ${n}: country does not exist`);
    const city = maps.cities.get(String(leg.cityId));
    if (!city) throw bad(`Leg ${n}: city does not exist`);
    if (String(city.countryId) !== String(leg.countryId)) throw bad(`Leg ${n}: city does not belong to the selected country`);
    const port = maps.ports.get(String(leg.portId));
    if (!port) throw bad(`Leg ${n}: port does not exist`);
    if (String(port.cityId) !== String(leg.cityId)) throw bad(`Leg ${n}: port does not belong to the selected city`);
    if (port.countryId && String(port.countryId) !== String(leg.countryId)) throw bad(`Leg ${n}: port does not belong to the selected country`);
    if (leg.terminalId) {
      const terminal = maps.terminals.get(String(leg.terminalId));
      if (!terminal) throw bad(`Leg ${n}: terminal does not exist`);
      if (String(terminal.portId) !== String(leg.portId)) throw bad(`Leg ${n}: terminal does not belong to the selected port`);
    }
    if (leg.agentId && !maps.agents.get(String(leg.agentId))) throw bad(`Leg ${n}: agent does not exist`);
  });
};

module.exports = { isId, assertLegShape, assertNoConsecutivePorts, collectRefIds, checkLegReferences };
