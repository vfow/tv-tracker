"use strict";

function extractFunction(source, name, opts = {}){
  const pattern = new RegExp("(async\\s+)?function\\s+" + name + "\\s*\\(", "g");
  const match = pattern.exec(source);
  if(!match){
    if(opts.optional){
      return null;
    }
    throw new Error("function not found in source: " + name);
  }
  const start = match.index;
  const openIdx = source.indexOf("{", match.index);
  if(openIdx < 0){
    throw new Error("function has no body brace: " + name);
  }
  let depth = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  let i = openIdx;
  while(i < source.length){
    const ch = source[i];
    const next = source[i + 1];
    if(inLineComment){
      if(ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if(inBlockComment){
      if(ch === "*" && next === "/"){
        inBlockComment = false;
        i += 2;
      }else{
        i += 1;
      }
      continue;
    }
    if(inString){
      if(ch === "\\"){
        i += 2;
        continue;
      }
      if(ch === inString) inString = null;
      i += 1;
      continue;
    }
    if(ch === "/" && next === "/"){
      inLineComment = true;
      i += 2;
      continue;
    }
    if(ch === "/" && next === "*"){
      inBlockComment = true;
      i += 2;
      continue;
    }
    if(ch === '"' || ch === "'" || ch === "`"){
      inString = ch;
      i += 1;
      continue;
    }
    if(ch === "{"){
      depth += 1;
    }else if(ch === "}"){
      depth -= 1;
      if(depth === 0){
        return source.slice(start, i + 1);
      }
    }
    i += 1;
  }
  throw new Error("unbalanced function body: " + name);
}

function extractFunctions(source, names){
  let out = "";
  for(const name of names){
    const fn = extractFunction(source, name);
    out += fn + "\n";
  }
  return out;
}

function extractBetween(source, begin, end, opts = {}){
  const startIndex = source.indexOf(begin);
  if(startIndex < 0){
    if(opts.optional){
      return null;
    }
    throw new Error("begin marker not found in source: " + begin);
  }
  const endIndex = source.indexOf(end, startIndex + begin.length);
  if(endIndex < 0){
    throw new Error("end marker not found in source: " + end);
  }
  return source.slice(startIndex, endIndex + end.length);
}

module.exports = { extractFunction, extractFunctions, extractBetween };