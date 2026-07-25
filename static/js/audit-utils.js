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

    function parseOffsetTimestamp(timestamp){
        const value = String(timestamp || "").trim();
        const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,6})?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);

        if(!match){
            return null;
        }

        if(!parseStrictLocalDate(`${match[1]}-${match[2]}-${match[3]}`)){
            return null;
        }

        const parsed = new Date(value);
        if(Number.isNaN(parsed.getTime())){
            return null;
        }

        return {
            hour:match[4],
            minute:match[5],
            second:match[6] || "00",
            offset:match[7]
        };
    }

    function makeCanonicalEpisodeReleaseDate(dateString,airtime,airstamp){
        const canonicalDate = String(dateString || "").trim();
        if(!parseStrictLocalDate(canonicalDate)){
            return null;
        }

        const timestampParts = parseOffsetTimestamp(airstamp);
        if(!timestampParts){
            return null;
        }

        const clockTime = String(airtime || "").trim();
        const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clockTime);
        const hour = timeMatch ? timeMatch[1] : timestampParts.hour;
        const minute = timeMatch ? timeMatch[2] : timestampParts.minute;
        const second = timeMatch ? "00" : timestampParts.second;

        const result = new Date(
            `${canonicalDate}T${hour}:${minute}:${second}${timestampParts.offset}`
        );

        return Number.isNaN(result.getTime()) ? null : result;
    }

    function makeDateOnlyEpisodeReleaseDate(dateString){
        const date = parseStrictLocalDate(dateString);
        if(!date){
            return null;
        }

        date.setDate(date.getDate() + 1);
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
        parseOffsetTimestamp,
        makeCanonicalEpisodeReleaseDate,
        makeDateOnlyEpisodeReleaseDate,
        prefersReducedMotion
    };
});
