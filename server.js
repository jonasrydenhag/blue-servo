"use strict";

var config = require('./config.json');
var debug = require('debug')('blueServo');
var noble = require('noble');
var storage = require('./lib/storage');

var peripheralIdOrAddress = config.peripheralId;
var serviceUUID = "6e400001b5a3f393e0a9e50e24dcca9e";
var writeCharacteristicUUID = "6e400002b5a3f393e0a9e50e24dcca9e";
var notifyCharacteristicUUID = "6e400003b5a3f393e0a9e50e24dcca9e";

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

    connect(foundPeripheral, function () {
      listenToQueue(foundPeripheral);
      disconnect(foundPeripheral);
    });
  }
});

function startScanning() {
  noble.startScanning([serviceUUID], false);
}

function connect(peripheral, callback) {
  process.on('SIGINT', function () {
    disconnect(peripheral);
  });

  peripheral.connect(function(error) {
    if (error) {
      debug(error);
    }

    var writeCharacteristic;
    var readCharacteristic;

    var characteristicUUIDs = [writeCharacteristicUUID, notifyCharacteristicUUID];

    peripheral.discoverServices([serviceUUID], function(error, services) {
      debug("Number of services found " + services.length);
      services.forEach(function (service) {
        debug("Found service with UUID " + service.uuid);
        debug("Found service with name " + service.name);
        service.discoverCharacteristics(characteristicUUIDs, function(error, characteristics) {
          debug("Number of characteristics found " + characteristics.length);
          characteristics.forEach(function(characteristic) {
            debug("Found characteristic with name " + characteristic.name);
            if (characteristic.uuid === writeCharacteristicUUID) {
              writeCharacteristic = characteristic;
            }

            if (characteristic.uuid === notifyCharacteristicUUID) {
              readCharacteristic = characteristic;
            }

            // Wait until both read and write are found
            if (writeCharacteristic && readCharacteristic) {
              callback(writeCharacteristic, readCharacteristic);
            }
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

    connect(peripheral, function (writeCharacteristic, readCharacteristic) {
      initRead(readCharacteristic, function () {
        disconnect(peripheral);
      });
      write(state, writeCharacteristic);
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

function initRead(characteristic, callback) {
  debug("Starts listening to read");
  characteristic.once('read', function(data) {
    read(data);
    callback();
  });

  characteristic.subscribe(function(error) {
    if (error) {
      debug(error);
    }
  });
}

function read(data) {
  debug("Read data", data);
  var state = extractStateFromData(data);
  debug("Read state", state);
  storage.push(state);
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
