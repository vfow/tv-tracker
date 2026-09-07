const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const {extractFunction} = require('./helpers/extract.js');

// Load the complete app so a removed dependency or duplicate global cannot hide
// behind a test that extracts only the expected backup implementation.
const context = {console, URL, URLSearchParams, setTimeout, clearTimeout,
    document:{addEventListener(){},getElementById(){return null;}}};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('static/js/app.js','utf8'),context,{filename:'app.js'});
vm.runInContext(extractFunction(fs.readFileSync('static/js/db.js','utf8'),'ensureHistoryIds'),context);
const plain = value => JSON.parse(JSON.stringify(value));

(async()=>{
    const localId = 'local-tvdb-42';
    const history = [
        {id:'regular',tmdb_id:localId,season:1,episode:2,watched_at:'2020-01-02T03:04:05Z'},
        {id:'special',tmdb_id:localId,season:1,episode:1,special:true,source_tvdb_episode_id:'901'},
        {id:'movie',media_type:'movie',movie_id:'202',watched_at:'2021-02-03T04:05:06Z'},
        {id:'unknown-old',action:'legacy',note:'Preserve this record'}
    ];
    context.DATA.shows[localId] = {
        tmdb_id:localId,local_only:true,title:'Synthetic imported show',status:'paused',
        source:'compatible-json-import',episodes_watched:{'1':[2]},
        _imported_progress:{watched:{'1-1':{special:true},'1-2':{special:false}}},
        compatible_import:{match_method:'unresolved',tvdb_id:'42'}
    };
    context.DATA.history = plain(history);
    context.DATA.profile.favorite_shows = [localId];
    context.DATA.metadata_sync = {active:true,paused:true,pending:[localId],failed:[{showId:localId}]};
    context.DATA.network_sync = {pending:[localId],failed:[localId]};
    context.ensureProfileData();
    const before = plain(context.DATA);
    // The established native projection adds the storage ID and sorts History.
    // Assert its exact output while preserving every record's content.
    const expected = plain(before);
    expected.shows[localId].id = localId;
    expected.history = plain([history[2],history[0],history[3],history[1]]);
    const backup = context.getNativeBackupObject();
    assert.deepStrictEqual(plain(context.DATA),before,'export must not change tracker or History truth');
    assert.deepStrictEqual(plain(backup.data),expected,'native backup retains older IDs, progress, queues and unknown History');
    for(const schemaVersion of [1,2,3,4,5]) {
        const candidate = {...plain(backup),schemaVersion};
        const original = JSON.stringify(candidate);
        assert.strictEqual(context.validateNativeBackupObject(candidate).valid,true);
        assert.strictEqual(JSON.stringify(candidate),original,'validation is read-only for supported schemas');
    }
    for(const candidate of [null,{...plain(backup),schemaVersion:999},{...plain(backup),data:{shows:[]}}]) {
        assert.strictEqual(context.validateNativeBackupObject(candidate).valid,false);
    }

    const live = context.DATA;
    let acknowledge;
    let adopted = null;
    context.csrfToken = ()=>'synthetic-csrf';
    context.fetch = async (url,options)=>{
        assert.strictEqual(url,'/api/backup/import');
        assert.strictEqual(options.method,'POST');
        assert.strictEqual(options.credentials,'same-origin');
        assert.strictEqual(options.headers['X-CSRF-Token'],'synthetic-csrf');
        assert.deepStrictEqual(JSON.parse(options.body).data,expected);
        return {ok:true};
    };
    context.parseAPIResponse = ()=>new Promise(resolve=>{acknowledge=resolve;});
    context.adoptTransactionalTrackerData = (data,revision)=>{adopted={data:plain(data),revision};};
    const save = context.commitTrackerDataTransactionally(backup.data,backup);
    await new Promise(setImmediate);
    assert.strictEqual(adopted,null,'restore must wait for durable backend acknowledgement');
    assert.strictEqual(context.DATA,live);
    acknowledge({revision:17});
    await save;
    assert.deepStrictEqual(adopted,{data:expected,revision:17});

    adopted = null;
    context.parseAPIResponse = async()=>{throw new Error('Synthetic rejected restore');};
    await assert.rejects(context.commitTrackerDataTransactionally(backup.data,backup),/rejected restore/);
    assert.strictEqual(adopted,null,'rejected restore must not adopt replacement state');
    assert.strictEqual(context.DATA,live);
    assert.deepStrictEqual(plain(context.DATA),before);
    assert.deepStrictEqual(plain(backup.data),expected,'restore preparation must not mutate the supplied backup');
    console.log('Whole-app native backup compatibility and acknowledgement checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
