var error  = require("../../core/errors")
  , helper = require("../../helpers")
  , async  = require("async")
  , funct  = helper.functions
  , base   = helper.database
  , params = helper.params;

function StoreHandler(db) {
  var storesCollection = db.collection("stores")
    , itemsCollection  = db.collection("items")
    , promotionsCollection = db.collection("promotions");

  this.index = function(req, res, next) {
    var query  = req.query.city ? { city: req.query.city, verified: true } : { verified: true }
      , select = helper.parseSelect("stores", req.query.select);
    storesCollection.find(query, select).toArray(function(err, results) {

      return res.json(results);
    });
  }

  this.show = function(req, res, next) {
    var store_id = req.params.id;
    if (params.notPresent(store_id))
      return res.json(error("InvalidArgumentError", "Missing params"));

    var query  = { _id: base.objectID(store_id), verified: true }
      , select = helper.parseSelect("stores", req.query.select);
    storesCollection.findOne(query, select, function(err, store) {
      if (params.notPresent(store))
        return res.json(error("ResourceNotFoundError", "Store not found"));

      async.parallel({
        promotions: function(callback) {
          var query = { store_id: base.objectID(store_id) }
            , select = { _id:1 };
          promotionsCollection.find(query, select).count(function(err, count) {
            if (err)
              return callback(error("InvalidArgumentError", err));
            else
              return callback(null, count);
          });
        },
        happy_items: function(callback) {
          var query = { store_id: base.objectID(store_id), happy_hour: true }
            , select = { _id:1 };
          itemsCollection.find(query, select).count(function(err, count) {
            if (err)
              return callback(error("InvalidArgumentError", err));
            else
              return callback(null, count);
          });
        },
        happy_hour: function(callback) {
          base.happyHour(storesCollection, store_id, function(err, happy_hour) {
            if (err)
              return callback(error("InvalidArgumentError", err));

            return callback(null, happy_hour);
          });
        },
      }, function(err, result) {
        if (err)
          return res.json(err);

        store["promotions_count"] = result.promotions;
        store["happy_hour_count"] = result.happy_items;
        store["happy_hour"] = result.happy_hour;
        return res.json(store);
      });
    });
  }

  this.cities = function(req, res, next) {
    storesCollection.distinct("city", { verified: true }, function(err, results) {
      if (err)
        return res.json(error("InternalError", "Database error"));

      return res.json(results || []);
    });
  }
}

module.exports = StoreHandler;
