const config = require('../config.json');

const winston = require('winston');
const spawn = require('child_process').spawn;
const exec = require('child_process').exec;
const crypto = require('crypto');
const moment = require('moment');
const Promise = require('bluebird');
const StreamSplitter = require('stream-splitter');
const EventEmitter = require('events');
const mysql = require('mysql');
const fs = require('fs-extra');

const ServerProperties = require('./ServerProperties');

/**
 * This is the main Server class for instanciating new Spigot Servers
 */
class SpigotServer extends EventEmitter {
  /**
   * Create new Server
   * @param  {String} slug      A minimal computer-friendly name (e.g. my-spigot-server)
   * @param  {String} name      A full name for the server (e.g. My Spigot Server)
   * @param  {String} baseDir   Directory in which the server will be placed (in slug subdir)
   * @param  {String} jarFile   Jar file name to start the server
   * @param  {String} backupDir Directory in which backups will be placed (in slug subdir)
   * @param  {Integer} port      Port to bind the server to
   */
  constructor(slug, name, baseDir, jarFile, backupDir, template, port, isActive, isBungee) {
    super();
    this.slug = slug;
    this.name = name;
    this.baseDir = baseDir;
    this.workingDir = baseDir + '/' + slug;
    this.jarFile = jarFile;
    this.backupDir = backupDir + '/' + slug;
    this.template = template;
    this.port = port;
    this.isActive = isActive;
    this.isBungee = isBungee;

    if (!this.isBungee) {
      this.serverProperties = new ServerProperties(this.workingDir + '/server.properties');
    }

    this.mysql = {
      user: slug,
      password: crypto.createHash('md5').update(slug).digest("hex"),
      db: slug,
    }

    this.monitorHistory = [];

    this.isRunning = false;
    this.status = 'STOPPED';
    this.process = null;
    this.stdoutSplitter = null;
    this.sqlBackupProcess = null;
    this.backupProcess = null;
    this.monitorProcess = null;

    this.backups = [];
    this.loadBackups();

    this.players = {};

    this.console = [];

    this.isActiveSubscribers = [];
    this.isRunningSubscribers = [];
    this.monitorSubscribers = [];
    this.backupsSubscribers = [];
    this.playersSubscribers = [];
    this.consoleSubscribers = [];
  }

  /**
   * Bootstrap the new server with a template and a new mysql database
   * @return {Promise}
   */
  init() {
    return new Promise((resolve, reject) => {
      winston.info(`Initializing "${this.name}"(${this.slug})`);

      // Create MYSQL user & db
      let connection = mysql.createConnection(config.mysql);
      winston.info(`Creating MYSQL Database for "${this.name}"(${this.slug})`);
      Promise.resolve().then(() => {
        connection.connect((error) => {
          return new Promise((resolve, reject) => {
            if (error) {
              winston.error(`Error connecting to MYSQL: ${error}`);
              reject();
            } else {
              resolve();
            }
          });
        });
      }).then(() => {
        return new Promise((resolve, reject) => {
          connection.query(`CREATE DATABASE ${this.mysql.db}`, (error, results, fields) => {
            if (error) {
              winston.error(`Error creating database ${this.mysql.db} in MYSQL: ${error}`);
              reject();
            } else {
              resolve(results, fields)
            }
          });
        });
      }).then((results, fields) => {
        return new Promise((resolve, reject) => {
          connection.query(`GRANT ALL PRIVILEGES ON ${this.mysql.db} . * TO '${this.mysql.user}'@'localhost' IDENTIFIED BY '${this.mysql.password}'`, (error, results, fields) => {
            if (error) {
              winston.error(`Error creating user ${this.mysql.user} in MYSQL: ${error}`);
              reject();
            } else {
              resolve(results, fields)
            }
          });
        });
      }).then((results, fields) => {
        connection.end();
      });

      // Copy folder structure (template)
      fs.ensureDir(`${this.workingDir}`).then(() => {
        return new Promise((resolve, reject) => {
          exec(`tar -xJf ${this.template} -C ${this.workingDir} --strip 1`, (error, stdout, stderr) => {
            if (error != null) {
              winston.error(`Error while cloning template for SpigotServer "${this.name}"(${this.slug}): ${stderr}`);
              reject('template-error');
              return;
            } else {
              winston.info(`Template cloned for SpigotServer "${this.name}"(${this.slug})`);
              resolve();
            }
          });
        });
      }).then(() => {
        fs.ensureDir(`${this.backupDir}`).then(() => {
          resolve();
        })
      });
    });
  }

/**
 * Sets the port the server will be listenning on
 */
  setPort() {
    return new Promise((resolve, reject) => {
      if (this.isBungee) {
        resolve()
      } else {
        this.serverProperties.loadProperties().then(() => {
          this.serverProperties.update('server-port', this.port);
          return this.serverProperties.saveProperties();
        }).then(() => {
          resolve();
        }).catch((err) => {
          reject(err);
        });
      }
    });
  }

  /**
   * Starts the server
   * @return {Promise}
   */
  start() {
    return new Promise((resolve,reject) => {
      if (this.isRunning) {
        winston.warn(`Tried to start SpigotServer "${this.name}"(${this.slug}) but it is already running on port ${this.port} with pid ${this.pid}`);
        reject('already-started');
        return;
      }

      this.setPort().then(() => {
        winston.info(`Starting SpigotServer "${this.name}"(${this.slug}) on port ${this.port}`);

        this.players = {};
        this.console = [];
        this.monitorHistory = [];

        this.isRunning = true;
        this.setRunning('STARTING');
        this.process = spawn('java', [
          '-jar',
          this.jarFile,
          'nogui'
        ], {
          cwd: this.workingDir
        });

        this.process.on('error', (err) => {
          winston.error(`SpigotServer "${this.name}"(${this.slug}) error in process ${this.pid}: ${err}`);
        });

        this.process.on('exit', (code) => {
          this.setRunning('STOPPED');
          this.isRunning = false;
          this.process = null;
          if (this.monitorProcess != null) {
            this.stopMonitoring();
          }
          if (code === 0) {
            winston.info(`SpigotServer "${this.name}"(${this.slug}) stopped successfully`);
          } else {
            winston.info(`SpigotServer "${this.name}"(${this.slug}) stopped with error code ${code}`);
          }
        });

        this.process.stdout.on('error', (err) => {});
        this.stdoutSplitter = this.process.stdout.pipe(StreamSplitter('\n'));
        this.stdoutSplitter.on('error', (err) => {});
        this.stdoutSplitter.on('token', (line) => {
          const ls = line.toString();
          this.console.push(ls);

          let del = [];
          this.consoleSubscribers.forEach((client) => {
            client.send(JSON.stringify({
              type: 'SERVER_CONSOLE_LINE',
              value: {
                slug: this.slug,
                line: ls,
              }
            }), (err) => {
              if (!err) {
                return;
              }
              del.push(client);
            })
          });
          del.forEach((client) => {
            remove(this.consoleSubscribers, client);
          });

          this.emit('stdout', ls);
        });

        /**
         * STARTED FILTER
         */

        let doneRegex = /\[[0-9]{2}:[0-9]{2}:[0-9]{2} INFO\]: Done \([0-9]+\.[0-9]+s\)! For help, type "help" or "?"/;
        if (this.isBungee) {
          doneRegex = /[0-9]{2}:[0-9]{2}:[0-9]{2} \[INFO\] Listening on \/[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}:[0-9]+/;
        }

        let startedFilter = (line) => {
          line = line.toString();
          let m = doneRegex.exec(line);
          if (m) {
            this.setRunning('STARTED');
            this.stdoutSplitter.removeListener('token', startedFilter);
            this.startMonitoring();
            resolve();
          }
        }
        this.stdoutSplitter.on('token', startedFilter);

        /**
         * LOGIN/LOGOUT FILTER
         */

        let playerLogin = /\[[0-9]{2}:[0-9]{2}:[0-9]{2} INFO\]: ([a-zA-Z0-9_\-])+\[\/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}):[0-9]+\] logged in/
        let playerLogout = /\[[0-9]{2}:[0-9]{2}:[0-9]{2} INFO\]: ([a-zA-Z0-9_\-])+ lost connection/

        let loginlogoutFilter = (line) => {
          line = line.toString();
          let m = playerLogin.exec(line);
          if (m) {
            this.playerLogin(m[1], m[2]);
          }
          m = playerLogout.exec(line);
          if (m) {
            this.playerLogout(m[1]);
          }
        }
        this.stdoutSplitter.on('token', loginlogoutFilter);
      });
    });
  }

  /**
   * A player logs in to the server
   * @param  {String} name username
   * @param  {String} ip   userip
   * @return {}
   */
  playerLogin(name, ip) {
    this.players[name] = ip;
    let del = [];
    this.playersSubscribers.forEach((client) => {
      client.send(JSON.stringify({
        type: 'SERVER_PLAYER_LOGIN',
        value: {
          slug: this.slug,
          name: name,
          ip: ip
        }
      }), (err) => {
        if (!err) {
          return;
        }
        del.push(client);
      })
    });
    del.forEach((client) => {
      remove(this.playersSubscribers, client);
    });
  }

  /**
   * A player logs out of the server
   * @param  {String} name username
   * @return {}
   */
  playerLogout(name) {
    let del = [];
    this.playersSubscribers.forEach((client) => {
      client.send(JSON.stringify({
        type: 'SERVER_PLAYER_LOGOUT',
        value: {
          slug: this.slug,
          name: name,
          ip: this.players[name]
        }
      }), (err) => {
        if (!err) {
          return;
        }
        del.push(client);
      })
    });
    del.forEach((client) => {
      remove(this.playersSubscribers, client);
    });
    delete this.players[name];
  }

  /**
   * Launch PIDSTAT  to monitor CPU, RAM and disk I/O
   * @return {}
   */
  startMonitoring() {
    if (!this.isRunning) {
      winston.warn(`Tried to monitor SpigotServer "${this.name}"(${this.slug}) but it is not running`);
      reject('not-running');
      return;
    }

    this.monitorProcess = spawn("pidstat", [
            "-h",
            "-r",
            "-u",
            "-d",
            "-s",
            "5",
            "-p",
            this.process.pid
            ]);

    this.monitorProcess.on('exit', (code) => {
      this.monitorProcess = null;
    })

    this.monitorProcess.stdout.on('error', (err) => {});
    let stdoutSplitter = this.monitorProcess.stdout.pipe(StreamSplitter('\n'));
    stdoutSplitter.on('error', (err) => {});
    stdoutSplitter.on("token", (line) => {
        line = line.toString();
        if (line[0] == '#') {
            return;
        }
        var raw = line.split(/\s+/);
        if (raw.length != 21) {
            return;
        }
        raw.shift();
        raw.shift();
        raw.shift();
        raw.shift();
        raw.pop();

        if (this.monitorHistory.length > 100) {
          this.monitorHistory.shift();
        }
        this.monitorHistory.push(raw);

        let del = [];
        this.monitorSubscribers.forEach((client) => {
          client.send(JSON.stringify({
            type: 'SERVER_MONITORING',
            value: {
              slug: this.slug,
              monitoring: raw
            }
          }), (err) => {
            if (!err) {
              return;
            }
            del.push(client);
          })
        });
        del.forEach((client) => {
          remove(this.monitorSubscribers, client);
        });
    });
  }

  /**
   * Stops the server
   * @return {Promise}
   */
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.isRunning) {
        winston.warn(`Tried to stop SpigotServer "${this.name}"(${this.slug}) but it is not running`);
        reject('not-running');
        return;
      }

      winston.info(`Stopping SpigotServer "${this.name}"(${this.slug}) on port ${this.port}`);

      this.setRunning('STOPPING');

      this.process.on('exit', (code) => {
        resolve();
      });
      if (this.isBungee) {
        this.executeCommand('end');
      } else {
        this.executeCommand('stop');
      }
    });
  }

  /**
   * Stop PIDSTAT
   * @return {}
   */
  stopMonitoring() {
    this.monitorProcess.kill('SIGTERM');
  }

  /**
   * Restarts the server
   * @return {Promise}
   */
  restart() {
    return new Promise((resolve, reject) => {
      if (!this.isRunning) {
        winston.warn(`Tried to restart SpigotServer "${this.name}"(${this.slug}) but it is not running`);
        reject('not-running');
        return;
      }

      winston.info(`Restarting SpigotServer "${this.name}"(${this.slug}) on port ${this.port}`);

      this.stop().then(() => {
        return this.start();
      }).then(() => {
        resolve();
      })
    })
  }

  /**
   * KILL the server
   * @return {}
   */
  kill() {
    if (!this.isRunning) {
      winston.warn(`Tried to kill SpigotServer "${this.name}"(${this.slug}) but it is not running`);
      return;
    }

    this.process.kill('SIGKILL');
  }

  /**
   * Executes a command on server (as console)
   * @param  {String} command A command
   * @return {}
   */
  executeCommand(command) {
    if (!this.isRunning) {
      winston.warn(`Tried to send command ${command} to SpigotServer "${this.name}"(${this.slug}) but it is not running`);
      return;
    }

    winston.info(`Sending command ${command} to SpigotServer "${this.name}"(${this.slug})`);

    this.process.stdin.write(command+'\n');
  }

  /**
   * Backs up the server + mysql database as a .tar.xz archive
   * @return {Promise}
   */
  backup() {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        winston.warn(`Tried to backup SpigotServer "${this.name}"(${this.slug}) but it is running`);
        reject('error-running');
        return;
      }

      winston.info(`Performing backup on SpigotServer "${this.name}"(${this.slug})`)

      exec(`mysqldump -u ${this.mysql.user} --password=${this.mysql.password} ${this.mysql.db} --single-transaction --default-character-set=utf8 > ${this.workingDir}/backup.sql`, (error, stdout, stderr) => {
        if (error != null) {
          winston.error(`Error while performing MYSQL backup on SpigotServer "${this.name}"(${this.slug}): ${stderr}`);
          reject('mysql-backup-error');
          return;
        } else {
          winston.info(`Performed MYSQL backup on SpigotServer "${this.name}"(${this.slug})`);

          let date = moment().format('YYYY-MM-DD-HH-mm-ss');
          exec(`tar -cJf ${this.backupDir}/${date}.tar.xz ${this.workingDir}`, (error, stdout, stderr) => {
            if (error != null) {
              winston.error(`Error while performing minecraft backup on SpigotServer "${this.name}"(${this.slug}): ${stderr}`);
              reject('minecraft-backup-error');
              return;
            } else {
              winston.info(`Performed minecraft backup on SpigotServer "${this.name}"(${this.slug})`);

              fs.stat(`${this.backupDir}/${date}.tar.xz`, (err, stat) => {
                let size = stat.blocks*stat.blksize/8;
                this.backups.push({
                  date: moment(date, 'YYYY-MM-DD-HH-mm-ss'),
                  size: size
                });

                let del = [];
                this.backupsSubscribers.forEach((client) => {
                  client.send(JSON.stringify({
                    type: 'SERVER_BACKUP',
                    value: {
                      slug: this.slug,
                      date: date,
                      size: size
                    }
                  }), (err) => {
                    if (!err) {
                      return;
                    }
                    del.push(client);
                  })
                });
                del.forEach((client) => {
                  remove(this.backupsSubscribers, client);
                });

                resolve();
              })
            }
          });
        }
      });
    });
  }

  loadBackups() {
    fs.readdir(`${this.backupDir}`, (err, files) => {
      if (err) {
        return;
      } else {
        let promises = [];
        files.forEach((file) => {
          let promise = new Promise((resolve, reject) => {
            let date = moment(file.split('.')[0], 'YYYY-MM-DD-HH-mm-ss');
            fs.stat(`${this.backupDir}/${file}`, (err, stat) => {
              if (err) {
                reject();
              } else {
                let size = stat.blocks*stat.blksize/8;
                resolve({
                  date: date,
                  size: size
                });
              }
            });
          });
          promises.push(promise);
        });

        Promise.all(promises).then((backups) => {
          this.backups = backups;
          this.backups.sort(function(left, right) {
            return left.date.diff(right.date);
          });
          console.log(this.backups);
        })
      }
    });
  }

  setActive(isActive) {
    this.isActive = isActive;
    let del = [];
    this.isActiveSubscribers.forEach((client) => {
      client.send(JSON.stringify({
        type: 'SERVER_ACTIVE',
        value: {
          slug: this.slug,
          isActive: this.isActive
        }
      }), (err) => {
        if (!err) {
          return;
        }
        del.push(client);
      })
    });
    del.forEach((client) => {
      remove(this.isActiveSubscribers, client);
    });
  }

  setRunning(status) {
    this.status = status;
    let del = [];
    this.isRunningSubscribers.forEach((client) => {
      client.send(JSON.stringify({
        type: 'SERVER_RUNNING',
        value: {
          slug: this.slug,
          running: status
        }
      }), (err) => {
        if (!err) {
          return;
        }
        del.push(client);
      })
    });
    del.forEach((client) => {
      remove(this.isRunningSubscribers, client);
    });
  }

  sendConsole(client) {
    client.send(JSON.stringify({
      type: 'SERVER_CONSOLE',
      value: {
        slug: this.slug,
        console: this.console,
        length: 500
      }
    }), (err) => {
      if (!err) {
        return;
      }
    })
  }

  subscribe(client, channel) {
    switch(channel) {
      case 'SERVER_DETAIL':
        this.isActiveSubscribers.push(client);
        this.isRunningSubscribers.push(client);
        this.monitorSubscribers.push(client);
        this.backupsSubscribers.push(client);
        this.playersSubscribers.push(client);
        break;
      case 'SERVER_CONSOLE':
        this.sendConsole(client);
        this.consoleSubscribers.push(client);
        break;
    }
  }

  unsubscribe(client, channel) {
    switch(channel) {
      case 'SERVER_DETAIL':
        remove(this.isActiveSubscribers, client);
        remove(this.isRunningSubscribers, client);
        remove(this.monitorSubscribers, client);
        remove(this.backupsSubscribers, client);
        remove(this.playersSubscribers, client);
        break;
      case 'SERVER_CONSOLE':
        remove(this.consoleSubscribers, client);
        break;
    }
  }
}

function remove(array, elt) {
  let i = array.indexOf(elt);
  if (i != -1) {
    array.splice(i, 1);
  }
}

module.exports = SpigotServer;
