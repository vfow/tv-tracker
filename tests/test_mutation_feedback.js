const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(ROOT,'static/js/mutation-feedback.js'),'utf8');
const template = fs.readFileSync(path.join(ROOT,'templates/index.html'),'utf8');

function buildEnvironment({saveResult=true}={}){
    const toasts = [];
    const saveCalls = [];
    const DATA = {
        shows:{
            '20':{tmdb_id:'20',title:'Severance'}
        },
        movies:{
            '10':{id:'10',tmdb_id:'10',title:'Dune',watched:false,plan:false,favorite:true,updated_at:''}
        },
        history:[],
        profile:{favorite_shows:['20'],favorite_movies:[{id:'10',tmdb_id:'10',title:'Dune'}]}
    };

    const window = {
        DATA,
        console:{error(){}},
        document:{
            getElementById(){
                return {getAttribute(){ return 'true'; }};
            }
        },
        showToast(message,options={}){
            toasts.push({message:String(message),options});
            return toasts.length;
        },
        ensureProfileData(){
            DATA.profile = DATA.profile || {};
            DATA.profile.favorite_shows = Array.isArray(DATA.profile.favorite_shows) ? DATA.profile.favorite_shows : [];
            DATA.profile.favorite_movies = Array.isArray(DATA.profile.favorite_movies) ? DATA.profile.favorite_movies : [];
        },
        ensureMovieTrackingData(){
            DATA.movies = DATA.movies || {};
        },
        normalizeFavoriteMovieRecord(movie){
            if(!movie){ return null; }
            const id = String(movie.id || movie.tmdb_id || '');
            if(!id){ return null; }
            return {id,tmdb_id:id,title:String(movie.title || 'Untitled')};
        },
        isMovieFavorite(id){
            return DATA.profile.favorite_movies.some(item=>String(item.id || item.tmdb_id) === String(id));
        },
        getMovieTrackingRecord(id){
            return DATA.movies[String(id)] || null;
        },
        upsertMovieTrackingRecord(movie,updates={}){
            const id = String(movie.id || movie.tmdb_id || '');
            const next = Object.assign({
                id,
                tmdb_id:id,
                title:String(movie.title || 'Untitled'),
                watched:false,
                plan:false,
                favorite:false,
                watched_at:'',
                updated_at:''
            },DATA.movies[id] || {},movie,updates);
            if(!next.watched && !next.plan && !next.favorite){
                delete DATA.movies[id];
                return null;
            }
            DATA.movies[id] = next;
            return next;
        },
        getMovieRecordFromDetails(movie){
            if(!movie){ return null; }
            const id = String(movie.id || movie.tmdb_id || '');
            return id ? {id,tmdb_id:id,title:String(movie.title || 'Untitled')} : null;
        },
        getMovieTrackingState(id){
            const record = DATA.movies[String(id)] || null;
            return {
                watched:!!(record && record.watched),
                plan:!!(record && record.plan),
                favorite:window.isMovieFavorite(id)
            };
        },
        removeMovieHistoryEntries(){ return []; },
        addMovieHistoryEntry(movie,watchedAt){
            const entry = {id:'movie-watched-' + movie.id,movie_id:movie.id,title:movie.title,watched_at:watchedAt};
            DATA.history.push(entry);
            return {entry,deletedIds:[]};
        },
        combineHistoryDeleteIds(left,right){
            return Array.from(new Set([...(left || []),...(right || [])]));
        },
        async showAppConfirm(){ return true; },
        renderActiveMoviePage(){},
        renderAll(){},
        renderFavoritesPopup(){},
        async waitForNextPaint(){},
        async saveData(options){
            saveCalls.push({kind:'state',options});
            return saveResult;
        },
        async saveMovieTrackingMutation(movieId,historyUpsertIds,historyDeleteIds,stateKeys){
            saveCalls.push({kind:'movie',movieId,historyUpsertIds,historyDeleteIds,stateKeys});
            return saveResult;
        },
        setMovieFavoriteState(){},
        updateMovieTracking(){},
        toggleFavoriteShow(){},
        isShowFavorite(id){
            return DATA.profile.favorite_shows.map(String).includes(String(id));
        }
    };

    vm.runInNewContext(source,{window,Date,Promise,Set,Array,Object,String,RegExp,console:window.console},{filename:'mutation-feedback.js'});
    return {window,toasts,saveCalls};
}

(async()=>{
    const appMarker = "filename='js/app.js'";
    const feedbackMarker = "filename='js/mutation-feedback.js'";
    const movieBridgeMarker = "filename='js/movie-details-vue-bridge.js'";
    assert(template.includes(feedbackMarker),'mutation feedback policy must be loaded');
    assert(template.indexOf(appMarker) < template.indexOf(feedbackMarker),'mutation feedback must load after app.js');
    assert(template.indexOf(feedbackMarker) < template.indexOf(movieBridgeMarker),'mutation feedback must load before movie bridge binding');

    const generic = buildEnvironment();
    generic.window.showToast('Could not save changes. Try again.');
    generic.window.showToast('Updated from another tab or device.');
    assert.strictEqual(generic.toasts.length,0,'background save failures must not surface as generic user toasts');
    generic.window.showToast('Dune added to Watched');
    assert.deepStrictEqual(generic.toasts.map(item=>item.message),['Dune added to Watched']);

    const favorite = buildEnvironment();
    const favoriteResult = await favorite.window.setMovieFavoriteState(
        {id:'10',title:'Dune'},
        false,
        {showMessage:true}
    );
    assert.strictEqual(favoriteResult.success,true);
    assert.strictEqual(favorite.window.isMovieFavorite('10'),false);
    assert.deepStrictEqual(favorite.toasts.map(item=>item.message),['Dune removed from Favorites']);
    assert.deepStrictEqual(Array.from(favorite.saveCalls[0].options.stateKeys),['profile','movies']);

    const failedFavorite = buildEnvironment({saveResult:false});
    failedFavorite.window.DATA.profile.favorite_movies = [];
    failedFavorite.window.DATA.movies = {};
    const failedFavoriteResult = await failedFavorite.window.setMovieFavoriteState(
        {id:'10',title:'Dune'},
        true,
        {showMessage:true}
    );
    assert.strictEqual(failedFavoriteResult.success,false);
    assert.deepStrictEqual(
        failedFavorite.toasts.map(item=>item.message),
        ['Couldn’t add Dune to Favorites. Try again.']
    );
    assert(!failedFavorite.toasts.some(item=>item.message === 'Dune added to Favorites'));

    const remove = buildEnvironment();
    remove.window.DATA.movies['10'].watched = true;
    const removed = await remove.window.updateMovieTracking({id:'10',title:'Dune'},'remove');
    assert.strictEqual(removed,true);
    assert.deepStrictEqual(remove.toasts.map(item=>item.message),['Dune is removed']);
    assert.strictEqual(remove.window.DATA.movies['10'],undefined);
    assert.strictEqual(remove.window.isMovieFavorite('10'),false);
    assert.deepStrictEqual(Array.from(remove.saveCalls[0].stateKeys),['movies','profile']);

    const plan = buildEnvironment();
    plan.window.DATA.movies['10'] = {id:'10',tmdb_id:'10',title:'Dune',watched:false,plan:true,favorite:false};
    plan.window.DATA.profile.favorite_movies = [];
    const planned = await plan.window.updateMovieTracking({id:'10',title:'Dune'},'plan');
    assert.strictEqual(planned,true);
    assert.deepStrictEqual(plan.toasts.map(item=>item.message),['Dune removed from Plan to Watch']);

    const showFavorite = buildEnvironment();
    const showSaved = await showFavorite.window.toggleFavoriteShow('20');
    assert.strictEqual(showSaved,true);
    assert.deepStrictEqual(showFavorite.toasts.map(item=>item.message),['Severance removed from Favorites']);

    console.log('Mutation feedback regressions passed.');
})().catch(error=>{
    console.error(error);
    process.exit(1);
});
