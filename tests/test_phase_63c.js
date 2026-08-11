const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {
  console,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Date,
  URLSearchParams,
  encodeURIComponent,
  decodeURIComponent,
  window:{}
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(fs.readFileSync('static/js/discover-browse.js','utf8'),context);
const browse = context.window.TVTrackerBrowse;
assert(browse,'browse module should load');

{
  const parsed = browse.parseSearch('?genre=18,80&theme=10,11&company=49,50&runtime=120-149&country=jp&language=ja&year=2024&sort=rating-desc','movie');
  assert.deepStrictEqual(Array.from(parsed.state.genres),['18','80']);
  assert.deepStrictEqual(Array.from(parsed.state.themes),['10','11']);
  assert.deepStrictEqual(Array.from(parsed.state.companies),['49','50']);
  assert.strictEqual(parsed.state.runtime,'120-149');
  assert.strictEqual(parsed.state.country,'jp');
  assert.strictEqual(parsed.state.language,'ja');
  assert.strictEqual(parsed.state.year,'2024');
  assert.strictEqual(parsed.state.sort,'rating-desc');
  assert.strictEqual(parsed.search,'?genre=18,80&theme=10,11&company=49,50&runtime=120-149&country=jp&language=ja&year=2024&sort=rating-desc');
}

{
  const parsed = browse.parseSearch('?decade=2020&year=2024&upcoming=0','movie');
  assert.strictEqual(parsed.state.year,'2024');
  assert.strictEqual(parsed.state.decade,'','exact year should override decade when both are present');
  assert.strictEqual(parsed.search,'?year=2024');
}

{
  const parsed = browse.parseSearch('?decade=2020','tv');
  assert.strictEqual(parsed.state.year,'');
  assert.strictEqual(parsed.state.decade,'2020');
  assert.strictEqual(parsed.search,'?decade=2020');
}

{
  const params = browse.buildTMDBParams(browse.normalizeState({media:'movie',decade:'1990'}),1,{});
  assert.strictEqual(params['primary_release_date.gte'],'1990-01-01');
  assert.strictEqual(params['primary_release_date.lte'],'1999-12-31');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(params,'primary_release_year'),false);
}

{
  const state = browse.setSingle(browse.normalizeState({media:'tv',year:'2024'}),'decade','2020');
  assert.strictEqual(state.year,'');
  assert.strictEqual(state.decade,'2020');
  const params = browse.buildTMDBParams(state,1,{});
  assert.strictEqual(params['first_air_date.gte'],'2020-01-01');
  assert.strictEqual(params['first_air_date.lte'],'2029-12-31');
}

{
  const parsed = browse.parseSearch('?upcoming=1&decade=2020&year=2024','tv');
  assert.strictEqual(parsed.state.upcoming,true);
  assert.strictEqual(parsed.state.year,'');
  assert.strictEqual(parsed.state.decade,'');
  assert.strictEqual(parsed.search,'?upcoming=1');
}

{
  const parsed = browse.parseSearch('?genre=bad,18,18&network=213&status=ended,canceled&certification=pg-13&sort=nope&x=1','tv');
  assert.deepStrictEqual(Array.from(parsed.state.genres),['18']);
  assert.strictEqual(parsed.state.network,'213');
  assert.deepStrictEqual(Array.from(parsed.state.statuses),['ended','canceled']);
  assert.strictEqual(parsed.state.certification,'');
  assert.strictEqual(parsed.state.sort,'popularity-desc');
  assert.strictEqual(parsed.search,'?genre=18&network=213&status=ended,canceled');
}

{
  const parsed = browse.parseSearch('?network=213&status=ended&certification=pg-13','movie');
  assert.strictEqual(parsed.state.network,'');
  assert.deepStrictEqual(Array.from(parsed.state.statuses),[]);
  assert.strictEqual(parsed.state.certification,'pg-13');
}

{
  assert.strictEqual(browse.serializeSearch(browse.emptyState('tv')),'');
  assert.strictEqual(browse.routeForState({media:'movie',year:'2024',sort:'title-asc'}),'/app/browse/movie?year=2024');
  assert.strictEqual(browse.normalizeSort('title-desc'),'popularity-desc','Discover title sorting should normalize to the supported default');
}

{
  const state = browse.normalizeState({media:'tv',genres:['18','80'],themes:['10','11'],companies:['49','50'],network:'213',country:'jp',language:'ja',statuses:['ended','canceled'],year:'2024',runtime:'45-59',sort:'rating-desc'});
  const params = browse.buildTMDBParams(state,2,{today:'2026-08-10',watchRegion:'MY'});
  assert.strictEqual(params.page,2);
  assert.strictEqual(params.with_genres,'18|80');
  assert.strictEqual(params.with_keywords,'10|11');
  assert.strictEqual(params.with_companies,'49|50');
  assert.strictEqual(params.with_networks,'213');
  assert.strictEqual(params.with_origin_country,'JP');
  assert.strictEqual(params.with_original_language,'ja');
  assert.strictEqual(params.with_status,'3|4');
  assert.strictEqual(params.first_air_date_year,'2024');
  assert.strictEqual(params['with_runtime.gte'],45);
  assert.strictEqual(params['with_runtime.lte'],59);
  assert.strictEqual(params.sort_by,'vote_average.desc');
  assert.strictEqual(params['vote_count.gte'],20);
}

{
  const movie = browse.normalizeState({media:'movie',upcoming:true,certification:'pg-13',providers:['8','9'],runtime:'180-plus',sort:'rating-asc'});
  const params = browse.buildTMDBParams(movie,1,{today:'2026-08-10',watchRegion:'MY'});
  assert.strictEqual(params['primary_release_date.gte'],'2026-08-10');
  assert.strictEqual(params.certification_country,'US');
  assert.strictEqual(params.certification,'PG-13');
  assert.strictEqual(params.with_watch_providers,'8|9');
  assert.strictEqual(params.with_watch_monetization_types,'flatrate');
  assert.strictEqual(params.watch_region,'MY');
  assert.strictEqual(params['with_runtime.gte'],180);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(params,'with_runtime.lte'),false);
  assert.deepStrictEqual(Array.from(movie.providers),['8','9']);
  assert.strictEqual(params.sort_by,'vote_average.asc');
  assert.strictEqual(params['vote_count.gte'],50);
}

{
  const tv = browse.normalizeState({media:'tv',network:'213',statuses:['ended'],genres:['18'],country:'us',runtime:'45-59',certification:'pg-13',sort:'date-desc'});
  const movie = browse.switchMedia(tv,'movie');
  assert.strictEqual(movie.media,'movie');
  assert.strictEqual(movie.network,'');
  assert.deepStrictEqual(Array.from(movie.statuses),[]);
  assert.deepStrictEqual(Array.from(movie.genres),['18']);
  assert.strictEqual(movie.country,'us');
  assert.strictEqual(movie.runtime,'','TV-only runtime range should be cleared when it does not exist for movies');
  assert.strictEqual(movie.sort,'date-desc');

  const back = browse.switchMedia(browse.normalizeState({media:'movie',certification:'pg-13',year:'2024',sort:'date-desc'}),'tv');
  assert.strictEqual(back.certification,'');
  assert.strictEqual(back.year,'2024');
  assert.strictEqual(back.sort,'date-desc');
}

{
  let state = browse.normalizeState({media:'movie',genres:['18','80'],country:'jp',year:'2024',sort:'rating-desc'});
  state = browse.removeValue(state,'genres','18');
  assert.deepStrictEqual(Array.from(state.genres),['80']);
  const cleared = browse.clearFilters(state);
  assert.strictEqual(cleared.media,'movie');
  assert.strictEqual(cleared.sort,'popularity-desc');
  assert.strictEqual(browse.hasFilters(cleared),false);
}

{
  const tvUpcoming = browse.normalizeState({media:'tv',upcoming:true,year:'2024'});
  const params = browse.buildTMDBParams(tvUpcoming,1,{today:'2026-08-10'});
  assert.strictEqual(tvUpcoming.year,'');
  assert.strictEqual(params['first_air_date.gte'],'2026-08-10');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(params,'first_air_date_year'),false);
}

{
  const shortMovie = browse.normalizeState({media:'movie',runtime:'under-90'});
  const params = browse.buildTMDBParams(shortMovie,1,{});
  assert.strictEqual(params['with_runtime.lte'],89);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(params,'with_runtime.gte'),false);
  assert.strictEqual(browse.routeForState(shortMovie),'/app/browse/movie?runtime=under-90');
}

{
  const cases = [
    ['popularity-desc','tv','popularity.desc'],
    ['popularity-asc','movie','popularity.asc'],
    ['rating-desc','tv','vote_average.desc'],
    ['rating-asc','movie','vote_average.asc'],
    ['date-desc','tv','first_air_date.desc'],
    ['date-asc','movie','primary_release_date.asc']
  ];
  cases.forEach(([sort,media,expected])=>{
    assert.strictEqual(browse.sortToTMDB(sort,media),expected,`${media} ${sort}`);
  });
}

{
  const tooMany = Array.from({length:20},(_,index)=>String(index + 1));
  const state = browse.normalizeState({media:'tv',genres:tooMany});
  assert.strictEqual(state.genres.length,12,'direct URL multi-select groups should be bounded');
}


console.log('Phase 6.3C browse-state checks passed');
