/* ECIAA — consentimento de cookies (LGPD) + Google Analytics sob consentimento.
   O GA (G-7SZK09TNBP) só é carregado DEPOIS do "Aceitar". Nada de cookie antes disso.
   A escolha fica no localStorage (mesma origem = vale para o site todo). Sem rastrear ninguém. */
(function () {
  var GID = 'G-7SZK09TNBP';
  var KEY = 'eciaa_consent'; // 'granted' | 'denied'

  function loadGA() {
    if (window.__eciaaGA) return; window.__eciaaGA = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GID);
  }

  function decide(choice) {
    try { localStorage.setItem(KEY, choice); } catch (e) {}
    var b = document.getElementById('eciaa-consent');
    if (b) b.parentNode.removeChild(b);
    if (choice === 'granted') loadGA();
  }

  function banner() {
    var wrap = document.createElement('div');
    wrap.id = 'eciaa-consent';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Aviso de cookies');
    wrap.style.cssText =
      'position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:9999;max-width:640px;margin:0 auto;' +
      'background:#fff;color:#171522;border:1px solid rgba(23,21,34,0.10);border-radius:16px;' +
      'box-shadow:0 18px 50px -22px rgba(124,58,237,0.35);padding:1rem 1.2rem;' +
      'display:flex;gap:1rem;align-items:center;flex-wrap:wrap;' +
      "font-family:'Satoshi',system-ui,sans-serif;font-size:0.92rem;line-height:1.5;";
    var txt = document.createElement('div');
    txt.style.cssText = 'flex:1 1 260px;color:#6B6880;';
    txt.innerHTML = 'Usamos cookies do Google Analytics só para entender como o site é usado. ' +
      '<a href="/politica-exclusao-dados.html" style="color:#7C3AED;text-decoration:underline;">Saiba mais</a>.';
    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:.6rem;flex:0 0 auto;';
    var accept = document.createElement('button');
    accept.type = 'button'; accept.textContent = 'Aceitar';
    accept.style.cssText = 'cursor:pointer;border:0;border-radius:999px;padding:.6rem 1.3rem;font-weight:700;' +
      "font-family:inherit;font-size:0.9rem;color:#fff;background:#7C3AED;";
    var reject = document.createElement('button');
    reject.type = 'button'; reject.textContent = 'Agora não';
    reject.style.cssText = 'cursor:pointer;border:1px solid rgba(23,21,34,0.14);border-radius:999px;' +
      "padding:.6rem 1.1rem;font-weight:600;font-family:inherit;font-size:0.9rem;color:#6B6880;background:#fff;";
    accept.addEventListener('click', function () { decide('granted'); });
    reject.addEventListener('click', function () { decide('denied'); });
    btns.appendChild(reject); btns.appendChild(accept);
    wrap.appendChild(txt); wrap.appendChild(btns);
    document.body.appendChild(wrap);
  }

  function start() {
    var choice = null;
    try { choice = localStorage.getItem(KEY); } catch (e) {}
    if (choice === 'granted') loadGA();
    else if (choice !== 'denied') banner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
