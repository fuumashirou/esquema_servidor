var redis   = require("../core/redis").rediscli
  , nohm    = require("nohm").Nohm
  , models  = require("../models")
  , async   = require("async");

exports.loadItems = function(store_id, items, callback) {
  var item_data = {};
  async.each(items, function(item_id, callback) {
    redis.hgetall("stores::" + store_id + "::items::" + item_id, function(err, result) {
      if (result && result.stock === "true") {
        item_data[item_id] = { name: result.name, price: result.price };
      }
      callback();
    });
  }, function(err) {
    if (err) callback(err)
      callback(null, item_data);
  });
}

exports.loadSelections = function(store_id, selections, callback) {
  var selection_data = {};
  async.each(selections, function(selection_id, callback) {
    redis.hgetall("stores::" + store_id + "::selections::" + selection_id, function(err, result) {
      if (result) {
        selection_data[selection_id] = { title: result.title };
      }
      callback();
    });
  }, function(err) {
    if (err) callback(err)
      callback(null, selection_data);
  });
}

exports.loadSelectionItems = function(store_id, selection_items, callback) {
  var selection_items_data = {};
  async.each(selection_items, function(selection_item_id, callback) {
    redis.hgetall("stores::" + store_id + "::selectionsitems::" + selection_item_id, function(err, result) {
      if (result && result.stock === "true") {
        selection_items_data[selection_item_id] = { name: result.name };
      }
      callback();
    });
  }, function(err) {
    if (err) callback(err)
      callback(null, selection_items_data);
  });
}

exports.loadSelectionsArray = function(selections_ids, callback) {
  var selection_data = []
    , selection_prop = [];
  async.each(selections_ids, function(selection_id, callback) {
    var Selection = models.Selection;
    nohm.factory("Selection", selection_id, function() {
      selection_data.push(this);
      callback();
    });
  }, function(err) {
    if (err) callback(err)
    callback(null, selection_data);
  });
}

exports.loadSelectionItemsArray = function(selection_items_ids, callback) {
  var selection_items_data = [];
  async.each(selection_items_ids, function(selection_item_id, callback) {
    var BaseItem = models.BaseItem;
    nohm.factory("BaseItem", selection_item_id, function() {
      selection_items_data.push(this.allProperties());
      callback();
    });
  }, function(err) {
    if (err) callback(err)
    callback(null, selection_items_data);
  });
}
