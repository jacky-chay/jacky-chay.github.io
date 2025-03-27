const birthYear = 1997;
const currentYear = new Date().getFullYear();
const age = currentYear - birthYear;

document.getElementById('birthYear').textContent = birthYear;
document.getElementById('age').textContent = age;

