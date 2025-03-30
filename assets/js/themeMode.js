(function() {
  let themeMode = localStorage.getItem("themeMode");
  let stylesheetLink = document.createElement("link");
  stylesheetLink.rel = "stylesheet";

  if (themeMode === "1") {
	stylesheetLink.href = "assets/css/styleDark.css";
  } else {
	stylesheetLink.href = "assets/css/style.css";
  }

  document.head.appendChild(stylesheetLink);
})();
	
	
	
// Get a reference to the button element
const lightThemeButton = document.getElementById("light-theme-button");
const darkThemeButton = document.getElementById("dark-theme-button");

// Add an event listener to the button that listens for the "click" event
lightThemeButton.addEventListener("click", function() {
  changeThemeModeToLight();
});

darkThemeButton.addEventListener("click", function() {
  changeThemeModeToDark();
});

// Your abc() function (example)
function changeThemeModeToLight() {  
	localStorage.setItem("themeMode", "0");
	location.reload(); // Reload the page to apply the new theme			
}


// Your abc() function (example)
function changeThemeModeToDark() {
	localStorage.setItem("themeMode", "1");
	location.reload(); // Reload the page to apply the new theme			
}