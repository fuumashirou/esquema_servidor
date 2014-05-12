exports.promotion = {
  attributes: {
    start_at:   ["String", true],
    end_at:     ["String", true],
    active:     ["String", true],
    starred:    ["String", true],
    pack:       ["String", true],
    name:       ["String", true],
    price:      ["String", true],
    image:      ["String", true],
    discount:   ["String", true],
    fixed:      ["String", true]
  },
  select: { _id:1, start_at:1, end_at:1, active:1, starred:1, pack:1, name:1, price:1, image_filename:1, discount:1, fixed:1 },
  whitelist: ["_id", "start_at", "end_at", "active", "starred", "pack", "name", "price", "image_filename", "discount", "items", "fixed"]
}

