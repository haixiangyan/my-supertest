import http from 'http'
import https from 'https'
import {Request} from 'superagent'

// 包裹原函数，提供更优雅的报错堆栈
function wrapAssertFn(assertFn) {
  // 保留最后 3 行
  const savedStack = new Error().stack.split('\n').slice(3)

  return function(res) {
    const err = assertFn(res)
    if (err instanceof Error && err.stack) {
      // 去掉第 1 行
      const badStack = err.stack.replace(err.message, '').split('\n').slice(1)
      err.stack = [err.toString()]
        .concat(savedStack)
        .concat('--------')
        .concat(badStack)
        .join('\n')
    }

    return err
  }
}

function Test(app, method, path) {
  // 发送请求
  Request.call(this, method.toUpperCase(), path)

  this.app = app // app/string
  this.url = typeof app === 'string' ? app + path : this.serverAddress(app, path) // 请求路径
  this._asserts = [] // Assertion 队列
}

// 继承 Request
Object.setPrototypeOf(Test.prototype, Request.prototype)

// 通过 app 获取请求路径
Test.prototype.serverAddress = function(app, path) {
  if (!app.address()) {
    this._server = app.listen(0) // 内部 server
  }

  const port = app.address().port
  const protocol = app instanceof https.Server ? 'https' : 'http'
  return `${protocol}://127.0.0.1:${port}${path}`
}

/**
 *   .expect(200)
 *   .expect(200, fn)
 *   .expect(200, body)
 *   .expect('Some body')
 *   .expect('Some body', fn)
 *   .expect('Content-Type', 'application/json')
 *   .expect('Content-Type', 'application/json', fn)
 *   .expect(fn)
 */
Test.prototype.expect = function(a, b, c) {
  // 回调
  if (typeof a === 'function') {
    this._asserts.push(wrapAssertFn(a))
  }
  if (typeof b === 'function') this.end(b)
  if (typeof c === 'function') this.end(c)

  // 状态码
  if (typeof a === 'number') {
    this._asserts.push(wrapAssertFn(this._assertStatus.bind(this, a)))
    // body
    if (typeof b !== 'function' && arguments.length > 1) {
      this._asserts.push(wrapAssertFn(this._assertBody.bind(this, b)))
    }
    return this
  }

  // header
  if (typeof b === 'string' || typeof b === 'number' || b instanceof RegExp) {
    this._asserts.push(wrapAssertFn(this._assertHeader.bind(this, { name: '' + a, value: b })))
  }

  // body
  this._asserts.push(wrapAssertFn(this._assertBody.bind(this, a)))

  return this
}

// 判断当前状态码是否相等
Test.prototype._assertStatus = function(status, res) {
  if (status !== res.status) {
    const actualStatusContent = http.STATUS_CODES[res.status]
    const expectStatusContent = http.STATUS_CODES[status]
    return new Error(`我想要的是 ${status} "${expectStatusContent}"，但是你给了我 ${res.status} "${actualStatusContent}"`)
  }
}

// 判断当前 body 是否相等
Test.prototype._assertBody = function() {

}

// 判断当前 header 是否相等
Test.prototype._assertHeader = function() {

}

// 执行所有 Assertion
Test.prototype.assert = function(err, res, fn) {
  let errorObj = null

  for (let i = 0; i < this._asserts.length; i++) {
    errorObj = this._asserts[i](res)
  }

  fn.call(this, errorObj || null, res)
}

// 汇总所有 Assertion 结果
Test.prototype.end = function (fn) {
  const self = this
  const server = this._server
  const end = Request.prototype.end

  end.call(this, function(err, res) {
    if (server && server._handle) return server.close(localAssert)

    localAssert()

    function localAssert() {
      self.assert(err, res, fn)
    }
  })

  return this
}

export default Test
