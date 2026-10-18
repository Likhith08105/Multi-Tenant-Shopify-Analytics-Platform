const { Store, Order, Customer, Product } = require('../models');

/**
 * Validates store ownership for a given tenant.
 * Returns the store instance if it exists and belongs to the tenant.
 * @param {string} storeId - The store UUID
 * @param {string} tenantId - The tenant UUID
 * @returns {Promise<Store|null>} The Store model instance or null
 */
const getStoreForTenant = async (storeId, tenantId) => {
  if (!storeId || !tenantId) return null;
  
  return await Store.findOne({ 
    where: { 
      id: storeId, 
      tenantId 
    } 
  });
};

/**
 * Checks if a store has any associated business data (Orders, Customers, Products).
 * @param {string} storeId - The store UUID
 * @returns {Promise<boolean>} True if associated data exists
 */
const hasAssociatedData = async (storeId) => {
  if (!storeId) return false;
  
  const [ordersCount, customersCount, productsCount] = await Promise.all([
    Order.count({ where: { storeId } }),
    Customer.count({ where: { storeId } }),
    Product.count({ where: { storeId } })
  ]);
  
  return (ordersCount > 0 || customersCount > 0 || productsCount > 0);
};

module.exports = {
  getStoreForTenant,
  hasAssociatedData
};
