(function () {
  var _installed = false;
  var _orig = {
    setTimeout:    globalThis.setTimeout,
    clearTimeout:  globalThis.clearTimeout,
    setInterval:   globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    dateNow:       Date.now,
  };
  var _fakeNow = 0;
  var _timers  = [];
  var _nextId  = 1;

  function install(baseTime) {
    if (_installed) return;
    _installed = true;
    _fakeNow = typeof baseTime === 'number' ? baseTime : _orig.dateNow();

    globalThis.setTimeout = function (fn, delay) {
      var args = Array.prototype.slice.call(arguments, 2);
      var id   = _nextId++;
      _timers.push({ id: id, fn: fn, args: args, triggerAt: _fakeNow + (delay || 0), interval: null });
      return id;
    };

    globalThis.clearTimeout = function (id) {
      _timers = _timers.filter(function (t) { return t.id !== id; });
    };

    globalThis.setInterval = function (fn, delay) {
      var args = Array.prototype.slice.call(arguments, 2);
      var id   = _nextId++;
      var ms   = delay || 0;
      _timers.push({ id: id, fn: fn, args: args, triggerAt: _fakeNow + ms, interval: ms });
      return id;
    };

    globalThis.clearInterval = globalThis.clearTimeout;

    Date.now = function () { return _fakeNow; };
  }

  function tick(ms) {
    var target = _fakeNow + ms;
    var guard  = 100000;
    while (guard-- > 0) {
      var next = null;
      for (var i = 0; i < _timers.length; i++) {
        var t = _timers[i];
        if (t.triggerAt <= target && (!next || t.triggerAt < next.triggerAt)) next = t;
      }
      if (!next) break;
      _fakeNow = next.triggerAt;
      if (next.interval !== null) {
        next.triggerAt = _fakeNow + next.interval;
      } else {
        _timers = _timers.filter(function (t) { return t.id !== next.id; });
      }
      try { next.fn.apply(null, next.args); } catch (e) {}
    }
    _fakeNow = target;
  }

  function restore() {
    if (!_installed) return;
    _installed = false;
    _timers    = [];
    globalThis.setTimeout   = _orig.setTimeout;
    globalThis.clearTimeout = _orig.clearTimeout;
    globalThis.setInterval  = _orig.setInterval;
    globalThis.clearInterval = _orig.clearInterval;
    Date.now = _orig.dateNow;
  }

  globalThis.__testClock__ = {
    install:     install,
    tick:        tick,
    restore:     restore,
    isInstalled: function () { return _installed; },
    now:         function () { return _fakeNow; },
  };
})()
