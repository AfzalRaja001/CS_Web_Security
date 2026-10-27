const statusElement = document.querySelector('#status');
const loginPanel = document.querySelector('#login-panel');
const profilePanel = document.querySelector('#profile-panel');
const emailValue = document.querySelector('#email-value');

function showStatus(message, kind = 'info') {
  statusElement.textContent = message;
  statusElement.dataset.kind = kind;
}

function showSignedOut() {
  loginPanel.hidden = false;
  profilePanel.hidden = true;
}

function showProfile(email) {
  loginPanel.hidden = true;
  profilePanel.hidden = false;
  emailValue.textContent = email;
}

async function refreshProfile() {
  const response = await fetch('/api/profile', { credentials: 'same-origin' });
  if (!response.ok) {
    showSignedOut();
    return;
  }
  const result = await response.json();
  showProfile(result.email);
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const loginForm = event.currentTarget;
  const form = new FormData(loginForm);
  const response = await fetch('/api/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
  });
  const result = await response.json();
  if (!response.ok) {
    showStatus(result.error, 'error');
    return;
  }
  showStatus('Logged in. The session cookie is HttpOnly.', 'success');
  showProfile(result.email);
  loginForm.reset();
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  showStatus('Logged out. The server session has been invalidated.', 'success');
  showSignedOut();
});

document.querySelector('#email-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const email = new FormData(event.currentTarget).get('email');
  window.location.assign(`/api/change-email?email=${encodeURIComponent(email)}`);
});

refreshProfile().catch(() => {
  showSignedOut();
  showStatus('Could not reach the local demo server.', 'error');
});