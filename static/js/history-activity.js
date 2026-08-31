function getActivityHistoryEntries(){

    if(!DATA.history || !Array.isArray(DATA.history)){
        DATA.history = [];
    }

    return DATA.history
    .filter(entry=>{

        if(isMovieHistoryEntry(entry)){
            return true;
        }

        if(!entry.air_date){
            return true;
        }

        return isEpisodeAired(
            entry.air_date,
            entry,
            DATA.shows[String(entry.tmdb_id)] || null
        );

    })
    .slice()
    .sort((a,b)=>{

        const aTime = new Date(a && a.watched_at || 0).getTime();
        const bTime = new Date(b && b.watched_at || 0).getTime();
        const safeATime = Number.isFinite(aTime) ? aTime : 0;
        const safeBTime = Number.isFinite(bTime) ? bTime : 0;
        const timeDifference = safeBTime - safeATime;

        if(timeDifference !== 0){
            return timeDifference;
        }

        const aIsMovie = isMovieHistoryEntry(a);
        const bIsMovie = isMovieHistoryEntry(b);

        if(aIsMovie !== bIsMovie){
            return aIsMovie ? 1 : -1;
        }

        if(!aIsMovie){
            const seasonDifference =
            Number(b.season || 0) - Number(a.season || 0);

            if(seasonDifference !== 0){
                return seasonDifference;
            }

            const episodeDifference =
            Number(b.episode || 0) - Number(a.episode || 0);

            if(episodeDifference !== 0){
                return episodeDifference;
            }
        }

        return String(a && a.title || "").localeCompare(String(b && b.title || ""));

    });

}


function getMovieHistoryDisplayData(entry){

    const movieId = String(entry && (entry.movie_id || entry.tmdb_id) || "");
    const trackedMovie = movieId && typeof getMovieTrackingRecord === "function"
    ? (getMovieTrackingRecord(movieId) || {})
    : {};
    const title = String(entry && entry.title || trackedMovie.title || "Unknown Movie");
    const releaseDate = String(entry && entry.release_date || trackedMovie.release_date || "").trim();
    const year = String(entry && entry.year || trackedMovie.year || (releaseDate ? releaseDate.slice(0,4) : "")).trim();

    return {
        id:movieId,
        title:title,
        year:year,
        backdropPath:String(entry && entry.backdrop_path || trackedMovie.backdrop_path || "")
    };

}


function loadMoreHistory(){

    historyVisibleLimit += HISTORY_BATCH_SIZE;
    return globalThis.renderHistory();

}


function renderHistory(){

    const list = document.getElementById("show-list");

    list.innerHTML = "";

    const allHistoryEntries = getActivityHistoryEntries();

    if(allHistoryEntries.length === 0){

        list.innerHTML = `
            <div class="empty-state">
                <h2>No watch history</h2>
                <p>Watched episodes and movies will appear here.</p>
            </div>
        `;

        return;

    }

    const historyEntries = allHistoryEntries.slice(0,historyVisibleLimit);
    const groups = groupHistoryByDate(historyEntries);
    const fragment = document.createDocumentFragment();

    groups.forEach(group=>{

        const groupBox = document.createElement("div");
        groupBox.className = "history-group";

        groupBox.innerHTML = `
            <div class="history-group-title">
                ${escapeHTML(group.label)}
            </div>
        `;

        group.entries.forEach(entry=>{

            const movieEntry = isMovieHistoryEntry(entry);
            const card = document.createElement("a");
            card.className = "show history-entry-card";

            let stillPath = "";
            let title = "";
            let detailLine = "";
            let placeholder = "📺";

            if(movieEntry){

                const movie = getMovieHistoryDisplayData(entry);
                stillPath = movie.backdropPath;
                title = movie.title;
                detailLine = movie.year ? escapeHTML(movie.year) : "";
                placeholder = "🎬";
                card.href = typeof getMovieDetailRoute === "function"
                ? getMovieDetailRoute(movie.id,movie.title)
                : "/app/history";

            }else{

                const show = DATA.shows[String(entry.tmdb_id)] || {};
                const episodeData = getEpisodeData(show,entry.season,entry.episode);
                const episodeTitle =
                entry.episode_title ||
                episodeData.name ||
                "Untitled Episode";

                stillPath =
                entry.episode_still_path ||
                episodeData.still_path ||
                "";
                title = entry.title || show.title || "Unknown Show";
                detailLine = `S${entry.season}E${String(entry.episode).padStart(2,"0")} — ${escapeHTML(episodeTitle)}`;
                card.href = typeof getEpisodeDetailRoute === "function"
                ? getEpisodeDetailRoute(entry.tmdb_id,entry.season,entry.episode)
                : "/app/history";

            }

            const imageHTML = stillPath
            ? `<img class="history-still" loading="lazy" decoding="async" src="${escapeHTML(trackerImageURL(stillPath,"w780"))}">`
            : `<div class="history-still-placeholder">${placeholder}</div>`;

            card.innerHTML = `

                ${imageHTML}

                <div class="info">

                    <div class="title">
                        ${escapeHTML(title)}
                    </div>

                    ${detailLine ? `<div class="history-episode-line">${detailLine}</div>` : ""}

                </div>

                <div class="history-time">
                    ${formatHistoryRelative(entry.watched_at)}
                </div>

            `;

            groupBox.appendChild(card);

        });

        fragment.appendChild(groupBox);

    });

    list.appendChild(fragment);

    if(allHistoryEntries.length > historyEntries.length){

        const moreButton = document.createElement("button");
        moreButton.className = "history-load-more";
        moreButton.type = "button";
        moreButton.textContent = "Load More";

        moreButton.addEventListener("click",loadMoreHistory);

        list.appendChild(moreButton);

    }

}
