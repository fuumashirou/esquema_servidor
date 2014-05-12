var redis_pub = require("redis").createClient()
  , redis  = require("redis").createClient()
  , error  = require("../../core/errors")
  , helper = require("../../helpers")
  , schema = require("../../schemas")
  , __     = require("underscore")
  , async  = require("async")
  , funct  = helper.functions
  , base   = helper.database
  , crypto = helper.crypto
  , params = helper.params
  , data   = helper.data;

function AccountHandler(db) {
  var storesCollection = db.collection("stores")
    , itemsCollection  = db.collection("items")
    , songsCollection  = db.collection("songs");

  this.checkin = function(req, res, next) {
    var current_user = req.params.username;
    if (!current_user || !req.body)
      return res.json(error("InvalidArgumentError", "Missing params"));

    if (req.body.qr && req.body.qr.length >= 20) { // Waiter checkin
      var query  = { waiter_token: req.body.qr }
        , select = { _id:1, "tables.number":1 };
      storesCollection.findOne(query, select, function(err, store) {
        if (err || !store)
          return res.json(error("ResourceNotFoundError", "No store"));

        var store_id = store._id
          , auth_token = crypto.createToken(current_user, store_id);
        // Generate waiter
        schema.Waiter.create({ id: auth_token, username: current_user, store_id: store_id }, function(err, new_waiter) {
          // Save waiter in waiters directory
          redis.hset("Store:" + store_id + ":WaiterAccount", current_user, auth_token);
          // Publish waiter
          redis_pub.publish("Store:" + store_id + ":Waiter", auth_token);
          return res.json({ auth_token: auth_token, store_id: store_id, tables: store.tables, type: "waiter" });
        });
      });
    } else { // Normal checkin
      var lat    = req.query.lat
        , lon    = req.query.lon
        , geo    = req.query.geo
        , flagMesero = false;

      async.parallel({
        query: function(callback) {
          if (req.body.auth_token) {
            schema.Waiter.find(req.body.auth_token, function(w_err, waiter) {
              if (w_err || !waiter) {
                var error = error("ResourceNotFoundError", "Waiter does not exists");
                callback(error);
              } else {
                flagMesero = true;
                var query = { _id: base.objectID(waiter.store_id), "tables.number": parseInt(req.body.number) };
                callback(null, query);
              }
            });
          } else {
            var query = { "tables.token": req.body.qr };
            callback(null, query);
          }
        }
      },
      function(err, results) {
        if (err)
          return res.json(err)
        var query = results["query"]
          , select = { "tables.$":1, schedule:1 };

        // if (geo !== "false") {
        //   if (!lat || !lon)
        //     return res.json(error("InvalidArgumentError", "Missing params"));

        //   query["loc"] = { $near: [ lon, lat ], $maxDistance : 20 };
        // }

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
                      return res.json({ checkin: result_account.checkin_id, store: store_id, auth_token: result_account.id, admin: result_account.admin, type: "user" });
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
                        var respuesta = { checkin: result_checkin.id, store: store_id, auth_token: auth_token, admin: false, type: "user" };
                        if(flagMesero===true){

                          respuesta.admin = true;
                          //respuesta["varnueva"]= "asdasd";
                        }

                        return res.json(respuesta);

                      });
                    });
                  }
                });
              } else { // Checkin doesnt exists
                // Generate checkin
                schema.Checkin.create({ id: checkin_id, store_id: store_id, table_number: table.number, table_id: table_id, users: current_user }, function(c_err, new_checkin) {
                  // Add user account
                  schema.Account.create({ id: auth_token, username: current_user, checkin_id: checkin_id, verified: true, admin: true }, function(a_err, result_account) {
                    // Save user in users directory
                    redis.hset("Store:" + store_id + ":User", current_user, auth_token);
                    // Publish table in use
                    redis_pub.publish("Store:" + store_id + ":Table", checkin_id);
                    return res.json({ checkin: checkin_id, store: store_id, auth_token: auth_token, admin: true, type: "user" });
                  });
                });
              }
            });
          });
        });
      });
    }
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
    if (ordered_items.constructor.name !== "Object")
      return res.json(error("InvalidArgumentError", "No items to be ordered"));

    checkUser(auth_token, function(err, session_data) {
      if (err)
        return res.json(err);
      // Set default parameters
      var user     = session_data.user
        , checkin  = session_data.checkin
        , store_id = checkin.store_id
        , current_user = user.username;
      if (user.last_order && ~~((new Date() - user.last_order) / 1000 ) <= 5)
        return res.json(error("NotAuthorizedError", "SPAM Alert"));

      // // Manage promotions
      // if (ordered_items["promotions"]) {
      //   ordered_items["promotions"].forEach(function(promotion) {
      //     if (!promotion["id"] || !promotion["items"])
      //       return callback(error("InvalidArgumentError", "Incomplete ordered item data"));
      //     promotion["items"].forEach(function(item) {
      //       item["promotion"]    = base.objectID();
      //       item["promotion_id"] = promotion["id"];
      //       ordered_items["items"].push(item);
      //     });
      //   });
      // }

      async.parallel({
        happy_hour: function(callback) {
          base.happyHour(storesCollection, store_id, function(err, happy_hour) {
            if (err)
              callback(err);
            else
              callback(null, happy_hour);
          });
        },
        item_ids: function(callback) {
          // Get items ids and validate JSON object
          var item_ids = [];
          ordered_items["items"].forEach(function(item) {
            if (!item["id"] || !item["quantity"])
              return callback(error("InvalidArgumentError", "Incomplete ordered item data"));
            if (item["selections"] && item["selections"].constructor.name === "Array") {
              item["selections"].forEach(function(selection) {
                if (!selection["id"] || !selection["item_ids"] || selection["item_ids"].constructor.name !== "Array")
                  return callback(error("InvalidArgumentError", "Incomplete ordered item data"));
              });
            }
            item_ids.push(base.objectID(item["id"]));
          });
          callback(null, item_ids);
        }
      }, function(err, results) {
        if (err)
          return res.json(err);

        var item_ids   = results.item_ids
          , happy_hour = results.happy_hour;
        async.waterfall([
            // Grab data from items in database
            function(callback) {
              var query  = { _id: { $in: item_ids } }
                , select = {}
                , order_items = {};
              itemsCollection.find(query, select).each(function(err, item) {
                if (item === null)
                  return callback(null, order_items);

                var current_item = { _id: item._id, name: item.name, price: item.price, hh_price: item.hh_price, category: item.category, happy_hour: item.happy_hour };
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
              ordered_items["items"].forEach(function(item) {
                var original_item = order_items[item["id"]];
                if (original_item === undefined) {
                  error = "Item does not exists"
                } else {
                  var items_price  = 0
                    , item_name    = original_item.category + " " + original_item.name
                    , current_item = { item_id: original_item._id, name: original_item.name, price: original_item.price, happy_hour: original_item.happy_hour, quantity: parseInt(item["quantity"]) };
                  if (item["comments"])
                    current_item.comments = item["comments"];
                  if (happy_hour.active === true && original_item.happy_hour === true) {
                    current_item["happy_hour"] = true;
                    current_item["hh_price"]   = original_item.hh_price;
                  }
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
              callback(error, items_data, happy_hour);
            }
        ], function (err, items_data, happy_hour) {
          if (err)
            return res.json(error("InvalidArgumentError", err));
          else {
            // Manage Happy hour
            if (happy_hour.active === true) {
              var hh_quantity = happy_hour.quantity
                , hh_personal = happy_hour.personal
                , hh_free_selection = happy_hour.free_selection
                , items = items_data;

              // 2x
              if (hh_quantity > 1) {
                var total_items = []
                  , groups = {};
                // Expand items (by quantity)
                items.forEach(function(item) {
                  for (var i = 1; i <= item.quantity; i++) {
                    if (item.happy_hour === true)
                      total_items.push({ name: item.name, price: item.price, hh_price: item.hh_price });
                  }
                });
                total_items = __.sortBy(total_items, "hh_price").reverse();
                // Group
                var total_groups = Math.floor(total_items.length/hh_quantity);
                if (total_groups > 0) {

                  var number = 0;
                  for (var i = 1; i <= total_groups; i++) {
                    groups[number] = { items: [], price: 0, hh_price: 0 };
                    number++;
                  }

                  var total_price = 0;
                  for (var key in groups) {
                    total_items.forEach(function(item) {
                      total_price += parseFloat(item.price);
                      if (groups[key]["items"].length < 2) {
                        groups[key]["items"].push(item);
                        if (groups[key]["items"].length == hh_quantity) {
                          groups[key]["hh_price"] = item.hh_price;
                          groups[key]["price"]    = item.price;
                        }
                      // Remove processed items
                      var index = total_items.indexOf(item);
                      total_items.splice(index, 1);
                      }
                    });
                  }
                  // Calc discount
                  var total_discount = 0;
                  for (var key in groups) {
                    total_discount += parseFloat(groups[key].hh_price);
                  }
                }
              } else {
                // Discount
                var total_discount = 0
                  , total_price    = 0;
                items.forEach(function(item) {
                  if (item.happy_hour === true) {
                    for (var i = 1; i <= item.quantity; i++) {
                      total_price    += parseFloat(item.price);
                      total_discount += parseFloat(item.hh_price);
                    }
                  }
                });
              }
            }

            var order_id   = base.objectID()
              , order_time = +new Date()
              , order_data = { table_number: checkin.table_number, ordered_at: order_time, ordered_by: current_user, received: false, items: JSON.stringify(item_ids) };
            // Save to Redis
            // Happy hour
            if (total_discount) {
              var hh_item = { id: base.objectID(), item_id: 0, name: "Happy hour", price: - (total_price - total_discount), quantity: 1, order_id: order_id };
              var Item = schema.Item(hh_item);
              Item.save();
            }
            // Orders
            schema.Order.create({ id: order_id, store_id: store_id, checkin_id: checkin.id, table_number: checkin.table_number, ordered_by: current_user }, function(s_err, result_order) {
              items_data.forEach(function(item) {
                var item_hash = { id: base.objectID(), item_id: item.item_id, name: item.name, price: item.price, quantity: item.quantity, happy_hour: item.happy_hour, order_id: order_id };
                if (item.hh_price)
                  item_hash["hh_price"] = item.hh_price;
                var Item = schema.Item(item_hash);
                Item.save();
              });
              schema.Account.find(auth_token, function(err, result_account) {
                result_account.last_order = order_time;
                result_account.save(function(err) {
                  // Publish to Redis
                  items_data.push(hh_item);
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

  this.list_users = function(req, res, next) {
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
      var checkin      = session_data.checkin
        , current_user = session_data.user;
      if (current_user.admin !== true)
        return res.json(error("NotAuthorizedError", "User is not admin"));

      redis.hget("Store:" + checkin.store_id + ":User", query_user, function(u_err, user_auth_token) {
        if (!user_auth_token)
          return res.json(error("ResourceNotFoundError", "User does not exist"));

        schema.Account.find(user_auth_token, function(a_err, account) {
          if (account.verified === true) {
            return res.json({ status: 200, message: "Already verified" });
          } else {
            account.verified = true;
            account.save(function(err) {
              return res.json({ status: 200, message: "done" });
            });
          }
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
        , users   = checkin.users.split(",")
        , current_user = session_data.user;
      if (current_user.admin !== true)
        return res.json(error("NotAuthorizedError", "User is not admin"));

      redis.hget("Store:" + checkin.store_id + ":User", query_user, function(u_err, user_auth_token) {
        if (!user_auth_token)
          return res.json(error("ResourceNotFoundError", "User does not exist"));

        schema.Account.find(user_auth_token, function(a_err, account) {
          if (account.admin === true)
            return res.json(error("NotAuthorizedError", "Can not remove admin user"));
          else {
            account.destroy(function(err) {
              // Delete user from directory
              redis.del("Store:" + checkin.store_id + ":User", query_user);
              return res.json({ status: 200, message: "done" });
            });
          }
        });
      });
    });
  }

  this.make_user_admin = function(req, res, next) {
    var auth_token = req.query.auth_token
      , query_user = req.params.user;
    if (params.notPresent(auth_token, query_user))
      return res.json(error("InvalidArgumentError", "Missing params"));

    checkUser(auth_token, function(err, session_data) {
      if (err)
        return res.json(err);
      var checkin      = session_data.checkin
        , current_user = session_data.user;
      if (current_user.admin !== true)
        return res.json(error("NotAuthorizedError", "User is not admin"));

      async.parallel({
        current_admin: function(callback) {
          current_user.admin = false;
          current_user.save(function(err) {
            return callback(null, true);
          });
        },
        new_admin: function(callback) {
          redis.hget("Store:" + checkin.store_id + ":User", query_user, function(u_err, user_auth_token) {
            if (!user_auth_token)
              return callback(true);

            schema.Account.find(user_auth_token, function(a_err, account) {
              account.admin = true;
              account.save(function(err) {
                return callback(null, true);
              });
            });
          });
        }
      }, function(err, result) {
        if (result.current_admin === true && result.new_admin === true)
          return res.json({ status: 200, message: "done" });
        else
          return res.json(error("ResourceNotFoundError", "User does not exist"));
      });
    });
  }

  this.checkout = function(req, res, next) {
    var auth_token = req.query.auth_token;
    if (params.notPresent(auth_token))
      return res.json(error("InvalidArgumentError", "Missing params"));

    schema.Account.find(auth_token, function(err, account) {
      if (!account)
        return res.json(error("NotAuthorizedError", "User is not in the user list"));

      schema.Checkin.find(account.checkin_id, function(err, checkin) {
        if (!checkin || checkin["leave_at"] !== undefined)
          return res.json(error("NotAuthorizedError", "Checkin not valid"));

        if (account.admin === false) {
          base.removeUser(checkin.store_id, account, function(err, result) {
            return res.json(err || result);
          });
        } else {
          schema.Order.count({ checkin_id: checkin.id }, function(o_err, order) {
            schema.Bill.find({ where: { checkin_id: checkin.id }, order: "generated_at" }, function(b_err, bill) {
              if (order === 0 || (order > 0 && bill !== null)) {
                checkin.leave_at = +new Date();
                checkin.save(function(s_err) {
                  base.removeCheckinData(checkin, function(err, result) {
                    return res.json(err || result);
                  });
                });
              } else {
                return res.json(error("NotAuthorizedError", "Payment required"));
              }
            });
          });
        }
      });
    });
  }

  this.song_order = function(req, res, next) {
    var auth_token   = req.query.auth_token
    if (params.notPresent(auth_token, req.body, req.body.song))
      return res.json(error("InvalidArgumentError", "Missing params"));

    checkUser(auth_token, function(err, session_data) {
      if (err)
        return res.json(err);
      // Set default parameters
      var user     = session_data.user
        , checkin  = session_data.checkin
        , store_id = checkin.store_id
        , current_user      = user.username
        , requested_song_id = req.body.song;
      if (user.last_order && ~~((new Date() - user.last_order) / 1000 ) <= 5)
        return res.json(error("NotAuthorizedError", "SPAM Alert"));

      var query  = { _id: base.objectID(requested_song_id) }
        , select = {};
      songsCollection.findOne(query, select, function(err, song) {
        if (err || !song)
          return res.json(error("ResourceNotFoundError", "Song does not exist"));

        var song_id  = base.objectID()
          , new_song = { id: song_id, song_id: song._id, artist: song.artist, title: song.title, table_number: checkin.table_number, store_id: store_id };
        schema.Song.create(new_song, function(s_err, result_song) {
          redis_pub.publish("Store:" + store_id + ":Song", song_id);

          schema.Song.count({ store_id: store_id }, function(o_err, request_number) {
            new_song.position = request_number;
            return res.json(new_song);
          });
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
            var data = { checkin: result_checkin, user: result_account };
            callback(null, data);
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
