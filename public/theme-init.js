(function () {
  let preference = 'system';
  try {
    const storedPreference = window.localStorage.getItem(
      'ijinden-deckbook-theme',
    );
    if (
      storedPreference === 'system' ||
      storedPreference === 'light' ||
      storedPreference === 'dark'
    ) {
      preference = storedPreference;
    }
  } catch {
    // Continue with the system default when storage is unavailable.
  }

  let systemTheme = 'light';
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      systemTheme = 'dark';
    }
  } catch {
    // Older or restricted browsers use the light default until the app loads.
  }

  document.documentElement.dataset.theme =
    preference === 'system' ? systemTheme : preference;
})();
