const express = require('express');
const { param } = require('express-validator');
const syncController = require('../controllers/syncController');
const auth = require('../middleware/auth');
const validateRequest = require('../middleware/validation');

const router = express.Router();

const storeIdValidation = [
  param('storeId').isUUID().withMessage('Valid storeId is required')
];

// Apply authentication to all routes
router.use(auth);

// Routes
router.post('/sync/:storeId', storeIdValidation, validateRequest, syncController.syncData);
router.get('/status/:storeId', storeIdValidation, validateRequest, syncController.getSyncStatus);

module.exports = router;
