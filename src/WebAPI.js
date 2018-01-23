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
        case 'SUBSCRIBE_SERVER_DETAIL':
          this.serverNetwork.subscribe(ws, 'SERVER_DETAIL', data.value);
          break;
        case 'UNSUBSCRIBE_SERVER_DETAIL':
          this.serverNetwork.unsubscribe(ws, 'SERVER_DETAIL', data.value);
          break;
        case 'SUBSCRIBE_SERVER_CONSOLE':
          this.serverNetwork.subscribe(ws, 'SERVER_CONSOLE', data.value);
          break;
        case 'UNSUBSCRIBE_SERVER_CONSOLE':
          this.serverNetwork.unsubscribe(ws, 'SERVER_CONSOLE', data.value);
          break;
        case 'COMMAND':
          this.serverNetwork.commandServer(data.value.slug, data.value.command);
          break;
        case 'START_SERVER':
          this.serverNetwork.startServer(data.value.slug);
          break;
        case 'STOP_SERVER':
          this.serverNetwork.stopServer(data.value.slug);
          break;
        case 'RESTART_SERVER':
          this.serverNetwork.restartServer(data.value.slug);
          break;
        case 'KILL_SERVER':
          this.serverNetwork.killServer(data.value.slug);
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
