var redis_pub  = require("redis").createClient()
  , redis  = require("redis").createClient()
  , error  = require("../../core/errors")
  , helper = require("../../helpers")
  , schema = require("../../schemas")
  , async  = require("async")
  , funct  = helper.functions
  , base   = helper.database
  , crypto = helper.crypto
  , params = helper.params
  , data   = helper.data;

function AccountHandler(db) {
  var storesCollection = db.collection("stores")
    , itemsCollection  = db.collection("items");

  this.checkin = function(req, res, next) {
    var current_user = req.params.username;
    if (!req.body || !req.body.qr)
      return res.json(error("InvalidArgumentError", "Missing params"));

    // Token
    // New QR
    if (req.body.qr.length <= 80) {
      var qr     = req.body.qr
        , query  = { "tables.token": qr }
        , select = { "tables.$":1, schedule:1 };
    // OLD QR
    } else {
      // Try to decrypt QR Code
      try {
        var qr = JSON.parse(new Buffer(decodeURI(req.body.qr), "base64").toString("ascii"));
        if (params.notPresent(qr.store, qr.code))
          throw "error";

        var store_id   = qr.store
          , table_id   = crypto.decodeQR(qr.code, store_id);
      } catch (err) {
        return res.json(error("InvalidArgumentError", "Wrong QR"));
      }
      var query  = { _id: base.objectID(store_id), "tables._id": base.objectID(table_id) }
        , select = { "tables.$":1, schedule:1 };
      if (params.notPresent(current_user, qr))
        return res.json(error("InvalidArgumentError", "Missing params"));
    }

    var checkin_id = base.objectID()
      , auth_token = crypto.createToken(current_user, checkin_id);
    storesCollection.findOne(query, select, function(err, store) {
      if (params.notPresent(store))
        return res.json(error("ResourceNotFoundError", "No store"));
      // Check for store status
      storeStatus(store, function(err, status) {
        if (status == false)
          return res.json(error("NotAuthorizedError", "Service inactive"));

        var table    = store.tables[0]
          , store_id = store._id
          , table_id = table._id;
        // Look for existing checkins
        schema.Checkin.findOne({where: { table_id: table_id }, order: "arrive_at DESC" }, function(t_err, result_checkin) {
          if (result_checkin && result_checkin.leave_at === undefined) { // Checkin exists
            // Look if user exists
            redis.hget("Store:" + store_id + ":User",  current_user, function(err, user_auth_token) {
              if (user_auth_token) { // User exists
                schema.Account.find(user_auth_token, function(a_err, result_account) {
                  return res.json({ checkin: result_account.checkin_id, store: store_id, auth_token: result_account.id });
                });
              } else { // Create user
                var account = result_checkin.accounts.build({ id: auth_token, username: current_user });
                account.save(function(n_err) {
                  var checkin_users = result_checkin.users.split(",");
                  checkin_users.push(current_user);
                  result_checkin.users = checkin_users.join(",");
                  result_checkin.save(function(err) {
                    // Save user in users directory
                    redis.hset("Store:" + store_id + ":User", current_user, auth_token);
                    return res.json({ checkin: result_checkin.id, store: store_id, auth_token: auth_token });
                  });
                });
              }
            });
          } else { // Checkin doesnt exists
            // Generate checkin
            schema.Checkin.create({ id: checkin_id, store_id: store_id, table_number: table.number, table_id: table_id, users: current_user }, function(c_err, new_checkin) {
              // Add user account
              schema.Account.create({ id: auth_token, username: current_user, verified: true, checkin_id: checkin_id }, function(a_err, result_account) {
                // Save user in users directory
                redis.hset("Store:" + store_id + ":User", current_user, auth_token);
                // Publish table in use
                redis_pub.publish("Store:" + store_id + ":Table", checkin_id);
                return res.json({ checkin: checkin_id, store: store_id, auth_token: auth_token });
              });
            });
          }
        });
      });
    });
  }

  this.new_order = function(req, res, next) {
    var auth_token = req.query.auth_token
      , ordered_items = req.body;
    if (params.notPresent(auth_token, ordered_items))
      return res.json(error("InvalidArgumentError", "Missing params"));

    try {
      if (typeof ordered_items !== "object")
        ordered_items = JSON.parse(ordered_items);
    } catch(err) {
      return res.json(error("InvalidArgumentError", "Wrong items data"));
    }
    if (ordered_items.constructor.name !== "Array" || ordered_items.length === 0)
      return res.json(error("InvalidArgumentError", "No items to be ordered"));

    checkUser(auth_token, function(err, session_data) {
      if (err)
        return res.json(err);

      // Set default parameters
      var current_user = session_data.user.username
        , checkin  = session_data.checkin
        , store_id = checkin.store_id;
      // Get items ids and validate JSON object
      var item_ids = [];
      ordered_items.forEach(function(item) {
        if (!item["id"] || !item["quantity"])
          return res.json(error("InvalidArgumentError", "Incomplete ordered item data"));
        if (item["selections"] && item["selections"].constructor.name === "Array") {
          item["selections"].forEach(function(selection) {
            if (!selection["id"] || !selection["item_ids"] || selection["item_ids"].constructor.name !== "Array")
              return res.json(error("InvalidArgumentError", "Incomplete ordered item data"));
          });
        }
        item_ids.push(base.objectID(item["id"]));
      });
      async.waterfall([
          // Grab data from items in database
          function(callback){
            var query  = { _id: { $in: item_ids } }
              , select = {}
              , order_items = {};
            itemsCollection.find(query, select).each(function(err, item) {
              if (item === null)
                return callback(null, order_items);

              var current_item = { _id: item._id, name: item.name, price: item.price, category: item.category };
              if (item.selections) {
                current_item["selections"] = {};
                item.selections.forEach(function(selection) {
                  current_item["selections"][selection._id] = { title: selection.title, items_limit: selection.items_limit, aditional_price: selection.aditional_price, selection_items: {} };
                  selection.selection_items.forEach(function(selection_item) {
                    current_item["selections"][selection._id]["selection_items"][selection_item._id] = selection_item;
                  });
                });
              }
              order_items[item._id] = current_item;
            });
          },
          // Complete ordered items data with data from database
          function(order_items, callback) {
            var items_data = []
              , error = null;
            ordered_items.forEach(function(item) {
              var original_item = order_items[item["id"]];
              if (original_item === undefined) {
                error = "Item does not exists"
              } else {
                var items_price  = 0
                  , item_name    = original_item.category + " " + original_item.name
                  , current_item = { item_id: original_item._id, name: original_item.name, price: original_item.price, quantity: parseInt(item["quantity"]) };
                if (item["comments"])
                  current_item.comments = item["comments"];
                // Add secetions data
                if (item["selections"]) {
                  item["selections"].forEach(function(selection) {
                    var items_number = 0
                      , original_selection = original_item["selections"][selection["id"]];
                    if (original_selection === undefined) {
                      error = "Wrong order data";
                    } else {
                      selection.item_ids.forEach(function(selection_item_id) {
                        var original_selection_item = original_selection["selection_items"][selection_item_id];
                        if (original_selection_item === undefined) {
                          error = "Wrong order data";
                        } else {
                          item_name += (" + " + original_selection_item.name);
                          items_price += original_selection_item.price !== undefined ? parseFloat(original_selection_item.price) : 0;
                          items_number++;
                        }
                      });
                      var aditional_price = funct.aditionalItemPrice(original_selection.items_limit, original_selection.aditional_price, items_number);
                      if (typeof aditional_price !== "number") {
                        error = "Too many items selected";
                      } else {
                        current_item.price += aditional_price + items_price;
                      }
                    }
                  });
                }
                current_item.name = item_name;
                items_data.push(current_item);
              }
            });
            callback(error, items_data);
          }
      ], function (err, items_data) {
        if (err)
          return res.json(error("InvalidArgumentError", err));
        else {
          var order_id   = base.objectID()
            , order_time = +new Date()
            , order_data = { table_number: checkin.table_number, ordered_at: order_time, ordered_by: current_user, received: false, items: JSON.stringify(item_ids) };
          // Save to Redis
          schema.Order.create({ id: order_id, store_id: store_id, checkin_id: checkin.id, table_number: checkin.table_number, ordered_by: current_user }, function(s_err, result_order) {
            items_data.forEach(function(item) {
              var Item = schema.Item({ id: base.objectID(), item_id: item.item_id, name: item.name, price: item.price, quantity: item.quantity, order_id: order_id });
              Item.save();
            });
            schema.Account.find(auth_token, function(err, result_account) {
              result_account.last_order = order_time;
              result_account.save(function(err) {
                // Publish to Redis
                order_data["items"] = items_data;
                redis.zadd("Store:" + store_id + ":OrderMessage", parseInt(order_time), order_id);
                redis_pub.publish("Store:" + store_id + ":Order", order_id);
                // Send response
                order_data.items = order_data.items;
                return res.json(order_data);
              });
            });
          });
        }
      });
    });
  }

  this.list_orders = function(req, res, next) {
    var auth_token = req.query.auth_token
      , detail     = req.query.detail;
    if (params.notPresent(auth_token))
      return res.json(error("InvalidArgumentError", "Missing params"));

    checkUser(auth_token, function(err, session_data) {
      if (err)
        return res.json(err);
      var current_user = session_data.user.username
        , checkin      = session_data.checkin
        , orders_array = [];
      schema.Order.all({ where: { checkin_id: checkin.id }, order: "ordered_at ASC" }, function(err, orders) {
        async.each(orders, function(order, callback) {
          schema.Item.all({ where: { order_id: order.id }, order: "ordered_at ASC" }, function(err, items) {
            if (items.length !== 0) {
              items.forEach(function(item) {
                orders_array.push(item);
              });
            }
            callback();
          });
        }, function(err) {
          var result;
          if (detail === undefined) {
            var max   = 0
              , group = {};
            for (var j = orders_array.length; --j >= 0;) {
              var value = orders_array[j];
              group[value["name"]] = value["quantity"] - -(group[value["name"]] | 0);
            }

            // Generate items array
            var new_group = {};
            orders_array.forEach(function(item) {
              if (group[item["name"]]) {
                new_group[item["name"]] = { name: item["name"], quantity: group[item["name"]], price: item["price"] };
              }
            });

            // Get total price
            var items = []
              , total = 0;
            for (key in new_group) {
              items.push(new_group[key]);
              total += new_group[key]["quantity"] * new_group[key]["price"];
            }

            result = { items: items, total: total };
          } else {
            result = orders_array;
          }

          return res.json(result);
        });
      });
    });
  }

  this.generate_bill = function(req, res, next) {
    var auth_token = req.query.auth_token
      , body       = req.body;
    if (params.notPresent(auth_token, body))
      return res.json(error("InvalidArgumentError", "Missing params"));

    try {
      if (typeof body !== "object")
        body = JSON.parse(body);
      var payment_type = body.payment_type;
    } catch(err) {
      return res.json(error("InvalidArgumentError", "Invalid data"));
    }

    checkUser(auth_token, function(err, session_data) {
      if (err)
        return res.json(err);
      var current_user = session_data.user.username
        , checkin      = session_data.checkin
        , store_id     = checkin.store_id
        , items_array  = []
        , total_price  = 0;
      if (checkin.bills > 0)
        return res.json(error("NotAuthorizedError", "Payment already generated"));
      // // Find orders
      schema.Order.all({ where: { checkin_id: checkin.id }, order: "ordered_at" }, function(o_err, orders) {
        async.each(orders, function(order, callback) {
          schema.Item.all({ where: { order_id: order.id }, order: "ordered_at" }, function(i_err, items) {
            if (items.length !== 0) {
              items.forEach(function(item) {
                items_array.push({ name: item.name, quantity: item.quantity, price: item.price });
                total_price += (item.price * item.quantity);
              });
            }
            callback();
          });
        }, function(err) {
          var bill_id = base.objectID();
          schema.Bill.create({ id: bill_id, table_number: checkin.table_number, checkin_id: checkin.id, generated_by: current_user, generated_at: +new Date(), total: total_price, payment_type: payment_type, items: JSON.stringify(items_array) }, function(s_err, result_bill) {
            schema.Checkin.find(checkin.id, function(err, result_checkin) {
              if (isNaN(result_checkin.bills)) {
                result_checkin.bills = 1;
              } else {
                result_checkin.bills += 1;
              }
              result_checkin.save(function(c_err) {
                // Publish current bill
                redis.zadd("Store:" + store_id + ":BillingMessage", parseInt(+new Date()), bill_id);
                redis_pub.publish("Store:" + store_id + ":Billing", bill_id);

                return res.json(result_bill);
              });
            });
          });
        });
      });
    });
  }

  this.users_list = function(req, res, next) {
    var auth_token = req.query.auth_token;
    if (params.notPresent(auth_token))
      return res.json(error("InvalidArgumentError", "Missing params"));

    checkUser(auth_token, function(err, session_data) {
      if (err)
        return res.json(err);

      var checkin = session_data.checkin;
      schema.Account.all({ where: { checkin_id: checkin.id }, order: "checked_at DESC" }, function(err, accounts) {
        if (err)
          return res.json(err);

        // Remove id from account data
        accounts.forEach(function(account) {
          delete account.id;
        });
        return res.json(accounts);
      });

    });
  }

  this.verify_user = function(req, res, next) {
    var auth_token = req.query.auth_token
      , query_user = req.params.user;
    if (params.notPresent(auth_token, query_user))
      return res.json(error("InvalidArgumentError", "Missing params"));

    checkUser(auth_token, function(err, session_data) {
      if (err)
        return res.json(err);
      var checkin = session_data.checkin;
      redis.hget("Store:" + checkin.store_id + ":User", query_user, function(u_err, user_auth_token) {
        if (!user_auth_token)
          return res.json(error("ResourceNotFoundError", "User does not exist"));

        schema.Account.find(user_auth_token, function(a_err, account) {
          account.verified = true;
          account.save(function(err) {
            return res.json({ status: 200, message: "done" });
          });
        });
      });
    });
  }

  this.remove_user = function(req, res, next) {
    var auth_token = req.query.auth_token
      , query_user = req.params.user;
    if (params.notPresent(auth_token, query_user))
      return res.json(error("InvalidArgumentError", "Missing params"));

    checkUser(auth_token, function(err, session_data) {
      if (err)
        return res.json(err);
      var checkin = session_data.checkin
        , users   = checkin.users.split(",");
      // Check that users >= 1
      if (users.length <= 1)
        return res.json(error("NotAuthorizedError", "Not to many users"));

      redis.hget("Store:" + checkin.store_id + ":User", query_user, function(u_err, user_auth_token) {
        if (!user_auth_token)
          return res.json(error("ResourceNotFoundError", "User does not exist"));

        schema.Account.find(user_auth_token, function(a_err, account) {
          account.destroy(function(err) {
            // Delete user from directory
            redis.del("Store:" + checkin.store_id + ":User", query_user);
            return res.json({ status: 200, message: "done" });
          });
        });
      });
    });
  }

  this.checkout = function(req, res, next) {
    var auth_token = req.query.auth_token;
    if (params.notPresent(auth_token))
      return res.json(error("InvalidArgumentError", "Missing params"));

    checkUser(auth_token, function(err, session_data) {
      if (err)
        return res.json(err);

      var checkin = session_data.checkin;
      schema.Order.count({ checkin_id: checkin.id }, function(o_err, order) {
        schema.Bill.find({ where: { checkin_id: checkin.id }, order: "generated_at" }, function(b_err, bill) {
          if (order === 0 || (order > 0 && bill !== null)) {
            checkin.leave_at = +new Date();
            checkin.save(function(s_err) {
              base.removeCheckinData(db, checkin, function(err, result) {
                return res.json(err || result);
              });
            });
          } else {
            return res.json(error("NotAuthorizedError", "payment required"));
          }
        });
      });
    });
  }

  var checkUser = function(auth_token, callback) {
    schema.Account.find(auth_token, function(err, result_account) {
      if (!result_account)
        err = error("NotAuthorizedError", "User is not in the user list");
      if (result_account && result_account.verified === false)
        err = error("NotAuthorizedError", "User need to be verified");

      if (result_account && result_account.verified === true) {
        schema.Checkin.find(result_account.checkin_id, function(err, result_checkin) {
          if (!result_checkin || result_checkin["leave_at"] !== undefined) {
            err = error("NotAuthorizedError", "Checkin not valid");
            callback(err, null);
          } else {
            if (result_account.last_order && ~~((new Date() - result_account.last_order) / 1000 ) < 5) {
              err = error("NotAuthorizedError", "spam alert");
              callback(err, null);
            } else {
              var data = { checkin: result_checkin, user: result_account };
              callback(null, data);
            }
          }
        });
      } else {
        callback(err, null);
      }
    });
  }

}

var storeStatus = function(store, callback) {
  var weekday = funct.todayWeekName()
    , status  = false;

  if (store.schedule && store.schedule[weekday]) {
    var schedule = store.schedule[weekday];
    if (schedule.active == true) {
      if (schedule.all_day == true) {
        status = true;
      } else {
        try {
          // Server time
          var start = funct.midnight_to_time(schedule.start_time)
            , end   = funct.midnight_to_time(schedule.end_time)
            , now   = new Date();
        } catch(e) {
          callback("Wrong time format", null);
        }
        if (start <= now && now <= end) {
          status = true;
        }
      }
    }
  }
  callback(null, status);
}

module.exports = AccountHandler;
