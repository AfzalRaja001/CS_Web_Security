const authPanel = document.querySelector('#auth-panel');
const profilePanel = document.querySelector('#profile-panel');
const statusElement = document.querySelector('#status');

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.dataset.error = String(isError);
}

function showSignedOut() {
  authPanel.hidden = false;
  profilePanel.hidden = true;
}

function showProfile(user) {
  authPanel.hidden = true;
  profilePanel.hidden = false;
  document.querySelector('#profile-username').textContent = user.username;
  document.querySelector('#profile-email').textContent = user.email;
}

async function loadProfile() {
  const response = await fetch('/api/profile', { credentials: 'same-origin' });
  if (!response.ok) {
    showSignedOut();
    return;
  }
  const result = await response.json();
  showProfile(result.user);
}

async function submitCredentials(form, endpoint) {
  const values = Object.fromEntries(new FormData(form));
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
  const result = await response.json();
  if (!response.ok) {
    setStatus(result.error || 'Request failed.', true);
    return;
  }
  setStatus('');
  showProfile(result.user);
  form.reset();
}

document.querySelector('#show-login').addEventListener('click', () => {
  document.querySelector('#login-form').hidden = false;
  document.querySelector('#register-form').hidden = true;
  document.querySelector('#show-login').classList.add('active');
  document.querySelector('#show-register').classList.remove('active');
});

document.querySelector('#show-register').addEventListener('click', () => {
  document.querySelector('#login-form').hidden = true;
  document.querySelector('#register-form').hidden = false;
  document.querySelector('#show-login').classList.remove('active');
  document.querySelector('#show-register').classList.add('active');
});

document.querySelector('#login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  submitCredentials(event.currentTarget, '/api/login').catch(() => setStatus('Could not reach the local server.', true));
});

document.querySelector('#register-form').addEventListener('submit', (event) => {
  event.preventDefault();
  submitCredentials(event.currentTarget, '/api/register').catch(() => setStatus('Could not reach the local server.', true));
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  setStatus('');
  showSignedOut();
});

fetch('/api/mode')
  .then((response) => response.json())
  .then(({ mode }) => {
    document.querySelector('#mode-label').textContent = mode === 'vulnerable' ? 'Vulnerable' : 'Protected';
  })
  .then(loadProfile)
  .catch(() => {
    showSignedOut();
    setStatus('Could not reach the local server.', true);
  });