document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  document.getElementById('loginResult').textContent = JSON.stringify(await res.json(), null, 2);
});

document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = document.getElementById('q').value;
  const res = await fetch('/api/search?q=' + encodeURIComponent(q));
  document.getElementById('searchResult').textContent = JSON.stringify(await res.json(), null, 2);
});
