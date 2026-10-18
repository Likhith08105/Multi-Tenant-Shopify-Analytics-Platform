const { Sequelize, DataTypes } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    pool: dbConfig.pool,
    dialectOptions: dbConfig.dialectOptions || {}
  }
);

const db = {};

// Import models
db.Tenant = require('./Tenant')(sequelize, DataTypes);
db.Store = require('./Store')(sequelize, DataTypes);
db.Customer = require('./Customer')(sequelize, DataTypes);
db.Product = require('./Product')(sequelize, DataTypes);
db.Order = require('./Order')(sequelize, DataTypes);
db.OrderItem = require('./OrderItem')(sequelize, DataTypes);

// Define associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Add new Store relationships
db.Store.hasMany(db.Order, { foreignKey: 'storeId', as: 'orders' });
db.Store.hasMany(db.Customer, { foreignKey: 'storeId', as: 'customers' });
db.Store.hasMany(db.Product, { foreignKey: 'storeId', as: 'products' });

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
