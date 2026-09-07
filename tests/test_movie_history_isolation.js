const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// Execute the complete shipped app, so duplicate global declarations cannot be
// hidden by extracting only the earlier, correct-looking function for a test.
const app = fs.readFileSync('static/js/app.js','utf8');
const context = {console, URL, URLSearchParams, setTimeout, clearTimeout,
    document:{addEventListener(){},getElementById(){return null;}}};
context.window = context;
vm.createContext(context);
vm.runInContext(app,context,{filename:'app.js'});
const movie = {id:101,title:'Synthetic movie',release_date:'2000-01-01'};
const preserved = [
    {id:'other-movie',media_type:'movie',movie_id:'202',watched_at:'2001-02-03T04:05:06Z'},
    {id:'old-movie',type:'movie',tmdb_id:'303'},
    {id:'unknown-movie',media_type:'movie'},
    {id:'tv',tmdb_id:'101',season:1,episode:1},
    {id:'special',tmdb_id:'101',season:0,episode:1,special:true},
    {id:'unknown-old',action:'legacy'}
];
context.DATA.history = [...preserved,{id:'old-target',media_type:'movie',movie_id:'101'}];
const added = context.addMovieHistoryEntry(movie,'2020-01-02T03:04:05Z');
assert.deepStrictEqual(Array.from(added.deletedIds),['old-target'],'adding one movie must replace only that movie’s History');
assert.strictEqual(JSON.stringify(context.DATA.history.slice(0,-1)),JSON.stringify(preserved),'unrelated and unknown records remain byte-for-byte intact');
assert.deepStrictEqual(Array.from(context.removeMovieHistoryEntries('101')),['movie-watched-101']);
assert.strictEqual(JSON.stringify(context.DATA.history),JSON.stringify(preserved));
for (const invalid of ['',null,undefined,'bad',0]) {
    assert.deepStrictEqual(Array.from(context.removeMovieHistoryEntries(invalid)),[],'invalid target must never mean all movies');
    assert.strictEqual(JSON.stringify(context.DATA.history),JSON.stringify(preserved));
}
assert.strictEqual(context.isMovieHistoryEntry(preserved[2]),true,'unscoped History classification retains unknown movie records');
assert.strictEqual(context.TVTrackerDataIntegrity.isMovieHistoryEntry,context.isMovieHistoryEntry,'the public API uses the same single matcher');
assert.strictEqual((app.match(/^function isMovieHistoryEntry\(/gm)||[]).length,1,'one global definition owns movie History identity');
console.log('Whole-app movie History isolation and unknown-record preservation passed.');
