const { Customer, Order, Product, OrderItem } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const { getStoreForTenant } = require('../services/storeService');

/**
 * Helper to build the base WHERE clause with store-awareness.
 * Rejects if storeId is provided but unauthorized.
 */
const _buildWhereClause = async (req, res) => {
  const { tenantId } = req;
  const { storeId } = req.query;

  if (storeId) {
    // Verify store ownership
    const store = await getStoreForTenant(storeId, tenantId);
    if (!store) {
      res.status(404).json({ success: false, message: 'Store not found or unauthorized' });
      return null;
    }
    return { tenantId, storeId };
  }
  
  // If no storeId, return analytics across ALL stores for the tenant
  return { tenantId };
};

exports.getDashboardStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const baseWhere = await _buildWhereClause(req, res);
    if (!baseWhere) return;

    // Set default date range if not provided
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate ? new Date(endDate) : new Date();

    const [totalCustomers, totalOrders, revenueResult, ordersInRange, revenueInRangeResult] = await Promise.all([
      Customer.count({ where: baseWhere }),
      Order.count({ where: baseWhere }),
      Order.findOne({
        where: baseWhere,
        attributes: [[sequelize.fn('SUM', sequelize.col('totalPrice')), 'totalRevenue']],
        raw: true
      }),
      Order.count({
        where: {
          ...baseWhere,
          shopifyCreatedAt: { [Op.between]: [start, end] }
        }
      }),
      Order.findOne({
        where: {
          ...baseWhere,
          shopifyCreatedAt: { [Op.between]: [start, end] }
        },
        attributes: [[sequelize.fn('SUM', sequelize.col('totalPrice')), 'revenue']],
        raw: true
      })
    ]);

    const avgOrderValue = totalOrders > 0 
      ? (parseFloat(revenueResult.totalRevenue) || 0) / totalOrders 
      : 0;

    res.json({
      success: true,
      data: {
        totalCustomers,
        totalOrders,
        totalRevenue: parseFloat(revenueResult.totalRevenue) || 0,
        ordersInRange,
        revenueInRange: parseFloat(revenueInRangeResult.revenue) || 0,
        averageOrderValue: avgOrderValue,
        dateRange: { startDate: start, endDate: end }
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard stats'
    });
  }
};

exports.getOrdersByDate = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const baseWhere = await _buildWhereClause(req, res);
    if (!baseWhere) return;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    let dateFormat;
    switch (groupBy) {
      case 'month': dateFormat = '%Y-%m'; break;
      case 'week': dateFormat = '%Y-%u'; break;
      case 'day': default: dateFormat = '%Y-%m-%d'; break;
    }

    const orders = await Order.findAll({
      where: {
        ...baseWhere,
        shopifyCreatedAt: { [Op.between]: [start, end] }
      },
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('shopifyCreatedAt'), dateFormat), 'date'],
        [sequelize.fn('COUNT', '*'), 'orderCount'],
        [sequelize.fn('SUM', sequelize.col('totalPrice')), 'revenue']
      ],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('shopifyCreatedAt'), dateFormat)],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('shopifyCreatedAt'), dateFormat), 'ASC']],
      raw: true
    });

    res.json({
      success: true,
      data: orders.map(order => ({
        date: order.date,
        orderCount: parseInt(order.orderCount),
        revenue: parseFloat(order.revenue) || 0
      }))
    });
  } catch (error) {
    console.error('Orders by date error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get orders by date'
    });
  }
};

exports.getTopCustomers = async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    const baseWhere = await _buildWhereClause(req, res);
    if (!baseWhere) return;

    const topCustomers = await Customer.findAll({
      where: baseWhere,
      order: [['totalSpent', 'DESC']],
      limit: parseInt(limit),
      include: [{
        model: Order,
        as: 'orders',
        attributes: []
      }]
    });

    res.json({
      success: true,
      data: topCustomers
    });
  } catch (error) {
    console.error('Top customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get top customers'
    });
  }
};

exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { period = '30days' } = req.query;

    const baseWhere = await _buildWhereClause(req, res);
    if (!baseWhere) return;

    let startDate;
    const endDate = new Date();

    switch (period) {
      case '7days': startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
      case '30days': startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
      case '90days': startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); break;
      case '1year': startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const revenueData = await Order.findAll({
      where: {
        ...baseWhere,
        shopifyCreatedAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('shopifyCreatedAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('totalPrice')), 'revenue'],
        [sequelize.fn('COUNT', '*'), 'orderCount']
      ],
      group: [sequelize.fn('DATE', sequelize.col('shopifyCreatedAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('shopifyCreatedAt')), 'ASC']],
      raw: true
    });

    res.json({
      success: true,
      data: {
        period,
        dateRange: { startDate, endDate },
        analytics: revenueData.map(item => ({
          date: item.date,
          revenue: parseFloat(item.revenue) || 0,
          orderCount: parseInt(item.orderCount)
        }))
      }
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get revenue analytics'
    });
  }
};

exports.getProductAnalytics = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const baseWhere = await _buildWhereClause(req, res);
    if (!baseWhere) return;

    const topProducts = await OrderItem.findAll({
      where: baseWhere,
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantity'],
        [sequelize.fn('SUM', sequelize.literal('quantity * price')), 'totalRevenue']
      ],
      include: [{
        model: Product,
        as: 'product',
        attributes: ['title', 'vendor', 'productType']
      }],
      group: ['productId', 'product.id'],
      order: [[sequelize.fn('SUM', sequelize.col('quantity')), 'DESC']],
      limit: parseInt(limit),
      raw: true,
      nest: true
    });

    res.json({
      success: true,
      data: topProducts.map(item => ({
        product: item.product,
        totalQuantity: parseInt(item.totalQuantity),
        totalRevenue: parseFloat(item.totalRevenue) || 0
      }))
    });
  } catch (error) {
    console.error('Product analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get product analytics'
    });
  }
};
