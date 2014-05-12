var redis  = require("redis").createClient()
  , schema = require("../../schemas")
  , helper = require("../../helpers")
  , __     = require("underscore")
  , async  = require("async")
  , base   = helper.database
  , params = helper.params;

function SongHandler(db) {
  var storesCollection = db.collection("stores")
    , songsCollection  = db.collection("songs");

  this.index = function(req, res, next) {
    var store_id = req.params.store_id;
    if (params.notPresent(store_id))
      return res.json(error("InvalidArgumentError", "Missing params"));

    var query  = { store_id: base.objectID(store_id) }
      , select = {};
    if (!params.notPresent(req.query.category)) {
      query["category"] = req.query.category;
    }

    songsCollection.find(query, select).toArray(function(err, songs) {

      return res.json(songs);
    });
  }

  this.orders = function(req, res, next) {
    var store_id = req.params.store_id;
    if (params.notPresent(store_id))
      return res.json(error("InvalidArgumentError", "Missing params"));

    redis.smembers("i:Song:store_id:" + store_id, function(err, song_ids) {
      var songs = [];
      async.each(song_ids, function(song_id, callback) {
        schema.Song.find(song_id, function(err, song) {
          var new_song = { id: song.song_id, table_number: song.table_number, ordered_at: song.ordered_at, artist: song.artist, title: song.title };
          songs.push(new_song);
          callback();
        });
      }, function(err) {
        if (err) {
          return res.json(error("InternalError", "Database error"));
        } else {
          songs = __.sortBy(songs, "ordered_at");
          return res.json(songs);
        }
      });
    });
  }

  this.categories = function(req, res, next) {
    var store_id = req.params.store_id
      , query    = { store_id: base.objectID(store_id) };
    songsCollection.distinct("category", query, function(err, results) {
      if (err)
        return res.json(error("InternalError", "Database error"));

      return res.json(results || []);
    });
  }

}

module.exports = SongHandler;
