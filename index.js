#!/usr/bin/env node

'use strict';

var debug = require('debug')('blueServo');
var Promise = require('promise');
var pythonShell = require('python-shell');

var servoOptions = {
  mode: "text",
  pythonPath: "/usr/bin/python",
  pythonOptions: ["-u"],
  scriptPath: __dirname + "/bin"
};

function press () {
  return new Promise(function (resolve, reject) {
    pythonShell.run('blueServo.py', servoOptions, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

(function(){
  module.exports.press = press;

  if (module.parent === null) {
    press()
      .then(function () {
        process.exit();
      })
      .catch(function (ex) {
        debug(ex);
        process.exit(1);
      });
  }
})();
