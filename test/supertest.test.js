import express from 'express'
import request from "../lib";
import * as path from 'path'
import * as https from 'https'
import * as fs from 'fs'
import * as bodyParser from 'body-parser'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function shouldIncludeStackWithThisFile(err) {
  expect(err.stack).toMatch(/test\/supertest.test.js:/)
  expect(err.stack.startsWith(err.name + ':')).toBeTruthy()
}

describe('request(url)', function () {
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
        .expect('hello', done);
    });
  });

  describe('.end(cb)', function () {
    it('should set `this` to the test object when calling cb', function (done) {
      const app = express();
      let s;

      app.get('/', function (req, res) {
        res.send('hello');
      });

      s = app.listen(function () {
        const url = 'http://localhost:' + s.address().port;
        const test = request(url).get('/');
        test.end(function (err, res) {
          expect(this).toEqual(test)
          done();
        });
      });
    });
  });
});

describe('request(app)', function () {
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

  it('should work with an active server', function (done) {
    const app = express();
    let server;

    app.get('/', function (req, res) {
      res.send('hey');
    });

    server = app.listen(4000, function () {
      request(server)
        .get('/')
        .end(function (err, res) {
          expect(res.status).toEqual(200)
          expect(res.text).toEqual('hey')
          done();
        });
    });
  });

  it('should work with remote server', function (done) {
    const app = express();

    app.get('/', function (req, res) {
      res.send('hey');
    });

    app.listen(4001, function () {
      request('http://localhost:4001')
        .get('/')
        .end(function (err, res) {
          expect(res.status).toEqual(200)
          expect(res.text).toEqual('hey')
          done();
        });
    });
  });

  it('should work with a https server', function (done) {
    const app = express();
    const fixtures = path.join(__dirname, 'fixtures');
    const server = https.createServer({
      key: fs.readFileSync(path.join(fixtures, 'test_key.pem')),
      cert: fs.readFileSync(path.join(fixtures, 'test_cert.pem'))
    }, app);

    app.get('/', function (req, res) {
      res.send('hey');
    });

    request(server)
      .get('/')
      .end(function (err, res) {
        if (err) return done(err);
        expect(res.status).toEqual(200)
        expect(res.text).toEqual('hey')
        done();
      });
  });

  it('should work with .send() etc', function (done) {
    const app = express();

    app.use(bodyParser.json());

    app.post('/', function (req, res) {
      res.send(req.body.name);
    });

    request(app)
      .post('/')
      .send({ name: 'john' })
      .expect('john', done);
  });

  it('should work when unbuffered', function (done) {
    const app = express();

    app.get('/', function (req, res) {
      res.end('Hello');
    });

    request(app)
      .get('/')
      .expect('Hello', done);
  });

  it('should default redirects to 0', function (done) {
    const app = express();

    app.get('/', function (req, res) {
      res.redirect('/login');
    });

    request(app)
      .get('/')
      .expect(302, done);
  });

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

  it('should handle socket errors', function (done) {
    const app = express();

    app.get('/', function (req, res) {
      res.destroy();
    });

    request(app)
      .get('/')
      .end(function (err) {
        expect(err).toBeTruthy()
        done();
      });
  });

  describe('.end(fn)', function () {
    it('should close server', function (done) {
      const app = express();
      let test;

      app.get('/', function (req, res) {
        res.send('supertest FTW!');
      });

      test = request(app)
        .get('/')
        .end(function () {
        });

      test._server.on('close', function () {
        done();
      });
    });

    it('should wait for server to close before invoking fn', function (done) {
      const app = express();
      let closed = false;
      let test;

      app.get('/', function (req, res) {
        res.send('supertest FTW!');
      });

      test = request(app)
        .get('/')
        .end(function () {
          expect(closed).toBeTruthy()
          done();
        });

      test._server.on('close', function () {
        closed = true;
      });
    });

    it('should support nested requests', function (done) {
      const app = express();
      const test = request(app);

      app.get('/', function (req, res) {
        res.send('supertest FTW!');
      });

      test
        .get('/')
        .end(function () {
          test
            .get('/')
            .end(function (err, res) {
              expect(err === null).toBeTruthy()
              expect(res.status).toEqual(200)
              expect(res.text).toEqual('supertest FTW!')
              done();
            });
        });
    });

    it('should include the response in the error callback', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send('whatever');
      });

      request(app)
        .get('/')
        .expect(function () {
          throw new Error('Some error');
        })
        .end(function (err, res) {
          expect(err).toBeTruthy()
          expect(res).toBeTruthy()
          // Duck-typing response, just in case.
          expect(res.status).toEqual(200)
          done();
        });
    });

    it('should set `this` to the test object when calling the error callback', function (done) {
      const app = express();
      let test;

      app.get('/', function (req, res) {
        res.send('whatever');
      });

      test = request(app).get('/');
      test.expect(function () {
        throw new Error('Some error');
      }).end(function (err, res) {
        expect(err).toBeTruthy()
        expect(this).toEqual(test)
        done();
      });
    });

    it('should handle an undefined Response', function (done) {
      const app = express();
      let server;

      app.get('/', function (req, res) {
        setTimeout(function () {
          res.end();
        }, 20);
      });

      server = app.listen(function () {
        const url = 'http://localhost:' + server.address().port;
        request(url)
          .get('/')
          .timeout(1)
          .expect(200, function (err) {
            expect(err instanceof Error).toBeTruthy()
            return done();
          });
      });
    });

    it('should handle error returned when server goes down', function (done) {
      const app = express();
      let server;

      app.get('/', function (req, res) {
        res.end();
      });

      server = app.listen(function () {
        const url = 'http://localhost:' + server.address().port;
        server.close();
        request(url)
          .get('/')
          .expect(200, function (err) {
            expect(err instanceof Error).toBeTruthy()
            return done();
          });
      });
    });
  });

  describe('.expect(status[, fn])', function () {
    it('should assert the response status', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send('hey');
      });

      request(app)
        .get('/')
        .expect(404)
        .end(function (err, res) {
          expect(err.message).toEqual('expected 404 "Not Found", got 200 "OK"')
          shouldIncludeStackWithThisFile(err);
          done();
        });
    });
  });

  describe('.expect(status)', function () {
    it('should handle connection error', function (done) {
      const req = request.agent('http://localhost:1234');

      req
        .get('/')
        .expect(200)
        .end(function (err, res) {
          expect(err.message).toEqual('ECONNREFUSED: Connection refused')
          done();
        });
    });
  });

  describe('.expect(status)', function () {
    it('should assert only status', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send('hey');
      });

      request(app)
        .get('/')
        .expect(200)
        .end(done);
    });
  });

  describe('.expect(status, body[, fn])', function () {
    it('should assert the response body and status', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send('foo');
      });

      request(app)
        .get('/')
        .expect(200, 'foo', done);
    });

    describe('when the body argument is an empty string', function () {
      it('should not quietly pass on failure', function (done) {
        const app = express();

        app.get('/', function (req, res) {
          res.send('foo');
        });

        request(app)
          .get('/')
          .expect(200, '')
          .end(function (err, res) {
            expect(err.message).toEqual('expected \'\' response body, got \'foo\'')
            shouldIncludeStackWithThisFile(err);
            done();
          });
      });
    });
  });

  describe('.expect(body[, fn])', function () {
    it('should assert the response body', function (done) {
      const app = express();

      app.set('json spaces', 0);

      app.get('/', function (req, res) {
        res.send({ foo: 'bar' });
      });

      request(app)
        .get('/')
        .expect('hey')
        .end(function (err, res) {
          expect(err.message).toEqual('expected \'hey\' response body, got \'{"foo":"bar"}\'')
          shouldIncludeStackWithThisFile(err);
          done();
        });
    });

    it('should assert the status before the body', function (done) {
      const app = express();

      app.set('json spaces', 0);

      app.get('/', function (req, res) {
        res.status(500).send({ message: 'something went wrong' });
      });

      request(app)
        .get('/')
        .expect(200)
        .expect('hey')
        .end(function (err, res) {
          expect(err.message).toEqual('expected 200 "OK", got 500 "Internal Server Error"')
          shouldIncludeStackWithThisFile(err);
          done();
        });
    });

    it('should assert the response text', function (done) {
      const app = express();

      app.set('json spaces', 0);

      app.get('/', function (req, res) {
        res.send({ foo: 'bar' });
      });

      request(app)
        .get('/')
        .expect('{"foo":"bar"}', done);
    });

    it('should assert the parsed response body', function (done) {
      const app = express();

      app.set('json spaces', 0);

      app.get('/', function (req, res) {
        res.send({ foo: 'bar' });
      });

      request(app)
        .get('/')
        .expect({ foo: 'baz' })
        .end(function (err, res) {
          expect(err.message).toEqual('expected { foo: \'baz\' } response body, got { foo: \'bar\' }')
          shouldIncludeStackWithThisFile(err);

          request(app)
            .get('/')
            .expect({ foo: 'bar' })
            .end(done);
        });
    });

    it('should test response object types', function (done) {
      const app = express();
      app.get('/', function (req, res) {
        res.status(200).json({ stringValue: 'foo', numberValue: 3 });
      });

      request(app)
        .get('/')
        .expect({ stringValue: 'foo', numberValue: 3 }, done);
    });

    it('should deep test response object types', function (done) {
      const app = express();
      app.get('/', function (req, res) {
        res.status(200)
          .json({ stringValue: 'foo', numberValue: 3, nestedObject: { innerString: '5' } });
      });

      request(app)
        .get('/')
        .expect({ stringValue: 'foo', numberValue: 3, nestedObject: { innerString: 5 } })
        .end(function (err, res) {
          expect(err.message.replace(/[^a-zA-Z]/g, '')).toEqual('expected {\n  stringValue: \'foo\',\n  numberValue: 3,\n  nestedObject: { innerString: 5 }\n} response body, got {\n  stringValue: \'foo\',\n  numberValue: 3,\n  nestedObject: { innerString: \'5\' }\n}'.replace(/[^a-zA-Z]/g, ''))
          shouldIncludeStackWithThisFile(err);

          request(app)
            .get('/')
            .expect({ stringValue: 'foo', numberValue: 3, nestedObject: { innerString: '5' } })
            .end(done);
        });
    });

    it('should support regular expressions', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send('foobar');
      });

      request(app)
        .get('/')
        .expect(/^bar/)
        .end(function (err, res) {
          expect(err.message).toEqual('expected body \'foobar\' to match /^bar/')
          shouldIncludeStackWithThisFile(err);
          done();
        });
    });

    it('should assert response body multiple times', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send('hey tj');
      });

      request(app)
        .get('/')
        .expect(/tj/)
        .expect('hey')
        .expect('hey tj')
        .end(function (err, res) {
          expect(err.message).toEqual("expected 'hey' response body, got 'hey tj'")
          shouldIncludeStackWithThisFile(err);
          done();
        });
    });

    it('should assert response body multiple times with no exception', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send('hey tj');
      });

      request(app)
        .get('/')
        .expect(/tj/)
        .expect(/^hey/)
        .expect('hey tj', done);
    });
  });

  describe('.expect(field, value[, fn])', function () {
    it('should assert the header field presence', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send({ foo: 'bar' });
      });

      request(app)
        .get('/')
        .expect('Content-Foo', 'bar')
        .end(function (err, res) {
          expect(err.message).toEqual('expected "Content-Foo" header field')
          shouldIncludeStackWithThisFile(err);
          done();
        });
    });

    it('should assert the header field value', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send({ foo: 'bar' });
      });

      request(app)
        .get('/')
        .expect('Content-Type', 'text/html')
        .end(function (err, res) {
          expect(err.message).toEqual('expected "Content-Type" of "text/html", '
            + 'got "application/json; charset=utf-8"')
          shouldIncludeStackWithThisFile(err);
          done();
        });
    });

    it('should assert multiple fields', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send('hey');
      });

      request(app)
        .get('/')
        .expect('Content-Type', 'text/html; charset=utf-8')
        .expect('Content-Length', '3')
        .end(done);
    });

    it('should support regular expressions', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send('hey');
      });

      request(app)
        .get('/')
        .expect('Content-Type', /^application/)
        .end(function (err) {
          expect(err.message).toEqual('expected "Content-Type" matching /^application/, '
            + 'got "text/html; charset=utf-8"')
          shouldIncludeStackWithThisFile(err);
          done();
        });
    });

    it('should support numbers', function (done) {
      const app = express();

      app.get('/', function (req, res) {
        res.send('hey');
      });

      request(app)
        .get('/')
        .expect('Content-Length', 4)
        .end(function (err) {
          expect(err.message).toEqual('expected "Content-Length" of "4", got "3"')
          shouldIncludeStackWithThisFile(err);
          done();
        });
    });

    describe('handling arbitrary expect functions', function () {
      let app;
      let get;

      beforeAll(function () {
        app = express();
        app.get('/', function (req, res) {
          res.send('hey');
        });
      });

      beforeEach(function () {
        get = request(app).get('/');
      });

      it('reports errors', function (done) {
        get
          .expect(function (res) {
            throw new Error('failed');
          })
          .end(function (err) {
            expect(err.message).toEqual('failed')
            shouldIncludeStackWithThisFile(err);
            done();
          });
      });

      it(
        'ensures truthy non-errors returned from asserts are not promoted to errors',
        function (done) {
          get
            .expect(function (res) {
              return 'some descriptive error';
            })
            .end(function (err) {
              expect(err).toBeTruthy()
              done();
            });
        }
      );

      it('ensures truthy errors returned from asserts are throw to end', function (done) {
        get
          .expect(function (res) {
            return new Error('some descriptive error');
          })
          .end(function (err) {
            expect(err.message).toEqual('some descriptive error')
            shouldIncludeStackWithThisFile(err);
            expect(err instanceof Error).toBeTruthy()
            done();
          });
      });

      it("doesn't create false negatives", function (done) {
        get
          .expect(function (res) {
          })
          .end(done);
      });

      it("doesn't create false negatives on non error objects", function (done) {
        const handler = {
          get: function(target, prop, receiver) {
            throw Error('Should not be called for non Error objects');
          }
        };
        const proxy = new Proxy({}, handler); // eslint-disable-line no-undef
        get
          .expect(() => proxy)
          .end(done);
      });

      it('handles multiple asserts', function (done) {
        const calls = [];
        get
          .expect(function (res) {
            calls[0] = 1;
          })
          .expect(function (res) {
            calls[1] = 1;
          })
          .expect(function (res) {
            calls[2] = 1;
          })
          .end(function () {
            const callCount = [0, 1, 2].reduce(function (count, i) {
              return count + calls[i];
            }, 0);
            expect(callCount).toEqual(3)
            done();
          });
      });

      it('plays well with normal assertions - no false positives', function (done) {
        get
          .expect(function (res) {
          })
          .expect('Content-Type', /json/)
          .end(function (err) {
            expect(err.message).toMatch(/Content-Type/)
            shouldIncludeStackWithThisFile(err);
            done();
          });
      });

      it('plays well with normal assertions - no false negatives', function (done) {
        get
          .expect(function (res) {
          })
          .expect('Content-Type', /html/)
          .expect(function (res) {
          })
          .expect('Content-Type', /text/)
          .end(done);
      });
    });

    describe('handling multiple assertions per field', function () {
      it('should work', function (done) {
        const app = express();
        app.get('/', function (req, res) {
          res.send('hey');
        });

        request(app)
          .get('/')
          .expect('Content-Type', /text/)
          .expect('Content-Type', /html/)
          .end(done);
      });

      it('should return an error if the first one fails', function (done) {
        const app = express();
        app.get('/', function (req, res) {
          res.send('hey');
        });

        request(app)
          .get('/')
          .expect('Content-Type', /bloop/)
          .expect('Content-Type', /html/)
          .end(function (err) {
            expect(err.message).toEqual('expected "Content-Type" matching /bloop/, '
              + 'got "text/html; charset=utf-8"')
            shouldIncludeStackWithThisFile(err);
            done();
          });
      });

      it('should return an error if a middle one fails', function (done) {
        const app = express();
        app.get('/', function (req, res) {
          res.send('hey');
        });

        request(app)
          .get('/')
          .expect('Content-Type', /text/)
          .expect('Content-Type', /bloop/)
          .expect('Content-Type', /html/)
          .end(function (err) {
            expect(err.message).toEqual('expected "Content-Type" matching /bloop/, '
              + 'got "text/html; charset=utf-8"')
            shouldIncludeStackWithThisFile(err);
            done();
          });
      });

      it('should return an error if the last one fails', function (done) {
        const app = express();
        app.get('/', function (req, res) {
          res.send('hey');
        });

        request(app)
          .get('/')
          .expect('Content-Type', /text/)
          .expect('Content-Type', /html/)
          .expect('Content-Type', /bloop/)
          .end(function (err) {
            expect(err.message).toEqual('expected "Content-Type" matching /bloop/, '
              + 'got "text/html; charset=utf-8"')
            shouldIncludeStackWithThisFile(err);
            done();
          });
      });
    });
  });
});

