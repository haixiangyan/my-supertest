# 造一个 supertest 轮子

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/1e2e85c107764fc7a8052eef62a7fa5a~tplv-k3u1fbpfcp-zoom-1.image)


> 文章源码：https://github.com/Haixiang6123/my-supertest
>
> 参考轮子：https://www.npmjs.com/package/supertest


[supertest](https://www.npmjs.com/package/supertest) 是一个短小精悍的接口测试工具，比如一个登录接口的测试用例如下：

```js
import request from 'supertest'

it('登录成功', () => {
  request('https://127.0.0.1:8080')
    .post('/login')
    .send({ username: 'HaiGuai', password: '123456' })
    .expect(200)
})
```

整个用例感观上非常简洁易懂。这个库挺小的，设计也不错，还是 TJ Holowaychuk 写的！今天就带大家一起实现一个 supertest 的轮子吧，做一个测试框架！

## 思路

在写代码前，先根据上面的经典例子设计好整个框架。

还是从上面的例子可以看出：发送请求，处理请求，对结果进行 expect 这三步组成了整个框架的链路，组成一个用例的生命周期。

```
request -> process -> expect(200)
```

**request** 这一步可以由第三方 http 库实现，比如 [axios](https://www.npmjs.com/package/axios)、[node-fetch](https://www.npmjs.com/package/node-fetch)、[superagent](https://www.npmjs.com/package/supertest) 都可以。

**process** 这一步就是业务代码不需要理会，最后的 **expect** 则可以用到 Node.js 自己提供的 assert 库来执行断言语句。所以，我们要把精力放在如何执行这些断言身上。

**expect** 最后一步是我们框架的整个核心，我们要做的是如何管理好所有的断言，因为开发者很有可能会像下面一样多次执行断言：

```
xxx
  .expect(1 + 1, 2)
  .expect(200)
  .expect({ result: 'success'})
  .expect((res) => console.log(res))
```

所以，我们需要一个数组 `this._asserts = []` 来存放这些断言，然后再提供一个 `end()` 函数，用来最后一次性执行完这些断言：

```
xxx
  .expect(1 + 1, 2)
  .expect(200)
  .expect({ result: 'success'})
  .expect((res) => console.log(res))
  .end() // 把上面都执行了
```

有点像事件中心，只不过这里每 `expect` 一下就相当于给 "expect" 这个事件加一个监听器，最后 `end` 则类似触发 "expect" 事件，把所有监听器都执行。

我们还注意到一点 `expect` 函数有可能是用来检查状态码 `status` 的，有的是检查返回的 `body`，还有些检查 `headers` 的，因此每次调用 `expect` 函数除了要往 `this._asserts` 推入断言回调，还要判断所推入的断言回调到底是给 `headers` 断言、还是给 `body` 断言或者给 `status` 断言的。

将上面的思路整理出来，图示如下：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/700c60d685f34e03ba1f6ff7dbbdf76f~tplv-k3u1fbpfcp-zoom-1.image)

其中我们只需要关注黄色和红色部分即可。

## 简单实现

刚刚说到“发送请求”这一步是可以由第三方库完成的，这里选用 superagent 作为发送 npm 包，因为这个库的用法也是链式调用更符合我们的期望，举个例子：

```js
superagent
  .post('/api/pet')
  .send({ name: 'Manny', species: 'cat' }) // sends a JSON post body
  .set('X-API-Key', 'foobar')
  .set('accept', 'json')
  .end((err, res) => {
    // Calling the end function will send the request
  });
```

这也太像了吧！这不禁给了我们一些灵感：基于 superagent，把上面的 `expect` 加到 superagent 里，然后改写一下 `end` 以及 restful 的 http 函数就 OK 了呀！**“基于 XX，重写方法和加自己的方法”**，想到了什么？继承呀！superagent 恰好提供了 Request 这个类，我们只要继承它再重写方法和加 `expect` 函数就好了！

一个简单 Request 子类实现如下（先不管怎么区分断言回调，只做一个简单的 `equals` 作为断言回调）：

```js
import {Request} from 'superagent'
import assert from 'assert'

function Test(url, method, path) {
  // 发送请求
  Request.call(this, method.toUpperCase(), path)

  this.url = url + path // 请求路径
  this._asserts = [] // Assertion 队列
}

// 继承 Request
Object.setPrototypeOf(Test.prototype, Request.prototype)

/**
 *   .expect(1 + 1, 2)
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
```

上面继承 Request 父类，提供了 `expect`, `equals`, `assert` 函数，并重写了 `end` 函数，这仅仅是我们自己的 `Test` 类，最好向外提供一个 `request` 函数：

```js
import methods from 'methods'
import http from 'http'
import Test from './Test'

function request(path) {
  const obj = {}

  methods.forEach(function(method) {
    obj[method] = function(url) {
      return new Test(path, method, url)
    }
  })

  obj.del = obj.delete

  return obj
}
```

**[methods](https://www.npmjs.com/package/methods) 这个 npm 包会返回所有 restful 的函数名，如 `post`, `get` 之类的。在新创建的对象里添加这些 restful 函数，并通过传入对应的 `path`, `method` 和 `url` 创建 `Test` 对象，然后间接创建一个 http 请求，以此完成 “发送请求” 这一步**。

然后可以这样使用我们的框架了：

```js
it('should be supported', function (done) {
  const app = express();
  let s;

  app.get('/', function (req, res) {
    res.send('hello');
  });

  s = app.listen(function () {
    const url = 'http://localhost:' + s.address().port;
    request(url)
      .get('/')
      .expect(1 + 1, 1)
      .end(done);
  });
});
```

## 创建一个服务器

上面 `request` 函数调用的时候会有个问题：**我们每次都要在 `app.listen` 函数里测试，那能不能在 request 的时候就传入 app，然后直接发请求测试呢？比如：**

```js
it('should fire up the app on an ephemeral port', function (done) {
  const app = express();

  app.get('/', function (req, res) {
    res.send('hey');
  });

  request(app)
    .get('/')
    .end(function (err, res) {
      expect(res.status).toEqual(200)
      expect(res.text).toEqual('hey')
      done();
    });
});
```

首先，我们在 `request` 函数里检测如果传入的是 app 函数，那么创建服务器。

```js
function request(app) {
  const obj = {}

  if (typeof app === 'function') {
    app = http.createServer(app) // 创建内部服务器
  }

  methods.forEach(function(method) {
    obj[method] = function(url) {
      return new Test(app, method, url)
    }
  })

  obj.del = obj.delete

  return obj
}
```

然后在 `Test` 类的 constructor 里也可以获取对应的 path，并监听 0 号端口：

```js
function Test(app, method, path) {
  // 发送请求
  Request.call(this, method.toUpperCase(), path)

  this.redirects(0) // 禁止重定向
  this.app = app // app/string
  this.url = typeof app === 'string' ? app + path : this.serverAddress(app, path) // 请求路径
  this._asserts = [] // Assertion 队列
}

// 通过 app 获取请求路径
Test.prototype.serverAddress = function(app, path) {
  if (!app.address()) {
    this._server = app.listen(0) // 内部 server
  }

  const port = app.address().port
  const protocol = app instanceof https.Server ? 'https' : 'http'
  return `${protocol}://127.0.0.1:${port}${path}`
}
```

最后，在 `end` 函数里把刚刚创建的服务器关闭：

```js
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
```

## 封装报错信息

*再来看看我们是如何处理断言的：断言失败会走到 catch 语句并返回一个 Error，最后返回 Error 传入 `end(fn)` 的 `fn` 回调入参。但是这会有一个问题啊，我们看错误堆栈的时候就蒙逼了：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/219088c02a5c4d7db23240c31b6db172~tplv-k3u1fbpfcp-zoom-1.image)

错误信息是符合预期的，但是错误堆栈就不太友好了：前三行会定位到我们自己的框架代码里！试想一下，如果别人用我们的库 `expect` 出错了，点了错误堆栈结果后，发现定位到了我们的源码会不会觉得蒙逼？所以，我们要对 Error 的 `err.stack` 进行改造：

```js
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

Test.prototype.expect = function(a, b) {
  this._asserts.push(wrapAssertFn(this.equals.bind(this, a, b)))

  return this
}
```

上面首先去掉当前调用栈前 3 行，也就是上面截图的前 3 行，因为这都属于源码里的报错，对开发者会有干扰，而后面的堆栈可以帮助开发者直接定位到那个凉了的 `expect` 了。当然，我们还把真实的源码出错地方作为 `badStack` 也显示出来，只是用 '------' 作为分割了，最后的错误结果如下：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/42f29125157b499692cd82cf5416e955~tplv-k3u1fbpfcp-zoom-1.image)

## 区分断言回调

现在把注意力都放在 `expect` 这个最最核心的函数上，刚刚已用 `equal` 实现最简单的断言了，现在我们要添加对 `headers`, `status` 和 `body` 的断言，对它们的断言函数的简单实现如下：

```js
import util from "util";
import assert from 'assert'

// 判断当前状态码是否相等
Test.prototype._assertStatus = function(status, res) {
  if (status !== res.status) {
    const expectStatusContent = http.STATUS_CODES[status]
    const actualStatusContent = http.STATUS_CODES[res.status]
    return new Error('expected ' + status + ' "' + expectStatusContent + '", got ' + res.status + ' "' + actualStatusContent + '"')
  }
}

// 判断当前 body 是否相等
// 判断当前 body 是否相等
Test.prototype._assertBody = function(body, res) {
  const isRegExp = body instanceof RegExp

  if (typeof body === 'object' && !isRegExp) { // 普通 body 的对比
    try {
      assert.deepStrictEqual(body, res.body)
    } catch (err) {
      const expectBody = util.inspect(body)
      const actualBody = util.inspect(res.body)
      return error('expected ' + expectBody + ' response body, got ' + actualBody, body, res.body);
    }
  } else if (body !== res.text) { // 普通文本内容的对比
    const expectBody = util.inspect(body)
    const actualBody = util.inspect(res.text)

    if (isRegExp) {
      if (!body.test(res.text)) { // body 是正则表达式的情况
        return error('expected body ' + actualBody + ' to match ' + body, body, res.body);
      }
    } else {
      return error(`expected ${expectBody} response body, got ${actualBody}`, body, res.body)
    }
  }
}

// 判断当前 header 是否相等
Test.prototype._assertHeader = function(header, res) {
  const field = header.name
  const actualValue = res.header[field.toLowerCase()]
  const expectValue = header.value

  // field 不存在
  if (typeof actualValue === 'undefined') {
    return new Error('expected "' + field + '" header field');
  }
  // 相等的情况
  if ((Array.isArray(actualValue) && actualValue.toString() === expectValue) || actualValue === expectValue) {
    return
  }
  // 检查正则的情况
  if (expectValue instanceof RegExp) {
    if (!expectValue.test(actualValue)) {
      return new Error('expected "' + field + '" matching ' + expectValue + ', got "' + actualValue + '"')
    }
  } else {
    return new Error('expected "' + field + '" of "' + expectValue + '", got "' + actualValue + '"')
  }
}

// 优化错误展示内容
function error(msg, expected, actual) {
  const err = new Error(msg)
  err.expected = expected
  err.actual = actual
  err.showDiff = true
  return err
}
```

然后在 `expect` 函数里通过参数类型的判断选择对应的 `_assertXXX` 函数：

```js
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
    return this
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
    return this
  }

  // body
  this._asserts.push(wrapAssertFn(this._assertBody.bind(this, a)))

  return this
}
```

至此，我们完成基本的断言功能了。

## 处理网络错误

有时候会抛出的错误可能并不是因为业务代码出错了，而是像网络断网这种异常情况。我们也要对这类错误进行处理，以更友好的方式展示给开发者，可以对 `assert` 函数进行改造：

```js
// 执行所有 Assertion
Test.prototype.assert = function(resError, res, fn) {
  // 通用网络错误
  const sysErrors = {
    ECONNREFUSED: 'Connection refused',
    ECONNRESET: 'Connection reset by peer',
    EPIPE: 'Broken pipe',
    ETIMEDOUT: 'Operation timed out'
  };

  let errorObj = null

  // 处理返回的错误
  if (!res && resError) {
    if (resError instanceof Error && resError.syscall === 'connect' && sysErrors[resError.code]) {
      errorObj = new Error(resError.code + ': ' + sysErrors[resError.code])
    } else {
      errorObj = resError
    }
  }

  // 执行所有 Assertion
  for (let i = 0; i < this._asserts.length && !errorObj; i++) {
    errorObj = this._assertFunction(this._asserts[i], res)
  }

  // 处理 superagent 的错误
  if (!errorObj && resError instanceof Error && (!res || resError.status !== res.status)) {
    errorObj = resError
  }

  fn.call(this, errorObj || null, res)
}
```

至此，对于 `status`, `body`, `headers` 的断言都实现了，并在 `expect` 里合理使用这三者的断言回调，同时还处理了网络异常的情况。

## Agent 代理

再来回顾一下我们是怎么使用框架来写测试用例的：

```js
it('should handle redirects', function (done) {
  const app = express();

  app.get('/login', function (req, res) {
    res.end('Login');
  });

  app.get('/', function (req, res) {
    res.redirect('/login');
  });

  request(app)
    .get('/')
    .redirects(1)
    .end(function (err, res) {
      expect(res).toBeTruthy()
      expect(res.status).toEqual(200)
      expect(res.text).toEqual('Login')
      done();
    });
});
```

可以观察到：**每次调用 `request` 函数内部都会马上创建一个服务器，调用 `end` 的时候又马上关闭，连续测试的时候消耗很大而且完全可以公用一个 server。能不能对 A 系列的用例用 A_Server，而对 B 系列的用例用 B_Server 呢？**

superagent 除了 Request 类，还提供强大的 Agent 类来解决这类的需求。参考刚刚写的 `Test` 类，照猫画虎写一个自己的 `TestAgent` 类继承原 Agent 类：

```js
import http from 'http'
import methods from 'methods'
import {agent as Agent} from 'superagent'

import Test from './Test'

function TestAgent(app, options) {
  // 普通函数调用 TestAgent(app, options)
  if (!(this instanceof TestAgent)) {
    return new TestAgent(app, options)
  }

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

// 继承 Agent
Object.setPrototypeOf(TestAgent.prototype, Agent.prototype)

// host 函数
TestAgent.prototype.host = function(host) {
  this._host = host
  return this
}

// delete
TestAgent.prototype.del = TestAgent.prototype.delete
```

当然不要忘了把 restful 的方法也重载了：

```js
// 重写 http 的 restful method
methods.forEach(function(method) {
  TestAgent.prototype[method] = function(url, fn) {
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
```

重写的时候除了返回创建的 `Test` 对象，还对 https, host, cookie 做了一些处理。其实这些处理也不是我想出来的，是 superagent 里的对它自己 Agent 类的处理，这里就照抄过来而已 :)

## 使用 Class 继承

上面都是用 prototype 来实现继承，非常的蛋疼。这里直接把代码都改写成 class 形式，同时整理 `Test` 和 `TestAgent` 两个类的代码：

```js
// Test.js
import http from 'http'
import https from 'https'
import assert from 'assert'
import {Request} from 'superagent'
import util from 'util'

// 包裹原函数，提供更优雅的报错堆栈
function wrapAssertFn(assertFn) {
  // 保留最后 3 行
  const savedStack = new Error().stack.split('\n').slice(3)

  return function (res) {
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

// 优化错误展示内容
function error(msg, expected, actual) {
  const err = new Error(msg)
  err.expected = expected
  err.actual = actual
  err.showDiff = true
  return err
}

class Test extends Request {
  // 初始化
  constructor(app, method, path) {
    super(method.toUpperCase(), path)

    this.redirects(0) // 禁止重定向
    this.app = app // app/string
    this.url = typeof app === 'string' ? app + path : this.serverAddress(app, path) // 请求路径
    this._asserts = [] // Assertion 队列
  }

  // 通过 app 获取请求路径
  serverAddress(app, path) {
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
  expect(a, b, c) {
    // 回调
    if (typeof a === 'function') {
      this._asserts.push(wrapAssertFn(a))
      return this
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
      this._asserts.push(wrapAssertFn(this._assertHeader.bind(this, {name: '' + a, value: b})))
      return this
    }

    // body
    this._asserts.push(wrapAssertFn(this._assertBody.bind(this, a)))

    return this
  }

  // 汇总所有 Assertion 结果
  end(fn) {
    const self = this
    const server = this._server
    const end = Request.prototype.end

    end.call(this, function (err, res) {
      if (server && server._handle) return server.close(localAssert)

      localAssert()

      function localAssert() {
        self.assert(err, res, fn)
      }
    })

    return this
  }

  // 执行所有 Assertion
  assert(resError, res, fn) {
    // 通用网络错误
    const sysErrors = {
      ECONNREFUSED: 'Connection refused',
      ECONNRESET: 'Connection reset by peer',
      EPIPE: 'Broken pipe',
      ETIMEDOUT: 'Operation timed out'
    }

    let errorObj = null

    // 处理返回的错误
    if (!res && resError) {
      if (resError instanceof Error && resError.syscall === 'connect' && sysErrors[resError.code]) {
        errorObj = new Error(resError.code + ': ' + sysErrors[resError.code])
      } else {
        errorObj = resError
      }
    }

    // 执行所有 Assertion
    for (let i = 0; i < this._asserts.length && !errorObj; i++) {
      errorObj = this._assertFunction(this._asserts[i], res)
    }

    // 处理 superagent 的错误
    if (!errorObj && resError instanceof Error && (!res || resError.status !== res.status)) {
      errorObj = resError
    }

    fn.call(this, errorObj || null, res)
  }

  // 判断当前状态码是否相等
  _assertStatus(status, res) {
    if (status !== res.status) {
      const expectStatusContent = http.STATUS_CODES[status]
      const actualStatusContent = http.STATUS_CODES[res.status]
      return new Error('expected ' + status + ' "' + expectStatusContent + '", got ' + res.status + ' "' + actualStatusContent + '"')
    }
  }

  // 判断当前 body 是否相等
  _assertBody(body, res) {
    const isRegExp = body instanceof RegExp

    if (typeof body === 'object' && !isRegExp) { // 普通 body 的对比
      try {
        assert.deepStrictEqual(body, res.body)
      } catch (err) {
        const expectBody = util.inspect(body)
        const actualBody = util.inspect(res.body)
        return error('expected ' + expectBody + ' response body, got ' + actualBody, body, res.body)
      }
    } else if (body !== res.text) { // 普通文本内容的对比
      const expectBody = util.inspect(body)
      const actualBody = util.inspect(res.text)

      if (isRegExp) {
        if (!body.test(res.text)) { // body 是正则表达式的情况
          return error('expected body ' + actualBody + ' to match ' + body, body, res.body)
        }
      } else {
        return error(`expected ${expectBody} response body, got ${actualBody}`, body, res.body)
      }
    }
  }

  // 判断当前 header 是否相等
  _assertHeader(header, res) {
    const field = header.name
    const actualValue = res.header[field.toLowerCase()]
    const expectValue = header.value

    // field 不存在
    if (typeof actualValue === 'undefined') {
      return new Error('expected "' + field + '" header field')
    }
    // 相等的情况
    if ((Array.isArray(actualValue) && actualValue.toString() === expectValue) || actualValue === expectValue) {
      return
    }
    // 检查正则的情况
    if (expectValue instanceof RegExp) {
      if (!expectValue.test(actualValue)) {
        return new Error('expected "' + field + '" matching ' + expectValue + ', got "' + actualValue + '"')
      }
    } else {
      return new Error('expected "' + field + '" of "' + expectValue + '", got "' + actualValue + '"')
    }
  }

  // 执行单个 Assertion
  _assertFunction(fn, res) {
    let err
    try {
      err = fn(res)
    } catch (e) {
      err = e
    }
    if (err instanceof Error) return err
  }
}

export default Test
```

还有 `TestAgent`

```js
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
```

最后再给大家看一下 `request` 函数的代码：

```js
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
```

## 总结

至此，已经完美地实现了 [supertest](https://www.npmjs.com/package/supertest) 这个库啦，来总结一下我们都干了什么：

1. 确定了 `request -> process -> expect` 的整体链路，expect 这一环是整个测试库的核心
2. 向外暴露 `expect` 函数用于收集断言语句，以及 `end` 函数用于批量执行断言回调
3. 在 `expect` 函数里根据入参要将 `_asssertStatus` 或 `_assertBody` 还是 `_assertHeaders` 推入 `_asserts` 数组里
4. `end` 函数执行 `assert` 函数来执行所有 `_asserts` 里所有的断言回调，并对网络错误也做了相应的处理
5. 对抛出的错误 stack 也做了修改，更友好地展示错误
6. 除了用 `request` 函数测试单个用例，也提供 `TestAgent` 作为 agent 测试一批的用例

## 最后

这是这期 “造轮子” 的最后一篇文章了，目前只出了 10 篇关于 “造轮子” 的文章。

虽然这系列的文章标题都是以 “造轮子” 为开头，但本质上是带大家一步一步地阅读源码。相比于市面上 “精读源码” 的文章，这一系列的文章不会一上来就看源码，而是从一个简单需求开始，先实现一个最 Low 的代码来解决问题，然后再慢慢地优化，最后进化成源码的样子。希望这样可以由浅入深地带大家看一遍源码，同时又不会有太大的心理负担 :)

为什么只写 10 篇呢？一个原因是想尝试一下别的领域了和看看书了。另一个原因是因为每周都研究源码，再从头开始推演源码的进化路程是十分消耗精力的，真的会累，怕后面会烂尾，就以现在最好的状态收尾吧。

（完结散花🎉🎉）
