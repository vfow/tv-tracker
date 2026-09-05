(function(global){
    "use strict";

    const feedback = global.TVTrackerFeedback;
    if(!feedback || typeof feedback.notify !== "function"){
        return;
    }

    function withDismiss(options){
        const normalized = Object.assign({},options || {});
        if(!Object.prototype.hasOwnProperty.call(normalized,"dismissible")){
            normalized.dismissible = true;
        }
        return normalized;
    }

    const wrapped = Object.freeze({
        notify(message,options={}){
            return feedback.notify(message,withDismiss(options));
        },
        reportError(error,userMessage,options={}){
            return feedback.reportError(error,userMessage,withDismiss(options));
        },
        dismissByKey:feedback.dismissByKey,
        setOffline:feedback.setOffline,
        sanitizeUserMessage:feedback.sanitizeUserMessage,
        looksTechnical:feedback.looksTechnical
    });

    global.TVTrackerFeedback = wrapped;

    const legacyShowToast = global.showToast;
    if(typeof legacyShowToast === "function"){
        global.showToast = function(message,options={}){
            return legacyShowToast(message,withDismiss(options));
        };
    }
})(window);
