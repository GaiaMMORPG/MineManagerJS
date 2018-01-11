const SpigotServer = require('./SpigotServer');
const Promise = require('bluebird');
const fs = require('fs-extra');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync')


class ServerNetwork {
  constructor(slug, name, baseDir) {
    this.slug = slug;
    this.name = name;
    this.baseDir = baseDir;
    this.workingDir = baseDir + '/' + slug;
    this.backupDir = baseDir + '/ ' + slug + '-backups';
    this.templateDir = baseDir + '/' + slug + '-templates';
    this.configFile = this.workingDir + '/config.json';

    fs.ensureDir(this.workingDir).then(() => {
      return fs.ensureDir(this.backupDir);
    }).then(() => {
      return fs.ensureDir(this.templateDir);
    });

    this.portRange = [25566,30000];
    this.usedPorts = [];

    const adapter = new FileSync(this.configFile);
    this.db = low(adapter);

    this.db.defaults({
      'bungeecord': {
        'name': 'BungeeCord',
        'jarfile': 'BungeeCord.jar',
        'template': 'bungeecord',
        'port': 25565,
        'active': true,
        'ready': false
      },
      'spigot-servers': {}
    }).write();

    this.bungeeCord = null;
    this.spigotServers = {};
  }

  loadBungee() {
    return new Promise((resolve, reject) => {
      let config = this.db.get('bungeecord').value();
      let templatePath = this.templateDir + '/' + config.template + '.tar.xz';
      this.bungeeCord = new SpigotServer('bungeecord', config.name, this.workingDir, config.jarfile, this.backupDir, templatePath, config.port, true);
      if (!config.ready) {
        this.bungeeCord.init().then(() => {
          return this.bungeeCord.start();
        }).then(() => {
          resolve();
        });
        this.db.set('bungeecord.ready', true).write();
      } else {
        this.bungeeCord.start().then(() => {
          resolve();
        });
      }
    })
  }

  loadServers() {
    return new Promise((resolve, reject) => {
      let startPromises = [];
      this.db.get('spigot-servers')
        .map((config, slug) => {
          this.loadServer(slug, config.name, config.template, config.jarfile, config.port);
          if (config.active) {
            startPromises.push(this.startServer(slug));
          }
        })
        .value();
      Promise.all(startPromises).then(() => {
        resolve();
      })
    });
  }

  getOpenPort() {
    let port = this.portRange[0];
    while (port <= this.portRange[1] && this.usedPorts.indexOf(port) !== -1) {
      port++;
    }
    if (port > this.portRange[1]) {
      throw new Error('no port available');
    }
    return port;
  }

  addServer(slug, name, template, jarFile) {
    let templatePath = this.templateDir + '/' + template + '.tar.xz';
    let port = this.getOpenPort();
    this.usedPorts.push(port);

    this.spigotServers[slug] = new SpigotServer(slug, name, this.workingDir, jarFile, this.backupDir, templatePath, port, false);
    return this.spigotServers[slug].init().then(() => {
      this.db.get('spigot-servers')
        .set(slug, {
          name: name,
          jarfile: jarFile,
          template: template,
          port: port,
          active: false
        })
        .write();
    });
  }

  removeServer(slug) {
    return this.spigotServers[slug].stop().catch((err) => {
    }).finally(() => {
      let port = this.spigotServers[slug].port;
      let i = this.usedPorts.indexOf(port);
      this.usedPorts.splice(i, 1);
      delete this.spigotServers[slug];
      this.db.unset(`spigot-servers.${slug}`).write();
    })
  }

  loadServer(slug, name, template, jarFile, port) {
    let templatePath = this.templateDir + '/' + template + '.tar.xz';

    if (this.usedPorts.indexOf(port) !== -1) {
      return Promise.reject('port-used');
    }
    this.spigotServers[slug] = new SpigotServer(slug, name, this.workingDir, jarFile, this.backupDir, templatePath, port, false);
    return Promise.resolve();
  }

  activateServer(slug) {
    this.db.get('spigot-servers')
      .set(`${slug}.active`, true)
      .write();
  }

  deactivateServer(slug) {
    this.db.get('spigot-servers')
      .set(`${slug}.active`, false)
      .write();
  }

  startServer(slug) {
    return this.spigotServers[slug].start()
  }

  stopServer(slug) {
    return this.spigotServers[slug].stop();
  }

  restartServer(slug) {
    return this.spigotServers[slug].restart();
  }

  backupServer(slug) {
    return this.spigotServers[slug].backup();
  }
}

module.exports = ServerNetwork;
