/**
 * This JavaScript file, for translation purposes
 */
 
const languages = [
  "en_US",  // Index 0: English (United States)
  "en_GB",  // Index 1: English (United Kingdom)
  "es_ES",  // Index 2: Spanish (Spain)
  "es_MX",  // Index 3: Spanish (Mexico)
  "fr_FR",  // Index 4: French (France)
  "fr_CA",  // Index 5: French (Canada)
  "de_DE",  // Index 6: German (Germany)
  "it_IT",  // Index 7: Italian (Italy)
  "ja_JP",  // Index 8: Japanese (Japan)
  "zh_CN",  // Index 9: Chinese (China, Simplified)
  "zh_TW",  // Index 10: Chinese (Taiwan, Traditional)
  "ko_KR",  // Index 11: Korean (South Korea)
  "pt_PT",  // Index 12: Portuguese (Portugal)
  "pt_BR",  // Index 13: Portuguese (Brazil)
  "ru_RU",  // Index 14: Russian (Russia)
  "ar_SA",  // Index 15: Arabic (Saudi Arabia)
  "nl_NL",  // Index 16: Dutch (Netherlands)
  "sv_SE",  // Index 17: Swedish (Sweden)
  "da_DK",  // Index 18: Danish (Denmark)
  "no_NO",  // Index 19: Norwegian (Norway)
  "fi_FI",  // Index 20: Finnish (Finland)
  "pl_PL",  // Index 21: Polish (Poland)
  "tr_TR",  // Index 22: Turkish (Turkey)
  "el_GR",  // Index 23: Greek (Greece)
  "he_IL",  // Index 24: Hebrew (Israel)
  "id_ID",  // Index 25: Indonesian (Indonesia)
  "vi_VN",  // Index 26: Vietnamese (Vietnam)
  "th_TH",  // Index 27: Thai (Thailand)
  "hi_IN",  // Index 28: Hindi (India)
  "bn_BD",  // Index 29: Bengali (Bangladesh)
  "sw_KE",  // Index 30: Swahili (Kenya)
  "ro_RO",  // Index 31: Romanian (Romania)
  "cs_CZ",  // Index 32: Czech (Czech Republic)
  "sk_SK",  // Index 33: Slovak (Slovakia)
  "hu_HU",  // Index 34: Hungarian (Hungary)
  "uk_UA"   // Index 35: Ukrainian (Ukraine)
];

let currentLanguage = "en_US"; // Default language
	
// This method is to get the currentLocale	
function getCurrentLocale() {
  return currentLanguage; // Replace with your locale logic
}
	

// This method is used to load the JSON file for translation
function loadAndCacheJSONPromises(filename) {
  return new Promise((resolve, reject) => {
	// Check if the data is already in the cache
	let cachedData = localStorage.getItem(filename);

	// console.log("isCachedData: ", cachedData);
	// if (cachedData) {
	  // resolve(JSON.parse(cachedData)); // Parse back into a JavaScript object
	  // return; // important to return here.
	// }
	// else{
		// console.log(`Trying to load data to cache`);
	// }

	fetch(filename)
	  .then(response => {
		if (!response.ok) {
		  throw new Error(`HTTP error! status: ${response.status}`);
		}
		return response.json();
	  })
	  .then(jsonData => {
		localStorage.setItem(filename, JSON.stringify(jsonData));  // Stringify to store
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
		if(elementToTranslate){
			elementToTranslate.textContent = data[key][locale];		
		}
	}
}
	
	
// Example using the Promises version
function mainPromises() {
  // loadAndCacheJSONPromises('https://raw.githubusercontent.com/jacky-chay/jacky-chay.github.io/refs/heads/master/assets/json/translations.json')  
  loadAndCacheJSONPromises('../json/translations.json')  
	.then(myData => {
		console.log("Data (Promises):", myData);
		// Start localizing
		localizeText(myData, getCurrentLocale());	
	})
	.catch(error => {
		console.log("Failed to load data (Promises):", error);
	});
		
}
	
  

function languageSelected() {
  const selectElement = document.getElementById("languageSelect");
  const selectedValue = selectElement.value;

  if (selectedValue) {
    // Do something with the selected language value
    console.log("Selected language code:", selectedValue);

    // Example: You might want to store the selected language in localStorage
    currentLanguage = selectedValue;

	mainPromises();
  } else {
    console.log("No language selected.");
    // Handle the case where no language is selected (e.g., the default "-- Select a Language --" option)
  }
}


  
  

mainPromises();