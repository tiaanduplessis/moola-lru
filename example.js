const express = require('express')
const app = express()
const cache = require('./index')

app.use(cache())

app.get('/', (req, res) => {
  res.sendCached({test: true})
})

app.listen(5000)
