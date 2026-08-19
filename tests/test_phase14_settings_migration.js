const fs=require("fs"),path=require("path"),assert=require("assert");
const ROOT=path.resolve(__dirname,"..");
const domain=fs.readFileSync(path.join(ROOT,"frontend/src/domains/settings/index.ts"),"utf8");
const main=fs.readFileSync(path.join(ROOT,"frontend/src/main.ts"),"utf8");
const legacy=fs.readFileSync(path.join(ROOT,"static/js/settings.js"),"utf8");
const router=fs.readFileSync(path.join(ROOT,"static/js/app-router.js"),"utf8");
for(const section of ["profile","auth","notifications","streaming","data","danger-zone"]){assert(domain.includes(`"${section}"`));assert(legacy.includes(`{id:"${section}"`));}
assert(domain.includes('settingsOwner="modern"'));assert(domain.includes("legacy.open(normalized,options)"));assert(domain.includes("window.TVTrackerSettings=controller"));assert(main.includes("installSettingsDomain()"));assert(router.includes("TVTrackerSettings.open"));assert(!domain.includes("innerHTML"));
console.log("Phase 14 Settings migration contracts passed.");
