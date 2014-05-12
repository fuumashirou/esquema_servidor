var error  = require("../../core/errors")
  , helper = require("../../helpers")
  , funct   = helper.functions
  , base   = helper.database
  , params = helper.params;

function StoreHandler(db) {
  var storesCollection = db.collection("stores");

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

      happyHour(storesCollection, store_id, function(err, happy_hour) {
        if (err)
          return res.json(error("InvalidArgumentError", err));

        store.happy_hour = happy_hour;
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

// Get happy hour info
var happyHour = function(collection, store_id, callback) {
    var query  = { _id: base.objectID(store_id) }
      , select = { "happy_hour":1 }
      , weekday    = funct.todayWeekName()
      , happy_hour = { active: false };

  collection.findOne(query, select, function(err, store) {
    if (store && store.happy_hour) {
      happy_hour.type = store.happy_hour.rules.type;
      if (store.happy_hour.active == true) {
        var status = store.happy_hour.schedules[weekday];
        if (status.active == true) {
          happy_hour.all_day = status.all_day;
          if (status.all_day == true) {
            happy_hour.active = true;
          } else {
            try {
              var start = funct.midnight_to_time(status.start_time)
                , end   = funct.midnight_to_time(status.end_time)
                , now   = new Date();
              happy_hour["start"] = start.toISOString();
              happy_hour["end"]   = end.toISOString();
            } catch(e) {
              callback("Wrong time format", null);
            }
            if (start <= now && now <= end) {
              happy_hour.active = true;
            }
          }
        }
      }
    }
    callback(null, happy_hour);
  });
}

module.exports = StoreHandler;
