(function() {
  try {
    var tm = null;
    // __turboModuleProxy is installed as a JSI global in new arch.
    // iOS registers as 'RNAsyncStorage'; Android v2.x registers as 'RNCAsyncStorage'.
    if (typeof globalThis.__turboModuleProxy === 'function') {
      tm = globalThis.__turboModuleProxy('RNAsyncStorage') ||
           globalThis.__turboModuleProxy('RNCAsyncStorage');
    }
    // Fallback: TurboModuleRegistry via react-native module (new arch, module bundled).
    if (!tm) {
      try {
        var reg = require('react-native').TurboModuleRegistry;
        if (reg) tm = reg.get('RNAsyncStorage') || reg.get('RNCAsyncStorage');
      } catch(_) {}
    }
    if (tm) {
      // v3+ (iOS): promise-based with legacy_* prefix.
      // v2.x (Android): callback-based with unprefixed names — (args, callback).
      globalThis.__testStorage__ = {
        getItem: function(k) {
          return new Promise(function(resolve, reject) {
            if (typeof tm.legacy_multiGet === 'function') {
              tm.legacy_multiGet([k]).then(function(r) {
                var entry = r && r[0]; resolve(entry ? entry[1] : null);
              }, reject);
            } else {
              tm.multiGet([k], function(errors, result) {
                if (errors && errors.length) { reject(new Error(String(errors[0]))); return; }
                var entry = result && result[0];
                resolve(entry ? entry[1] : null);
              });
            }
          });
        },
        setItem: function(k, v) {
          return new Promise(function(resolve, reject) {
            if (typeof tm.legacy_multiSet === 'function') {
              tm.legacy_multiSet([[k, v]]).then(resolve, reject);
            } else {
              tm.multiSet([[k, v]], function(errors) {
                if (errors && errors.length) { reject(new Error(String(errors[0]))); return; }
                resolve();
              });
            }
          });
        },
        removeItem: function(k) {
          return new Promise(function(resolve, reject) {
            if (typeof tm.legacy_multiRemove === 'function') {
              tm.legacy_multiRemove([k]).then(resolve, reject);
            } else {
              tm.multiRemove([k], function(errors) {
                if (errors && errors.length) { reject(new Error(String(errors[0]))); return; }
                resolve();
              });
            }
          });
        },
        clear: function() {
          return new Promise(function(resolve, reject) {
            if (typeof tm.legacy_clear === 'function') {
              tm.legacy_clear().then(resolve, reject);
            } else {
              tm.clear(function(errors) {
                if (errors && errors.length) { reject(new Error(String(errors[0]))); return; }
                resolve();
              });
            }
          });
        },
      };
      return true;
    }
    // Last resort: require the JS module directly (requires it to be in the Metro bundle).
    var mod = require('@react-native-async-storage/async-storage');
    var AS = mod && (mod.default || mod);
    if (!AS) throw new Error('no AS export');
    globalThis.__testStorage__ = {
      getItem:    function(k)    { return AS.getItem(k); },
      setItem:    function(k, v) { return AS.setItem(k, v); },
      removeItem: function(k)    { return AS.removeItem(k); },
      clear:      function()     { return AS.clear(); },
    };
    return true;
  } catch(e) {
    globalThis.__testStorage__ = null;
    return false;
  }
})()
