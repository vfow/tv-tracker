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

    function selectTab(tabName){
        const selected = tabName === "signup" ? "signup" : "login";

        tabs.forEach(tab=>{
            const active = tab.dataset.authTab === selected;
            tab.classList.toggle("active",active);
            tab.setAttribute("aria-selected",String(active));
            tab.tabIndex = active ? 0 : -1;
        });

        Object.keys(panels).forEach(name=>{
            if(panels[name]){
                panels[name].hidden = name !== selected;
            }
        });
    }

    function activateTabFromKeyboard(tab,event){
        const currentIndex = tabs.indexOf(tab);
        if(currentIndex < 0){ return; }

        let nextIndex = currentIndex;
        if(event.key === "ArrowRight"){
            nextIndex = (currentIndex + 1) % tabs.length;
        }else if(event.key === "ArrowLeft"){
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        }else if(event.key === "Home"){
            nextIndex = 0;
        }else if(event.key === "End"){
            nextIndex = tabs.length - 1;
        }else{
            return;
        }

        event.preventDefault();
        const nextTab = tabs[nextIndex];
        selectTab(nextTab.dataset.authTab);
        nextTab.focus();
    }

    tabs.forEach(tab=>{
        tab.addEventListener("click",()=>{
            selectTab(tab.dataset.authTab);
            tab.focus();
        });
        tab.addEventListener("keydown",event=>activateTabFromKeyboard(tab,event));
    });

    if(usernameInput && passwordInput && signInButton){
        function updateSignInButton(){
            const ready = usernameInput.value.trim().length > 0 && passwordInput.value.length > 0;
            signInButton.disabled = !ready;
            signInButton.classList.toggle("is-ready",ready);
            signInButton.setAttribute("aria-disabled",String(!ready));
        }

        [usernameInput,passwordInput].forEach(input=>{
            input.addEventListener("input",updateSignInButton);
            input.addEventListener("change",updateSignInButton);
        });
        window.addEventListener("pageshow",updateSignInButton);
        window.setTimeout(updateSignInButton,100);
        window.setTimeout(updateSignInButton,500);
        updateSignInButton();
    }

    const initial = document.body ? document.body.dataset.initialAuthTab : "login";
    selectTab(initial);
}());
