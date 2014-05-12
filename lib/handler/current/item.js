var redis  = require("redis").createClient()
  , error  = require("../../core/errors")
  , helper = require("../../helpers")
  , async  = require("async")
  , funct  = helper.functions
  , base   = helper.database
  , params = helper.params
  , data   = helper.data;

function ItemHandler(db) {
  var storesCollection = db.collection("stores")
    , itemsCollection  = db.collection("items")
    , promotionsCollection = db.collection("promotions");

  this.index = function(req, res, next) {
    var store_id = req.params.store_id;
    if (params.notPresent(store_id))
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
      var items_with_stock = [];
      async.each(items, function(item, callback) {
        getStock("Item", store_id, item, function(err, item_with_stock) {
          items_with_stock.push(item_with_stock);
          callback();
        });
      }, function(err) {
        if (err)
          return res.json(error("InternalError", "Unexpected error"));
        else
          return res.json(items_with_stock);
      });
    });
  }

  this.show = function(req, res, next) {
    if (params.notPresent(req.params.store_id, req.params.id))
      return res.json(error("InvalidArgumentError", "Missing params"));

    var query  = { _id: base.objectID(req.params.id) }
      , select = {};
    itemsCollection.findOne(query, select, function(err, item) {
      if (!item)
        return res.json({});

      async.parallel({
        promotions: function(p_callback) {
          if (!item.promotions || (item.promotions && item.promotions.length == 0))
            return p_callback(null, undefined);

          var promotion_ids = [];
          item.promotions.forEach(function(promotion_id) {
            promotion_ids.push(base.objectID(promotion_id.toString()));
          });

          var query  = { _id: { $in: promotion_ids } }
            , select = { _id:1, active:1, fixed:1, start_at:1, end_at:1, discount:1 };
          promotionsCollection.find(query, select).toArray(function(err, promotions) {
            if (err)
              p_callback(err);
            else {
              var time_now  = new Date()
                , active    = false
                , promotion = undefined;
              promotions.forEach(function(promotion) {
                if (promotion.active === true) {
                  if (time_now >= promotion.start_at && time_now <= promotion.end_at)
                    active = true;
                }
                if (active === true)
                  promotion = { active: active, discount: promotion.discount, fixed: promotion.fixed };
              });
              p_callback(null, promotion);
            }
          });
        },
        item_data: function(p_callback) {
          // Make Happy Hour object
          base.happyHour(storesCollection, req.params.store_id, function(err, happy_hour) {
            item.happy_hour = (happy_hour.active == true && item.happy_hour == true) ? true : false;

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
                  return p_callback(null, item_with_stock);
                });
              } else {
                return p_callback(null, item_with_stock);
              }
            });
          });
        }
      }, function(err, result) {
        if (err)
          return res.json(err);

        var promotions = result["promotions"]
          , item = result["item_data"];

          item.promotions = promotions;
          return res.json(item);
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
