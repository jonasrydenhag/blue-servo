"use strict";

var config = require('./config.json');
var debug = require('debug')('blueServo');
var noble = require('noble');
var Promise = require('promise');
var storage = require('./lib/storage');

var peripheralId = config.peripheralId;
var serviceUUID = "6e400001b5a3f393e0a9e50e24dcca9e";
var writeCharacteristicUUID = "6e400002b5a3f393e0a9e50e24dcca9e";
var notifyCharacteristicUUID = "6e400003b5a3f393e0a9e50e24dcca9e";

var findPeripheralPromise;

var scanningTimeout;
var connectionTimeout;

function changeState(state) {
  return new Promise(function (resolve, reject) {
    find()
      .then(function (peripheral) {
        if (peripheral == null) {
          reject("Found peripheral is null");
          return;
        }

        connectAndWrite(state, peripheral)
          .then(resolve)
          .catch(reject)
          .finally(function () {
            disconnect(peripheral);
          })
      })
      .catch(reject);
  });
}

function find() {
  if (findPeripheralPromise != null) {
    return findPeripheralPromise;
  }

  findPeripheralPromise = new Promise(function (resolve, reject) {
    noble.on('stateChange', function(state) {
      debug("State change", state);

      if (state === 'poweredOn') {
        debug("Start scanning");
        startScanning();
        scanningTimeout = setScanningTimeout(reject);
      } else {
        reject("Powered off");
        stopScanning();
      }
    });

    noble.on('discover', function(foundPeripheral) {
      if (foundPeripheral.id === peripheralId || foundPeripheral.address === peripheralId) {
        noble.stopScanning();

        foundPeripheral.on('disconnect', function() {
          reject("Disconnected");
        });

        debug("Found", foundPeripheral.id);

        resolve(foundPeripheral);
      }
    });
  }).catch(function (ex) {
    debug("Scanning failed:", ex);

    findPeripheralPromise = null;
  }).finally(function () {
    if (scanningTimeout) {
      clearTimeout(scanningTimeout);
    }
  });

  return findPeripheralPromise;
}

function startScanning() {
  noble.startScanning([serviceUUID], false);
}

function stopScanning() {
  noble.stopScanning();
}

function connect(peripheral) {
  return new Promise(function (resolve, reject) {
    connectionTimeout = setConnectionTimeout(peripheral, reject);

    peripheral.connect(function (error) {
      if (error) {
        reject(error);
      }

      debug("Connected to peripheral");
      var characteristicUUIDs = [writeCharacteristicUUID, notifyCharacteristicUUID];

      peripheral.discoverServices([serviceUUID], function (error, services) {
        if (error) {
          reject(error);
        }

        debug("Number of services found", services.length);
        if (services.length < 1) {
          reject("No services found");
        }

        services.forEach(function (service) {
          debug("Found service with name", service.name);

          service.discoverCharacteristics(characteristicUUIDs, function (error, characteristics) {
            if (error) {
              reject(error);
            }

            debug("Number of characteristics found", characteristics.length);
            if (characteristics.length < 1) {
              reject("No characteristics found");
            }

            var writeCharacteristic;
            var readCharacteristic;

            characteristics.forEach(function (characteristic) {
              debug("Found characteristic with name", characteristic.name);
              if (characteristic.uuid === writeCharacteristicUUID) {
                writeCharacteristic = characteristic;
              }

              if (characteristic.uuid === notifyCharacteristicUUID) {
                readCharacteristic = characteristic;
              }

              // Wait until both read and write are found
              if (writeCharacteristic && readCharacteristic) {
                resolve({
                  "writeCharacteristic": writeCharacteristic,
                  "readCharacteristic": readCharacteristic
                });
              }
            });
          });
        });
      });
    });
  }).finally(function () {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
  });
}

function connectAndWrite(state, peripheral) {
  return new Promise(function (resolve, reject) {
    debug("Connect to peripheral", peripheral.id);

     connect(peripheral)
      .then(function (chars) {
        initRead(chars.readCharacteristic)
          .then(resolve)
          .catch(reject);

        write(state, chars.writeCharacteristic)
          .catch(reject);
      })
      .catch(function (ex) {
        debug("Connection failed with: ", ex);
        reject(ex);
      });
  });
}

function write(state, characteristic) {
  return new Promise(function (resolve, reject) {
    var data;

    if (state === 'on') {
      data = Buffer.from('!S1');
    } else if (state === 'off') {
      data = Buffer.from('!S0');
    } else {
      reject("Wrong state " + state);
      return;
    }

    characteristic.write(data, false, function (error) {
      if (error) {
        reject(error);
        return;
      }
      debug("Wrote state", state);
    })
  });
}

function initRead(characteristic) {
  debug("Starts listening to read");

  var readPromise = new Promise(function (resolve, reject) {
    characteristic.once('read', function(data) {
      read(data)
        .then(resolve)
        .catch(reject);
    });
  });

  characteristic.subscribe(function(error) {
    if (error) {
      debug(error);
    }
  });

  return readPromise;
}

function read(data) {
  return new Promise(function (resolve, reject) {
    debug("Read data", data);

    extractStateFromData(data)
      .then(function (state) {
        resolve(state);
        storage.push(state);
      })
      .catch(reject);
  });
}

function extractStateFromData(data) {
  return new Promise(function (resolve, reject) {
    var state = parseInt(data.toString('utf8', 2,3));

    debug("Read state", state);

    if (state === 0) {
      resolve("off");
    } else if (state === 1) {
      resolve("on");
    } else {
      reject("Servo state is unknown: " + state);
    }
  });
}

function setScanningTimeout(reject) {
  var timeout = 10000;

  return setTimeout(function () {
    reject("Scanning timed out after " + timeout);
    stopScanning();
  }, timeout);
}

function setConnectionTimeout(peripheral, reject) {
  var timeout = 5000;

  return setTimeout(function () {
    reject("Connection to peripheral " + peripheral.id + " timed out after " + timeout);
  }, timeout);
}

function disconnect(peripheral) {
  peripheral.disconnect();
}

process.on('SIGINT', function () {
  if (findPeripheralPromise != null) {
    findPeripheralPromise
      .then(function (peripheral) {
        disconnect(peripheral);
      });
  }
});

module.exports = {
  changeState: changeState
};
