const fs = require('fs-extra');

class ServerProperties {
  constructor(filepath) {
    this.filepath = filepath;
    this.properties = [];
  }

  loadProperties() {
    return new Promise((resolve, reject) => {
      fs.readFile(this.filepath, (err, data) => {
        if(err) {
          reject(err);
          return;
        }
        let array = data.toString().split("\n");
        for (let i=0; i<array.length; i++) {
          let elt = array[i];
          // Skip comments
          if (elt[0] == '#') {
            continue;
          }
          let parts = elt.split("=");
          if (parts.length == 2) {
            this.properties.push(parts);
          }
        };
        resolve();
      });
    });
  }

  saveProperties() {
    return new Promise((resolve, reject) => {
      let data = '';
      for (let i=0; i<this.properties.length; i++) {
        data += this.properties[i][0] + '=' + this.properties[i][1] + '\n';
      }
      fs.writeFile(this.filepath, data, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      })
    });
  }

  update(key, value) {
    for (let i=0; i<this.properties.length; i++) {
      if (this.properties[i][0] == key) {
        this.properties[i][1] = value;
      }
    }
  }
}

module.exports = ServerProperties;
