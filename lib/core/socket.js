var RedisStore = require("socket.io/lib/stores/redis")
  , accounts   = require("../handler/current/account")
  , redis_sub  = require("redis").createClient()
  , redis_cli  = require("redis").createClient()
  , schema     = require("../schemas")
  , helper     = require("../helpers")
  , socket     = require("socket.io")
  , cookie     = require("cookie")
  , async      = require("async")
  , base       = helper.database
  , origin     = process.env.NODE_ENV === "production" ? "https://panel.twable.com" : "http://192.168.0.176:3000";

var Socket = function(app, db) {
  var io = socket.listen(app);

  // Socket configuration,
  io.configure(function() {
    io.enable("browser client minification"); // send minified client
    io.enable("browser client etag");         // apply etag caching logic based on version number
    io.enable("browser client gzip");         // gzip the file
    io.set("log level", 1);                   // reduce logging
    io.set("store", new RedisStore({
      redisPub: require("redis").createClient(),
      redisSub: require("redis").createClient(),
      redisClient: require("redis").createClient()
    }));
  });

  io.of("/orders").authorization(function(data, callback) {
    if (data.headers.cookie === undefined || (data.headers.origin !== "http://localhost:3000" && data.headers.origin !== origin))
      return callback("Unauthorized user", false);
    var user_cookie = cookie.parse(data.headers.cookie);
    var session_id  = user_cookie["_validation_token_key"];
    // Retrieve session from redis using the unique key stored in cookies
    redis_cli.hget(["accountSessionStore", session_id], function(err, session) {
      if (err || session === null) return callback("Unauthorized user", false);

      var session = JSON.parse(session);
      db.collection("accounts").findOne({ _id: base.objectID(session.account_id) }, { _id:1, _type:1, owns:1, store_id:1 }, function(err, account) {
        if (!account)
          return callback("Unauthorized user", false);

        switch(account._type) {
          case "Manager":
            data.store_id = data.query.store;
            break;
          case "Employee":
            if (account.store_id.toString() == session.store_id)
              data.store_id = session.store_id;
            break;
          default: // Admin
            data.store_id = data.query.store;
        }
        if (data.store_id == undefined)
          return callback("Unauthorized user", false);
        else
          return callback(null, true);
      });
    });
  }).on("connection", function(client) {
    client.room = client.handshake.store_id;
    client.join(client.room);
    client.emit("status", "connected");

    // Send data when connected to panel
    client.on("initialize", function() {
      // Send saved orders data on user join
      redis_cli.zrange("Store:" + client.room + ":OrderMessage", 0, -1, function(err, messages) {
        if (messages && messages.length !== 0) {
          messages.forEach(function(message) {
            orderData(message, function(order) {
              client.to(client.room).emit("new_order", order.custom, false);
            });
          });
        }
      });
      // Send saved billings data on user join
      redis_cli.zrange("Store:" + client.room + ":BillingMessage", 0, -1, function(err, messages) {
        if (messages && messages.length !== 0) {
          messages.forEach(function(message) {
            schema.Bill.find(message, function(err, bill) {
              client.to(client.room).emit("new_billing", bill, false);
            });
          });
        }
      });
      // Send tables in use
      redis_cli.smembers("i:Checkin:store_id:" + client.room, function(err, messages) {
        messages.forEach(function(message) {
          schema.Checkin.find(message, function(err, checkin) {
            var table = { id: checkin.table_id, number: checkin.table_number };
            client.to(client.room).emit("new_table", table, false);
          });
        });
      });
    });

    // Redis logic
    redis_sub.on("message", function(channel, message) {
      if (channel == "Store:" + client.room + ":Order") { // OrderRequest
        orderData(message, function(order) { // message == order_id
          client.to(client.room).emit("new_order", order.custom, true);
        });
      } else if (channel == "Store:" + client.room + ":Billing") { // BillingRequest
        schema.Bill.find(message, function(err, bill) { // message == bill_id
          client.to(client.room).emit("new_billing", bill, true);
        });
      } else if (channel == "Store:" + client.room + ":Table") { // TableRequest
        schema.Checkin.find(message, function(err, checkin) { // message == checkin_id
          var table = { id: checkin.table_id, number: checkin.table_number };
          client.to(client.room).emit("new_table", table, true);
        });
      }
    });
    // Subscribe to Redis channels
    redis_sub.subscribe("Store:" + client.room + ":Order");
    redis_sub.subscribe("Store:" + client.room + ":Billing");
    redis_sub.subscribe("Store:" + client.room + ":Table");

    // Set received: true when client receive the order
    client.on("order_received", function(data) {
      schema.Order.find(data.order_id, function(err, order) {
        order.received = true;
        order.save();
      });
    });

    // Set leave_at: new Date() when admin accept payment
    client.on("confirm_bill", function(data) {
      redis_cli.zrem("Store:" + client.room + ":BillingMessage", data.id);
      schema.Bill.find(data.id, function(err, bill) {
        // Set checkin as leave
        schema.Checkin.find(bill.checkin_id, function(err, checkin) {
          checkin.leave_at = new Date();
          checkin.save(function(s_err) {
            redis_cli.zrem("Store:" + client.room + ":BillingMessage", data.id);
            base.removeCheckinData(checkin, function(err, result) {});
          });
        });
      });
    });

    client.on("confirm_order", function(data) {
      orderData(data.id, function(order_hash) {
        order = order_hash.original;
        // Generate total price
        var items = order_hash.custom.items
          , total = 0;
        items.forEach(function(item) {
          total += item.price * item.quantity;
        });
        // Save to mongodb
        var new_order = { _id: base.objectID(order.id), store_id: base.objectID(order.store_id), table_number: order.table_number, checkin_id: base.objectID(order.checkin_id), ordered_by: order.ordered_by, ordered_at: new Date(order.ordered_at), items: items, total: total };
        db.collection("orders").insert(new_order, function(err, inserts) {
          redis_cli.zrem("Store:" + client.room + ":OrderMessage", order.id);
          order.done = true;
          order.save();
        });
      });
    });

    // On client disconnection
    client.on("disconnect", function() {
      client.leave(client.room);
      // console.log("user leave room " + socket.room);
    });
  });


  io.of("/waiters").authorization(function(data, callback) {
    if (data.headers.cookie === undefined || (data.headers.origin !== "http://localhost:3000" && data.headers.origin !== origin))
      return callback("Unauthorized user", false);
    var user_cookie = cookie.parse(data.headers.cookie);
    var session_id  = user_cookie["_validation_token_key"];
    // Retrieve session from redis using the unique key stored in cookies
    redis_cli.hget(["accountSessionStore", session_id], function(err, session) {
      if (err || session === null) return callback("Unauthorized user", false);

      var session = JSON.parse(session);
      db.collection("accounts").findOne({ _id: base.objectID(session.account_id) }, { _id:1, _type:1, owns:1, store_id:1 }, function(err, account) {
        if (!account)
          return callback("Unauthorized user", false);

        switch(account._type) {
          case "Manager":
            data.store_id = data.query.store;
            break;
          case "Employee":
            if (account.store_id.toString() == session.store_id)
              data.store_id = session.store_id;
            break;
          default: // Admin
            data.store_id = data.query.store;
        }
        if (data.store_id == undefined)
          return callback("Unauthorized user", false);
        else
          return callback(null, true);
      });
    });
  }).on("connection", function(client) {
    client.room = client.handshake.store_id;
    client.join(client.room);
    client.emit("status", "connected");

    // Send data when connected to panel
    client.on("initialize", function() {
      // Send saved orders data on user join
      redis_cli.smembers("i:Waiter:store_id:" + client.room, function(err, messages) {
        messages.forEach(function(message) {
          schema.Waiter.find(message, function(err, waiter) {
            var new_waiter = { id: waiter.id, username: waiter.username, verified: waiter.verified, checked_at: waiter.checked_at };
            client.to(client.room).emit("new_waiter", new_waiter, false);
          });
        });
      });
    });

    // Redis logic
    redis_sub.on("message", function(channel, message) {
      if (channel == "Store:" + client.room + ":Waiter") { // WaiterRequest
        schema.Waiter.find(message, function(err, waiter) { // message = username
          var new_waiter = { id: waiter.id, username: waiter.username, verified: waiter.verified, checked_at: waiter.checked_at };
          client.to(client.room).emit("new_waiter", new_waiter, true);
        });
      }
    });
    // Subscribe to Redis channels
    redis_sub.subscribe("Store:" + client.room + ":Waiter");

    // Set waiter status
    client.on("waiter_status", function(data) {
      schema.Waiter.find(data.id, function(err, waiter) {
        if (data.status == true || data.status == false) {
          waiter.verified = data.status;
          waiter.save();
        } else if (data.status == "delete") {
          waiter.destroy(function() {
            redis_cli.hdel("Store:" + client.room + ":WaiterAccount", waiter.username);
          });
        }
      });
    });

    // On client disconnection
    client.on("disconnect", function() {
      client.leave(client.room);
      // console.log("user leave room " + socket.room);
    });
  });

  io.of("/karaoke").authorization(function(data, callback) {
    if (data.headers.cookie === undefined || (data.headers.origin !== "http://localhost:3000" && data.headers.origin !== origin))
      return callback("Unauthorized user", false);
    var user_cookie = cookie.parse(data.headers.cookie);
    var session_id  = user_cookie["_validation_token_key"];
    // Retrieve session from redis using the unique key stored in cookies
    redis_cli.hget(["accountSessionStore", session_id], function(err, session) {
      if (err || session === null) return callback("Unauthorized user", false);

      var session = JSON.parse(session);
      db.collection("accounts").findOne({ _id: base.objectID(session.account_id) }, { _id:1, _type:1, owns:1, store_id:1 }, function(err, account) {
        if (!account)
          return callback("Unauthorized user", false);

        switch(account._type) {
          case "Manager":
            data.store_id = data.query.store;
            break;
          case "Employee":
            if (account.store_id.toString() == session.store_id)
              data.store_id = session.store_id;
            break;
          default: // Admin
            data.store_id = data.query.store;
        }
        if (data.store_id == undefined)
          return callback("Unauthorized user", false);
        else
          return callback(null, true);
      });
    });
  }).on("connection", function(client) {
    client.room = client.handshake.store_id;
    client.join(client.room);
    client.emit("status", "connected");

    // Send data when connected to panel
    client.on("initialize", function() {
      // Send saved orders data on user join
      redis_cli.smembers("i:Song:store_id:" + client.room, function(err, messages) {
        messages.forEach(function(message) {
          schema.Song.find(message, function(err, song) {
            var new_song = { id: song.id, table_number: song.table_number, ordered_at: song.ordered_at, artist: song.artist, title: song.title };
            client.to(client.room).emit("new_song", new_song, false);
          });
        });
      });
    });

    // Redis logic
    redis_sub.on("message", function(channel, message) {
      if (channel == "Store:" + client.room + ":Song") { // SongRequest
        schema.Song.find(message, function(err, song) { // message = id
          var new_song = { id: song.id, table_number: song.table_number, ordered_at: song.ordered_at, artist: song.artist, title: song.title };
          client.to(client.room).emit("new_song", new_song, true);
        });
      }
    });
    // Subscribe to Redis channels
    redis_sub.subscribe("Store:" + client.room + ":Song");

    // Song status
    client.on("karaoke_status", function(data) {
      schema.Song.find(data.id, function(err, song) {
        if (data.status == "delete")
          song.destroy(function() {});
      });
    });

    // On client disconnection
    client.on("disconnect", function() {
      client.leave(client.room);
    });
  });

  return io;
}

var orderData = function(order_id, cb) {
  schema.Order.find(order_id, function(err, order) {
    if (order) {
      var order_hash = { id: order.id, ordered_at: order.ordered_at, ordered_by: order.ordered_by, table_number: order.table_number, received: order.received, items: [] };
      schema.Item.all({ where: { order_id: order.id }, order: "quantity" }, function(err, items) {
        if (items.length > 0) {
          async.each(items, function(item, callback) {
            if (item.item_id != 0) {
              order_hash.items.push({ id: item.item_id, name: item.name, quantity: item.quantity, price: item.price });
            }
            callback();
          }, function(err) {
            cb({ original: order, custom: order_hash });
          });
        }
      });
    }
  });
}

module.exports = Socket;
