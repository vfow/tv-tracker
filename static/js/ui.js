function renderCreatedByHTML(show){
    const creators = Array.isArray(show && show.created_by) ? show.created_by.slice(0,3) : [];
    if(!creators.length){
        return "";
    }
    return `<span>Created by ${creators.map(escapeHTML).join(" • ")}</span>`;
}
function renderCompanyLinksHTML(companies){
    const source = Array.isArray(companies) ? companies : [];
    const items = source.map(company=>{
        const id = Number(company && company.id || 0);
        const name = String(company && company.name || "").trim();
        const logoPath = String(company && company.logo_path || "").trim();
        const route = id && typeof getCompanyDetailRoute === "function" ? getCompanyDetailRoute(id,name) : "";
        if(!name){
            return "";
        }
        const content = logoPath
        ? `<span class="network-logo-chip" title="${escapeHTML(name)}"><img class="network-logo-inline" src="${escapeHTML(trackerImageURL(logoPath,"w185"))}" alt="${escapeHTML(name)}"></span>`
        : `<span>${escapeHTML(name)}</span>`;
        return route
        ? `<a class="show-detail-entity-link show-detail-inline-link show-detail-company-link" href="${escapeHTML(route)}" aria-label="${escapeHTML(name)}">${content}</a>`
        : content;
    }).filter(Boolean);
    return items.length ? `<span class="show-detail-inline-link-list">${items.join("")}</span>` : "Unknown";
}
function getMovieCertification(movie){
    const results = movie && movie.release_dates && Array.isArray(movie.release_dates.results) ? movie.release_dates.results : [];
    const us = results.find(item=>String(item.iso_3166_1 || "").toUpperCase() === "US");
    const release = us && Array.isArray(us.release_dates) ? us.release_dates.find(item=>String(item.certification || "").trim()) : null;
    return release ? String(release.certification || "").trim() : "";
}
function renderMovieLanguageDetailsHTML(movie){
    const languages = [];
    return `<span class="show-detail-inline-link-list">${languages.map(()=>"").join("")}</span>`;
}
function renderMovieProvidersHTML(movie){
    const region = typeof v2GetWatchRegion === "function" ? v2GetWatchRegion() : "US";
    const providerRegion = movie && movie.watch_providers && movie.watch_providers.results ? movie.watch_providers.results[region] : null;
    if(!providerRegion){
        return `<div class="v2-api-empty">Unknown</div>`;
    }
}
function renderMovieDetailsTabHTML(movie){
    const certification = getMovieCertification(movie);
    return `
        <div class="show-detail-fact-list">
            <div class="show-detail-fact-row"><div class="episode-detail-label">Original Title</div><div class="episode-detail-value">${escapeHTML(movie.original_title || "Unknown")}</div></div>
            <div class="show-detail-fact-row"><div class="episode-detail-label">Status</div><div class="episode-detail-value">${escapeHTML(movie.status || "Unknown")}</div></div>
            <div class="show-detail-fact-row"><div class="episode-detail-label">Release Date</div><div class="episode-detail-value">${escapeHTML(movie.release_date || "Unknown")}</div></div>
            <div class="show-detail-fact-row"><div class="episode-detail-label">Runtime</div><div class="episode-detail-value">${movie.runtime ? `${escapeHTML(movie.runtime)} min` : "Unknown"}</div></div>
            <div class="show-detail-fact-row"><div class="episode-detail-label">Language</div><div class="episode-detail-value">${renderMovieLanguageDetailsHTML(movie)}</div></div>
            <div class="show-detail-fact-row"><div class="episode-detail-label">Country</div><div class="episode-detail-value">${renderMovieCountryDetailsHTML(movie)}</div></div>
            <div class="show-detail-fact-row"><div class="episode-detail-label">Certification</div><div class="episode-detail-value">${certification ? renderCertificationLinkHTML("movie",certification) : "Unknown"}</div></div>
            <div class="show-detail-fact-row"><div class="episode-detail-label">Production Companies</div><div class="episode-detail-value">${renderCompanyLinksHTML(movie.production_companies)}</div></div>
        </div>
    `;
}
