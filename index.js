'use strict'

const Lru = require('lru')

const moolaLru = (opts = 50) => {
  const cache = new Lru(opts)

  const handle = (req, res, next) => {
    const key = `${req.url || req.originalUrl}.${req.header(
      'accepts'
    )}.${req.header('accept-encoding')}`

    const value = cache.get(key)

    res.sendCached = res.send

    if (value) {
      res.send(value)
      return
    }

    res.sendCached = body => {
      cache.set(key, body)
      res.send(body)
    }

    next()
  }

  return handle
}

module.exports = moolaLru
