const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('./config/env');
const { testConnection } = require('./config/database');
const { setSocketIO, cleanupExpired } = require('./services/seatService');

async function start() {
  try {
    const db = await testConnection();
    console.log(`[DB] Connected to ${db.database_name} (MySQL ${db.version})`);
  } catch (error) {
    console.error('[DB] Connection failed. Check backend/.env and run database/cinebook.sql');
    console.error(error.message);
    process.exit(1);
  }

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'], methods: ['GET', 'POST'] }
  });
  setSocketIO(io);

  io.on('connection', (socket) => {
    socket.on('join-show', (showId) => {
      if (showId) socket.join(`show:${showId}`);
    });
    socket.on('leave-show', (showId) => {
      if (showId) socket.leave(`show:${showId}`);
    });
  });

  const cleanup = setInterval(() => {
    cleanupExpired().catch((error) => console.error('[CLEANUP]', error.message));
  }, 60 * 1000);
  cleanup.unref();

  server.listen(config.port, () => {
    console.log(`[API] CineBook backend running at http://localhost:${config.port}`);
    console.log(`[PAYMENTS] Mode: ${process.env.RAZORPAY_KEY_ID ? 'Razorpay test' : 'Development simulation'}`);
  });
}

start();
