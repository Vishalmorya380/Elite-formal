function toggleDetails() {
    const detailsSection = document.getElementById('personalDetails');
    if (detailsSection.style.display === 'none' || detailsSection.style.display === '') {
      detailsSection.style.display = 'block';
    } else {
      detailsSection.style.display = 'none';
    }
  }
  
  function togglePassword() {
    const passwordSection = document.getElementById('changePassword');
    if (passwordSection.style.display === 'none' || passwordSection.style.display === '') {
      passwordSection.style.display = 'block';
    } else {
      passwordSection.style.display = 'none';
    }
  }