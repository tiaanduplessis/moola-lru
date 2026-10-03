const http = require('http')
const express = require('express')
const moolaLru = require('../')

let server
let routeCalls

beforeEach(done => {
  routeCalls = 0
  const app = express()
  app.use(moolaLru())
  app.get('/text', (req, res) => {
    routeCalls++
    res.sendCached('cached text ' + routeCalls)
  })
  app.get('/uncached', (req, res) => {
    routeCalls++
    res.send('uncached ' + routeCalls)
  })
  app.get('/json', (req, res) => {
    routeCalls++
    res.sendCached({ url: req.url, call: routeCalls })
  })
  server = app.listen(0, '127.0.0.1', done)
})

afterEach(done => server.close(done))

const get = (path, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: server.address().port,
        path,
        headers,
        agent: false
      },
      res => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          body += chunk
        })
        res.on('error', reject)
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body })
        )
      }
    )
    req.setTimeout(2000, () =>
      req.destroy(new Error('Loopback request timed out'))
    )
    req.on('error', reject)
  })

test('real Express serves the same JSON on a hit without re-entering the route', () => {
  let first
  return get('/json')
    .then(result => {
      first = result
      expect(result.status).toBe(200)
      expect(result.headers['content-type']).toMatch(/^application\/json/)
      expect(JSON.parse(result.body)).toEqual({ url: '/json', call: 1 })
      return get('/json')
    })
    .then(second => {
      expect(second.body).toBe(first.body)
      expect(second.headers['content-type']).toBe(first.headers['content-type'])
      expect(routeCalls).toBe(1)
    })
})

test('real Express serves the same text body on cache hits', () => {
  return get('/text')
    .then(first => {
      expect(first.body).toBe('cached text 1')
      return get('/text')
    })
    .then(second => {
      expect(second.body).toBe('cached text 1')
      expect(routeCalls).toBe(1)
    })
})

test('real Express does not cache ordinary sends', () => {
  return get('/uncached')
    .then(first => {
      expect(first.body).toBe('uncached 1')
      return get('/uncached')
    })
    .then(second => {
      expect(second.body).toBe('uncached 2')
      expect(routeCalls).toBe(2)
    })
})

test('real Express separates URLs and both existing header dimensions', () => {
  const variants = [
    [
      '/json?item=one',
      { accepts: 'application/json', 'accept-encoding': 'gzip' }
    ],
    [
      '/json?item=two',
      { accepts: 'application/json', 'accept-encoding': 'gzip' }
    ],
    ['/json?item=one', { accepts: 'text/plain', 'accept-encoding': 'gzip' }],
    [
      '/json?item=one',
      { accepts: 'application/json', 'accept-encoding': 'identity' }
    ]
  ]
  const results = []
  return variants
    .reduce(
      (chain, variant) =>
        chain.then(() => get(variant[0], variant[1])).then(result => {
          results.push(result.body)
          expect(result.status).toBe(200)
          expect(JSON.parse(result.body).call).toBe(results.length)
        }),
      Promise.resolve()
    )
    .then(() =>
      variants.reduce(
        (chain, variant, index) =>
          chain.then(() => get(variant[0], variant[1])).then(result => {
            expect(result.body).toBe(results[index])
          }),
        Promise.resolve()
      )
    )
    .then(() => {
      expect(routeCalls).toBe(variants.length)
    })
})
