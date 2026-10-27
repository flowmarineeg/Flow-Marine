'use strict';

const { body, validationResult } = require('express-validator');
const { badRequest } = require('../../utils/responseHelper');
const { VESSEL_STATUS, OWNERSHIP_TYPES } = require('../../config/constants');

const handle = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return badRequest(res, 'Validation failed', errors.array().map(e => ({ field: e.path, message: e.msg })));
  }
  next();
};

const nn = { nullable: true, checkFalsy: true };
// Master-data fields shared by create and update. Required-ness (callSign, capacity, hire rate) is enforced in the
// service against the merged record, so a partial update of an older vessel is judged on its final state.
const masterFields = [
  body('ownerContacts').optional().isArray({ max: 20 }).withMessage('ownerContacts must be an array (max 20)'),
  body('ownerContacts.*.name').isString().trim().notEmpty().withMessage('Each owner contact needs a name'),
  body('ownerContacts.*.email').optional(nn).isEmail().withMessage('Invalid contact email'),
  body('ownerContacts.*.phone').optional(nn).isString().trim().isLength({ max: 40 }),
  body('ownerContacts.*.title').optional(nn).isString().trim().isLength({ max: 100 }),
  body('charterHistory').optional().isArray({ max: 200 }).withMessage('charterHistory must be an array'),
  body('charterHistory.*.charterPartyDate').optional(nn).isISO8601().withMessage('Invalid charter party date'),
  body('charterHistory.*.deliveryDate').isISO8601().withMessage('Each charter entry needs a delivery date'),
  body('charterHistory.*.redeliveryDate').isISO8601().withMessage('Each charter entry needs a redelivery date'),
  body('charterHistory.*.deliveryPrice').optional(nn).isFloat({ min: 0 }).withMessage('Delivery price must be a positive number'),
  body('reeferPlugs').optional(nn).isInt({ min: 0 }).withMessage('Reefer plugs must be a whole number'),
  body('mainEngineFuelType').optional(nn).trim().isLength({ max: 40 }),
  body('auxEngineFuelType').optional(nn).trim().isLength({ max: 40 }),
  body('consumptionSeaMtDay').optional(nn).isFloat({ min: 0 }).withMessage('Consumption at sea must be a positive number'),
  body('consumptionPortIdleMtDay').optional(nn).isFloat({ min: 0 }).withMessage('Port idle consumption must be a positive number'),
  body('consumptionPortWorkingMtDay').optional(nn).isFloat({ min: 0 }).withMessage('Port working consumption must be a positive number'),
  body('defaultDailyHireRate').optional(nn).isFloat({ min: 0 }).withMessage('Default daily hire rate must be a positive number'),
  body('shares').optional().isArray().withMessage('shares must be an array'),
  body('shares.*.partnerId').optional().isMongoId().withMessage('Invalid partnerId'),
  body('shares.*.shareBp').optional().isInt({ min: 1, max: 10000 }).withMessage('shareBp must be an integer 1-10000').toInt(),
];

const validateCreate = [
  body('vesselCode').trim().notEmpty().withMessage('Vessel code is required').isLength({ max: 20 }).withMessage('Max 20 characters'),
  body('vesselName').trim().notEmpty().withMessage('Vessel name is required').isLength({ max: 100 }),
  body('ownershipType').notEmpty().withMessage('Ownership type is required').isIn(OWNERSHIP_TYPES).withMessage(`Must be one of: ${OWNERSHIP_TYPES.join(', ')}`),
  // imoNumber is now REQUIRED
  body('imoNumber').trim().notEmpty().withMessage('IMO number is required')
    .isLength({ min: 7, max: 7 }).withMessage('IMO number must be exactly 7 digits')
    .isNumeric().withMessage('IMO number must be numeric'),
  body('ownershipDescription').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 500 }),
  body('capacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Capacity must be a positive number'),
  body('dwt').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('DWT must be a positive number'),
  body('builtYear').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1800, max: new Date().getFullYear() + 1 }).withMessage('Invalid built year'),
  body('status').optional().isIn(VESSEL_STATUS).withMessage(`Must be one of: ${VESSEL_STATUS.join(', ')}`),
  body('charterStartDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid charter start date'),
  body('charterEndDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid charter end date'),
  ...masterFields,
  // Extended particulars
  body('manager').optional({ nullable: true, checkFalsy: true }).trim(),
  body('loa').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('LOA must be a positive number'),
  body('beam').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Beam must be a positive number'),
  body('summerDraft').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Summer draft must be a positive number'),
  body('grossTonnage').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Gross tonnage must be a positive number'),
  body('netTonnage').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Net tonnage must be a positive number'),
  body('suezGT').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Suez GT must be a positive number'),
  body('suezNT').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Suez NT must be a positive number'),
  // Bunker capacities
  body('totalBunkerCapacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Total bunker capacity must be a positive number'),
  body('vlsfoCapacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('VLSFO capacity must be a positive number'),
  body('mdoCapacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('MDO capacity must be a positive number'),
  body('fwCapacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('F.W. tank capacity must be a positive number'),
  handle,
];

const validateUpdate = [
  body('vesselCode').optional().trim().notEmpty().isLength({ max: 20 }),
  body('vesselName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('ownershipType').optional().isIn(OWNERSHIP_TYPES),
  body('imoNumber').optional().trim().notEmpty()
    .isLength({ min: 7, max: 7 }).isNumeric(),
  body('ownershipDescription').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 500 }),
  body('capacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('dwt').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('builtYear').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1800, max: new Date().getFullYear() + 1 }),
  body('status').optional().isIn(VESSEL_STATUS),
  ...masterFields,
  // Extended particulars
  body('manager').optional({ nullable: true, checkFalsy: true }).trim(),
  body('loa').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('beam').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('summerDraft').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('grossTonnage').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('netTonnage').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('suezGT').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('suezNT').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  // Bunker capacities
  body('totalBunkerCapacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('vlsfoCapacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('mdoCapacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('fwCapacity').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  handle,
];

module.exports = { validateCreate, validateUpdate };
