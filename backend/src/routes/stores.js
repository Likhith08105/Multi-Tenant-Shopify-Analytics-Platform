const express = require('express');
const { body, param } = require('express-validator');
const storeController = require('../controllers/storeController');
const auth = require('../middleware/auth');
const validateRequest = require('../middleware/validation');

const router = express.Router();

const createStoreValidation = [
  body('storeName').notEmpty().withMessage('storeName is required').matches(/^[a-zA-Z0-9-]+$/).withMessage('Invalid store name format'),
  body('shopifyDomain').optional().isURL().withMessage('shopifyDomain must be a valid URL'),
  body('accessToken').optional({ nullable: true, checkFalsy: true }).isLength({ min: 10 }).withMessage('Invalid access token'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive')
];

const updateStoreValidation = [
  param('id').isUUID().withMessage('Valid store ID is required'),
  body('storeName').optional().matches(/^[a-zA-Z0-9-]+$/).withMessage('Invalid store name format'),
  body('shopifyDomain').optional().isURL().withMessage('shopifyDomain must be a valid URL'),
  body('accessToken').optional({ nullable: true, checkFalsy: true }).isLength({ min: 10 }).withMessage('Invalid access token'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive')
];

const idValidation = [
  param('id').isUUID().withMessage('Valid store ID is required')
];

router.get('/', auth, storeController.getStores);
router.get('/:id', auth, idValidation, validateRequest, storeController.getStoreById);
router.post('/', auth, createStoreValidation, validateRequest, storeController.createStore);
router.put('/:id', auth, updateStoreValidation, validateRequest, storeController.updateStore);
router.delete('/:id', auth, idValidation, validateRequest, storeController.deleteStore);

module.exports = router;
