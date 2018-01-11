const WebSocket = require('ws');
const winston = require('winston')

class WebAPI {
  constructor(serverNetwork) {
    this.serverNetwork = serverNetwork;
  }

  start() {
    this.wss = new WebSocket.Server({port: 3001});
    this.wss.on('connection', this.handleConnection.bind(this));
  }

  handleConnection(ws) {
    ws.on('message', (value) => {
      let data = JSON.parse(value);
      switch (data.type) {
        case 'bungeestatus':
        ws.send(JSON.stringify({
          type: 'bungeestatus',
          value: this.serverNetwork.bungeeCord.status()
        }));
        break;
      }
    });
  }

  stop() {
    this.wss.close();
  }
}

module.exports = WebAPI;
