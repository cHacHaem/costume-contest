(async () => {
  const res = await fetch('/api/status');
  const data = await res.json();
  if (!data.open) {
    window.location.href = '/vote.html';
  }
})();

document.getElementById('contestForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const categories = Array.from(form.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
  formData.append('categories', JSON.stringify(categories));

  const res = await fetch('/api/submit', {
    method: 'POST',
    body: formData
  });

  const result = await res.json();
  if (result.success) {
    alert('✅ Costume submitted!');
    form.reset();
  } else {
    alert('❌ ' + result.error);
  }
});
