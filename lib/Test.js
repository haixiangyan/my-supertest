import {Request} from 'superagent'
import assert from 'assert'

function Test(app, method, path) {
  // 发送请求
  Request.call(this, method.toUpperCase(), path)

  this.app = app // app/string
  this.url = app + path // 请求路径
  this._asserts = [] // Assertion 队列
}

// 继承 Request
Object.setPrototypeOf(Test.prototype, Request.prototype)

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
Test.prototype.expect = function(a, b) {
  this._asserts.push(this.equals.bind(this, a, b))

  return this
}

// 判断两值是否相等
Test.prototype.equals = function(a, b) {
  try {
    assert.strictEqual(a, b)
  } catch (err) {
    return new Error(`我想要${a}，但是你给了我${b}`)
  }
}

// 执行所有 Assertion
Test.prototype.assert = function(err, res, fn) {
  let errorObj = null

  for (let i = 0; i < this._asserts.length; i++) {
    errorObj = this._asserts[i](res)
  }

  fn(errorObj)
}

// 汇总所有 Assertion 结果
Test.prototype.end = function (fn) {
  const self = this
  const end = Request.prototype.end

  end.call(this, function(err, res) {
    self.assert(err, res, fn)
  })

  return this
}

export default Test
