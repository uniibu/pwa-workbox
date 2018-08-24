if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('<%= options.swURL %>', {
    scope: '<%= options.swScope %>'
  }).then(registration => {
    window.$sw = registration;
  }).catch(error => {
    console.error('Service worker registration failed:', error);
  });
} else {
  console.warn('Service workers are not supported.');
}