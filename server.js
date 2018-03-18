"use strict";

var debug = require('debug')('blueServo');
var noble = require('noble');

var peripheralIdOrAddress = 'address';
var serviceUUID = "6e400001b5a3f393e0a9e50e24dcca9e";
var writeCharacteristicUUID = "6e400002b5a3f393e0a9e50e24dcca9e";
var notifyCharacteristicUUID = "6e400003b5a3f393e0a9e50e24dcca9e";

var peripheral;
var writeCharacteristic;
var readCharacteristic;

noble.on('stateChange', function(state) {
  if (state === 'poweredOn') {
    noble.startScanning([serviceUUID], false);
  } else {
    noble.stopScanning();
  }
});

noble.on('discover', function(foundPeripheral) {
  if (foundPeripheral.id === peripheralIdOrAddress || foundPeripheral.address === peripheralIdOrAddress) {
    noble.stopScanning();

    peripheral = foundPeripheral;

    peripheral.on('disconnect', function() {
      process.exit(0);
    });

    connect(peripheral);
  }
});

function connect(peripheral) {

  peripheral.connect(function(error) {
    if (error) {
      debug(error);
    }

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

            if (writeCharacteristic && readCharacteristic) {
              initWrite(writeCharacteristic, readCharacteristic);
            }
          });
        });
      });
    });
  });
}



function initWrite(writeCharacteristic, readCharacteristic) {
  var data = Buffer.from('!S0');

  read(readCharacteristic);

  writeCharacteristic.write(data, false, function (error) {
    if (error) {
      debug(error);
    } else {
    }
  });
}

function read(characteristic) {
  characteristic.read(function(error, data) {
    if (error) {
      debug(error);
    } else {
      var state = parseInt(data.toString('utf8', 2,3));

      if (state === 0) {
        debug('Servo is off');
      } else if (state === 1) {
        debug('Servo is on');
      } else {
        debug('Servo state is unavailable');
      }
    }
  });
}

process.on('SIGINT', function () {
  if (peripheral !== null) {
    peripheral.disconnect();
  }
});
