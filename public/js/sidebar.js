function openNav() {
    document.getElementById("myAccountSidebar").style.width = "250px";
  }
  
  function closeNav() {
    document.getElementById("myAccountSidebar").style.width = "0";
  }
  
  document.getElementById("myAccountButton").addEventListener("click", function() {
    openNav();
  });
  