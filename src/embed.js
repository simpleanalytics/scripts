/* eslint-env browser */

(function(document) {
  NodeList.prototype.forEach = Array.prototype.forEach;

  document.addEventListener("DOMContentLoaded", function() {
    var counter = 1;
    document.querySelectorAll("[data-sa-graph-url]").forEach(function(graph) {
      var url = graph.getAttribute("data-sa-graph-url");
      var append = url.indexOf("?") > -1 ? "&" : "?";
      var iframe = document.createElement("iframe");
      iframe.setAttribute(
        "src",
        url + append + "embed=true&graph_id=" + counter
      );
      iframe.setAttribute("id", "sa-graph-" + counter);
      iframe.setAttribute("scrolling", "no");
      iframe.style.width = "100%";
      iframe.style.border = "none";
      graph.innerHTML = iframe.outerHTML;
      counter = counter + 1;
    });

    window.onresize = function() {
      document
        .querySelectorAll("[data-sa-graph-url] iframe")
        .forEach(function(iframe) {
          iframe.contentWindow.postMessage("true", "*");
        });
    };

    window.addEventListener("message", function(event) {
      if (typeof event.data !== "object") {
        return;
      } else if (event.data.type === "resize") {
        document.getElementById("sa-graph-" + event.data.id).height =
          event.data.height + "px";
      } else if (event.data.type === "pageviews") {
        var graph = document.getElementById("sa-graph-" + event.data.id);
        var selector = graph.parentNode.getAttribute(
          "data-sa-page-views-selector"
        );
        if (selector)
          document
            .querySelectorAll(selector)
            .forEach(function(pageViewsElement) {
              pageViewsElement.textContent = event.data.pageviews;
            });
      }
    });
  });
})(document);
