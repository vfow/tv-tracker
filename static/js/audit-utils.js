(function(root,factory){
    const api = factory();
    if(typeof module !== "undefined" && module.exports){
        module.exports = api;
    }
    root.TVTrackerAuditUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this,function(){
    "use strict";

    function parseStrictLocalDate(dateString){
        const value = String(dateString || "").trim();
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

        if(!match){
            return null;
        }

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);

        if(
            !Number.isInteger(year) || year < 1 || year > 9999 ||
            !Number.isInteger(month) || month < 1 || month > 12 ||
            !Number.isInteger(day) || day < 1 || day > 31
        ){
            return null;
        }

        const result = new Date(0);
        result.setHours(0,0,0,0);
        result.setFullYear(year,month - 1,day);

        if(
            result.getFullYear() !== year ||
            result.getMonth() !== month - 1 ||
            result.getDate() !== day
        ){
            return null;
        }

        return result;
    }

    function chooseEpisodeCalendarDate(primaryDate,fallbackDate){
        const primary = String(primaryDate || "").trim();
        const fallback = String(fallbackDate || "").trim();

        if(parseStrictLocalDate(primary)){
            return primary;
        }

        if(parseStrictLocalDate(fallback)){
            return fallback;
        }

        return "";
    }

    function makeDateOnlyEpisodeReleaseDate(dateString){
        const date = parseStrictLocalDate(dateString);
        if(!date){
            return null;
        }
        date.setHours(0,0,0,0);
        return date;
    }

    function prefersReducedMotion(matchMediaFunction){
        try{
            const matcher = matchMediaFunction || (
                typeof globalThis.matchMedia === "function"
                ? globalThis.matchMedia.bind(globalThis)
                : null
            );
            return !!(matcher && matcher("(prefers-reduced-motion: reduce)").matches);
        }catch(error){
            return false;
        }
    }

    return {
        parseStrictLocalDate,
        chooseEpisodeCalendarDate,
        makeDateOnlyEpisodeReleaseDate,
        prefersReducedMotion
    };
});
