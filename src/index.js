const readline = require('readline');
const ServerNetwork = require('./ServerNetwork')
const WebAPI = require('./WebAPI');

let rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const serverNetwork = new ServerNetwork('testnet', 'TestNetwork', '/home/crashoz');

rl.on('line', function(line){
  switch(line) {
    case 'add':
    serverNetwork.addServer('test', 'Test', 'template', 'spigot-1.12.2.jar').then(() => {
      console.log('[server added]');
    })
    break;
    case 'start':
    serverNetwork.startServer('test');
    break;
    case 'stop':
    serverNetwork.stopServer('test');
    break;
    case 'del':
    serverNetwork.removeServer('test');
    break;
    case 'load':
    serverNetwork.loadBungee().then(() => {
      console.log('[bungee loaded]');
      return serverNetwork.loadServers();
    }).then(() => {
      console.log('[everything loaded]');
    });

    break;
  }
})

const webAPI = new WebAPI(serverNetwork);
webAPI.start();
