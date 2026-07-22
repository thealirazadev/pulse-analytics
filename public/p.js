(function () {
  try {
    var d = document,
      n = navigator,
      h = history,
      w = window;
    var dnt =
      n.doNotTrack == "1" || w.doNotTrack == "1" || n.globalPrivacyControl;
    var s = d.currentScript || d.querySelector("script[data-site]");
    var sid = s && s.getAttribute("data-site");
    var url = s && new URL("/api/collect", s.src).href;
    function beacon(b) {
      if (dnt || !sid || !url) return;
      try {
        if (n.sendBeacon) n.sendBeacon(url, b);
        else
          fetch(url, {
            method: "POST",
            body: b,
            keepalive: true,
            mode: "no-cors",
          });
      } catch (e) {}
    }
    var last;
    function send() {
      var p = location.pathname;
      if (p === last) return;
      last = p;
      beacon(JSON.stringify({ sid: sid, p: p, r: d.referrer || undefined }));
    }
    // Public API: pulse('event','signup') records a named event; always defined
    // so it is a safe no-op under DNT/GPC or a missing data-site.
    w.pulse = function (t, e) {
      if (t === "event" && e) beacon(JSON.stringify({ sid: sid, n: "" + e }));
    };
    if (dnt || !sid) return;
    function wrap(k) {
      var o = h[k];
      if (!o) return;
      h[k] = function () {
        var r = o.apply(this, arguments);
        send();
        return r;
      };
    }
    wrap("pushState");
    wrap("replaceState");
    w.addEventListener("popstate", send);
    send();
  } catch (e) {}
})();
