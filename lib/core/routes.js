var current = require("../handler/current")
  , older   = require("../handler/older")
  , restify = require("restify");

module.exports = exports = function(server, db) {
  // Define current routes handlers
  var currentAccountHandler = new current.account(db)
    // , currentHelperHandler  = new current.helper(db)
    , currentStoreHandler   = new current.store(db)
    , currentItemHandler    = new current.item(db)
    , currentSongHandler    = new current.song(db)
    , currentUserHandler    = new current.user(db)
    , currentPromotionHandler = new current.promotion(db);
  // Define old routes handlers
  var olderAccountHandler = new older.account(db)
    , olderStoreHandler   = new older.store(db)
    , olderItemHandler    = new older.item(db)
    , olderUserHandler    = new older.user(db);
  // Define routes
  server.use(restify.authorizationParser());
  server.use(restify.queryParser());
  server.use(restify.bodyParser({ mapParams: false }));
  server.pre(function(req, res, next) {
  // INICIO SACAR
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  // FIN SACAR
  res.header("Content-Type", "application/json; charset=utf-8");
    return next();
  });

  server.get("/", function(req, res, next) {
    res.send("Twable v1.0 - 27/12/13");
  });

  // New routes
  server.get("/1.0/cities", currentStoreHandler.cities);
  server.get("/1.0/stores", currentStoreHandler.index);
  server.get("/1.0/stores/:id", currentStoreHandler.show);
  server.get("/1.0/stores/:store_id/songs", currentSongHandler.index);
  server.get("/1.0/stores/:store_id/songs/orders", currentSongHandler.orders);
  server.get("/1.0/stores/:store_id/songs/categories", currentSongHandler.categories);
  server.get("/1.0/stores/:store_id/items", currentItemHandler.index);
  server.get("/1.0/stores/:store_id/items/:id",  currentItemHandler.show);
  server.get("/1.0/stores/:store_id/categories", currentItemHandler.categories);
  server.get("/1.0/stores/:store_id/promotions",     currentPromotionHandler.index);
  server.get("/1.0/stores/:store_id/promotions/:id", currentPromotionHandler.show);

  server.post("/1.0/checkins", currentUserHandler.authenticate, currentAccountHandler.checkin);
  server.post("/1.0/checkins/bill",   currentAccountHandler.generate_bill);
  server.get ("/1.0/checkins/orders", currentAccountHandler.list_orders);
  server.post("/1.0/checkins/orders", currentAccountHandler.new_order);
  server.post("/1.0/checkins/songs",  currentAccountHandler.song_order);
  server.get ("/1.0/checkins/users",       currentAccountHandler.list_users);
  server.post("/1.0/checkins/users/:user", currentAccountHandler.verify_user);
  server.del ("/1.0/checkins/users/:user", currentAccountHandler.remove_user);
  server.post("/1.0/checkins/users/:user/admin", currentAccountHandler.make_user_admin);
  server.del ("/1.0/checkins", currentAccountHandler.checkout);

  server.post("/1.0/users/register", currentUserHandler.register);
  server.put ("/1.0/users/verify",   currentUserHandler.verify);
  server.get ("/1.0/users/login",    currentUserHandler.authenticate);

  // server.get ("/1.0/pdf", currentHelperHandler.pdf);

  // Old routes
  server.get("/cities", olderStoreHandler.cities);
  server.get("/stores", olderStoreHandler.index);
  server.get("/stores/:id", olderStoreHandler.show);
  server.get("/stores/:store_id/items", olderItemHandler.index);
  server.get("/stores/:store_id/items/:id",  olderItemHandler.show);
  server.get("/stores/:store_id/categories", olderItemHandler.categories);

  server.post("/checkins", olderUserHandler.authenticate, olderAccountHandler.checkin);
  server.post("/checkins/bill",   olderAccountHandler.generate_bill);
  server.get ("/checkins/orders", olderAccountHandler.list_orders);
  server.post("/checkins/orders", olderAccountHandler.new_order);
  server.post("/checkins/orders_2", olderAccountHandler.new_order);
  server.get ("/checkins/users",       olderAccountHandler.users_list);
  server.post("/checkins/users/:user", olderAccountHandler.verify_user);
  server.del ("/checkins/users/:user", olderAccountHandler.remove_user);
  server.del ("/checkins", olderAccountHandler.checkout);

  server.post("/users/register", olderUserHandler.register);
  server.put ("/users/verify",   olderUserHandler.verify);
  server.get ("/users/login",    olderUserHandler.authenticate);
}
