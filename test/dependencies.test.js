const childProcess = require('child_process')
const path = require('path')

const expressDirectory = path.dirname(require.resolve('express'))

// Resolve from each actual consumer, including a nested body-parser copy.
const run = (directory, script) =>
  childProcess.execFileSync(process.execPath, ['-e', script], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 5000
  })

const bodyParserDirectory = () =>
  path.dirname(
    JSON.parse(
      run(
        expressDirectory,
        'console.log(JSON.stringify(require.resolve("body-parser")))'
      )
    )
  )

test('the installed Express 4 graph retains the patched dependency floors', () => {
  const script = [
    'const assert = require("assert")',
    'function atLeast(name, floor) {',
    '  const actual = require(name + "/package.json").version.split(".").map(Number)',
    '  const wanted = floor.split(".").map(Number)',
    '  for (let i = 0; i < 3; i++) {',
    '    if (actual[i] > wanted[i]) return',
    '    assert(actual[i] >= wanted[i], name + " must be >= " + floor)',
    '  }',
    '}',
    'assert.strictEqual(require("express/package.json").version.split(".")[0], "4")',
    'atLeast("express", "4.22.3")',
    'atLeast("body-parser", "1.20.8")',
    'atLeast("qs", "6.16.0")',
    'atLeast("path-to-regexp", "0.1.13")'
  ].join('\n')
  run(expressDirectory, script)
  run(
    bodyParserDirectory(),
    'const assert = require("assert"); const v = require("qs/package.json").version.split(".").map(Number); assert(v[0] > 6 || (v[0] === 6 && v[1] >= 16), "body-parser qs must be >= 6.16.0")'
  )
})

test('both qs consumers can round-trip an untrusted constructor.isBuffer key', () => {
  // GHSA-4mjr-xmp4-gh2g: dependency regression, not a claim that this
  // middleware itself calls qs.stringify or exposes that vulnerable flow.
  const script = [
    'const assert = require("assert")',
    'const qs = require("qs")',
    'const parsed = qs.parse("x[constructor][isBuffer]=y", {plainObjects: true})',
    'assert.doesNotThrow(() => qs.stringify(parsed))',
    'assert.strictEqual(qs.stringify(parsed), "x%5Bconstructor%5D%5BisBuffer%5D=y")'
  ].join('\n')
  run(expressDirectory, script)
  run(bodyParserDirectory(), script)
})
