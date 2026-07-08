/* shared/sidebar.js — persistent sidebar injected into all OHS-Portal sub-pages */
(function () {
  'use strict';

  if (document.getElementById('ohs-sidebar')) return; // idempotent

  // Auto-detect depth: count directory segments after the repo root (/OHS-Portal/)
  const BASE = (function () {
    var segs = location.pathname.replace(/^\//, '').split('/').filter(Boolean);
    // last segment is a file (has extension) → remove it
    if (segs.length > 0 && /\.[a-z0-9]+$/i.test(segs[segs.length - 1])) segs.pop();
    // first segment is the GitHub Pages repo name → remove it
    if (segs.length > 0) segs.shift();
    var depth = segs.length; // directory levels below repo root
    return depth > 0 ? new Array(depth + 1).join('../') : './';
  }());

  // ── CSS ───────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --ohs-sidebar-bg: #1a2d42;
      --ohs-sidebar-w:  260px;
    }
    body.dark { --ohs-sidebar-bg: #0d1b2a; }

    #ohs-sidebar {
      position: fixed; top: 0; left: 0; bottom: 0;
      width: var(--ohs-sidebar-w); z-index: 200;
      background: var(--ohs-sidebar-bg);
      display: flex; flex-direction: column;
      overflow: hidden;
      font-family: "Microsoft JhengHei", "Noto Sans TC", sans-serif;
    }
    #ohs-sidebar .brand {
      background: linear-gradient(160deg, #e8821a 0%, #f59840 55%, #f9ad5a 100%);
      padding: 20px 20px 16px; text-align: center; flex-shrink: 0;
    }
    body.dark #ohs-sidebar .brand {
      background: linear-gradient(160deg, #2c1a0e 0%, #3d2010 55%, #4a2712 100%);
    }
    #ohs-sidebar .brand img { height: 110px; display: block; margin: 0 auto 10px; }
    #ohs-sidebar .brand-sub {
      font-size: 13px; color: rgba(255,255,255,.88); letter-spacing: 3px; font-weight: 600;
    }
    #ohs-sidebar .nav { flex: 1; overflow-y: auto; padding: 6px 0 4px; }
    #ohs-sidebar .nav::-webkit-scrollbar { width: 4px; }
    #ohs-sidebar .nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 4px; }
    #ohs-sidebar .nav-section {
      font-size: 10px; font-weight: 700; color: rgba(255,255,255,.3);
      letter-spacing: 3px; text-transform: uppercase; padding: 16px 18px 6px;
    }
    #ohs-sidebar .nav-item {
      display: flex; align-items: center; gap: 11px;
      padding: 11px 16px 11px 15px;
      color: rgba(255,255,255,.65);
      cursor: pointer; transition: background .15s, color .15s;
      text-decoration: none; font-size: 14px;
      border-left: 3px solid transparent;
    }
    #ohs-sidebar .nav-item:hover { background: rgba(255,255,255,.07); color: #fff; }
    #ohs-sidebar .nav-item.active {
      background: rgba(255,255,255,.11); color: #fff; border-left-color: #f59840;
    }
    #ohs-sidebar .nav-icon { font-size: 17px; flex-shrink: 0; width: 20px; text-align: center; }

    /* Heat mini widget */
    #ohs-sidebar .hw-widget {
      margin: 6px 10px 10px; background: rgba(255,255,255,.07);
      border-radius: 12px; padding: 11px 13px 9px;
      border: 1px solid rgba(255,255,255,.1);
    }
    #ohs-sidebar .hw-hd {
      font-size: 10px; font-weight: 700; color: rgba(255,255,255,.45);
      letter-spacing: 1px; margin-bottom: 8px;
    }
    #ohs-sidebar .hw-loading { font-size: 11px; color: rgba(255,255,255,.3); text-align: center; padding: 4px 0 6px; }
    #ohs-sidebar .hw-vals   { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    #ohs-sidebar .hw-temp   { font-size: 22px; font-weight: 800; color: #fff; }
    #ohs-sidebar .hw-rh     { font-size: 12px; color: rgba(255,255,255,.45); }
    #ohs-sidebar .hw-badge  { margin-left: auto; padding: 2px 9px; border-radius: 9px; font-size: 11px; font-weight: 700; }
    #ohs-sidebar .hw-sub    { font-size: 10px; color: rgba(255,255,255,.35); margin-bottom: 7px; }
    #ohs-sidebar .hw-link {
      display: block; text-align: center; font-size: 11px;
      color: rgba(255,255,255,.4); text-decoration: none;
      padding: 4px; border-radius: 6px; background: rgba(255,255,255,.05);
      transition: background .15s;
    }
    #ohs-sidebar .hw-link:hover { background: rgba(255,255,255,.13); color: rgba(255,255,255,.8); }
    #ohs-sidebar .hw-err { font-size: 10px; color: rgba(255,100,100,.7); text-align: center; padding: 2px 0 5px; }

    /* Footer */
    #ohs-sidebar .sidebar-foot {
      flex-shrink: 0; padding: 10px 12px;
      border-top: 1px solid rgba(255,255,255,.08);
    }
    #ohs-sidebar .dark-btn {
      width: 100%; padding: 7px 10px; border-radius: 6px;
      border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.06);
      color: rgba(255,255,255,.6); font-size: 12px; cursor: pointer;
      transition: background .15s; display: flex; align-items: center;
      justify-content: center; gap: 7px; font-family: inherit;
    }
    #ohs-sidebar .dark-btn:hover { background: rgba(255,255,255,.13); color: #fff; }

    /* Backdrop */
    #ohs-backdrop {
      display: none; position: fixed; inset: 0; z-index: 199; background: rgba(0,0,0,.45);
    }
    #ohs-backdrop.show { display: block; }

    /* Desktop: shrink content area to leave room for sidebar */
    @media (min-width: 769px) {
      body { padding-left: var(--ohs-sidebar-w) !important; }
      /* Hide per-page floating dark toggle if present (sidebar provides one) */
      #dark-toggle { display: none !important; }
    }

    /* Mobile: sidebar slides in */
    @media (max-width: 768px) {
      #ohs-sidebar {
        transform: translateX(-100%);
        transition: transform .25s cubic-bezier(.4,0,.2,1);
      }
      #ohs-sidebar.open {
        transform: translateX(0); box-shadow: 8px 0 40px rgba(0,0,0,.4);
      }
      .ohs-menu-btn { display: inline-flex !important; }
    }

    /* Hamburger button injected into sub-page headers */
    .ohs-menu-btn {
      display: none; background: none; border: none; cursor: pointer;
      font-size: 24px; line-height: 1; padding: 2px 6px; flex-shrink: 0; margin-right: 4px;
    }
  `;
  document.head.appendChild(style);

  // ── Backdrop ──────────────────────────────────────────────────────────────
  const backdrop = document.createElement('div');
  backdrop.id = 'ohs-backdrop';
  document.body.insertBefore(backdrop, document.body.firstChild);

  // ── Sidebar HTML ──────────────────────────────────────────────────────────
  const sidebar = document.createElement('aside');
  sidebar.id = 'ohs-sidebar';
  sidebar.innerHTML = `
    <div class="brand">
      <img src="${BASE}上地球logo.png" alt="大豐環保科技">
      <div class="brand-sub">職安衛管理系統</div>
    </div>
    <nav class="nav">
      <a class="nav-item" href="${BASE}">
        <span class="nav-icon">🏠</span>首頁
      </a>

      <div class="nav-section">安全衛生</div>
      <a class="nav-item" href="${BASE}risk/" data-match="/risk/">
        <span class="nav-icon">⚠️</span>危害鑑別及風險評估
      </a>
      <a class="nav-item" href="${BASE}accident/" data-match="/accident/">
        <span class="nav-icon">📈</span>職業災害分析系統
      </a>
      <a class="nav-item" href="${BASE}news/" data-match="/news/">
        <span class="nav-icon">📰</span>職災情報與安衛動態
      </a>

      <div class="nav-section">機械設備及化學品</div>
      <a class="nav-item" href="${BASE}equipment/" data-match="/equipment/">
        <span class="nav-icon">⚙️</span>機械設備管理
      </a>
      <a class="nav-item" href="${BASE}chemical/" data-match="/chemical/">
        <span class="nav-icon">⚗️</span>危害性化學品管理
      </a>
      <a class="nav-item" href="https://check-system.gm.zerozero.tw/dashboard" target="_blank">
        <span class="nav-icon">📋</span>自動點檢系統
      </a>

      <div class="nav-section">人員管理</div>
      <a class="nav-item" href="${BASE}contract/" data-match="/contract/">
        <span class="nav-icon">🏗️</span>承攬商管理系統
      </a>
      <a class="nav-item" href="${BASE}nurse/" data-match="/nurse/">
        <span class="nav-icon">🏥</span>職護臨場服務
      </a>
      <a class="nav-item" href="https://hr-corptraining.zerozero.tw/certificates" target="_blank">
        <span class="nav-icon">🪪</span>證照管理
      </a>
      <a class="nav-item" href="${BASE}training/" data-match="/training/">
        <span class="nav-icon">🎓</span>教育訓練教材庫
      </a>

      <div class="nav-section">制度文件</div>
      <a class="nav-item" href="${BASE}law/" data-match="/law/">
        <span class="nav-icon">📋</span>法規鑑別查詢系統
      </a>
      <a class="nav-item" href="${BASE}monitoring/" data-match="/monitoring/">
        <span class="nav-icon">🔬</span>作業環境監測
      </a>
      <a class="nav-item" href="${BASE}committee/" data-match="/committee/">
        <span class="nav-icon">📊</span>安全衛生委員會
      </a>
      <a class="nav-item" href="${BASE}plans/" data-match="/plans/">
        <span class="nav-icon">🗂️</span>職業安全衛生計畫書
      </a>

      <div class="nav-section">四大防護計畫</div>
      <a class="nav-item" href="${BASE}ergonomic/" data-match="/ergonomic/">
        <span class="nav-icon">🧍</span>人因性危害預防
      </a>
      <a class="nav-item" href="${BASE}overload/" data-match="/overload/">
        <span class="nav-icon">😰</span>異常工作負荷預防
      </a>
      <a class="nav-item" href="${BASE}harassment/" data-match="/harassment/">
        <span class="nav-icon">🛡️</span>不法侵害防治系統
      </a>
      <a class="nav-item" href="${BASE}maternity/" data-match="/maternity/">
        <span class="nav-icon">🤰</span>母性健康保護
      </a>
      <a class="nav-item" href="${BASE}fourplans/admin/" data-match="/fourplans/">
        <span class="nav-icon">🩺</span>四大計畫管理後台
      </a>

      <div class="nav-section">消防</div>
      <a class="nav-item" href="${BASE}fire/" data-match="/fire/">
        <span class="nav-icon">🧯</span>消防管理
      </a>

      <div class="nav-section">個人工具</div>
      <a class="nav-item" href="${BASE}tasks/" data-match="/tasks/">
        <span class="nav-icon">✅</span>職安工作中樞
      </a>

      <div class="nav-section">小工具</div>
      <a class="nav-item" href="${BASE}law/?chat=1">
        <span class="nav-icon">⚖️</span>法規問答機器人
      </a>
      <a class="nav-item" href="${BASE}risk/?chat=1">
        <span class="nav-icon">🔍</span>風險評估機器人
      </a>
      <a class="nav-item" href="${BASE}chemical/?chat=1">
        <span class="nav-icon">🧪</span>化學品緊急應變機器人
      </a>
      <a class="nav-item" href="${BASE}harassment/?chat=1">
        <span class="nav-icon">🤝</span>霸凌行為諮詢
      </a>

      <div class="hw-widget">
        <div class="hw-hd">🌡️ 即時熱危害</div>
        <div id="ohs-hw-body"><div class="hw-loading">定位中…</div></div>
        <a class="hw-link" href="${BASE}heat/">查看詳情 →</a>
      </div>
    </nav>
    <div class="sidebar-foot">
      <button class="dark-btn" id="ohs-dark-btn">🌙 切換深色模式</button>
    </div>
  `;
  document.body.insertBefore(sidebar, backdrop.nextSibling);

  // ── Active nav item ───────────────────────────────────────────────────────
  const path = location.pathname;
  sidebar.querySelectorAll('.nav-item[data-match]').forEach(function (a) {
    if (path.includes(a.getAttribute('data-match'))) {
      a.classList.add('active');
    }
  });

  // ── Mobile hamburger button ───────────────────────────────────────────────
  var header = document.querySelector('header');
  if (header) {
    var menuBtn = document.createElement('button');
    menuBtn.className = 'ohs-menu-btn';
    menuBtn.setAttribute('aria-label', '開啟選單');
    menuBtn.textContent = '☰';
    menuBtn.onclick = openSidebar;
    header.insertBefore(menuBtn, header.firstChild);
  }

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('show');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
  }
  backdrop.onclick = closeSidebar;
  sidebar.querySelectorAll('.nav-item').forEach(function (a) {
    a.addEventListener('click', function () { if (window.innerWidth <= 768) closeSidebar(); });
  });

  // ── Dark mode ─────────────────────────────────────────────────────────────
  var darkBtn = document.getElementById('ohs-dark-btn');
  function applyDark(isDark) {
    document.body.classList.toggle('dark', isDark);
    darkBtn.textContent = isDark ? '☀️ 切換淺色模式' : '🌙 切換深色模式';
  }
  applyDark(localStorage.getItem('portal-dark') === '1');
  darkBtn.onclick = function () {
    var isDark = !document.body.classList.contains('dark');
    localStorage.setItem('portal-dark', isDark ? '1' : '0');
    applyDark(isDark);
  };

  // ── Heat mini widget ──────────────────────────────────────────────────────
  (function () {
    var KEY = 'CWA-6A18801C-3D96-4113-93F6-8198BD0712F2';
    var API = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=' + KEY + '&format=JSON';
    var WL = [{label:'低',min:-Infinity,max:25,bg:'#dcfce7',cl:'#15803d'},
              {label:'中',min:25,max:28,bg:'#fef9c3',cl:'#854d0e'},
              {label:'高',min:28,max:30,bg:'#ffedd5',cl:'#9a3412'},
              {label:'極高',min:30,max:Infinity,bg:'#fee2e2',cl:'#991b1b'}];
    var HL = [{label:'安全',    min:-Infinity,max:26.7, bg:'#dcfce7',cl:'#15803d'},
              {label:'注意',    min:26.7,max:32.2,      bg:'#f7fee7',cl:'#3f6212'},
              {label:'格外注意',min:32.2,max:40.6,      bg:'#fef9c3',cl:'#854d0e'},
              {label:'危險',    min:40.6,max:54.4,      bg:'#ffedd5',cl:'#9a3412'},
              {label:'極度危險',min:54.4,max:Infinity,  bg:'#fee2e2',cl:'#991b1b'}];
    function wbgt(T,RH){var Tw=T*Math.atan(0.151977*Math.sqrt(RH+8.313659))+Math.atan(T+RH)-Math.atan(RH-1.676331)+0.00391838*Math.pow(RH,1.5)*Math.atan(0.023101*RH)-4.686035;return +(0.7*Tw+0.3*T).toFixed(1);}
    function hi(T,RH){var Tf=T*9/5+32;var H=Tf<80?0.5*(Tf+61+(Tf-68)*1.2+RH*0.094):-42.379+2.04901523*Tf+10.14333127*RH-0.22475541*Tf*RH-0.00683783*Tf*Tf-0.05481717*RH*RH+0.00122874*Tf*Tf*RH+0.00085282*Tf*RH*RH-0.00000199*Tf*Tf*RH*RH;return +((H-32)*5/9).toFixed(1);}
    function lv(arr,v){return arr.find(function(l){return v>=l.min&&v<l.max;})||arr[arr.length-1];}
    function haversine(a,b,c,d){var R=6371,r=Math.PI/180;var x=Math.sin((c-a)*r/2)*Math.sin((c-a)*r/2)+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)*Math.sin((d-b)*r/2);return R*2*Math.asin(Math.sqrt(x));}
    function setBody(html){var el=document.getElementById('ohs-hw-body');if(el)el.innerHTML=html;}
    function badge(l){return '<span class="hw-badge" style="background:'+l.bg+';color:'+l.cl+'">'+l.label+'</span>';}
    if(!navigator.geolocation){setBody('<div class="hw-err">不支援定位</div>');return;}
    navigator.geolocation.getCurrentPosition(function(pos){
      fetch(API).then(function(r){return r.json();}).then(function(j){
        var best=null,md=Infinity;
        var stations=j.records&&j.records.Station?j.records.Station:[];
        for(var i=0;i<stations.length;i++){
          var s=stations[i];
          var coords=s.GeoInfo&&s.GeoInfo.Coordinates?s.GeoInfo.Coordinates:[];
          var c=coords.find(function(x){return x.CoordinateName==='WGS84';});
          if(!c)continue;
          var T=+s.WeatherElement.AirTemperature,RH=+s.WeatherElement.RelativeHumidity;
          if(!isFinite(T)||!isFinite(RH)||T<-50||RH<0)continue;
          var d=haversine(pos.coords.latitude,pos.coords.longitude,+c.StationLatitude,+c.StationLongitude);
          if(d<md){md=d;best={T:T,RH:RH};}
        }
        if(!best){setBody('<div class="hw-err">無氣象站資料</div>');return;}
        var w=wbgt(best.T,best.RH),h=hi(best.T,best.RH);
        var wl=lv(WL,w),hl=lv(HL,h);
        var ranked=[wl,hl];
        var order=['極高','極度危險','危險','高','格外注意','中','注意','安全','低'];
        ranked.sort(function(a,b){return order.indexOf(a.label)-order.indexOf(b.label);});
        var worst=ranked[0];
        setBody(
          '<div class="hw-vals">'+
            '<span class="hw-temp">'+best.T.toFixed(1)+'°</span>'+
            '<span class="hw-rh">'+Math.round(best.RH)+'%</span>'+
            badge(worst)+
          '</div>'+
          '<div class="hw-sub">WBGT '+w+'°C ('+wl.label+') · HI '+h+'°C ('+hl.label+')</div>'
        );
      }).catch(function(){setBody('<div class="hw-err">資料載入失敗</div>');});
    },function(){setBody('<div class="hw-err">位置存取被拒</div>');},{timeout:10000,maximumAge:300000});
  })();

})();
