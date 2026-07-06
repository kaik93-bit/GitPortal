(function () {
  var theme = localStorage.getItem("gitportal-theme") || "cyberpunk";
  document.documentElement.setAttribute("data-theme", theme);
})();
