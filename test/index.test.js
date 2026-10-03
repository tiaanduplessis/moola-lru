const moolaLru = require('../')

const request = (url = '/', headers = {}) => ({
  url,
  header: name => headers[name]
})

const response = () => ({ send: jest.fn() })

const dispatch = (cache, req = request()) => {
  const res = response()
  const next = jest.fn()
  cache(req, res, next)
  return { res, next }
}

test('exports a middleware factory', () => {
  expect(typeof moolaLru).toBe('function')
  expect(typeof moolaLru()).toBe('function')
})

test('a miss calls next once without sending', () => {
  const { res, next } = dispatch(moolaLru())
  expect(next).toHaveBeenCalledTimes(1)
  expect(res.send).not.toHaveBeenCalled()
  expect(typeof res.sendCached).toBe('function')
})

test('sendCached stores and sends the body; a hit does not call next', () => {
  const cache = moolaLru()
  const first = dispatch(cache)
  const body = { cached: true }
  first.res.sendCached(body)
  expect(first.res.send).toHaveBeenCalledWith(body)
  expect(first.res.send).toHaveBeenCalledTimes(1)

  const second = dispatch(cache)
  expect(second.next).not.toHaveBeenCalled()
  expect(second.res.send).toHaveBeenCalledWith(body)
  expect(second.res.send).toHaveBeenCalledTimes(1)
  expect(second.res.sendCached).toBe(second.res.send)
})

test('ordinary res.send does not populate the cache', () => {
  const cache = moolaLru()
  dispatch(cache).res.send('uncached')
  expect(dispatch(cache).next).toHaveBeenCalledTimes(1)
})

test('request URLs including query strings have separate keys', () => {
  const cache = moolaLru()
  dispatch(cache, request('/item?q=one')).res.sendCached('one')
  expect(dispatch(cache, request('/item?q=two')).next).toHaveBeenCalledTimes(1)
  expect(dispatch(cache, request('/other?q=one')).next).toHaveBeenCalledTimes(1)
  expect(dispatch(cache, request('/item?q=one')).res.send).toHaveBeenCalledWith(
    'one'
  )
})

test('req.url takes precedence over originalUrl and falls back when absent', () => {
  const cache = moolaLru()
  const first = request('/local')
  first.originalUrl = '/mounted/local'
  dispatch(cache, first).res.sendCached('local')
  expect(dispatch(cache, request('/local')).res.send).toHaveBeenCalledWith(
    'local'
  )
  expect(dispatch(cache, request('/mounted/local')).next).toHaveBeenCalledTimes(
    1
  )
  const fallback = request()
  delete fallback.url
  fallback.originalUrl = '/original'
  dispatch(cache, fallback).res.sendCached('original')
  expect(dispatch(cache, request('/original')).res.send).toHaveBeenCalledWith(
    'original'
  )
})

test('the existing accepts and accept-encoding header keys are isolated', () => {
  const cache = moolaLru()
  const headers = { accepts: 'application/json', 'accept-encoding': 'gzip' }
  dispatch(cache, request('/', headers)).res.sendCached('json-gzip')
  expect(
    dispatch(
      cache,
      request('/', { accepts: 'text/plain', 'accept-encoding': 'gzip' })
    ).next
  ).toHaveBeenCalledTimes(1)
  expect(
    dispatch(
      cache,
      request('/', {
        accepts: 'application/json',
        'accept-encoding': 'identity'
      })
    ).next
  ).toHaveBeenCalledTimes(1)
  expect(dispatch(cache, request('/')).next).toHaveBeenCalledTimes(1)
  expect(dispatch(cache, request('/', headers)).res.send).toHaveBeenCalledWith(
    'json-gzip'
  )
})

test('middleware instances do not share entries', () => {
  dispatch(moolaLru()).res.sendCached('private to one instance')
  expect(dispatch(moolaLru()).next).toHaveBeenCalledTimes(1)
})

test('the default cache holds 50 entries and evicts the oldest', () => {
  const cache = moolaLru()
  for (let i = 0; i < 50; i++) {
    dispatch(cache, request('/' + i)).res.sendCached('entry-' + i)
  }
  expect(dispatch(cache, request('/0')).res.send).toHaveBeenCalledWith(
    'entry-0'
  )
  dispatch(cache, request('/50')).res.sendCached('entry-50')
  expect(dispatch(cache, request('/1')).next).toHaveBeenCalledTimes(1)
  expect(dispatch(cache, request('/0')).res.send).toHaveBeenCalledWith(
    'entry-0'
  )
})

test('a numeric maximum preserves LRU recency on hits', () => {
  const cache = moolaLru(2)
  dispatch(cache, request('/a')).res.sendCached('a')
  dispatch(cache, request('/b')).res.sendCached('b')
  dispatch(cache, request('/a'))
  dispatch(cache, request('/c')).res.sendCached('c')
  expect(dispatch(cache, request('/b')).next).toHaveBeenCalledTimes(1)
  expect(dispatch(cache, request('/a')).res.send).toHaveBeenCalledWith('a')
  expect(dispatch(cache, request('/c')).res.send).toHaveBeenCalledWith('c')
})

test('object options retain max and maxAge behavior', () => {
  const originalNow = Date.now
  let now = 1000
  Date.now = () => now
  try {
    const cache = moolaLru({ max: 1, maxAge: 100 })
    dispatch(cache, request('/a')).res.sendCached('a')
    now += 20
    expect(dispatch(cache, request('/a')).res.send).toHaveBeenCalledWith('a')
    dispatch(cache, request('/b')).res.sendCached('b')
    expect(dispatch(cache, request('/a')).next).toHaveBeenCalledTimes(1)
    now += 101
    expect(dispatch(cache, request('/b')).next).toHaveBeenCalledTimes(1)
  } finally {
    Date.now = originalNow
  }
})
