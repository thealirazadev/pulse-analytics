(function () {
  try {
    var d = document,
      n = navigator,
      h = history,
      w = window;
    if (n.doNotTrack == "1" || w.doNotTrack == "1" || n.globalPrivacyControl)
      return;
    var s = d.currentScript || d.querySelector("script[data-site]");
    if (!s) return;
    var sid = s.getAttribute("data-site");
    if (!sid) return;
    var url = new URL("/api/collect", s.src).href;
    var last;
    function send() {
      var p = location.pathname;
      if (p === last) return;
      last = p;
      var b = JSON.stringify({ sid: sid, p: p, r: d.referrer || undefined });
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
