require('dotenv').config();
const { sequelize, Tenant, Store, Order, Customer, Product } = require('../src/models');
const { Op } = require('sequelize');

async function checkAnomalies() {
  const anomalies = { orders: 0, customers: 0, products: 0 };
  
  // Orders
  const invalidOrders = await Order.findAll({
    where: { storeId: { [Op.not]: null } },
    include: [{ model: Store, as: 'store' }]
  });
  anomalies.orders = invalidOrders.filter(o => o.store && o.tenantId !== o.store.tenantId).length;

  // Customers
  const invalidCustomers = await Customer.findAll({
    where: { storeId: { [Op.not]: null } },
    include: [{ model: Store, as: 'store' }]
  });
  anomalies.customers = invalidCustomers.filter(c => c.store && c.tenantId !== c.store.tenantId).length;

  // Products
  const invalidProducts = await Product.findAll({
    where: { storeId: { [Op.not]: null } },
    include: [{ model: Store, as: 'store' }]
  });
  anomalies.products = invalidProducts.filter(p => p.store && p.tenantId !== p.store.tenantId).length;

  return anomalies;
}

async function migrateStores() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`\n==========================================`);
  console.log(`🏁 Starting Store Migration ${isDryRun ? '(DRY RUN)' : '(EXECUTION)'}`);
  console.log(`==========================================\n`);

  try {
    // 1. BEFORE SNAPSHOT
    const totalTenants = await Tenant.count();
    const tenantsWithShopify = await Tenant.count({ where: { shopifyStoreName: { [Op.not]: null } } });
    const totalStores = await Store.count();
    
    const totalOrders = await Order.count();
    const totalCustomers = await Customer.count();
    const totalProducts = await Product.count();
    
    const ordersNullStoreId = await Order.count({ where: { storeId: null } });
    const customersNullStoreId = await Customer.count({ where: { storeId: null } });
    const productsNullStoreId = await Product.count({ where: { storeId: null } });

    console.log(`--- BEFORE SNAPSHOT ---`);
    console.log(`Total Tenants: ${totalTenants}`);
    console.log(`Tenants with Shopify connection: ${tenantsWithShopify}`);
    console.log(`Total Stores: ${totalStores}`);
    console.log(`Total Orders: ${totalOrders} (${ordersNullStoreId} with storeId=NULL)`);
    console.log(`Total Customers: ${totalCustomers} (${customersNullStoreId} with storeId=NULL)`);
    console.log(`Total Products: ${totalProducts} (${productsNullStoreId} with storeId=NULL)\n`);

    // 2. ANOMALIES
    const anomalies = await checkAnomalies();
    console.log(`--- INVARIANT CHECKS (storeId NOT NULL but wrong tenantId) ---`);
    console.log(`Invalid Orders: ${anomalies.orders}`);
    console.log(`Invalid Customers: ${anomalies.customers}`);
    console.log(`Invalid Products: ${anomalies.products}\n`);

    if (anomalies.orders > 0 || anomalies.customers > 0 || anomalies.products > 0) {
      console.warn('⚠️ WARNING: Data anomalies detected! Please resolve before executing actual migration.\n');
    }

    // 3. TENANT ITERATION
    const tenants = await Tenant.findAll({ where: { shopifyStoreName: { [Op.not]: null } } });
    
    console.log(`--- PER-TENANT ANALYSIS ---`);
    for (const tenant of tenants) {
      const storeName = tenant.shopifyStoreName;
      const existingStore = await Store.findOne({
        where: { tenantId: tenant.id, storeName }
      });

      const ordersToBackfill = await Order.count({ where: { tenantId: tenant.id, storeId: null } });
      const customersToBackfill = await Customer.count({ where: { tenantId: tenant.id, storeId: null } });
      const productsToBackfill = await Product.count({ where: { tenantId: tenant.id, storeId: null } });

      console.log(`Tenant: ${tenant.id} (${tenant.email || 'N/A'})`);
      console.log(`Shopify Store: ${storeName}`);
      console.log(`AccessToken: ${tenant.shopifyAccessToken ? 'PRESENT' : 'MISSING'}`);
      console.log(`Existing Store: ${existingStore ? 'YES' : 'NO'}`);
      console.log(`Orders requiring backfill: ${ordersToBackfill}`);
      console.log(`Customers requiring backfill: ${customersToBackfill}`);
      console.log(`Products requiring backfill: ${productsToBackfill}\n`);

      if (!isDryRun) {
        console.log(`>> Executing migration for tenant ${tenant.id}...`);
        const t = await sequelize.transaction();
        try {
          // Find or create store
          const [store, created] = await Store.findOrCreate({
            where: { tenantId: tenant.id, storeName },
            defaults: {
              shopifyDomain: tenant.shopifyStoreUrl,
              accessToken: tenant.shopifyAccessToken,
              lastSyncAt: tenant.lastSyncAt
            },
            transaction: t
          });

          // Backfill
          await Order.update({ storeId: store.id }, {
            where: { tenantId: tenant.id, storeId: null },
            transaction: t
          });
          
          await Customer.update({ storeId: store.id }, {
            where: { tenantId: tenant.id, storeId: null },
            transaction: t
          });
          
          await Product.update({ storeId: store.id }, {
            where: { tenantId: tenant.id, storeId: null },
            transaction: t
          });

          // Verify invariants before commit
          const invalidRecords = await Order.count({
            where: { storeId: store.id, tenantId: { [Op.ne]: store.tenantId } },
            transaction: t
          }) + await Customer.count({
            where: { storeId: store.id, tenantId: { [Op.ne]: store.tenantId } },
            transaction: t
          }) + await Product.count({
            where: { storeId: store.id, tenantId: { [Op.ne]: store.tenantId } },
            transaction: t
          });

          if (invalidRecords > 0) {
            throw new Error(`Invariant violation detected during migration of tenant ${tenant.id}`);
          }

          await t.commit();
          console.log(`>> Successfully migrated tenant ${tenant.id}.\n`);
        } catch (err) {
          await t.rollback();
          console.error(`>> FAILED migrating tenant ${tenant.id}:`, err);
        }
      }
    }

    if (!isDryRun) {
      console.log(`--- VERIFICATION AFTER MIGRATION ---`);
      
      const remainingOrdersNull = await Order.count({ where: { storeId: null } });
      const remainingCustomersNull = await Customer.count({ where: { storeId: null } });
      const remainingProductsNull = await Product.count({ where: { storeId: null } });
      
      console.log(`Orders with storeId NULL: ${remainingOrdersNull}`);
      console.log(`Customers with storeId NULL: ${remainingCustomersNull}`);
      console.log(`Products with storeId NULL: ${remainingProductsNull}`);
      
      const newTotalOrders = await Order.count();
      const newTotalCustomers = await Customer.count();
      const newTotalProducts = await Product.count();
      
      console.log(`Data Loss Check:`);
      console.log(`Orders: ${totalOrders} -> ${newTotalOrders}`);
      console.log(`Customers: ${totalCustomers} -> ${newTotalCustomers}`);
      console.log(`Products: ${totalProducts} -> ${newTotalProducts}`);
    } else {
      console.log(`--- DRY RUN COMPLETE - ZERO ROWS MODIFIED ---`);
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

migrateStores();
