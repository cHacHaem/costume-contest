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
const submitButton = form.querySelector('button[type=submit]');
submitButton.disabled = true;
  const formData = new FormData(form);
  const categories = Array.from(form.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
  formData.append('categories', JSON.stringify(categories));

  const res = await fetch('/api/submit', {
    method: 'POST',
    body: formData
  });

  const result = await res.json();
  if (result.success) {
    document.getElementById('formMessage').textContent = '✅ Submission successful! Thank you for entering the contest. Come back to vote when submissions close at 12:30. Refresh the page to submit another entry.';
    form.reset();
  } else {
    document.getElementById('formMessage').textContent = '❌ Submission failed: ' + (result.error || 'Unknown error');
  }
});
