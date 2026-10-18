const { Store } = require('../models');
const { getStoreForTenant, hasAssociatedData } = require('../services/storeService');

// Attributes to return when fetching lists (excluding accessToken)
const storeAttributes = ['id', 'tenantId', 'storeName', 'shopifyDomain', 'status', 'lastSyncAt', 'createdAt', 'updatedAt'];

const sanitizeStore = (store) => {
  const storeData = store.toJSON ? store.toJSON() : store;
  delete storeData.accessToken;
  return storeData;
};

exports.getStores = async (req, res) => {
  try {
    const stores = await Store.findAll({
      where: { tenantId: req.tenantId },
      attributes: storeAttributes
    });
    res.json({ success: true, stores });
  } catch (error) {
    console.error('getStores Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getStoreById = async (req, res) => {
  try {
    const store = await getStoreForTenant(req.params.id, req.tenantId);

    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found or unauthorized' });
    }

    res.json({ success: true, store: sanitizeStore(store) });
  } catch (error) {
    console.error('getStoreById Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.createStore = async (req, res) => {
  try {
    const { storeName, shopifyDomain, accessToken, status } = req.body;

    const store = await Store.create({
      tenantId: req.tenantId, // Force from JWT
      storeName,
      shopifyDomain,
      accessToken,
      status: status || 'active'
    });

    res.status(201).json({ success: true, store: sanitizeStore(store) });
  } catch (error) {
    console.error('createStore Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateStore = async (req, res) => {
  try {
    const { storeName, shopifyDomain, accessToken, status } = req.body;

    const store = await getStoreForTenant(req.params.id, req.tenantId);

    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found or unauthorized' });
    }

    if (storeName) store.storeName = storeName;
    if (shopifyDomain) store.shopifyDomain = shopifyDomain;
    if (accessToken !== undefined) store.accessToken = accessToken;
    if (status) store.status = status;

    await store.save();

    res.json({ success: true, store: sanitizeStore(store) });
  } catch (error) {
    console.error('updateStore Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.deleteStore = async (req, res) => {
  try {
    const store = await getStoreForTenant(req.params.id, req.tenantId);

    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found or unauthorized' });
    }

    // Check for associated data to prevent orphaned/nullified records
    const hasData = await hasAssociatedData(store.id);

    if (hasData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete store because it has associated data (Orders, Customers, or Products).' 
      });
    }

    await store.destroy();
    res.json({ success: true, message: 'Store deleted successfully' });
  } catch (error) {
    console.error('deleteStore Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
