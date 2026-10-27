window.CSRF_DEMO_CONFIG = Object.freeze({
  victimOrigins: Object.freeze({
    vulnerable: 'http://127.0.0.1:4310',
    protected: 'http://127.0.0.1:4312',
  }),
  targetEmail: 'hacked@email.com',
});