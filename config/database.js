const mysql = require('mysql2/promise');
const config = require('./env');

const pool = mysql.createPool(config.db);

async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    const [rows] = await connection.query('SELECT DATABASE() AS database_name, VERSION() AS version');
    return rows[0];
  } finally {
    connection.release();
  }
}

async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { pool, testConnection, withTransaction };
