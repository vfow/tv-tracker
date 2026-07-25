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

    function getDateStringInTimeZone(dateValue,timeZone){
        const date = dateValue instanceof Date ? dateValue : new Date(dateValue);

        if(Number.isNaN(date.getTime())){
            return "";
        }

        try{
            const parts = new Intl.DateTimeFormat("en-CA",{
                timeZone:String(timeZone || "UTC"),
                year:"numeric",
                month:"2-digit",
                day:"2-digit"
            }).formatToParts(date);

            const values = {};
            parts.forEach(part=>{
                if(part.type !== "literal"){
                    values[part.type] = part.value;
                }
            });

            const result = `${values.year || ""}-${values.month || ""}-${values.day || ""}`;
            return parseStrictLocalDate(result) ? result : "";
        }catch(error){
            return "";
        }
    }

    function isTimestampOnCalendarDate(timestamp,dateString,timeZone){
        const calendarDate = String(dateString || "").trim();

        if(!parseStrictLocalDate(calendarDate)){
            return false;
        }

        return getDateStringInTimeZone(timestamp,timeZone) === calendarDate;
    }

    function makeDateOnlyEpisodeReleaseDate(
        dateString,
        fallbackTime="09:00",
        utcOffset="+08:00"
    ){
        const date = String(dateString || "").trim();
        if(!parseStrictLocalDate(date)){
            return null;
        }

        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(fallbackTime || ""))){
            return null;
        }
        if(!/^[+-](0\d|1[0-4]):[0-5]\d$/.test(String(utcOffset || ""))){
            return null;
        }

        const result = new Date(`${date}T${fallbackTime}:00${utcOffset}`);
        return Number.isNaN(result.getTime()) ? null : result;
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
        getDateStringInTimeZone,
        isTimestampOnCalendarDate,
        makeDateOnlyEpisodeReleaseDate,
        prefersReducedMotion
    };
});
