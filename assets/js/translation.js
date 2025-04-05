/**
 * This JavaScript file, for translation purposes
 */
 
const currentVersion = 3;

const languages = [
  { code: "en_US", name: "English (United States)" },  // Index 0
  { code: "zh_CN", name: "中文 (China)" },             // Index 1
  { code: "es_ES", name: "Español (Spain)" },          // Index 2
  { code: "fr_FR", name: "Français (France)" },         // Index 3
  { code: "de_DE", name: "Deutsch (Germany)" },          // Index 4
  { code: "it_IT", name: "Italiano (Italy)" },          // Index 5
  { code: "ja_JP", name: "日本語 (Japan)" },           // Index 6
  { code: "ko_KR", name: "한국어 (Korea)" },           // Index 7
  { code: "pt_PT", name: "Português (Portugal)" },       // Index 8
  { code: "ru_RU", name: "Русский (Russia)" },         // Index 9
  { code: "ar_SA", name: "العربية (Saudi Arabia)" },       // Index 10
  { code: "nl_NL", name: "Nederlands (Netherlands)" },    // Index 11
  { code: "sv_SE", name: "Svenska (Sweden)" },          // Index 12
  { code: "da_DK", name: "Dansk (Denmark)" },            // Index 13
  { code: "no_NO", name: "Norsk (Norway)" },            // Index 14
  { code: "fi_FI", name: "Suomi (Finland)" },            // Index 15
  { code: "pl_PL", name: "Polski (Poland)" },            // Index 16
  { code: "tr_TR", name: "Türkçe (Turkey)" },           // Index 17
  { code: "el_GR", name: "Ελληνικά (Greece)" },         // Index 18
  { code: "he_IL", name: 'עברית (Israel)' },           // Index 19
  { code: "id_ID", name: "Bahasa Indonesia (Indonesia)" },  // Index 20
  { code: "vi_VN", name: "Tiếng Việt (Vietnam)" },         // Index 21
  { code: "th_TH", name: "ภาษาไทย (Thailand)" },          // Index 22
  { code: "hi_IN", name: "हिन्दी (India)" },            // Index 23
  { code: "bn_BD", name: "বাংলা (Bangladesh)" },            // Index 24
  { code: "sw_KE", name: "Kiswahili (Kenya)" },        // Index 25
  { code: "ro_RO", name: "Română (Romania)" },          // Index 26
  { code: "cs_CZ", name: "Čeština (Czech Republic)" },    // Index 27
  { code: "sk_SK", name: "Slovenčina (Slovakia)" },      // Index 28
  { code: "hu_HU", name: "Magyar (Hungary)" },          // Index 29
  { code: "uk_UA", name: "Українська (Ukraine)" },        // Index 30
];



let currentLanguage = languages[0].code; // Default language en_US

// This method is used to load the JSON file 
let currentFilename = "";

function loadAndCacheJSONPromises(filename, version) {
    return new Promise((resolve, reject) => {
      const localStorageKey = `i18nData_v${version}`;
      let cachedData = localStorage.getItem(localStorageKey);

      if (cachedData) {
        console.log(`Data loaded from localStorage (v${currentVersion})`);
        resolve(JSON.parse(cachedData));
        return;
      }

      // **Clear localStorage before fetching new data**
      console.debug("Clearing localStorage before update");
      localStorage.clear(); // Clear everything.  USE WITH CAUTION!

      fetch(filename)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(jsonData => {
          localStorage.setItem(localStorageKey, JSON.stringify(jsonData)); // Save with the versioned key
          localStorage.setItem("currentVersion", currentVersion);
          console.log(`Data loaded from network and cached (v${currentVersion})`);
          resolve(jsonData);
        })
        .catch(error => {
          console.error(`Error loading and caching JSON from ${filename}:`, error);
          reject(error);
        });
    });
  }

// This is the main method that do the localization job	
function localizeText(data, locale) {
	
	console.log(`${locale} is selected for showing language`);
	
	for (const key in data) {		
		const elementToTranslate = document.getElementById(key);

		if(elementToTranslate && key == "heroSelectionDataTypedTxtId"){
			elementToTranslate.setAttribute('data-typed-items', data[key][locale]);
			
		  
			// Get the strings from the element
			let typed_strings = elementToTranslate.getAttribute('data-typed-items').split(',');

			// Destroy the previous instance, if it exists
			if (elementToTranslate.typedEffect) {
				elementToTranslate.typedEffect.destroy();
				elementToTranslate.typedEffect = null; // Clear the property
			}

			// Create and store the Typed instance directly on the element
			elementToTranslate.typedEffect = new Typed(elementToTranslate, { // Pass the element
				strings: typed_strings,
				loop: true,
				typeSpeed: 20,
				backSpeed: 30,
				backDelay: 1000
			});
			
			continue;
		}
		if(elementToTranslate){
			elementToTranslate.textContent = data[key][locale];		
		}
	}
}
	
	
// Example using the Promises version
function mainPromises() {
	
	if(window.location.pathname.endsWith(".html")){
		console.debug("Running locally.");
		currentFilename = 'https://raw.githubusercontent.com/jacky-chay/jacky-chay.github.io/master/assets/json/translations.json';
	}
	else{
		console.debug("Running on a web server.");		
		currentFilename = 'assets/json/translations.json';
	}
	
  loadAndCacheJSONPromises(currentFilename, currentVersion)
	.then(myData => {
		console.debug("Data (Promises):", myData);
		// Start localizing
		localizeText(myData, currentLanguage);	
	})
	.catch(error => {
		console.error("Failed to load data (Promises):", error);
	});
		
}	
  
  
// This populates the language dropdown list according to the languages variable
function populateLanguageSelect() {
  const languageSelect = document.getElementById("languageSelect");

  languages.forEach(language => {
    const option = document.createElement("option");
    option.value = language.code; // Use language.code as the value
    option.textContent = language.name; // Use language.name as the display text
    languageSelect.appendChild(option);
  });
}
 

function languageSelected() {
  const selectElement = document.getElementById("languageSelect");
  const selectedValue = selectElement.value;

  if (selectedValue) {
    // Do something with the selected language value
    console.log("Selected language code:", selectedValue);
	
    currentLanguage = selectedValue;

	// Run main
	mainPromises();
  } else {
    console.log("No language selected. Default using en_US");
    // Handle the case where no language is selected (e.g., the default "-- Select a Language --" option)
  }
}





window.onload = populateLanguageSelect;
mainPromises();
