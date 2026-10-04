(function listwellAnalytics() {
  var script = document.currentScript;
  if (!script) {
    return;
  }
  var site = script.getAttribute("data-site");
  var key = script.getAttribute("data-key");
  if (!site || !key) {
    return;
  }
  var endpoint = new URL("/api/analytics/collect", script.src);
  endpoint.searchParams.set("s", site);
  endpoint.searchParams.set("k", key);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint.toString());
    return;
  }
  fetch(endpoint.toString(), {
    credentials: "omit",
    keepalive: true,
    method: "GET",
    mode: "cors",
  }).catch(function () {
    /* ignore */
  });
})();
