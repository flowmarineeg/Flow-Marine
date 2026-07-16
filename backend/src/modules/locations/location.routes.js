'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('./location.controller');
const auth    = require('../../middleware/auth');
const rbac    = require('../../middleware/rbac');
const audit   = require('../../middleware/auditLogger');
const {
  validateCountryCreate, validateCountryUpdate,
  validateCityCreate, validateCityUpdate,
  validatePortCreate, validatePortUpdate,
  validateTerminalCreate, validateTerminalUpdate,
} = require('./location.validation');

router.use(auth);
router.use(rbac('locations'));

// ─── Countries ────────────────────────────────────────────────────────────────
router.get('/countries',       ctrl.listCountries);
router.get('/countries/:id',   ctrl.getCountry);
router.post('/countries',      audit('locations'), validateCountryCreate, ctrl.createCountry);
router.put('/countries/:id',   audit('locations'), validateCountryUpdate, ctrl.updateCountry);
router.delete('/countries/:id', audit('locations'), ctrl.deleteCountry);

// ─── Cities ───────────────────────────────────────────────────────────────────
router.get('/cities',       ctrl.listCities);
router.get('/cities/:id',   ctrl.getCity);
router.post('/cities',      audit('locations'), validateCityCreate, ctrl.createCity);
router.put('/cities/:id',   audit('locations'), validateCityUpdate, ctrl.updateCity);
router.delete('/cities/:id', audit('locations'), ctrl.deleteCity);

// ─── Ports ────────────────────────────────────────────────────────────────────
router.get('/ports',       ctrl.listPorts);
router.get('/ports/:id',   ctrl.getPort);
router.post('/ports',      audit('locations'), validatePortCreate, ctrl.createPort);
router.put('/ports/:id',   audit('locations'), validatePortUpdate, ctrl.updatePort);
router.delete('/ports/:id', audit('locations'), ctrl.deletePort);

// ─── Terminals ────────────────────────────────────────────────────────────────
router.get('/terminals',       ctrl.listTerminals);
router.get('/terminals/:id',   ctrl.getTerminal);
router.post('/terminals',      audit('locations'), validateTerminalCreate, ctrl.createTerminal);
router.put('/terminals/:id',   audit('locations'), validateTerminalUpdate, ctrl.updateTerminal);
router.delete('/terminals/:id', audit('locations'), ctrl.deleteTerminal);

module.exports = router;
