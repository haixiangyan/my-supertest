import methods from 'methods'
import http from 'http'
import TestAgent from './TestAgent'
import Test from './Test'

function request(app) {
  const obj = {}

  if (typeof app === 'function') {
    app = http.createServer(app)
  }

  methods.forEach(function(method) {
    obj[method] = function(url) {
      return new Test(app, method, url)
    }
  })

  obj.del = obj.delete

  return obj
}

request.agent = TestAgent

export default request
