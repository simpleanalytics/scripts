/* Simple Analytics - Privacy friendly analytics (docs.simpleanalytics.com/script; 2020-11-17; 4881) */

!function(o,e,t){var r,n,a,i,c,s,p,u;if(o)try{var m="https:",f=o.console,l="doNotTrack",d=o.navigator,g=o.location,y=g.hostname,h=o.document,v=d.userAgent,w="Not sending request ",b=encodeURIComponent,O=decodeURIComponent,E=JSON.stringify,T=o.addEventListener,_="https://"+t,x=undefined,A=(h.documentElement,"language"),B=d.userAgentData,S=/(bot|spider|crawl)/i.test(v)&&!/(cubot)/i.test(v),$={version:"custom_light_5"};if(S&&($.bot=!0),B)try{$.mobile=B.mobile;var I=B.brands.slice(-1)[0];$.browser=I.brand,$.browserVersion=I.version}catch(K){}var R,j=function(e){f&&f.warn&&f.warn("Simple Analytics:",e)},k=(Date.now,function(){var t=o.crypto||o.msCrypto,e=[1e7]+-1e3+-4e3+-8e3+-1e11,r=/[018]/g;try{return e.replace(r,function(e){return(e^t.getRandomValues(new Uint8Array(1))[0]&15>>e/4).toString(16)})}catch(n){return e.replace(r,function(e){var t=16*Math.random()|0;return(e<2?t:3&t|8).toString(16)})}}),C=function(){for(var e={},t=arguments,r=0;r<t.length;r++){var n=t[r];if(n)for(var o in n)Object.prototype.hasOwnProperty.call(n,o)&&(e[o]=n[o])}return e},D=function(e){var t=g.search.match(new RegExp("[?&]("+e+")=([^?&]+)","gi")),r=t?t.map(function(e){return e.split("=")[1]}):[];if(r&&r[0])return r[0]},N=function(t,e){t=C($,t),(new Image).src=_+"/simple.gif?"+Object.keys(t).filter(function(e){return t[e]!=x}).map(function(e){return b(e)+"="+b(t[e])}).join("&")};try{R=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(K){}var U=h.querySelector('script[src*="'+t+'"]'),q=function(e,t){return e&&e.getAttribute("data-"+t)},V=(e.mode||q(U,"mode"),e.hostname||q(U,"hostname")||y);if(($.hostname=V)!==y&&($.hostname_original=y),l in d&&"1"==d[l])return j(w+"when "+l+" is enabled");if(-1==y.indexOf(".")||/^[0-9]+$/.test(y.replace(/\./g,"")))return j(w+"from "+y);var z,F={},H=k(),J=(h.referrer||"").replace(y,V).replace(/^https?:\/\/((m|l|w{2,3}([0-9]+)?)\.)?([^?#]+)(.*)$/,"$4").replace(/^([^/]+)$/,"$1")||x,L="(utm_)?",M={source:D(L+"source|ref"),medium:D(L+"medium"),campaign:D(L+"campaign"),term:D(L+"term"),content:D(L+"content"),referrer:J},P="sendBeacon",Z=function(e,t){var r={type:"append",original_id:t?e:H};!t&&P in d?d[P](_+"/append",E(C($,r))):N(r)};T("pagehide",Z,!1);var G=function(e){var t="";try{t=e||O(g.pathname)}catch(K){}return t};(u=G(n))&&z!=u&&(a={path:z=u},d[A]&&(a[A]=d[A]),c="navigation",s=(i=o.performance)&&i.getEntriesByType&&i.getEntriesByType(c)[0]&&i.getEntriesByType(c)[0].type?-1<["reload","back_forward"].indexOf(i.getEntriesByType(c)[0].type):i&&i[c]&&-1<[1,2].indexOf(i[c].type),p=!!J&&J.split("/")[0]==V,F=a,function(e,t,r){e&&Z(""+H,!0),H=k(),F.id=H;var n=V+G();N(C(F,t?{referrer:r?J:null}:M,{https:g.protocol==m,timezone:R,type:"pageview"})),J=n}(r,r||s,p))}catch(K){j(K)}}(window,{},"<!--# echo var="http_host" default="" -->");
//# sourceMappingURL=light.js.map