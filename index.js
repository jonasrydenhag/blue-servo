#!/usr/bin/env node

'use strict';

var debug = require('debug')('blueServo');
var Promise = require('promise');
var servo = require('./lib/servo');
var storage = require('./lib/storage');

function on () {
  return changeState("on");
}

function off () {
  return changeState("off");
}

function currentState () {
  return storage.state();
}

function changeState (state) {
  return new Promise(function (resolve, reject) {
    if (state !== "on" && state !== "off") {
      throw new Error("Invalid state: " + state);
    }

    debug("Change server state:", state);
    servo.changeState(state)
      .then(function (state) {
        debug("State changed to:", state);
        resolve(state);
      })
      .catch(function (ex) {
        debug("State change failed:", ex);
        reject(ex);
      });
  });
}

(function(){
  module.exports.on = on;
  module.exports.off = off;
  module.exports.state = currentState;

  if (module.parent === null) {
    var state = process.argv[2];

    changeState(state)
      .then(function (newState) {
        debug(newState);
        process.exit();
      })
      .catch(function (ex) {
        debug(ex);
        process.exit(1);
      });
  }
})();
