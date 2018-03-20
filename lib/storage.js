'use strict';

var config = require('../config.json');
var firebase = require('firebase-admin');

var serviceAccount = require('../firebase-account.json');

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: config.firebase.databaseURL
});

var db = firebase.database();
var queueRef = db.ref("queue/state");
// @todo Switch from test
var statesRef = db.ref("states-test");

function pushState(state) {
  if (state !== "on" && state !== "off") {
    throw new Error("Invalid state: " + state);
  }

  return statesRef
    .push({
      state: state,
      createDate: firebase.database.ServerValue.TIMESTAMP
    });
}

// @todo Remove
function pushQueue(state) {
  if (state !== "on" && state !== "off") {
    throw new Error("Invalid state: " + state);
  }

  return queueRef
    .set(state);
}

function lastState() {
  return new Promise(function (resolve, reject) {
    statesRef
      .orderByChild("createDate")
      .limitToLast(1)
      .once("value", function (snapshot) {
        if (snapshot.hasChildren() === true) {
          snapshot.forEach(function (data) {
            resolve(data.val().state);
          });
        } else {
          resolve(null);
        }
      })
      .catch(function (ex) {
        reject(ex);
      });
  });
}

function listenToQueue(listener) {
  queueRef
    .on("value", function (snapshot) {
      snapshot.ref.remove();
      listener(snapshot.val());
    });
}

module.exports = {
  push: pushState,
  // @todo Remove
  pushQueue: pushQueue,
  //
  queue: listenToQueue,
  state: lastState
};
