export const STORAGE_BRIDGE_SCRIPT = `(function() {
  try {
    var tm = null;
    // __turboModuleProxy is installed as a JSI global in new arch.
    if (typeof globalThis.__turboModuleProxy === 'function') {
      tm = globalThis.__turboModuleProxy('RNAsyncStorage');
    }
    // Fallback: TurboModuleRegistry via react-native module (new arch, module bundled).
    if (!tm) {
      try {
        var reg = require('react-native').TurboModuleRegistry;
        if (reg) tm = reg.get('RNAsyncStorage');
      } catch(_) {}
    }
    if (tm) {
      globalThis.__testStorage__ = {
        getItem: function(k) {
          return new Promise(function(resolve, reject) {
            tm.legacy_multiGet([k]).then(function(r) {
              var entry = r && r[0]; resolve(entry ? entry[1] : null);
            }, reject);
          });
        },
        setItem: function(k, v) {
          return new Promise(function(resolve, reject) {
            tm.legacy_multiSet([[k, v]]).then(resolve, reject);
          });
        },
        removeItem: function(k) {
          return new Promise(function(resolve, reject) {
            tm.legacy_multiRemove([k]).then(resolve, reject);
          });
        },
        clear: function() {
          return new Promise(function(resolve, reject) {
            tm.legacy_clear().then(resolve, reject);
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
})()`;
