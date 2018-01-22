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
      console.log(data);
      switch (data.type) {
        case 'REQUEST_SERVERS_LIST':
          ws.send(JSON.stringify({
            type: 'SERVERS_LIST',
            value: this.serverNetwork.serversList()
          }));
          break;
        case 'SUBSCRIBE_SERVERS_DETAIL':
          this.serverNetwork.subscribe(ws, 'SERVERS_DETAIL');
          break;
        case 'UNSUBSCRIBE_SERVERS_DETAIL':
          this.serverNetwork.unsubscribe(ws, 'SERVERS_DETAIL');
          break;
        case 'SUBSCRIBE_SERVER_CONSOLE':
          this.serverNetwork.subscribe(ws, 'SERVER_CONSOLE', data.value);
          break;
        case 'UNSUBSCRIBE_SERVER_CONSOLE':
          this.serverNetwork.unsubscribe(ws, 'SERVER_CONSOLE', data.value);
          break;
      }
    });

    ws.on('error', (err) => {
      console.log(err);
      ws.close()
    })
  }

  stop() {
    this.wss.close();
  }
}

module.exports = WebAPI;
