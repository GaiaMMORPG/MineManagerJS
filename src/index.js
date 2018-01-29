const readline = require('readline');
const ServerNetwork = require('./ServerNetwork')
const WebAPI = require('./WebAPI');

const serverNetwork = new ServerNetwork('gaia-network', 'Gaïa Network', '/var/gaia-renaissance/minecraft');

serverNetwork.loadBungee().then(() => {
  return serverNetwork.loadServers();
}).then(() => {
});

const webAPI = new WebAPI(serverNetwork);
webAPI.start();
