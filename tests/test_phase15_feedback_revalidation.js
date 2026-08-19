const fs=require("fs"),path=require("path"),assert=require("assert");
const ROOT=path.resolve(__dirname,"..");
const feedback=fs.readFileSync(path.join(ROOT,"static/js/feedback.js"),"utf8");
const modern=fs.readFileSync(path.join(ROOT,"frontend/src/core/feedback.ts"),"utf8");
assert(feedback.includes("TVTrackerFeedback"));assert(feedback.includes("MAX_VISIBLE = 3"));assert(feedback.includes("setOffline"));assert(modern.includes("window.TVTrackerFeedback"));assert(!modern.includes("innerHTML"));
console.log("Phase 15 feedback ownership revalidation passed.");
