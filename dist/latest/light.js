/* Simple Analytics - Privacy friendly analytics (docs.simpleanalytics.com/script; 2020-02-07; a8c0) */

!function(o,t){if(o){var e="https:",n=e+"//",s=n+t+"/v2/post",r=n+t,a=o.console,i="doNotTrack",c="pageviews",u="events",p=o.navigator,h=p.userAgent,d=o.location,f=o.document,l=d.hostname,m="Not sending requests ",g=null,v=encodeURIComponent,y=decodeURIComponent,w=o.addEventListener,E=function(e){a&&a.warn&&a.warn("Simple Analytics: "+e)};w("error",function(e){e.filename&&-1<e.filename.indexOf(t)&&L(e.message)},!1);function T(e,t){return e&&e.getAttribute("data-"+t)}var b,x,O="pushState",S=o.dispatchEvent,B=f.querySelector('script[src*="'+t+'"]'),R=T(B,"mode"),q="true"===T(B,"skip-dnt");T(B,"sa-global");if(!q&&i in p&&"1"===p[i])return E(m+"when "+i+" is enabled");if(-1===l.indexOf("."))return E(m+"from localhost");if(!h||-1<h.search(/(bot|spider|crawl)/gi))return E(m+"because bot detected");try{function I(e){var t=d.search.match(new RegExp("[?&]("+e+")=([^?&]+)","gi")),n=t?t.map(function(e){return e.split("=")[1]}):[];if(n&&n[0])return n[0]}var $;try{$=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(M){}function k(e){return Math.round((Date.now()-(e||0))/1e3)}var A,C="(utm_)?",H={version:2,hostname:l,https:d.protocol===e,timezone:$,width:o.innerWidth,source:{source:I(C+"source|source|ref"),medium:I(C+"medium"),campaign:I(C+"campaign"),referrer:(f.referrer||"").replace(/^https?:\/\/((m|l|w{2,3}([0-9]+)?)\.)?([^?#]+)(.*)$/,"$4").replace(/^([^/]+)\/$/,"$1")||g},pageviews:[]},N="sendBeacon",U=JSON.stringify,_=N in p&&!1===/ip(hone|ad)(.*)os\s([1-9]|1[0-2])_/i.test(h);_&&w("unload",function(){try{H[c][H[c].length-1];H.time=k(),p[N](s,U(H))}catch(e){L(e)}},!1);function D(e){var t=y(d.pathname);if("hash"===R&&d.hash&&(t+=d.hash.split("?")[0]),A!==t){var n={path:A=t,added:k()},r=o.performance,a="navigation",i=r&&r.getEntriesByType&&r.getEntriesByType(a)[0]&&r.getEntriesByType(a)[0].type?-1<["reload","back_forward"].indexOf(r.getEntriesByType(a)[0].type):r&&r[a]&&-1<[1,2].indexOf(r[a].type);!function(e,t,n){try{var r=H[c],a=r?r.length:0;a&&r[a-1];if(e===u);else if(H[c]?H[c].push(t):H[c]=[t],n&&0===a&&delete H.source,_)return;n&&delete H.source;var i=new XMLHttpRequest;i.open("POST",s,!0),H.time=k(),i.setRequestHeader("Content-Type","text/plain; charset=UTF-8"),i.send(U(H)),delete H[c],delete H[u]}catch(o){L(o)}}(c,n,e||i)}}var F=o.history;if((F?F.pushState:g)&&Event&&S){w(O,function(){D(1)},!(F.pushState=(x=F[b=O],function(){var e=x.apply(this,arguments),t=new Event(b);return t.arguments=arguments,S(t),e}))),w("popstate",function(){D(1)},!1)}"hash"===R&&"onhashchange"in o&&w("hashchange",function(){D(1)},!1),D()}catch(M){L(M)}}function L(e){e=e.message||e,E(e),(new Image).src=r+"/error.gif?error="+v(e)+"&url="+v(l+d.pathname)}}(window,"<!--# echo var="http_host" default="" -->");