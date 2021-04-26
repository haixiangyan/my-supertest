import http from 'http'
import methods from 'methods'
import {agent as Agent} from 'superagent'

import Test from './Test'

class TestAgent extends Agent {
  // 初始化
  constructor(app, options) {
    super()

    // 创建服务器
    if (typeof app === 'function') {
      app = http.createServer(app)
    }

    // https
    if (options) {
      this._ca = options.ca
      this._key = options.key
      this._cert = options.cert
    }

    // 使用 superagent 的代理
    Agent.call(this)
    this.app = app
  }

  // host 函数
  host(host) {
    this._host = host
    return this
  }

  // 重用 delete
  del(...args) {
    this.delete(args)
  }
}

// 重写 http 的 restful method
methods.forEach(function (method) {
  TestAgent.prototype[method] = function (url, fn) {
    // 初始化请求
    const req = new Test(this.app, method.toLowerCase(), url)

    // https
    req.ca(this._ca)
    req.key(this._key)
    req.cert(this._cert)

    // host
    if (this._host) {
      req.set('host', this._host)
    }

    // http 返回时保存 Cookie
    req.on('response', this._saveCookies.bind(this))
    // 重定向除了保存 Cookie，同时附带上 Cookie
    req.on('redirect', this._saveCookies.bind(this))
    req.on('redirect', this._attachCookies.bind(this))

    // 本次请求就带上 Cookie
    this._attachCookies(req)
    this._setDefaults(req)

    return req
  }
})

export default TestAgent
