const WebSocket = require('ws');
const winston = require('winston');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const crypto = require('crypto');

class WebAPI {
  constructor(serverNetwork) {
    this.serverNetwork = serverNetwork;

    const adapter = new FileSync('users.json');
    this.db = low(adapter);
  }

  start() {
    this.db.defaults({
      'users': {}
    }).write();
    this.wss = new WebSocket.Server({
      host: '127.0.0.1',
      port: 2334
    });
    this.wss.on('connection', this.handleAuth.bind(this));
  }

  handleAuth(ws) {
    const authSuccessful = (user, token, expires) => {
      ws.user = user;
      ws.user.token = token;
      ws.user.expires = expires;
      ws.removeListener('message', authHandler);
      this.handleConnection(ws);

      ws.send(JSON.stringify({
        type: 'AUTH_SUCCESS',
        value: {
          username: user.username,
          role: user.role,
          token: token,
          expires: expires
        }
      }), (err) => {});
    };

    const authFailed = () => {
      ws.send(JSON.stringify({
        type: 'AUTH_FAILED',
      }), (err) => {});
    };

    const authTokenFailed = () => {
      ws.send(JSON.stringify({
        type: 'AUTH_TOKEN_FAILED',
      }), (err) => {});
    };

    const authHandler = (value) => {
      const data = JSON.parse(value);
      if (!data || !data.value) {
        return;
      }

      const { username, password, token } = data.value;
      const user = this.db.get(`users.${username}`).cloneDeep().value();

      if (token) {
        if (token === user.token.value) {
          if (Date.now() > user.token.expires) {
            authTokenFailed();
          } else {
            authSuccessful(user, token, user.token.expires);
          }
        } else {
          authTokenFailed();
        }
      } else if (user && user.password === password) {
        crypto.randomBytes(32, (err, buf) => {
          if (err) {
            authFailed();
            return;
          }

          const token = buf.toString('hex');
          const expires = Date.now()+86400000;

          this.db.get(`users.${username}`)
            .set('token', {
              value: token,
              expires: expires
            })
            .write();

          authSuccessful(user, token, expires);
        });
      } else {
        authFailed();
      }
    };

    ws.on('message', authHandler);
    ws.on('error', (err) => {
      ws.close()
    })
  }

  handleConnection(ws) {
    ws.on('message', (value) => {
      let data = JSON.parse(value);
      console.log(data);
      switch (data.type) {
        case 'RELOAD_WRAPPER':
          this.serverNetwork.reload()
          break;
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
  }

  stop() {
    this.wss.close();
  }
}

module.exports = WebAPI;
