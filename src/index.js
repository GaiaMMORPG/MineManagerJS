const readline = require('readline');
const ServerNetwork = require('./ServerNetwork')
const WebAPI = require('./WebAPI');

const serverNetwork = new ServerNetwork('testnet', 'TestNetwork', '/home/crashoz');

serverNetwork.loadBungee().then(() => {
  return serverNetwork.loadServers();
}).then(() => {
});

const webAPI = new WebAPI(serverNetwork);
webAPI.start();
