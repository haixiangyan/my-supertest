import express from 'express'
import request from "../lib";

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
