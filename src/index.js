const readline = require('readline');
const SpigotServer = require('./minecraft')

let rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const server = new SpigotServer('test', 'Test', '/home/crashoz/TestNetwork', 'spigot-1.12.2.jar', '/home/crashoz/TestBackups', '/home/crashoz/Templates/template.xz', 25565);

server.on('stdout', (line) => {
  console.log(line);
})

rl.on('line', function(line){
  switch(line) {
    case 'init':
    server.init().then(() => {
      console.log('[server initialized]');
    });
    break;
    case 'start':
    server.start().then(() => {
      console.log('[server started]');
    });
    break;
    case 'stop':
    server.stop().then(() => {
      console.log('[server stopped]');
    });
    break;
    case 'restart':
    server.restart().then(() => {
      console.log('[server restarted]');
    });
    break;
    case 'backup':
    server.backup().then(() => {
      console.log('[server backup complete]');
    });
    break;
  }
})
