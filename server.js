"use strict";

var config = require('./config.json');
var debug = require('debug')('blueServo');
var noble = require('noble');
var Promise = require('promise');
var storage = require('./lib/storage');

var peripheralIdOrAddress = config.peripheralId;
var serviceUUID = "6e400001b5a3f393e0a9e50e24dcca9e";
var writeCharacteristicUUID = "6e400002b5a3f393e0a9e50e24dcca9e";
var notifyCharacteristicUUID = "6e400003b5a3f393e0a9e50e24dcca9e";

var currentPeripheral;

noble.on('stateChange', function(state) {
  if (state === 'poweredOn') {
    startScanning();
  } else {
    noble.stopScanning();
  }
});

noble.on('discover', function(foundPeripheral) {
  if (foundPeripheral.id === peripheralIdOrAddress || foundPeripheral.address === peripheralIdOrAddress) {
    noble.stopScanning();

    connect(foundPeripheral)
      .catch(function (ex) {
        debug("Connection failed with: ", ex);
      })
      .finally(function () {
        listenToQueue(foundPeripheral);
        disconnect(foundPeripheral);
      });
  }
});

function startScanning() {
  noble.startScanning([serviceUUID], false);
}

function connect(peripheral) {
  currentPeripheral = peripheral;

  return new Promise(function (resolve, reject) {
    peripheral.connect(function (error) {
      if (error) {
        reject(error);
      }

      var characteristicUUIDs = [writeCharacteristicUUID, notifyCharacteristicUUID];

      peripheral.discoverServices([serviceUUID], function (error, services) {
        if (error) {
          reject(error);
        }

        debug("Number of services found " + services.length);
        if (services.length < 1) {
          reject("No services found");
        }
        services.forEach(function (service) {
          debug("Found service with UUID " + service.uuid);
          debug("Found service with name " + service.name);
          service.discoverCharacteristics(characteristicUUIDs, function (error, characteristics) {
            if (error) {
              reject(error);
            }

            debug("Number of characteristics found " + characteristics.length);
            if (characteristics.length < 1) {
              reject("No characteristics found");
            } else {
              var timeout = 2000;

              var characteristicsTimeout = setTimeout(function () {
                reject("Desired characteristics not found before timeout " + timeout);
              }, timeout);
            }

            var writeCharacteristic;
            var readCharacteristic;

            characteristics.forEach(function (characteristic) {
              debug("Found characteristic with name " + characteristic.name);
              if (characteristic.uuid === writeCharacteristicUUID) {
                writeCharacteristic = characteristic;
              }

              if (characteristic.uuid === notifyCharacteristicUUID) {
                readCharacteristic = characteristic;
              }

              // Wait until both read and write are found
              if (writeCharacteristic && readCharacteristic) {
                clearTimeout(characteristicsTimeout);
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
  });
}

function listenToQueue(peripheral) {
  storage.queue(function (state) {
    debug("New queue value", state);
    if (state === null) {
      return;
    }

    debug("Connect to peripheral", peripheral.id);

    connect(peripheral)
      .then(function (chars) {
        initRead(chars.readCharacteristic)
          .finally(function () {
            disconnect(peripheral);
          });

        write(state, chars.writeCharacteristic);
      })
      .catch(function (ex) {
        debug("Connection failed with: ", ex);
        disconnect(peripheral);
      });
  });
}

function write(state, characteristic) {
  var data;

  if (state === 'on') {
    data = Buffer.from('!S1');
  } else if (state === 'off') {
    data = Buffer.from('!S0');
  } else {
    debug("Wrong state " + state);
  }

  characteristic.write(data, false, function (error) {
    if (error) {
      debug(error);
    }
    debug("Wrote state", state);
  })
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
  return new Promise(function (resolve) {
    debug("Read data", data);
    var state = extractStateFromData(data);
    debug("Read state", state);

    resolve(state);
    storage.push(state);
  });
}

function extractStateFromData(data) {
  var state = parseInt(data.toString('utf8', 2,3));

  if (state === 0) {
    return "off"
  } else if (state === 1) {
    return "on";
  } else {
    debug("Servo state is unknown: " + state);
  }
}

function disconnect(peripheral) {
  peripheral.disconnect();
}

process.on('SIGINT', function () {
  disconnect(currentPeripheral);
});
