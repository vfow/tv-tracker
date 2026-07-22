(function(){
    "use strict";

    const passwordInput = document.getElementById("password");
    const signInButton = document.getElementById("sign-in-button");

    if(!passwordInput || !signInButton){
        return;
    }

    function updateSignInButton(){
        const ready = passwordInput.value.length >= 4;
        signInButton.disabled = !ready;
        signInButton.classList.toggle("is-ready", ready);
        signInButton.setAttribute("aria-disabled", String(!ready));
    }

    passwordInput.addEventListener("input", updateSignInButton);
    passwordInput.addEventListener("change", updateSignInButton);
    window.addEventListener("pageshow", updateSignInButton);
    window.setTimeout(updateSignInButton, 100);
    window.setTimeout(updateSignInButton, 500);
    updateSignInButton();
}());
