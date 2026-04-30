export const NETWORK_MOCK_SCRIPT = `
(function () {
  var originalFetch = globalThis.fetch;

  globalThis.__testNetworkMocks__ = {
    mocks: [],
    requests: [],
  };

  function tryParseJson(str) {
    if (typeof str !== 'string') return str;
    try { return JSON.parse(str); } catch (e) { return str; }
  }

  function findMock(url, method) {
    var mocks = globalThis.__testNetworkMocks__.mocks;
    var normalMethod = (method || 'GET').toUpperCase();
    for (var i = mocks.length - 1; i >= 0; i--) {
      var m = mocks[i];
      var matcher = m.matcher;
      if (matcher.method && matcher.method.toUpperCase() !== normalMethod) continue;
      var urlMatch = false;
      if (matcher.urlType === 'exact') {
        urlMatch = url === matcher.url;
      } else if (matcher.urlType === 'regex') {
        try { urlMatch = new RegExp(matcher.pattern, matcher.flags).test(url); } catch (e) {}
      }
      if (urlMatch) return m;
    }
    return null;
  }

  if (typeof originalFetch === 'function') {
    globalThis.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      var method = (init && init.method) || (input && input.method) || 'GET';
      var body = init && init.body;

      globalThis.__testNetworkMocks__.requests.push({
        url: url,
        method: method.toUpperCase(),
        body: body ? tryParseJson(body) : null,
      });

      var mock = findMock(url, method);
      if (!mock) return originalFetch.apply(this, arguments);

      var response = mock.response;
      var status = response.status !== undefined ? response.status : 200;
      var resolvedBody = response.body !== undefined ? response.body : null;
      var bodyStr = typeof resolvedBody === 'string'
        ? resolvedBody
        : JSON.stringify(resolvedBody);

      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({
            status: status,
            ok: status >= 200 && status < 300,
            headers: {
              get: function (key) {
                var h = response.headers || {};
                return h[key] || null;
              },
            },
            json: function () { return Promise.resolve(resolvedBody); },
            text: function () { return Promise.resolve(bodyStr); },
            clone: function () { return this; },
          });
        }, response.delay || 0);
      });
    };
  }
})()
`;
