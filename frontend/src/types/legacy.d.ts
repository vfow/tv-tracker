export {};
declare global {
  interface Window {
    TVTrackerFeedback?: { notify(message:string,options?:Record<string,unknown>):string|null; reportError(error:unknown,userMessage?:string,options?:Record<string,unknown>):string|null; dismissByKey(key:string):boolean; setOffline(offline:boolean):void; };
    TVTrackerSettings?: { render():void; open(section?:string,options?:Record<string,unknown>):void; current():string; normalizeSection(value?:string):string; routeFor(section?:string):string; sectionFromPath(pathname?:string):string; sections:ReadonlyArray<{id:string;label:string}>; __modernOwner?:boolean; };
  }
}
