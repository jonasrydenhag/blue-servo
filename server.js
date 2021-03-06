"use strict";

var config = require('./config.json');
var debug = require('debug')('blueServo');
var noble = require('noble');
var storage = require('./lib/storage');

var peripheralIdOrAddress = config.peripheralId;
var serviceUUID = "6e400001b5a3f393e0a9e50e24dcca9e";
var writeCharacteristicUUID = "6e400002b5a3f393e0a9e50e24dcca9e";
var notifyCharacteristicUUID = "6e400003b5a3f393e0a9e50e24dcca9e";

var peripheral;

noble.once('stateChange', function(state) {
  if (state === 'poweredOn') {
    startScanning();
  } else {
    noble.stopScanning();
  }
});

function onDiscover(foundPeripheral) {
  if (foundPeripheral.id === peripheralIdOrAddress || foundPeripheral.address === peripheralIdOrAddress) {
    noble.stopScanning();
    noble.removeListener('discover', onDiscover);

    peripheral = foundPeripheral;

    peripheral.once('disconnect', function() {
      reconnect();
    });

    connect(peripheral);
  }
}

noble.on('discover', onDiscover);

function startScanning() {
  noble.startScanning([serviceUUID], false);
}

function connect(peripheral) {

  peripheral.connect(function(error) {
    if (error) {
      debug(error);
    }

    var writeCharacteristic;
    var readCharacteristic;

    var characteristicUUIDs = [writeCharacteristicUUID, notifyCharacteristicUUID];

    peripheral.discoverServices([serviceUUID], function(error, services) {
      services.forEach(function (service) {
        service.discoverCharacteristics(characteristicUUIDs, function(error, characteristics) {
          characteristics.forEach(function(characteristic) {
            if (characteristic.uuid === writeCharacteristicUUID) {
              writeCharacteristic = characteristic;
            }

            if (characteristic.uuid === notifyCharacteristicUUID) {
              readCharacteristic = characteristic;
            }

            // Wait until read is found before starting write
            if (writeCharacteristic && readCharacteristic) {
              initRead(readCharacteristic);
              initWrite(writeCharacteristic);
            }
          });
        });
      });
    });
  });
}

function initWrite(characteristic) {
  storage.queue(function (state) {
    if (state === null) {
      return;
    }

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
        reconnect();
      }
    })
  });
}

function initRead(characteristic) {
  characteristic.on('read', function(data) {
    var state = extractStateFromData(data);
    storage.push(state);
  });

  characteristic.subscribe(function(error) {
    if (error) {
      debug(error);
      reconnect();
    }
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

function reconnect() {
  disconnect();
  setTimeout(function () {
    debug("Reconnects");
    startScanning();
  }, 1000);
}

function disconnect() {
  if (peripheral) {
    peripheral.disconnect();
  }
}

process.on('SIGINT', function () {
  disconnect();
});
