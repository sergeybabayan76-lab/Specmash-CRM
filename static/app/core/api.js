(function () {
  async function request(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        detail = payload.detail || payload.message || detail;
      } catch (error) {
        // Keep the HTTP status when the server does not return JSON.
      }
      throw new Error(detail);
    }
    return response;
  }

  window.SpecmashApp = window.SpecmashApp || {};
  window.SpecmashApp.api = {
    request,
    get: (url) => request(url),
    postJson: (url, body) => request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  };
}());
