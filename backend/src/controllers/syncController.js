const { getStoreForTenant } = require('../services/storeService');
const DataSyncServiceBulk = require('../services/dataSyncServiceBulk');

// Use the bulk sync service by default
const dataSyncService = new DataSyncServiceBulk();

const syncData = async (req, res) => {
  try {
    const { tenantId } = req;
    const { storeId } = req.params;

    if (!storeId) {
      return res.status(400).json({ success: false, message: 'storeId is required' });
    }

    console.log(`Manual sync initiated for store: ${storeId} (tenant: ${tenantId})`);
    
    // Find the store and verify ownership
    const store = await getStoreForTenant(storeId, tenantId);
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found or unauthorized'
      });
    }

    if (store.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Store is inactive. Cannot sync.'
      });
    }

    if (!store.accessToken || !store.storeName) {
      return res.status(400).json({
        success: false,
        message: 'Shopify credentials not configured for this store.',
        missingCredentials: {
          accessToken: !store.accessToken,
          storeName: !store.storeName
        }
      });
    }

    // Use the DataSyncService to perform the sync with the Store
    const result = await dataSyncService.syncStoreData(store);

    res.status(200).json({
      success: true,
      message: 'Data synchronization completed successfully',
      data: result
    });

  } catch (error) {
    console.error('Error in sync:', error);
    res.status(500).json({
      success: false,
      message: 'Sync failed'
    });
  }
};

const getSyncStatus = async (req, res) => {
  try {
    const { tenantId } = req;
    const { storeId } = req.params;
    
    if (!storeId) {
      return res.status(400).json({ success: false, message: 'storeId is required' });
    }

    // Find the store and verify ownership
    const store = await getStoreForTenant(storeId, tenantId);

    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found or unauthorized'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        storeId: store.id,
        lastSyncAt: store.lastSyncAt,
        shopifyDomain: store.shopifyDomain,
        hasSynced: !!store.lastSyncAt
      }
    });

  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status'
    });
  }
};

module.exports = {
  syncData,
  getSyncStatus
};
