// Get the wechat link element
const wechatLink = document.querySelector('.wechat');
const wechatLinkFooter = document.querySelector('.wechatFooter');

// Get the element where you want to append the image (e.g., a container div)
// You might need to create this container element in your HTML
const imageContainer = document.createElement('div');
wechatLink.parentNode.insertBefore(imageContainer, wechatLink.nextSibling);  // Insert the container after the wechat link
imageContainer.style.display = 'none'; // Initially hide the container

// Create the image element (but don't add it to the DOM yet)
const wechatQRImage = document.createElement('img');
wechatQRImage.src = 'assets/img/wechatQR.jpg';
wechatQRImage.alt = 'JackyChay Wechat';
wechatQRImage.width = 230;
wechatQRImage.height = 230;


// Function to show image
function showImage() {
  // Show the image
  imageContainer.style.display = 'block';

  // Add break lines before the image
  imageContainer.innerHTML = '<br>'; // Set the inner HTML to 1 break lines

  imageContainer.appendChild(wechatQRImage); // Append the image to the container
}

// Function to hide image
function hideImage(){
	imageContainer.style.display = 'none';
    imageContainer.removeChild(wechatQRImage);
	imageContainer.innerHTML = ''; // Clear the container completely
}




// Add a click event listener to the wechat link
wechatLink.addEventListener('click', function(event) {
  event.preventDefault(); // Prevent the link from navigating

  if (imageContainer.style.display === 'none') {
    // Show the image
    showImage();
  } else {
    // Hide the image
    hideImage();
  }
  
});

wechatLinkFooter.addEventListener('click', function(event) {
  event.preventDefault(); // Prevent the link from navigating
  
	// Show the image
    showImage();
	
	// Scroll to the image container
    imageContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	
});