(function(global){
    "use strict";

    function cleanText(value){
        return String(value === null || typeof value === "undefined" ? "" : value).trim();
    }

    function cleanId(value){
        const clean = cleanText(value);
        return /^[1-9][0-9]{0,11}$/.test(clean) ? clean : "";
    }

    function cleanIndex(value){
        const number = Number(value);
        return Number.isInteger(number) && number >= 0 ? number : 0;
    }

    function normalizeWatchedEpisodes(value){
        const list = Array.isArray(value) ? value : [];
        const numbers = list
        .map(cleanIndex)
        .filter(number=>number > 0);
        return Array.from(new Set(numbers)).sort((left,right)=>left-right);
    }

    function episodeIsLoggable(episode,show,seasonNumber){
        if(typeof global.isEpisodeLoggable === "function"){
            return global.isEpisodeLoggable(episode,show,seasonNumber) === true;
        }
        if(!episode || !episode.air_date || typeof global.isEpisodeAired !== "function"){
            return false;
        }
        return global.isEpisodeAired(episode.air_date,episode,show) === true;
    }

    function normalizeEpisode(show,seasonNumber,episode,watchedEpisodes){
        if(!episode || typeof episode !== "object") return null;
        const episodeNumber = cleanIndex(episode.episode_number);
        if(episodeNumber <= 0) return null;
        return Object.freeze({
            season:seasonNumber,
            episode:episodeNumber,
            title:cleanText(episode.name),
            airDate:cleanText(episode.air_date),
            watched:watchedEpisodes.includes(episodeNumber),
            loggable:episodeIsLoggable(episode,show,seasonNumber),
            special:seasonNumber === 0 || episode.special === true
        });
    }

    function normalizeSeason(show,seasonKey){
        const seasonNumber = cleanIndex(seasonKey);
        const watchedSource = show && show.episodes_watched && typeof show.episodes_watched === "object"
        ? show.episodes_watched[String(seasonKey)]
        : [];
        const watchedEpisodes = normalizeWatchedEpisodes(watchedSource);
        const episodeSource = show && show._episode_list && typeof show._episode_list === "object" && Array.isArray(show._episode_list[String(seasonKey)])
        ? show._episode_list[String(seasonKey)]
        : [];
        const normalizedEpisodes = episodeSource
        .map(episode=>normalizeEpisode(show,seasonNumber,episode,watchedEpisodes))
        .filter(Boolean);
        const knownEpisodeNumbers = new Set(normalizedEpisodes.map(episode=>episode.episode));

        watchedEpisodes.forEach(episodeNumber=>{
            if(!knownEpisodeNumbers.has(episodeNumber)){
                normalizedEpisodes.push(Object.freeze({
                    season:seasonNumber,
                    episode:episodeNumber,
                    title:"",
                    airDate:"",
                    watched:true,
                    loggable:false,
                    special:seasonNumber === 0
                }));
            }
        });

        normalizedEpisodes.sort((left,right)=>left.episode-right.episode);
        const loggableEpisodes = normalizedEpisodes.filter(episode=>episode.loggable && !episode.special);

        return Object.freeze({
            season:seasonNumber,
            watchedEpisodes:Object.freeze(watchedEpisodes.slice()),
            episodes:Object.freeze(normalizedEpisodes),
            allLoggableWatched:loggableEpisodes.length > 0 && loggableEpisodes.every(episode=>episode.watched)
        });
    }

    function selectedEpisodeState(showId){
        const context = global.selectedEpisodeContext && typeof global.selectedEpisodeContext === "object"
        ? global.selectedEpisodeContext
        : null;
        if(!context || cleanId(context.showId) !== showId) return null;
        const season = cleanIndex(context.season);
        const episode = cleanIndex(context.episode);
        if(episode <= 0) return null;
        return Object.freeze({showId,season,episode});
    }

    function snapshot(showIdValue){
        const data = global.DATA && typeof global.DATA === "object" ? global.DATA : {};
        const shows = data.shows && typeof data.shows === "object" ? data.shows : {};
        const context = global.selectedEpisodeContext && typeof global.selectedEpisodeContext === "object"
        ? global.selectedEpisodeContext
        : null;
        const showId = cleanId(showIdValue || (context && context.showId) || global.selectedShowId);
        const show = showId && shows[showId] && typeof shows[showId] === "object" ? shows[showId] : null;

        if(!show){
            return Object.freeze({
                showId,
                title:"",
                status:"",
                completedAt:"",
                seasons:Object.freeze([]),
                selectedEpisode:null
            });
        }

        const seasonKeys = new Set();
        const watched = show.episodes_watched && typeof show.episodes_watched === "object" ? show.episodes_watched : {};
        const episodeLists = show._episode_list && typeof show._episode_list === "object" ? show._episode_list : {};
        Object.keys(watched).forEach(key=>seasonKeys.add(String(key)));
        Object.keys(episodeLists).forEach(key=>seasonKeys.add(String(key)));

        const seasons = Array.from(seasonKeys)
        .map(key=>normalizeSeason(show,key))
        .sort((left,right)=>left.season-right.season);

        return Object.freeze({
            showId,
            title:cleanText(show.title || show.name),
            status:cleanText(show.status),
            completedAt:cleanText(show.completed_at),
            seasons:Object.freeze(seasons),
            selectedEpisode:selectedEpisodeState(showId)
        });
    }

    global.TVTrackerEpisodeTrackingStateBridge = Object.freeze({
        snapshot,
        ownership:"legacy-read-only"
    });
})(window);
