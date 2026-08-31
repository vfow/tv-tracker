const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const bridgeSource = fs.readFileSync('static/js/episode-tracking-state-bridge.js','utf8');
const contractsSource = fs.readFileSync('frontend/src/episode-tracking/contracts.ts','utf8');
const adapterSource = fs.readFileSync('frontend/src/episode-tracking/legacyEpisodeTrackingState.ts','utf8');
const mainSource = fs.readFileSync('frontend/src/main.ts','utf8');
const template = fs.readFileSync('templates/index.html','utf8');
const architecture = fs.readFileSync('docs/architecture/FRONTEND_MODERNIZATION_EPISODE_TRACKING.md','utf8');
const appSource = fs.readFileSync('static/js/app.js','utf8');

assert(bridgeSource.includes('TVTrackerEpisodeTrackingStateBridge'));
assert(bridgeSource.includes('ownership:"legacy-read-only"'));
assert(!bridgeSource.includes('document.'),'Episode Tracking state bridge must remain DOM-free');
assert(!bridgeSource.includes('fetch('),'Episode Tracking state bridge must remain network-free');
assert(!bridgeSource.includes('saveData'),'Episode Tracking state bridge must remain persistence-free');
assert(!bridgeSource.includes('localStorage'),'Episode Tracking state bridge must remain browser-storage-free');
assert(!bridgeSource.includes('sessionStorage'),'Episode Tracking state bridge must remain browser-storage-free');
assert(!bridgeSource.includes('history.pushState'),'Episode Tracking state bridge must not navigate');
assert(!bridgeSource.includes('history.replaceState'),'Episode Tracking state bridge must not navigate');

assert(contractsSource.includes('export interface EpisodeTrackingState'));
assert(contractsSource.includes('export interface EpisodeTrackingSeasonState'));
assert(contractsSource.includes('export interface EpisodeTrackingEpisodeState'));
assert(adapterSource.includes('hasLegacyEpisodeTrackingStateBridge'));
assert(adapterSource.includes('readLegacyEpisodeTrackingSnapshot'));
assert(!mainSource.includes('legacyEpisodeTrackingState'),'state adapter must stay inactive until a renderer handoff');

assert(appSource.includes('async function updateEpisodeWatched(showId,season,episode,isWatched)'));
assert(appSource.includes('async function markSeasonWatched(showId,seasonNumber)'));
assert(appSource.includes('async function markNextEpisode(showId)'));
assert(appSource.includes('await autoCompleteShowAfterLogging(show)'));
assert(appSource.includes('reopenCompletedShowAfterUnwatch(show,season)'));
assert(appSource.includes('await saveShowMutation(id,addedEntries,deletedHistoryIds)'));

const DATA = {
    shows:{
        123:{
            tmdb_id:'123',
            title:'Example Show',
            status:'watching',
            completed_at:'',
            episodes_watched:{
                '0':[1],
                '1':[2,1,2],
                '2':[1],
                '3':[4]
            },
            _episode_list:{
                '0':[
                    {episode_number:1,name:'Special',air_date:'2026-01-01',special:true}
                ],
                '1':[
                    {episode_number:1,name:'Pilot',air_date:'2026-08-01'},
                    {episode_number:2,name:'Second',air_date:'2026-08-08'},
                    {episode_number:3,name:'Future',air_date:'2099-01-01'}
                ],
                '2':[
                    {episode_number:1,name:'Return',air_date:'2026-08-20'},
                    {episode_number:2,name:'Next',air_date:'2026-08-27'}
                ]
            }
        }
    },
    history:[]
};
const before = JSON.stringify(DATA);
const window = {
    DATA,
    selectedShowId:'123',
    selectedEpisodeContext:{showId:'123',season:2,episode:2},
    isEpisodeLoggable(episode,show,seasonNumber){
        return Number(seasonNumber) > 0 && !!episode && !!episode.air_date && String(episode.air_date) <= '2026-08-31';
    }
};
const context = {window,console,Object,Array,Number,String,Date,Set,Map};
vm.createContext(context);
vm.runInContext(bridgeSource,context);

const bridge = window.TVTrackerEpisodeTrackingStateBridge;
assert(bridge,'Episode Tracking state bridge should be exposed');
assert.strictEqual(bridge.ownership,'legacy-read-only');

const snapshot = bridge.snapshot('123');
assert.strictEqual(snapshot.showId,'123');
assert.strictEqual(snapshot.title,'Example Show');
assert.strictEqual(snapshot.status,'watching');
assert.deepStrictEqual(Array.from(snapshot.seasons).map(season=>season.season),[0,1,2,3]);

const specialSeason = snapshot.seasons.find(season=>season.season === 0);
assert(specialSeason);
assert.deepStrictEqual(Array.from(specialSeason.watchedEpisodes),[1]);
assert.strictEqual(specialSeason.episodes[0].special,true);
assert.strictEqual(specialSeason.episodes[0].loggable,false);
assert.strictEqual(specialSeason.allLoggableWatched,false);

const seasonOne = snapshot.seasons.find(season=>season.season === 1);
assert(seasonOne);
assert.deepStrictEqual(Array.from(seasonOne.watchedEpisodes),[1,2]);
assert.strictEqual(seasonOne.episodes[0].title,'Pilot');
assert.strictEqual(seasonOne.episodes[0].watched,true);
assert.strictEqual(seasonOne.episodes[2].watched,false);
assert.strictEqual(seasonOne.episodes[2].loggable,false);
assert.strictEqual(seasonOne.allLoggableWatched,true,'future episodes must not block current season watched parity');

const seasonTwo = snapshot.seasons.find(season=>season.season === 2);
assert(seasonTwo);
assert.deepStrictEqual(Array.from(seasonTwo.watchedEpisodes),[1]);
assert.strictEqual(seasonTwo.allLoggableWatched,false);

const seasonThree = snapshot.seasons.find(season=>season.season === 3);
assert(seasonThree);
assert.deepStrictEqual(Array.from(seasonThree.watchedEpisodes),[4]);
assert.strictEqual(seasonThree.episodes.length,1,'authoritative watched state must survive incomplete episode metadata');
assert.strictEqual(seasonThree.episodes[0].episode,4);
assert.strictEqual(seasonThree.episodes[0].watched,true);
assert.strictEqual(seasonThree.episodes[0].loggable,false);

assert.deepStrictEqual(
    JSON.parse(JSON.stringify(snapshot.selectedEpisode)),
    {showId:'123',season:2,episode:2}
);
assert.strictEqual(JSON.stringify(DATA),before,'snapshot must not mutate tracker state');
assert(Object.isFrozen(snapshot));
assert(Object.isFrozen(snapshot.seasons));
assert(Object.isFrozen(seasonOne));
assert(Object.isFrozen(seasonOne.watchedEpisodes));
assert(Object.isFrozen(seasonOne.episodes));
assert(Object.isFrozen(seasonOne.episodes[0]));
assert(Object.isFrozen(snapshot.selectedEpisode));

DATA.shows[123].episodes_watched['1'].push(99);
DATA.shows[123]._episode_list['1'][0].name = 'Changed live title';
assert.deepStrictEqual(Array.from(seasonOne.watchedEpisodes),[1,2],'snapshot watched state must be detached');
assert.strictEqual(seasonOne.episodes[0].title,'Pilot','snapshot episode metadata must be detached');

const missing = bridge.snapshot('999');
assert.strictEqual(missing.showId,'999');
assert.deepStrictEqual(Array.from(missing.seasons),[]);
assert.strictEqual(missing.selectedEpisode,null);

const appIndex = template.indexOf("filename='js/app.js'");
const episodeTrackingIndex = template.indexOf("filename='js/episode-tracking-state-bridge.js'");
const routerIndex = template.indexOf("filename='js/app-router.js'");
assert(appIndex >= 0);
assert(episodeTrackingIndex > appIndex,'Episode Tracking state bridge must load after app ownership helpers');
assert(routerIndex > episodeTrackingIndex,'Episode Tracking state bridge must load before router/startup');

assert(architecture.includes('`DATA.shows[showId].episodes_watched` remains the authoritative watched-episode state'));
assert(architecture.includes('The Episode Tracking state bridge is read-only'));
assert(architecture.includes('`app-router.js` remains the sole browser History API owner'));
assert(architecture.includes('`saveShowMutation` / `saveData` behavior is unchanged'));

console.log('Frontend modernization Episode Tracking state boundary checks passed.');
