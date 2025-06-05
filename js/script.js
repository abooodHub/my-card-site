// خوادم كل مشغل (ثلاثة خوادم كحد أقصى لكل شركة)
const serverGroups = {
  'STC': [
    { id: 'stc1', name: 'STC - الرياض', url: 'wss://speedtest.saudi.net.sa:8080/ws?' },
    { id: 'stc2', name: 'STC - جدة',   url: 'wss://jed-speedtest.saudi.net.sa:8080/ws?' },
    { id: 'stc3', name: 'STC - الدمام', url: 'wss://dam-speedtest.saudi.net.sa:8080/ws?' }
  ],
  'Mobily': [
    { id: 'mobily-riyadh', name: 'Mobily - Riyadh', url: 'wss://ryd.myspeed.net.sa.prod.hosts.ooklaserver.net:8080/ws?' },
    { id: 'mobily-yanbu',  name: 'Mobily - Yanbu',  url: 'wss://ynb.myspeed.net.sa.prod.hosts.ooklaserver.net:8080/ws?' },
    { id: 'mobily-jeddah', name: 'Mobily - Jeddah', url: 'wss://jed.myspeed.net.sa.prod.hosts.ooklaserver.net:8080/ws?' }
  ],
  'Zain KSA': [
    { id: 'zain-riyadh', name: 'Zain KSA - الرياض', url: 'wss://speedtest-riyadhnew.sa.zain.com.prod.hosts.ooklaserver.net:8080/ws?' },
    { id: 'zain-jeddah', name: 'Zain KSA - جدة',   url: 'wss://speedtest-jeddahnew.sa.zain.com.prod.hosts.ooklaserver.net:8080/ws?' },
    { id: 'zain-makkah', name: 'Zain KSA - مكة',    url: 'wss://speedtest-makkah.sa.zain.com.prod.hosts.ooklaserver.net:8080/ws?' }
  ],
  'GO Telecom': [
    { id: 'go-riyadh', name: 'GO Telecom - الرياض', url: 'wss://speedtest.go.com.sa.prod.hosts.ooklaserver.net:8080/ws?' },
    { id: 'go-jeddah', name: 'GO Telecom - جدة',   url: 'wss://hispeedtest.go.com.sa.prod.hosts.ooklaserver.net:8080/ws?' },
  ],
  'Salam': [
    { id: 'salam-riyadh', name: 'Salam - الرياض', url: 'wss://ftthspeed-ruh.salam.sa.prod.hosts.ooklaserver.net:8080/ws?' },
    { id: 'salam-jeddah', name: 'Salam - جدة',   url: 'wss://jed-speed.itc.net.sa.prod.hosts.ooklaserver.net:8080/ws?' },
    { id: 'salam-khobar', name: 'Salam - الخبر', url: 'wss://speedtest-kbr.salam.sa.prod.hosts.ooklaserver.net:8080/ws?' }
  ]
};

// المصفوفة الحالية للخوادم المعروضة بناءً على المشغل المختار
let currentServers = [];
// كائن لتخزين مثيلات WebSocket الجارية للخوادم المعروضة
let activeSockets = {};
// مؤشر البداية لعرض الدفعات (ثلاثة خوادم)
let batchStartIndex = 0;
// حجم الدفعة (ثلاثة خوادم)
const BATCH_SIZE = 3;
// مدة العدّ التنازلي بالثواني
const COUNTDOWN_SECONDS = 4;
// متغير لتخزين قيمة العدّ الحالية
let countdownValue = COUNTDOWN_SECONDS;
// معرف مؤقت العدّ التنازلي
let countdownIntervalId = null;
// معرف مؤقت تحديث الدفعات
let batchIntervalId = null;

// عند اختيار مشغل معين
function selectOperator(operatorName) {
  // إذا كان هناك مؤقت للدفعات قائم، أوقفه
  if (batchIntervalId) {
    clearInterval(batchIntervalId);
    batchIntervalId = null;
  }
  // إذا كان هناك مؤقت للعدّ التنازلي قائم، أوقفه
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }

  // ضبط الخوادم الحالية حسب المشغل المختار
  currentServers = serverGroups[operatorName] || [];

  // إعادة تعيين مؤشر الدفعة وإغلاق جميع الاتصالات القديمة
  batchStartIndex = 0;
  closeAllSockets();

  // تفريغ الحاوية من البطاقات القديمة
  document.getElementById('servers-container').innerHTML = '';

  // إعادة ضبط العدّ التنازلي
  resetCountdown();

  // عرض أول دفعة على الفور وبدء مؤقت لتحديث الدفعات كل 4 ثوانٍ
  updateBatch();
  batchIntervalId = setInterval(() => {
    updateBatch();
    resetCountdown(); // إعادة ضبط العدّ بعد كل تحديث دفعة
  }, COUNTDOWN_SECONDS * 1000);

  // بدء العدّ التنازلي بالتزامن مع بدء الدفعات
  startCountdown();
}

// دالة لإغلاق جميع WebSocket الحالية
function closeAllSockets() {
  for (let id in activeSockets) {
    try {
      activeSockets[id].close();
    } catch (e) {
      // تجاهل الأخطاء عند الإغلاق
    }
  }
  activeSockets = {};
}

// دالة لإنشاء بطاقة خادم جديدة
function createServerCard(server) {
  const card = document.createElement('div');
  card.classList.add('server');
  card.id = server.id;

  const title = document.createElement('h2');
  title.textContent = server.name;
  card.appendChild(title);

  const output = document.createElement('div');
  output.classList.add('output');
  output.id = `${server.id}-output`;
  output.textContent = 'لم يبدأ الاتصال بعد';
  card.appendChild(output);

  return card;
}

// دالة لفتح اتصال WebSocket وعرض النتائج
function openSocket(server) {
  const outputEl = document.getElementById(`${server.id}-output`);

  // إذا وُجد اتصال سابق للخادم، أغلقه
  if (activeSockets[server.id]) {
    try {
      activeSockets[server.id].close();
    } catch (e) {
      // تجاهل الأخطاء
    }
  }

  // عرض حالة الانتظار
  outputEl.textContent = 'جارٍ الاتصال...';

  // إنشاء اتصال WebSocket جديد
  const ws = new WebSocket(server.url);
  activeSockets[server.id] = ws;

  ws.onopen = () => {
    outputEl.textContent = 'تم الاتصال بنجاح\n';
  };
  ws.onmessage = (event) => {
    outputEl.textContent = `البيانات الواردة:\n${event.data}`;
  };
  ws.onclose = (event) => {
    outputEl.textContent += `\nتم إغلاق الاتصال (الرمز: ${event.code})`;
  };
  ws.onerror = () => {
    outputEl.textContent += '\nحدث خطأ أثناء الاتصال';
  };
}

// دالة لتحديث وعرض الدفعة الحالية من الخوادم (ثلاثة فقط)
function updateBatch() {
  const container = document.getElementById('servers-container');
  // إغلاق الاتصالات القديمة ومسح البطاقات
  closeAllSockets();
  container.innerHTML = '';

  // إذا لم توجد خوادم لهذا المشغل، أعرض رسالة
  if (currentServers.length === 0) {
    const msg = document.createElement('div');
    msg.classList.add('no-servers');
    msg.textContent = 'لا توجد خوادم متاحة لهذا المشغل.';
    container.appendChild(msg);
    return;
  }

  // حساب نهاية الدفعة الحالية (ثلاثة خوادم كحد أقصى)
  const endIndex = Math.min(batchStartIndex + BATCH_SIZE, currentServers.length);

  // إنشاء بطاقة لكل خادم في الدفعة الحالية وفتح اتصال WebSocket
  for (let i = batchStartIndex; i < endIndex; i++) {
    const server = currentServers[i];
    const card = createServerCard(server);
    container.appendChild(card);
    openSocket(server);
  }

  // تحديث مؤشر البداية للدفعة التالية (مع التدوير)
  batchStartIndex = endIndex < currentServers.length ? endIndex : 0;
}

// دالة لإعادة ضبط قيمة العدّ التنازلي
function resetCountdown() {
  countdownValue = COUNTDOWN_SECONDS;
  document.getElementById('count').textContent = countdownValue;
}

// دالة لبدء العدّ التنازلي وعرضه
function startCountdown() {
  // تأكد من إيقاف أي مؤقت سابق
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
  }
  // إعادة ضبط القيمة وعرضها
  resetCountdown();
  // بدء مؤقت يقلّل القيمة كل ثانية
  countdownIntervalId = setInterval(() => {
    countdownValue--;
    if (countdownValue <= 0) {
      // عندما يصل إلى الصفر، يُعاد ضبطه إلى القيمة الابتدائية
      countdownValue = COUNTDOWN_SECONDS;
    }
    document.getElementById('count').textContent = countdownValue;
  }, 1000);
}
