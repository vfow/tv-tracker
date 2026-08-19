const fs=require("fs"),path=require("path"),assert=require("assert");
const ROOT=path.resolve(__dirname,"..");
const t=fs.readFileSync(path.join(ROOT,"templates/index.html"),"utf8");
for(const n of ["discover-runtime.js","search-navigation.js","tracker-integrity.js","tracker-removal.js"])assert(t.includes(n));
for(const n of ["discover-stability.js","search-navigation-fix.js","duplicate-show-integrity.js","show-removal-integrity.js"])assert(!t.includes(n));
for(const n of ["discover-runtime.js","search-navigation.js","tracker-integrity.js","tracker-removal.js"])assert.strictEqual((t.match(new RegExp(n.replace(".","\\."),"g"))||[]).length,1);
console.log("Phase 17 frontend ownership contracts passed.");
