'use strict';

const pickFields = require('../../utils/pickFields');
const Country  = require('./country.model');
const City     = require('./city.model');
const Port     = require('./port.model');
const Terminal = require('./terminal.model');
const { escapeRegex } = require('../../utils/escapeRegex');

// RouteLeg module (Sprint 6) may not exist yet — guard against it safely
const countRouteLegsReferencing = async (query) => {
  let RouteLeg;
  try {
    RouteLeg = require('../routes/routeLeg.model');
  } catch {
    return 0;
  }
  return RouteLeg.countDocuments(query);
};

// ════════════════════════════════════════════════════════════════════════════
// COUNTRIES
// ════════════════════════════════════════════════════════════════════════════

const listCountries = async ({ search = '' } = {}) => {
  const query = {};
  if (search) {
    const rx = escapeRegex(search);
    query.$or = [
      { name: { $regex: rx, $options: 'i' } },
      { code: { $regex: rx, $options: 'i' } },
    ];
  }
  return Country.find(query).sort({ name: 1 }).lean();
};

const getCountryById = async (id) => {
  const country = await Country.findOne({ _id: id }).lean();
  if (!country) throw { status: 404, message: 'Country not found' };
  return country;
};

const createCountry = async (data, createdBy) => {
  const code = data.code.toUpperCase();
  const exists = await Country.findOne({ $or: [{ name: data.name }, { code }] });
  if (exists) throw { status: 400, message: `Country with this name or code "${code}" already exists` };
  const country = await Country.create({ ...pickFields(Country, data), code, createdBy });
  return country.toObject();
};

const updateCountry = async (id, data, updatedBy) => {
  const country = await Country.findOne({ _id: id });
  if (!country) throw { status: 404, message: 'Country not found' };

  const code = data.code ? data.code.toUpperCase() : country.code;
  const name = data.name || country.name;
  const dup = await Country.findOne({ $or: [{ name }, { code }], _id: { $ne: id } });
  if (dup) throw { status: 400, message: `Country with this name or code "${code}" already exists` };

  Object.assign(country, { ...pickFields(Country, data), code, updatedBy });
  await country.save();
  return country.toObject();
};

const deleteCountry = async (id) => {
  const country = await Country.findOne({ _id: id });
  if (!country) throw { status: 404, message: 'Country not found' };

  const cityCount = await City.countDocuments({ countryId: id });
  if (cityCount > 0) throw { status: 400, message: `Cannot delete — ${cityCount} cit${cityCount === 1 ? 'y' : 'ies'} reference this country` };

  await Country.findByIdAndDelete(id);
};

// ════════════════════════════════════════════════════════════════════════════
// CITIES
// ════════════════════════════════════════════════════════════════════════════

const listCities = async ({ countryId = '', search = '' } = {}) => {
  const query = {};
  if (countryId) query.countryId = countryId;
  if (search) query.name = { $regex: escapeRegex(search), $options: 'i' };
  return City.find(query).populate('countryId', 'name code localCurrency').sort({ name: 1 }).lean();
};

const getCityById = async (id) => {
  const city = await City.findOne({ _id: id }).populate('countryId', 'name code localCurrency').lean();
  if (!city) throw { status: 404, message: 'City not found' };
  return city;
};

const createCity = async (data, createdBy) => {
  const country = await Country.findOne({ _id: data.countryId });
  if (!country) throw { status: 400, message: 'Selected country does not exist' };

  const exists = await City.findOne({ name: data.name, countryId: data.countryId });
  if (exists) throw { status: 400, message: `City "${data.name}" already exists in this country` };

  const city = await City.create({ ...pickFields(City, data), createdBy });
  return city.toObject();
};

const updateCity = async (id, data, updatedBy) => {
  const city = await City.findOne({ _id: id });
  if (!city) throw { status: 404, message: 'City not found' };

  const countryId = data.countryId || city.countryId;
  if (data.countryId) {
    const country = await Country.findOne({ _id: countryId });
    if (!country) throw { status: 400, message: 'Selected country does not exist' };
  }

  const name = data.name || city.name;
  const dup = await City.findOne({ name, countryId, _id: { $ne: id } });
  if (dup) throw { status: 400, message: `City "${name}" already exists in this country` };

  Object.assign(city, { ...pickFields(City, data), updatedBy });
  await city.save();
  return city.toObject();
};

const deleteCity = async (id) => {
  const city = await City.findOne({ _id: id });
  if (!city) throw { status: 404, message: 'City not found' };

  const portCount = await Port.countDocuments({ cityId: id });
  if (portCount > 0) throw { status: 400, message: `Cannot delete — ${portCount} port${portCount === 1 ? '' : 's'} reference this city` };

  await City.findByIdAndDelete(id);
};

// ════════════════════════════════════════════════════════════════════════════
// PORTS
// ════════════════════════════════════════════════════════════════════════════

const listPorts = async ({ cityId = '', countryId = '', search = '' } = {}) => {
  const query = {};
  if (cityId) query.cityId = cityId;
  if (countryId) query.countryId = countryId;
  if (search) {
    const rx = escapeRegex(search);
    query.$or = [
      { name: { $regex: rx, $options: 'i' } },
      { code: { $regex: rx, $options: 'i' } },
    ];
  }
  return Port.find(query)
    .populate('cityId', 'name')
    .populate('countryId', 'name code localCurrency')
    .sort({ name: 1 })
    .lean();
};

const getPortById = async (id) => {
  const port = await Port.findOne({ _id: id })
    .populate('cityId', 'name')
    .populate('countryId', 'name code localCurrency')
    .lean();
  if (!port) throw { status: 404, message: 'Port not found' };
  return port;
};

const createPort = async (data, createdBy) => {
  const city = await City.findOne({ _id: data.cityId });
  if (!city) throw { status: 400, message: 'Selected city does not exist' };
  if (String(city.countryId) !== String(data.countryId)) {
    throw { status: 400, message: 'Selected city does not belong to the selected country' };
  }

  const exists = await Port.findOne({ name: data.name, cityId: data.cityId });
  if (exists) throw { status: 400, message: `Port "${data.name}" already exists in this city` };

  const port = await Port.create({ ...pickFields(Port, data), code: data.code ? data.code.toUpperCase() : null, createdBy });
  return port.toObject();
};

const updatePort = async (id, data, updatedBy) => {
  const port = await Port.findOne({ _id: id });
  if (!port) throw { status: 404, message: 'Port not found' };

  const cityId = data.cityId || port.cityId;
  const countryId = data.countryId || port.countryId;

  if (data.cityId) {
    const city = await City.findOne({ _id: cityId });
    if (!city) throw { status: 400, message: 'Selected city does not exist' };
    if (String(city.countryId) !== String(countryId)) {
      throw { status: 400, message: 'Selected city does not belong to the selected country' };
    }
  }

  const name = data.name || port.name;
  const dup = await Port.findOne({ name, cityId, _id: { $ne: id } });
  if (dup) throw { status: 400, message: `Port "${name}" already exists in this city` };

  Object.assign(port, { ...pickFields(Port, data), code: data.code ? data.code.toUpperCase() : port.code, updatedBy });
  await port.save();
  return port.toObject();
};

const deletePort = async (id) => {
  const port = await Port.findOne({ _id: id });
  if (!port) throw { status: 404, message: 'Port not found' };

  const terminalCount = await Terminal.countDocuments({ portId: id });
  if (terminalCount > 0) throw { status: 400, message: `Cannot delete — ${terminalCount} terminal${terminalCount === 1 ? '' : 's'} reference this port` };

  const legCount = await countRouteLegsReferencing({ portId: id });
  if (legCount > 0) throw { status: 400, message: `Cannot delete — ${legCount} route leg${legCount === 1 ? '' : 's'} reference this port` };

  await Port.findByIdAndDelete(id);
};

// ════════════════════════════════════════════════════════════════════════════
// TERMINALS
// ════════════════════════════════════════════════════════════════════════════

const listTerminals = async ({ portId = '', search = '' } = {}) => {
  const query = {};
  if (portId) query.portId = portId;
  if (search) query.name = { $regex: escapeRegex(search), $options: 'i' };
  return Terminal.find(query).populate('portId', 'name code').sort({ name: 1 }).lean();
};

const getTerminalById = async (id) => {
  const terminal = await Terminal.findOne({ _id: id }).populate('portId', 'name code').lean();
  if (!terminal) throw { status: 404, message: 'Terminal not found' };
  return terminal;
};

const createTerminal = async (data, createdBy) => {
  const port = await Port.findOne({ _id: data.portId });
  if (!port) throw { status: 400, message: 'Selected port does not exist' };

  const exists = await Terminal.findOne({ name: data.name, portId: data.portId });
  if (exists) throw { status: 400, message: `Terminal "${data.name}" already exists in this port` };

  const terminal = await Terminal.create({ ...pickFields(Terminal, data), createdBy });
  return terminal.toObject();
};

const updateTerminal = async (id, data, updatedBy) => {
  const terminal = await Terminal.findOne({ _id: id });
  if (!terminal) throw { status: 404, message: 'Terminal not found' };

  const portId = data.portId || terminal.portId;
  if (data.portId) {
    const port = await Port.findOne({ _id: portId });
    if (!port) throw { status: 400, message: 'Selected port does not exist' };
  }

  const name = data.name || terminal.name;
  const dup = await Terminal.findOne({ name, portId, _id: { $ne: id } });
  if (dup) throw { status: 400, message: `Terminal "${name}" already exists in this port` };

  Object.assign(terminal, { ...pickFields(Terminal, data), updatedBy });
  await terminal.save();
  return terminal.toObject();
};

const deleteTerminal = async (id) => {
  const terminal = await Terminal.findOne({ _id: id });
  if (!terminal) throw { status: 404, message: 'Terminal not found' };

  const legCount = await countRouteLegsReferencing({ terminalId: id });
  if (legCount > 0) throw { status: 400, message: `Cannot delete — ${legCount} route leg${legCount === 1 ? '' : 's'} reference this terminal` };

  await Terminal.findByIdAndDelete(id);
};

module.exports = {
  listCountries, getCountryById, createCountry, updateCountry, deleteCountry,
  listCities, getCityById, createCity, updateCity, deleteCity,
  listPorts, getPortById, createPort, updatePort, deletePort,
  listTerminals, getTerminalById, createTerminal, updateTerminal, deleteTerminal,
};
