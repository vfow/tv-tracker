(function(){
    "use strict";

    const passwordInput = document.getElementById("password");
    const signInButton = document.getElementById("sign-in-button");
    const usernameInput = document.getElementById("username");
    const tabs = Array.from(document.querySelectorAll("[data-auth-tab]"));
    const panels = {
        login:document.getElementById("login-panel"),
        signup:document.getElementById("signup-panel")
    };

    function selectTab(tabName,{focusPanel=false}={}){
        const selected = tabName === "signup" ? "signup" : "login";

        tabs.forEach(tab=>{
            const active = tab.dataset.authTab === selected;
            tab.classList.toggle("active",active);
            tab.setAttribute("aria-selected",String(active));
        });

        Object.keys(panels).forEach(name=>{
            if(panels[name]){
                panels[name].hidden = name !== selected;
            }
        });

        if(focusPanel && selected === "login" && usernameInput){
            usernameInput.focus();
        }
    }

    tabs.forEach(tab=>{
        tab.addEventListener("click",()=>selectTab(tab.dataset.authTab,{focusPanel:true}));
    });

    if(passwordInput && signInButton){
        function updateSignInButton(){
            const ready = passwordInput.value.length >= 4;
            signInButton.disabled = !ready;
            signInButton.classList.toggle("is-ready",ready);
            signInButton.setAttribute("aria-disabled",String(!ready));
        }

        passwordInput.addEventListener("input",updateSignInButton);
        passwordInput.addEventListener("change",updateSignInButton);
        window.addEventListener("pageshow",updateSignInButton);
        window.setTimeout(updateSignInButton,100);
        window.setTimeout(updateSignInButton,500);
        updateSignInButton();
    }

    const initial = document.body ? document.body.dataset.initialAuthTab : "login";
    selectTab(initial);
}());
