var error  = require("../../core/errors")
  , helper = require("../../helpers")
  , async  = require("async")
  , base   = helper.database
  , params = helper.params;

function PromotionHandler(db) {
  var promotionsCollection = db.collection("promotions");

  this.index = function(req, res, next) {
    var store_id = req.params.store_id;
    if (params.notPresent(store_id))
      return res.json(error("InvalidArgumentError", "Missing params"));

    var query  = { store_id: base.objectID(store_id) }
      , select = helper.parseSelect("promotions", req.query.select);
    promotionsCollection.find(query, select).toArray(function(err, promotions) {

      return res.json(promotions);
    });
  }

  this.show = function(req, res, next) {
    var store_id     = req.params.store_id
      , promotion_id = req.params.id;
    if (params.notPresent(store_id))
      return res.json(error("InvalidArgumentError", "Missing params"));

    var query  = { _id: base.objectID(promotion_id) }
      , select = {};
    promotionsCollection.findOne(query, select, function(err, promotion) {
      if (!promotion)
        return res.json({});

      return res.json(promotion);
    });
  }

}

module.exports = PromotionHandler;
