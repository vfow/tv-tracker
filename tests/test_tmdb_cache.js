const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const tmdb = fs.readFileSync('static/js/tmdb.js','utf8');
const cacheSource = tmdb.slice(
  tmdb.indexOf('const TMDB_SEARCH_CACHE_PREFIX'),
  tmdb.indexOf('function tmdbHasApiKey')
);

let now = 1_000_000_000;
class CacheDate extends Date {
  static now(){ return now; }
}

const sessionData = new Map();
const context = {
  console,
  Map,
  Object,
  Array,
  Number,
  String,
  JSON,
  Date:CacheDate,
  sessionStorage:{
    getItem(key){ return sessionData.has(key) ? sessionData.get(key) : null; },
    setItem(key,value){ sessionData.set(key,String(value)); },
    removeItem(key){ sessionData.delete(key); }
  }
};

vm.createContext(context);
vm.runInContext(cacheSource,context);

context.writeTMDBSearchCache('Example Show',[{id:123,name:'Example Show'}]);
sessionData.clear();
assert.strictEqual(
  context.readTMDBSearchCache('example show')[0].id,
  123,
  'fresh TMDB search memory cache should be returned'
);

now += (1000 * 60 * 60) + 1;
assert.strictEqual(
  context.readTMDBSearchCache('example show'),
  null,
  'expired TMDB search memory cache should be discarded after one hour'
);

console.log('TMDB search cache TTL checks passed');
