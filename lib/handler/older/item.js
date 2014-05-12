var redis   = require("redis").createClient()
  , error   = require("../../core/errors")
  , helper  = require("../../helpers")
  , async   = require("async")
  , funct   = helper.functions
  , base    = helper.database
  , params  = helper.params
  , data    = helper.data;

function ItemHandler(db) {
  var storesCollection = db.collection("stores")
    , itemsCollection  = db.collection("items");

  this.index = function(req, res, next) {
    if (params.notPresent(req.params.store_id))
      return res.json(error("InvalidArgumentError", "Missing params"));

    var query  = { store_id: base.objectID(req.params.store_id) }
      , select = helper.parseSelect("items", req.query.select);
    if (!params.notPresent(req.query.category)) {
      if (req.query.category !== "happy hour")
        query["category"] = req.query.category;
      else
        query["happy_hour"] = true;
    }

    itemsCollection.find(query, select).toArray(function(err, items) {
      return res.json(items);
    });
  }

  this.show = function(req, res, next) {
    if (params.notPresent(req.params.store_id, req.params.id))
      return res.json(error("InvalidArgumentError", "Missing params"));

    var query  = { _id: base.objectID(req.params.id) }
      , select = {};
    itemsCollection.findOne(query, select, function(err, item) {
      if (!item) return res.json({});

      // Make Happy Hour object
      base.happyHour(storesCollection, req.params.store_id, function(err, status) {
        if (status == true && item.happy_hour == true) {
          item.happy_hour = true;
        } else {
          item.happy_hour = false;
        }
        delete item.hh_price;

        getStock("Item", req.params.store_id, item, function(err, item_with_stock) {
          if (item_with_stock.selections) {
            async.each(item_with_stock.selections, function(selection, callback) {
              if (selection.selection_items) {
                async.each(selection.selection_items, function(selection_item, cb) {
                    getStock("SelectionItem", req.params.store_id, selection_item, function(err, selection_item_with_stock) {
                      cb();
                  });
                }, function(err) {
                  callback();
                });
              } else {
                callback();
              }
            }, function(err) {
              return res.json(item_with_stock);
            });
          } else {
            return res.json(item_with_stock);
          }
        });

      });
    });
  }

  this.categories = function(req, res, next) {
    var store_id = req.params.store_id;
    if (params.notPresent(store_id))
      return res.json(error("InvalidArgumentError", "Missing params"));

    var query  = { _id: base.objectID(store_id) }
      , select = { "categories.type":1, "categories.name":1, "categories.items":1 };
    storesCollection.findOne(query, select, function(err, store) {
      var categories = [];
      if (req.query.type && store && store.categories) {
        store.categories.forEach(function(category) {
          if (category.type == req.query.type) {
            categories.push(category);
          }
        });
      }
      if (!req.query.type && store && store.categories) categories = store.categories;
      return res.json(categories);
    });
  }

}

// Get item stock
var getStock = function(type, store_id, object, callback) {
  redis.hget("Store:" + store_id + ":" + type, object._id, function(err, stock) {
    if (err)
      callback(err, null);
    if (!stock)
      object.stock = false;

    switch(stock) {
    case "true":
      object.stock = true;
      break;
    default:
      object.stock = false;
    }

    callback(null, object);
  });
}

module.exports = ItemHandler;
