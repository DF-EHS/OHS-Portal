/* =============================================
   sidebar.js — 側邊目錄互動邏輯
   大豐環保｜法務及環安課
   ============================================= */

// 回到頂部按鈕
const backToTop = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
  backToTop.classList.toggle('visible', window.scrollY > 400);
});

// 切換側邊目錄
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  if (sidebar.classList.contains('open')) {
    overlay.style.display = 'block';
    setTimeout(() => overlay.classList.add('active'), 10);
  } else {
    closeSidebar();
  }
}

// 關閉側邊目錄
function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
  setTimeout(() => overlay.style.display = 'none', 300);
}

// TOC 點擊後自動關閉（平板/手機）
document.querySelectorAll('.toc-chapter, .toc-sub').forEach(a => {
  a.addEventListener('click', () => {
    if (window.innerWidth <= 1024) closeSidebar();
  });
});
