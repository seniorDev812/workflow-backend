import { WebSocketServer } from 'ws';
import { logger } from './logger.js';

class RealtimeManager {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.heartbeatInterval = null;
  }

  initialize(server) {
    this.wss = new WebSocketServer({ server });
    
    this.wss.on('connection', (ws, req) => {
      logger.info(`WebSocket client connected: ${req.socket.remoteAddress}`);
      
      // Add client to set
      this.clients.add(ws);
      
      // Send initial connection message
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to real-time dashboard',
        timestamp: new Date().toISOString()
      }));

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(ws, message);
        } catch (error) {
          logger.error('WebSocket message parsing error:', error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    // Start heartbeat to keep connections alive
    this.startHeartbeat();
    
    logger.info('WebSocket server initialized');
  }

  handleMessage(ws, message) {
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      case 'subscribe':
        // Handle subscription to specific events
        ws.send(JSON.stringify({ 
          type: 'subscribed', 
          channel: message.channel,
          timestamp: new Date().toISOString()
        }));
        break;
      default:
        logger.warn('Unknown WebSocket message type:', message.type);
    }
  }

  broadcast(event, data) {
    const message = JSON.stringify({
      type: event,
      data,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(message);
        } catch (error) {
          logger.error('Failed to send WebSocket message:', error);
          this.clients.delete(client);
        }
      }
    });
  }

  // Send to specific client
  sendToClient(clientId, event, data) {
    // Implementation for sending to specific client
    // This would require maintaining a client registry with IDs
  }

  // Broadcast dashboard updates
  broadcastDashboardUpdate(updateType, data) {
    this.broadcast('dashboard_update', {
      type: updateType,
      data,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast new message notification
  broadcastNewMessage(message) {
    this.broadcast('new_message', {
      id: message.id,
      name: message.name,
      subject: message.subject,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast new application notification
  broadcastNewApplication(application) {
    this.broadcast('new_application', {
      id: application.id,
      name: application.name,
      jobTitle: application.job?.title || 'General Application',
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast system health update
  broadcastSystemHealth(health) {
    this.broadcast('system_health', {
      ...health,
      timestamp: new Date().toISOString()
    });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.broadcast('heartbeat', { timestamp: Date.now() });
    }, 30000); // 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  getConnectedClients() {
    return this.clients.size;
  }

  shutdown() {
    this.stopHeartbeat();
    if (this.wss) {
      this.wss.close();
    }
    this.clients.clear();
    logger.info('WebSocket server shutdown');
  }
}

export const realtimeManager = new RealtimeManager();
export default realtimeManager;
