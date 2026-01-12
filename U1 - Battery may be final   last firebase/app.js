// TODO: Replace with your Firebase project configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase (Compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

document.addEventListener('DOMContentLoaded', () => {

    // Splash Screen Logic
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.style.opacity = '0';
            splash.style.visibility = 'hidden';
        }
    }, 2000);

    // Audio Logic
    const audioBlip = document.getElementById('audio-blip');
    const audioAlert = document.getElementById('audio-alert');

    document.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'A') {
            if (audioBlip) {
                audioBlip.currentTime = 0;
                audioBlip.play().catch(err => console.log('Audio play blocked', err));
            }
        }
    });

    const MAX_CHART_POINTS = 30;    // for side analytics charts
    const HISTORY_MAX_POINTS = 500; // per series
    let client = null;              // MQTT client
    let historyChartInstance = null;
    let realTimeCharts = {};
    let graphsChart = null;

    let activeGraphsTabKey = 'solar';
    let activeMetricMode = 'p'; // 'p', 'v', 'i', 'all'

    // ===== HISTORY STORE =====
    // each entry: { t: timestamp, p: power, v: voltage, i: current }
    // batterySoc: { t, v } where v is SoC
    let historyStore = {
        solar: [],
        thermal: [],
        battery: [],
        batterySoc: [],
        loadLow: [],
        loadMed: [],
        loadHigh: []
    };

    let customGraphConfigs = {
        custom1: { name: 'Custom 1', sourceKey: 'solar', metrics: ['p'] },
        custom2: { name: 'Custom 2', sourceKey: 'battery', metrics: ['p', 'v'] },
        custom3: { name: 'Custom 3', sourceKey: 'loadLow', metrics: ['p'] }
    };

    // ===== NEW: GLOBAL SETTINGS =====
    let globalSettings = {
        names: {
            source1: 'Solar',
            source2: 'Thermal',
            source3: 'Battery',
            load1: 'Low Priority Load',
            load2: 'Medium Priority Load',
            load3: 'High Priority Load'
        },
        billRate: 0,
        billSource: 'solar', // 'solar', 'thermal', 'loads'
        historyVisibility: {
            solar: true,
            thermal: true,
            battery: true,
            loadLow: true,
            loadMed: true,
            loadHigh: true
        },
        batteryVisual: 1
    };

    // ===== RANDOM MODE STATE =====
    let randomRunning = false;
    let randomTimerId = null;

    // ===== 1. DOM REFERENCES =====
    const mainContainer = document.querySelector('.container');

    // Sidebar / navigation
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const pageContents = document.querySelectorAll('.page-content');
    const toggleAnalyticsBtn = document.getElementById('btn-toggle-analytics');
    const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');

    // Settings
    const themeLightBtn = document.getElementById('btn-theme-light');
    const themeDarkBtn = document.getElementById('btn-theme-dark');
    const titleInput = document.getElementById('site-title-input');
    const titleSaveBtn = document.getElementById('btn-save-title');
    const titleDisplay = document.getElementById('site-title-display');
    const colorPicker = document.getElementById('accent-color-picker');
    const colorValueDisplay = document.getElementById('color-value-display');
    const layoutCompactBtn = document.getElementById('btn-layout-compact');
    const layoutWideBtn = document.getElementById('btn-layout-wide');
    const colorThemeButtons = document.querySelectorAll('.btn-color-theme');
    const bgSelector = document.getElementById('bg-selector');
    const transparencySlider = document.getElementById('transparency-slider');
    const chartStyleToggle = document.getElementById('chart-style-toggle');
    const logoUploader = document.getElementById('logo-uploader');
    const presetLifi = document.getElementById('preset-lifi');
    const presetSolar = document.getElementById('preset-solar');
    const btnGenerateQr = document.getElementById('btn-generate-qr');
    const qrContainer = document.getElementById('qr-code-container');

    // Tiles on Home
    const editTilesBtn = document.getElementById('btn-edit-tiles');
    const editableTitles = document.querySelectorAll('.editable-title');

    // History modal
    const historyModalBackdrop = document.getElementById('history-modal-backdrop');
    const historyModalCloseBtn = document.getElementById('history-modal-close');
    const historyGraphButtons = document.querySelectorAll('.btn-history-graph');
    const historyModalTitle = document.getElementById('history-modal-title');
    const historyChartCanvas = document.getElementById('historyChartCanvas');

    // MQTT
    const connectBtn = document.getElementById('btn-connect');
    const disconnectBtn = document.getElementById('btn-disconnect');
    const statusBadge = document.getElementById('mqtt-status');
    const brokerUrlInput = document.getElementById('broker-url');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const namespaceInput = document.getElementById('namespace');
    const deviceIdInput = document.getElementById('device-id');

    // Control Panel
    const loadToggleButtons = document.querySelectorAll('.btn-toggle-cmd');
    const modeButtons = document.querySelectorAll('.mode-control .btn');

    // Graphs page
    const graphsTabButtons = document.querySelectorAll('.graphs-tab-btn');
    const graphsMetricButtons = document.querySelectorAll('.graphs-metric-btn');
    const graphsTitleEl = document.getElementById('graphs-active-title');
    const graphsCurrentEl = document.getElementById('graphs-current-values');
    const graphsCustomConfigEl = document.getElementById('graphs-custom-config');
    const customNameInput = document.getElementById('custom-tab-name');
    const customSourceSelect = document.getElementById('custom-tab-source');
    const customMetricsSelect = document.getElementById('custom-tab-metrics');
    const customSaveBtn = document.getElementById('custom-tab-save');

    // Test page: manual
    const testApplyBtn = document.getElementById('btn-test-apply');
    const testSolarPower = document.getElementById('test-solar-power');
    const testSolarVolt = document.getElementById('test-solar-volt');
    const testThermalPower = document.getElementById('test-thermal-power');
    const testThermalVolt = document.getElementById('test-thermal-volt');
    const testBattPower = document.getElementById('test-batt-power');
    const testBattVolt = document.getElementById('test-batt-volt');
    const testBattSoc = document.getElementById('test-batt-soc');
    const testLoadLowPower = document.getElementById('test-load-low-power');
    const testLoadMedPower = document.getElementById('test-load-med-power');
    const testLoadHighPower = document.getElementById('test-load-high-power');

    // Test page: random
    const randomToggleBtn = document.getElementById('btn-random-toggle');
    const randomSettingsToggleBtn = document.getElementById('btn-random-settings-toggle');
    const randomStatusLabel = document.getElementById('random-status-label');
    const randomSettingsPanel = document.getElementById('random-settings-panel');

    // Random config inputs
    const randSolarPowerEnabled = document.getElementById('rand-solar-power-enabled');
    const randSolarPowerMin = document.getElementById('rand-solar-power-min');
    const randSolarPowerMax = document.getElementById('rand-solar-power-max');

    const randThermalPowerEnabled = document.getElementById('rand-thermal-power-enabled');
    const randThermalPowerMin = document.getElementById('rand-thermal-power-min');
    const randThermalPowerMax = document.getElementById('rand-thermal-power-max');

    const randBattSocEnabled = document.getElementById('rand-batt-soc-enabled');
    const randBattSocMin = document.getElementById('rand-batt-soc-min');
    const randBattSocMax = document.getElementById('rand-batt-soc-max');

    const randSolarVoltFixed = document.getElementById('rand-solar-voltage-fixed');
    const randThermalVoltFixed = document.getElementById('rand-thermal-voltage-fixed');
    const randBattVoltFixed = document.getElementById('rand-batt-voltage-fixed');

    const randLoadLowEnabled = document.getElementById('rand-load-low-enabled');
    const randLoadLowMin = document.getElementById('rand-load-low-min');
    const randLoadLowMax = document.getElementById('rand-load-low-max');

    const randLoadMedEnabled = document.getElementById('rand-load-med-enabled');
    const randLoadMedMin = document.getElementById('rand-load-med-min');
    const randLoadMedMax = document.getElementById('rand-load-med-max');

    const randLoadHighEnabled = document.getElementById('rand-load-high-enabled');
    const randLoadHighMin = document.getElementById('rand-load-high-min');
    const randLoadHighMax = document.getElementById('rand-load-high-max');

    const isEditingTiles = false; // Deprecated with new Rename feature, but keeping for compatibility if needed

    // New DOM Elements
    const renameInputs = {
        source1: document.getElementById('rename-source1'),
        source2: document.getElementById('rename-source2'),
        source3: document.getElementById('rename-source3'),
        load1: document.getElementById('rename-load1'),
        load2: document.getElementById('rename-load2'),
        load3: document.getElementById('rename-load3')
    };
    const btnSaveRenames = document.getElementById('btn-save-renames');

    const billRateInput = document.getElementById('bill-rate-input');
    const btnSaveRate = document.getElementById('btn-save-rate');
    const billEstDisplay = document.getElementById('hist-bill-est');

    const visualOptions = document.querySelectorAll('.visual-option');
    const homeBattVisual = document.getElementById('home-batt-visual');
    const cpBattVisual = document.getElementById('cp-batt-visual');
    const homeBattStatus = document.getElementById('home-batt-status');
    const cpBattStatus = document.getElementById('cp-batt-status');

    const btnExportCsv = document.getElementById('btn-export-csv');
    function setupFirebaseListeners() {
        // 1. Settings
        db.ref('settings').on('value', (snapshot) => {
            const val = snapshot.val();
            if (val) {
                globalSettings = { ...globalSettings, ...val };

                // Apply Names
                applyGlobalNames();

                // Apply Bill Settings
                if (billRateInput) billRateInput.value = globalSettings.billRate;
                const billSourceRadios = document.querySelectorAll('input[name="bill-source"]');
                billSourceRadios.forEach(r => {
                    if (r.value === globalSettings.billSource) r.checked = true;
                });

                // Apply History Visibility
                const histToggles = document.querySelectorAll('.hist-toggle');
                histToggles.forEach(t => {
                    if (globalSettings.historyVisibility[t.value] !== undefined) {
                        t.checked = globalSettings.historyVisibility[t.value];
                    }
                });
                updateHistoryVisibility();

                // Apply Visuals
                updateVisualSelectionUI();
                const lastBatt = historyStore.battery[historyStore.battery.length - 1];
                const lastSoc = historyStore.batterySoc[historyStore.batterySoc.length - 1];
                updateBatteryVisuals(lastBatt ? lastBatt.p : 0, lastSoc ? lastSoc.v : 0);
            }
        });

        // 2. Custom Graphs
        db.ref('customGraphs').on('value', (snapshot) => {
            const val = snapshot.val();
            if (val) {
                customGraphConfigs = val;
                graphsTabButtons.forEach(btn => {
                    const key = btn.dataset.key;
                    if (key && customGraphConfigs[key] && btn.classList.contains('custom')) {
                        btn.textContent = customGraphConfigs[key].name;
                    }
                });
                refreshGraphsPanel();
            }
        });

        // 3. Latest Data (Live Sync)
        db.ref('latest').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) renderUI(data);
        });

        // 4. History Listeners
        const setupHistoryListener = (key, storeArr) => {
            const q = db.ref(`history/${key}`).limitToLast(HISTORY_MAX_POINTS);
            q.on('child_added', (snapshot) => {
                const val = snapshot.val();
                if (val) {
                    storeArr.push(val);
                    if (storeArr.length > HISTORY_MAX_POINTS) storeArr.shift();
                    updateHistorySummary();
                    refreshGraphsPanel();

                    // Update side analytics charts
                    if (key === 'batterySoc' && realTimeCharts.battery) addDataToChart(realTimeCharts.battery, { x: val.t, y: val.v });
                    if (key === 'loadLow' && realTimeCharts.lowLoad) addDataToChart(realTimeCharts.lowLoad, { x: val.t, y: val.p });
                    if (key === 'loadMed' && realTimeCharts.medLoad) addDataToChart(realTimeCharts.medLoad, { x: val.t, y: val.p });
                    if (key === 'loadHigh' && realTimeCharts.highLoad) addDataToChart(realTimeCharts.highLoad, { x: val.t, y: val.p });
                }
            });
        };

        setupHistoryListener('solar', historyStore.solar);
        setupHistoryListener('thermal', historyStore.thermal);
        setupHistoryListener('battery', historyStore.battery);
        setupHistoryListener('batterySoc', historyStore.batterySoc);
        setupHistoryListener('loadLow', historyStore.loadLow);
        setupHistoryListener('loadMed', historyStore.loadMed);
        setupHistoryListener('loadHigh', historyStore.loadHigh);
    }

    function saveGlobalSettings() {
        db.ref('settings').set(globalSettings);
    }

    function saveCustomGraphs() {
        db.ref('customGraphs').set(customGraphConfigs);
    }

    // Load local preferences (Theme/Layout) - these remain local
    function loadLocalPreferences() {
        const savedTheme = localStorage.getItem('dashboardTheme') || 'light';
        setThemeMode(savedTheme);

        const savedAccent = localStorage.getItem('dashboardAccent') || '#6a5af9';
        setAccentColor(savedAccent);
        if (colorPicker) colorPicker.value = savedAccent;

        colorThemeButtons.forEach(btn => {
            if (btn.dataset.color &&
                btn.dataset.color.toLowerCase() === savedAccent.toLowerCase()) {
                btn.classList.add('active');
            }
        });

        const savedLayout = localStorage.getItem('dashboardLayout') || 'compact';
        setLayout(savedLayout);

        const savedTitle = localStorage.getItem('dashboardTitle') || 'Team Spark - Load Manager';
        if (titleInput) titleInput.value = savedTitle;
        if (titleDisplay) titleDisplay.textContent = savedTitle;

        const analyticsHidden = localStorage.getItem('analyticsHidden') === 'true';
        setAnalyticsVisibility(!analyticsHidden);

        const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        setSidebarCollapsed(sidebarCollapsed);

        const savedBg = localStorage.getItem('dashboardBg');
        if (savedBg && savedBg !== 'default') {
            document.body.classList.add(`bg-${savedBg}`);
            if (bgSelector) bgSelector.value = savedBg;
        }

        const savedTransparency = localStorage.getItem('dashboardTransparency');
        if (savedTransparency) {
            document.documentElement.style.setProperty('--card-opacity', savedTransparency);
            if (transparencySlider) transparencySlider.value = savedTransparency;
        }

        const savedChartSmooth = localStorage.getItem('dashboardChartSmooth') === 'true';
        if (chartStyleToggle) chartStyleToggle.checked = savedChartSmooth;

        const savedLogo = localStorage.getItem('dashboardLogo');
        if (savedLogo) {
            const titleEl = document.getElementById('site-title-display');
            if (titleEl) {
                titleEl.innerHTML = `<img src="${savedLogo}" style="max-height: 40px; vertical-align: middle;">`;
            }
        }

        renderVisualPreviews();
    }

    // Theme/layout handlers
    function setThemeMode(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            if (themeLightBtn) themeLightBtn.classList.remove('active');
            if (themeDarkBtn) themeDarkBtn.classList.add('active');
        } else {
            document.body.classList.remove('dark-mode');
            if (themeLightBtn) themeLightBtn.classList.add('active');
            if (themeDarkBtn) themeDarkBtn.classList.remove('active');
        }
        localStorage.setItem('dashboardTheme', theme);
    }

    function setAccentColor(hex) {
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        }

        const root = document.documentElement;
        root.style.setProperty('--color-primary', hex);
        root.style.setProperty('--color-primary-light', `rgba(${r}, ${g}, ${b}, 0.15)`);

        if (colorValueDisplay) {
            colorValueDisplay.textContent = `rgb(${r}, ${g}, ${b})`;
        }
        localStorage.setItem('dashboardAccent', hex);
    }

    function setLayout(layout) {
        if (!mainContainer) return;
        if (layout === 'wide') {
            mainContainer.classList.remove('layout-compact');
            mainContainer.classList.add('layout-wide');
            if (layoutCompactBtn) layoutCompactBtn.classList.remove('active');
            if (layoutWideBtn) layoutWideBtn.classList.add('active');
        } else {
            mainContainer.classList.remove('layout-wide');
            mainContainer.classList.add('layout-compact');
            if (layoutCompactBtn) layoutCompactBtn.classList.add('active');
            if (layoutWideBtn) layoutWideBtn.classList.remove('active');
        }
        localStorage.setItem('dashboardLayout', layout);
    }

    function setAnalyticsVisibility(show) {
        if (!mainContainer || !toggleAnalyticsBtn) return;
        const icon = '📊';
        if (show) {
            mainContainer.classList.remove('analytics-hidden');
            toggleAnalyticsBtn.innerHTML = `<span class="text">Hide Analytics</span>`;
            toggleAnalyticsBtn.setAttribute('data-icon', icon);
            localStorage.setItem('analyticsHidden', 'false');
        } else {
            mainContainer.classList.add('analytics-hidden');
            toggleAnalyticsBtn.innerHTML = `<span class="text">Show Analytics</span>`;
            toggleAnalyticsBtn.setAttribute('data-icon', icon);
            localStorage.setItem('analyticsHidden', 'true');
        }
    }

    function setSidebarCollapsed(collapsed) {
        if (!mainContainer) return;
        if (collapsed) {
            mainContainer.classList.add('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', 'true');
        } else {
            mainContainer.classList.remove('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', 'false');
        }
    }

    // Settings event listeners
    if (themeLightBtn) themeLightBtn.addEventListener('click', () => setThemeMode('light'));
    if (themeDarkBtn) themeDarkBtn.addEventListener('click', () => setThemeMode('dark'));
    if (layoutCompactBtn) layoutCompactBtn.addEventListener('click', () => setLayout('compact'));
    if (layoutWideBtn) layoutWideBtn.addEventListener('click', () => setLayout('wide'));

    if (titleSaveBtn && titleInput && titleDisplay) {
        titleSaveBtn.addEventListener('click', () => {
            const newTitle = titleInput.value;
            titleDisplay.textContent = newTitle;
            localStorage.setItem('dashboardTitle', newTitle);
        });
    }

    if (toggleAnalyticsBtn) {
        toggleAnalyticsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const isHidden = mainContainer.classList.contains('analytics-hidden');
            setAnalyticsVisibility(isHidden);
        });
    }

    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', () => {
            const isCollapsed = mainContainer.classList.contains('sidebar-collapsed');
            setSidebarCollapsed(!isCollapsed);
        });
    }

    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => {
            setAccentColor(e.target.value);
            colorThemeButtons.forEach(btn => btn.classList.remove('active'));
        });
    }

    colorThemeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const hex = btn.dataset.color;
            if (!hex) return;
            setAccentColor(hex);
            if (colorPicker) colorPicker.value = hex;
            colorThemeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Advanced Visuals Listeners
    if (bgSelector) {
        bgSelector.addEventListener('change', (e) => {
            const style = e.target.value;
            document.body.className = document.body.className.replace(/bg-\w+/g, '').trim();
            if (style !== 'default') document.body.classList.add(`bg-${style}`);
            localStorage.setItem('dashboardBg', style);
        });
    }

    if (transparencySlider) {
        transparencySlider.addEventListener('input', (e) => {
            const val = e.target.value;
            document.documentElement.style.setProperty('--card-opacity', val);
            localStorage.setItem('dashboardTransparency', val);
        });
    }

    if (chartStyleToggle) {
        chartStyleToggle.addEventListener('change', (e) => {
            const smooth = e.target.checked;
            const tension = smooth ? 0.4 : 0.1;
            Object.values(realTimeCharts).forEach(chart => {
                if (chart) {
                    chart.data.datasets.forEach(ds => ds.tension = tension);
                    chart.update('none');
                }
            });
            localStorage.setItem('dashboardChartSmooth', smooth);
        });
    }

    // Connectivity Listeners
    if (logoUploader) {
        logoUploader.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const dataUrl = evt.target.result;
                    localStorage.setItem('dashboardLogo', dataUrl);
                    // Apply immediately
                    const titleEl = document.getElementById('site-title-display');
                    if (titleEl) {
                        titleEl.innerHTML = `<img src="${dataUrl}" style="max-height: 40px; vertical-align: middle;">`;
                    }
                    alert('Logo uploaded and saved!');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (presetLifi) {
        presetLifi.addEventListener('click', () => {
            // Demo preset: High transparency, Cyber bg, Green theme
            if (bgSelector) { bgSelector.value = 'cyber'; bgSelector.dispatchEvent(new Event('change')); }
            if (transparencySlider) { transparencySlider.value = 0.6; transparencySlider.dispatchEvent(new Event('input')); }
            const greenBtn = document.querySelector('.btn-color-theme[data-color="#28a745"]');
            if (greenBtn) greenBtn.click();
            alert('Li-Fi Mode Activated!');
        });
    }

    if (presetSolar) {
        presetSolar.addEventListener('click', () => {
            // Demo preset: Low transparency, Default bg, Orange theme
            if (bgSelector) { bgSelector.value = 'default'; bgSelector.dispatchEvent(new Event('change')); }
            if (transparencySlider) { transparencySlider.value = 0.95; transparencySlider.dispatchEvent(new Event('input')); }
            const orangeBtn = document.querySelector('.btn-color-theme[data-color="#fd7e14"]');
            if (orangeBtn) orangeBtn.click();
            alert('Solar Max Mode Activated!');
        });
    }

    if (btnGenerateQr) {
        btnGenerateQr.addEventListener('click', () => {
            if (qrContainer) {
                qrContainer.innerHTML = '';
                new QRCode(qrContainer, {
                    text: window.location.href,
                    width: 128,
                    height: 128
                });
            }
        });
    }

    // ===== 3. NAVIGATION =====
    sidebarLinks.forEach(link => {
        if (link.id === 'btn-toggle-analytics') return;

        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            sidebarLinks.forEach(lnk => lnk.classList.remove('active'));
            link.classList.add('active');
            pageContents.forEach(page => {
                page.style.display = (page.id === targetId.substring(1)) ? 'block' : 'none';
            });
        });
    });
    const homePage = document.getElementById('home');
    if (homePage) homePage.style.display = 'block';

    // ===== 4. NEW FEATURE HANDLERS =====

    if (btnSaveRenames) {
        btnSaveRenames.addEventListener('click', () => {
            globalSettings.names.source1 = renameInputs.source1.value;
            globalSettings.names.source2 = renameInputs.source2.value;
            globalSettings.names.source3 = renameInputs.source3.value;
            globalSettings.names.load1 = renameInputs.load1.value;
            globalSettings.names.load2 = renameInputs.load2.value;
            globalSettings.names.load3 = renameInputs.load3.value;
            saveGlobalSettings();
            applyGlobalNames();
            alert('Names updated successfully!');
        });
    }

    if (btnSaveRate) {
        btnSaveRate.addEventListener('click', () => {
            globalSettings.billRate = parseFloat(billRateInput.value) || 0;

            const selectedSource = document.querySelector('input[name="bill-source"]:checked');
            if (selectedSource) globalSettings.billSource = selectedSource.value;

            saveGlobalSettings();
            updateHistorySummary(); // Recalculate bill
            alert('Bill settings updated!');
        });
    }

    const btnSaveHistoryVis = document.getElementById('btn-save-history-vis');
    if (btnSaveHistoryVis) {
        btnSaveHistoryVis.addEventListener('click', () => {
            const histToggles = document.querySelectorAll('.hist-toggle');
            histToggles.forEach(t => {
                globalSettings.historyVisibility[t.value] = t.checked;
            });
            saveGlobalSettings();
            updateHistoryVisibility();
            alert('History display updated!');
        });
    }

    function updateHistoryVisibility() {
        // Map keys to card indices or IDs. 
        // The history cards are: Solar, Thermal, Battery, Low, Med, High
        // We need to identify them. Let's assume order or add IDs to index.html would be better.
        // But since I can't easily change all IDs without breaking things, I'll use the "More..." button data-id to find parent card.

        const map = {
            'solar': 'solar',
            'thermal': 'thermal',
            'battery': 'battery',
            'loadLow': 'load-low',
            'loadMed': 'load-med',
            'loadHigh': 'load-high'
        };

        Object.keys(globalSettings.historyVisibility).forEach(key => {
            const dataId = map[key];
            const btn = document.querySelector(`.btn-history-graph[data-id="${dataId}"]`);
            if (btn) {
                const card = btn.closest('.card');
                if (card) {
                    card.style.display = globalSettings.historyVisibility[key] ? 'block' : 'none';
                }
            }
        });
    }

    // Visual Selection
    visualOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            globalSettings.batteryVisual = parseInt(opt.dataset.visual);
            saveGlobalSettings();
            updateVisualSelectionUI();
            // Trigger an update to render the new visual immediately
            const lastBatt = historyStore.battery[historyStore.battery.length - 1];
            const lastSoc = historyStore.batterySoc[historyStore.batterySoc.length - 1];
            updateBatteryVisuals(lastBatt ? lastBatt.p : 0, lastSoc ? lastSoc.v : 0);
        });
    });

    function updateVisualSelectionUI() {
        visualOptions.forEach(opt => {
            if (parseInt(opt.dataset.visual) === globalSettings.batteryVisual) {
                opt.classList.add('active');
            } else {
                opt.classList.remove('active');
            }
        });
    }

    function updateBatteryVisuals(power, soc) {
        // power < 0 => Charging, power > 0 => Discharging
        const isCharging = power < 0;
        const statusText = isCharging ? 'Charging' : (power > 0 ? 'Discharging' : 'Idle');
        const statusColor = isCharging ? 'var(--color-success)' : (power > 0 ? 'var(--color-danger)' : 'var(--color-text-light)');

        if (homeBattStatus) {
            homeBattStatus.textContent = statusText;
            homeBattStatus.style.color = statusColor;
        }
        if (cpBattStatus) {
            cpBattStatus.textContent = statusText;
            cpBattStatus.style.color = statusColor;
        }

        const renderVisual = (container) => {
            if (!container) return;
            container.innerHTML = '';
            const v = globalSettings.batteryVisual;

            if (v === 1) {
                // Standard Battery
                const div = document.createElement('div');
                div.className = `v1-battery ${isCharging ? 'charging' : ''}`;
                const level = document.createElement('div');
                level.className = 'v1-level';
                level.style.height = `${soc}%`;
                // Color based on SoC
                if (soc < 20) level.style.backgroundColor = 'var(--color-danger)';
                else if (soc < 50) level.style.backgroundColor = 'var(--color-disconnected)'; // orange/yellow
                else level.style.backgroundColor = 'var(--color-success)';

                div.appendChild(level);
                container.appendChild(div);
            } else if (v === 2) {
                // Circular
                const div = document.createElement('div');
                div.className = `v2-ring ${isCharging ? 'charging' : ''}`;
                // Rotate based on SoC? Or just spin if charging.
                // Let's make it a pie chart style using conic-gradient
                div.style.background = `conic-gradient(var(--color-success) ${soc}%, transparent 0)`;
                container.appendChild(div);
            } else if (v === 3) {
                // Pulsing Dot
                const div = document.createElement('div');
                div.className = `v3-dot ${isCharging ? 'charging' : ''}`;
                // Opacity or size based on SoC?
                div.style.opacity = 0.3 + (soc / 100) * 0.7;
                container.appendChild(div);
            } else if (v === 4) {
                // Flow
                const div = document.createElement('div');
                div.className = 'v4-flow';
                // Speed could be related to power magnitude?
                div.style.animationDuration = isCharging ? '1s' : '3s';
                if (!isCharging && power === 0) div.style.animation = 'none';
                container.appendChild(div);
            } else if (v === 5) {
                // Digital Bar
                const div = document.createElement('div');
                div.className = 'v5-bar-container';
                const bars = 5;
                const activeBars = Math.ceil((soc / 100) * bars);
                for (let i = 0; i < bars; i++) {
                    const b = document.createElement('div');
                    b.className = `v5-bar ${i < activeBars ? 'active' : ''}`;
                    b.style.height = `${20 + i * 5}px`;
                    div.appendChild(b);
                }
                container.appendChild(div);
            } else if (v === 6) {
                // Arc
                const div = document.createElement('div');
                div.className = 'v6-arc';
                div.style.borderColor = isCharging ? 'var(--color-success)' : 'var(--color-primary)';
                // Rotate based on SoC
                const rot = -90 + (soc / 100) * 180;
                div.style.transform = `rotate(${rot}deg)`;
                container.appendChild(div);
            }
        };

        renderVisual(homeBattVisual);
        renderVisual(cpBattVisual);
    }

    function renderVisualPreviews() {
        // Render static previews for each option in Settings
        const options = document.querySelectorAll('.visual-option');
        options.forEach(opt => {
            const v = parseInt(opt.dataset.visual);
            const container = opt.querySelector('.visual-preview');
            if (!container) return;

            // Clear previous
            container.innerHTML = '';

            // Mock data for preview
            const soc = 75;
            const isCharging = true;
            const power = -100;

            // Reuse logic? We can copy-paste the render logic or refactor.
            // Refactoring `renderVisual` to take (container, visualType, soc, isCharging, power) would be best.
            // But to minimize risk, I'll just inline the specific visual logic for the preview here, simplified.

            if (v === 1) {
                const div = document.createElement('div');
                div.className = `v1-battery charging`;
                const level = document.createElement('div');
                level.className = 'v1-level';
                level.style.height = `${soc}%`;
                level.style.backgroundColor = 'var(--color-success)';
                div.appendChild(level);
                container.appendChild(div);
            } else if (v === 2) {
                const div = document.createElement('div');
                div.className = `v2-ring charging`;
                div.style.background = `conic-gradient(var(--color-success) ${soc}%, transparent 0)`;
                container.appendChild(div);
            } else if (v === 3) {
                const div = document.createElement('div');
                div.className = `v3-dot charging`;
                div.style.opacity = 0.3 + (soc / 100) * 0.7;
                container.appendChild(div);
            } else if (v === 4) {
                const div = document.createElement('div');
                div.className = 'v4-flow';
                div.style.animationDuration = '1s';
                container.appendChild(div);
            } else if (v === 5) {
                const div = document.createElement('div');
                div.className = 'v5-bar-container';
                const bars = 5;
                const activeBars = Math.ceil((soc / 100) * bars);
                for (let i = 0; i < bars; i++) {
                    const b = document.createElement('div');
                    b.className = `v5-bar ${i < activeBars ? 'active' : ''}`;
                    b.style.height = `${10 + i * 3}px`; // Smaller for preview
                    div.appendChild(b);
                }
                container.appendChild(div);
            } else if (v === 6) {
                const div = document.createElement('div');
                div.className = 'v6-arc';
                div.style.borderColor = 'var(--color-success)';
                const rot = -90 + (soc / 100) * 180;
                div.style.transform = `rotate(${rot}deg)`;
                container.appendChild(div);
            }
        });
    }

    // Export CSV
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            // Collect all data
            // We need a unified timeline or just export separate files? 
            // User said "Export buttons", implied one or multiple. Let's do one combined CSV if possible, or zip.
            // Simplest: One CSV with timestamp and all columns. 
            // But timestamps might not align perfectly if data came in differently.
            // Let's export the largest dataset (usually they come together).

            // We'll create a CSV with columns: Timestamp, Solar P, Thermal P, Battery P, Battery SoC, Low P, Med P, High P
            // We'll iterate through solar array (assuming it's the master clock or similar)

            const rows = [['Timestamp', 'Solar Power (W)', 'Thermal Power (W)', 'Battery Power (W)', 'Battery SoC (%)', 'Low Load (W)', 'Med Load (W)', 'High Load (W)']];

            // Helper to find closest sample in other arrays
            const find = (arr, t) => arr.find(x => Math.abs(x.t - t) < 2000); // 2 sec tolerance

            historyStore.solar.forEach(s => {
                const tStr = new Date(s.t).toLocaleString();
                const th = find(historyStore.thermal, s.t);
                const bat = find(historyStore.battery, s.t);
                const soc = find(historyStore.batterySoc, s.t);
                const l = find(historyStore.loadLow, s.t);
                const m = find(historyStore.loadMed, s.t);
                const h = find(historyStore.loadHigh, s.t);

                rows.push([
                    tStr,
                    s.p,
                    th ? th.p : '',
                    bat ? bat.p : '',
                    soc ? soc.v : '',
                    l ? l.p : '',
                    m ? m.p : '',
                    h ? h.p : ''
                ]);
            });

            let csvContent = "data:text/csv;charset=utf-8,"
                + rows.map(e => e.join(",")).join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "microgrid_history.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // ===== 5. CHART.JS: SIDE ANALYTICS =====
    function createRealTimeCharts() {
        const chartTextColor = getComputedStyle(document.body).getPropertyValue('--color-text-light');
        const chartPrimaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary');
        const chartOptions = () => ({
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { type: 'time', time: { unit: 'minute' }, grid: { display: false }, ticks: { color: chartTextColor } },
                y: { beginAtZero: true, ticks: { color: chartTextColor } }
            },
            plugins: { legend: { display: false } }
        });

        // Helper for gradient
        const createGradient = (ctx, color) => {
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            return gradient;
        };

        const batteryCanvas = document.getElementById('batteryChart');
        const lowCanvas = document.getElementById('lowLoadChart');
        const medCanvas = document.getElementById('medLoadChart');
        const highCanvas = document.getElementById('highLoadChart');

        if (batteryCanvas) {
            realTimeCharts.battery = new Chart(batteryCanvas.getContext('2d'), {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Battery SoC (%)', data: [], borderColor: chartPrimaryColor, backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            return createGradient(ctx, chartPrimaryColor + '33');
                        }, tension: 0.4, pointRadius: 0, fill: true
                    }]
                },
                options: chartOptions()
            });
        }

        if (lowCanvas) {
            realTimeCharts.lowLoad = new Chart(lowCanvas.getContext('2d'), {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Low Load (W)', data: [], borderColor: chartPrimaryColor, backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            return createGradient(ctx, chartPrimaryColor + '33');
                        }, tension: 0.4, pointRadius: 0, fill: true
                    }]
                },
                options: chartOptions()
            });
        }

        if (medCanvas) {
            realTimeCharts.medLoad = new Chart(medCanvas.getContext('2d'), {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Medium Load (W)', data: [], borderColor: chartPrimaryColor, backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            return createGradient(ctx, chartPrimaryColor + '33');
                        }, tension: 0.4, pointRadius: 0, fill: true
                    }]
                },
                options: chartOptions()
            });
        }

        if (highCanvas) {
            realTimeCharts.highLoad = new Chart(highCanvas.getContext('2d'), {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'High Load (W)', data: [], borderColor: chartPrimaryColor, backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            return createGradient(ctx, chartPrimaryColor + '33');
                        }, tension: 0.4, pointRadius: 0, fill: true
                    }]
                },
                options: chartOptions()
            });
        }
    }

    function addDataToChart(chart, dataPoint) {
        if (!chart || !dataPoint) return;
        chart.data.datasets[0].data.push(dataPoint);
        if (chart.data.datasets[0].data.length > MAX_CHART_POINTS) {
            chart.data.datasets[0].data.shift();
        }
        chart.data.datasets[0].borderColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary');
        chart.update('none');
    }

    // ===== 6. HISTORY & ENERGY CALCULATIONS =====
    function avgSeries(series, key) {
        if (!series || !series.length) return 0;
        let sum = 0;
        for (const s of series) {
            sum += (s[key] || 0);
        }
        return sum / series.length;
    }

    function energyKwh(series) {
        if (!series || series.length < 2) return 0;
        const pAvg = avgSeries(series, 'p');
        const t0 = series[0].t;
        const t1 = series[series.length - 1].t;
        const hours = (t1 - t0) / 3600000;
        return pAvg * hours / 1000; // W * h / 1000 => kWh
    }

    // Eco-Story Widget
    function updateEcoStats(solarKwh, thermalKwh) {
        const totalKwh = solarKwh + thermalKwh;
        const co2Saved = totalKwh * 0.82; // kg
        const treesPlanted = co2Saved / 20; // approx 20kg/year per tree

        let ecoCard = document.getElementById('eco-card');
        if (!ecoCard) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                ecoCard = document.createElement('div');
                ecoCard.id = 'eco-card';
                ecoCard.className = 'card';
                ecoCard.style.marginTop = '20px';
                ecoCard.style.background = 'linear-gradient(135deg, rgba(40, 167, 69, 0.1), rgba(40, 167, 69, 0.3))';
                ecoCard.innerHTML = `
                    <h4 style="color: var(--color-success)">Eco Impact</h4>
                    <p style="font-size: 0.9rem; margin-bottom: 5px;">CO₂ Saved: <strong id="eco-co2">0.00</strong> kg</p>
                    <p style="font-size: 0.9rem;">Trees Equivalent: <strong id="eco-trees">0</strong> 🌳</p>
                `;
                sidebar.appendChild(ecoCard);
            }
        }

        if (ecoCard) {
            const co2El = document.getElementById('eco-co2');
            const treesEl = document.getElementById('eco-trees');
            if (co2El) co2El.textContent = co2Saved.toFixed(2);
            if (treesEl) treesEl.textContent = treesPlanted.toFixed(1);
        }
    }

    function updateHistorySummary() {
        const solarKwh = energyKwh(historyStore.solar);
        const thermalKwh = energyKwh(historyStore.thermal);
        const lowKwh = energyKwh(historyStore.loadLow);
        const medKwh = energyKwh(historyStore.loadMed);
        const highKwh = energyKwh(historyStore.loadHigh);
        const battAvgSoc = avgSeries(historyStore.batterySoc, 'v');

        updateElement('hist-solar-total', solarKwh.toFixed(2));
        updateElement('hist-thermal-total', thermalKwh.toFixed(2));
        updateElement('hist-low-total', lowKwh.toFixed(2));
        updateElement('hist-med-total', medKwh.toFixed(2));
        updateElement('hist-high-total', highKwh.toFixed(2));
        updateElement('hist-batt-avg', battAvgSoc.toFixed(1));

        // Bill Estimation
        // Based on configured source
        let billKwh = 0;
        if (globalSettings.billSource === 'solar') billKwh = solarKwh;
        else if (globalSettings.billSource === 'thermal') billKwh = thermalKwh;
        else billKwh = totalLoadKwh; // 'loads' or default

        const bill = billKwh * globalSettings.billRate;
        if (billEstDisplay) billEstDisplay.textContent = bill.toFixed(2);

        updateEcoStats(solarKwh, thermalKwh);
    }

    function addHistorySample(data, timestamp) {
        const pushLimited = (arr, sample) => {
            arr.push(sample);
            if (arr.length > HISTORY_MAX_POINTS) arr.shift();
        };

        if (data.solar) {
            pushLimited(historyStore.solar, {
                t: timestamp,
                p: data.solar.power ?? 0,
                v: data.solar.voltage ?? 0,
                i: data.solar.current ?? 0
            });
        }

        if (data.thermal) {
            pushLimited(historyStore.thermal, {
                t: timestamp,
                p: data.thermal.power ?? 0,
                v: data.thermal.voltage ?? 0,
                i: data.thermal.current ?? 0
            });
        }

        if (data.battery) {
            pushLimited(historyStore.battery, {
                t: timestamp,
                p: data.battery.power ?? 0,
                v: data.battery.voltage ?? 0,
                i: data.battery.current ?? 0
            });
            if (data.battery.soc != null) {
                pushLimited(historyStore.batterySoc, {
                    t: timestamp,
                    v: data.battery.soc
                });
            }
        }

        if (data.loads?.low) {
            pushLimited(historyStore.loadLow, {
                t: timestamp,
                p: data.loads.low.power ?? 0,
                v: data.loads.low.voltage ?? 0,
                i: data.loads.low.current ?? 0
            });
        }
        if (data.loads?.med) {
            pushLimited(historyStore.loadMed, {
                t: timestamp,
                p: data.loads.med.power ?? 0,
                v: data.loads.med.voltage ?? 0,
                i: data.loads.med.current ?? 0
            });
        }
        if (data.loads?.high) {
            pushLimited(historyStore.loadHigh, {
                t: timestamp,
                p: data.loads.high.power ?? 0,
                v: data.loads.high.voltage ?? 0,
                i: data.loads.high.current ?? 0
            });
        }

        saveHistoryToStorage();
        updateHistorySummary();
        refreshGraphsPanel();

        // Update Battery Visuals
        if (data.battery) {
            const soc = data.battery.soc ?? (historyStore.batterySoc.length ? historyStore.batterySoc[historyStore.batterySoc.length - 1].v : 0);
            updateBatteryVisuals(data.battery.power, soc);
        }
    }

    // ===== 7. GRAPHS PAGE LOGIC =====
    function getGraphBaseConfig(key) {
        // Use global names
        const n = globalSettings.names;
        const fixedConfigs = {
            solar: { name: n.source1, sourceKey: 'solar', metrics: ['p', 'v', 'i'] },
            thermal: { name: n.source2, sourceKey: 'thermal', metrics: ['p', 'v', 'i'] },
            battery: { name: n.source3, sourceKey: 'battery', metrics: ['p', 'v', 'i'] },
            loadLow: { name: n.load1, sourceKey: 'loadLow', metrics: ['p'] },
            loadMed: { name: n.load2, sourceKey: 'loadMed', metrics: ['p'] },
            loadHigh: { name: n.load3, sourceKey: 'loadHigh', metrics: ['p'] }
        };
        if (fixedConfigs[key]) return fixedConfigs[key];
        if (customGraphConfigs[key]) return customGraphConfigs[key];
        return { name: 'Custom', sourceKey: 'solar', metrics: ['p'] };
    }

    function refreshGraphsPanel() {
        const cfgBase = getGraphBaseConfig(activeGraphsTabKey);

        // Determine which metrics to display based on activeMetricMode
        let metricsToUse;
        if (activeMetricMode === 'all') {
            metricsToUse = cfgBase.metrics.slice();
        } else {
            metricsToUse = [activeMetricMode];
        }
        const cfg = {
            ...cfgBase,
            metrics: metricsToUse
        };

        // Title
        if (graphsTitleEl) {
            const metricNames = metricsToUse.map(m => {
                if (m === 'p') return 'P';
                if (m === 'v') return 'V';
                if (m === 'i') return 'I';
                return m.toUpperCase();
            }).join(' / ');
            graphsTitleEl.textContent = `${cfg.name} - ${metricNames}`;
        }

        // Current values
        const series = historyStore[cfg.sourceKey] || [];
        const last = series[series.length - 1];
        let p = '--', v = '--', i = '--';
        if (last) {
            if (last.p != null) p = last.p.toFixed(2);
            if (last.v != null) v = last.v.toFixed(2);
            if (last.i != null) i = last.i.toFixed(2);
        }
        if (graphsCurrentEl) {
            graphsCurrentEl.innerHTML = `P: ${p} W &nbsp;&nbsp; V: ${v} V &nbsp;&nbsp; I: ${i} A`;
        }

        // Custom tab config UI
        if (activeGraphsTabKey.startsWith('custom') && graphsCustomConfigEl) {
            graphsCustomConfigEl.style.display = 'block';
            const c = customGraphConfigs[activeGraphsTabKey] || cfgBase;
            if (customNameInput) customNameInput.value = c.name || activeGraphsTabKey;
            if (customSourceSelect) customSourceSelect.value = c.sourceKey || 'solar';
            if (customMetricsSelect) {
                Array.from(customMetricsSelect.options).forEach(opt => {
                    opt.selected = (c.metrics || []).includes(opt.value);
                });
            }
        } else if (graphsCustomConfigEl) {
            graphsCustomConfigEl.style.display = 'none';
        }

        rebuildGraphsChart(cfg);
    }

    function rebuildGraphsChart(cfg) {
        const canvas = document.getElementById('graphsMainChart');
        if (!canvas) return;

        const series = historyStore[cfg.sourceKey] || [];
        const labels = series.map(s => new Date(s.t));
        const lineBaseColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#6a5af9';

        const metricInfo = {
            p: { key: 'p', label: 'Power (W)' },
            v: { key: 'v', label: 'Voltage (V)' },
            i: { key: 'i', label: 'Current (A)' }
        };

        const datasets = cfg.metrics.map((m, idx) => {
            const info = metricInfo[m];
            if (!info) return null;
            const values = series.map(s => s[info.key]);
            return {
                label: info.label,
                data: values,
                borderColor: lineBaseColor,
                backgroundColor: lineBaseColor + '33',
                tension: 0.15,
                pointRadius: 0,
                fill: false
            };
        }).filter(Boolean);

        const ctx = canvas.getContext('2d');
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'minute' }
                }
            }
        };

        if (!graphsChart) {
            graphsChart = new Chart(ctx, {
                type: 'line',
                data: { labels, datasets },
                options
            });
        } else {
            graphsChart.data.labels = labels;
            graphsChart.data.datasets = datasets;
            graphsChart.update('none');
        }
    }

    graphsTabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            if (!key) return;
            activeGraphsTabKey = key;
            graphsTabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            refreshGraphsPanel();
        });
    });

    graphsMetricButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const metric = btn.dataset.metric;
            if (!metric) return;
            activeMetricMode = metric;
            graphsMetricButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            refreshGraphsPanel();
        });
    });

    if (customSaveBtn) {
        customSaveBtn.addEventListener('click', () => {
            if (!activeGraphsTabKey.startsWith('custom')) return;
            const name = customNameInput.value || activeGraphsTabKey;
            const sourceKey = customSourceSelect.value || 'solar';

            let metrics = Array.from(customMetricsSelect.selectedOptions).map(o => o.value);
            if (!metrics.length) metrics = ['p'];

            customGraphConfigs[activeGraphsTabKey] = { name, sourceKey, metrics };
            saveCustomGraphsToStorage();

            graphsTabButtons.forEach(btn => {
                if (btn.dataset.key === activeGraphsTabKey) {
                    btn.textContent = name;
                }
            });

            refreshGraphsPanel();
        });
    }

    // ===== 8. HISTORY MODAL GRAPHS =====
    historyGraphButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const historyId = btn.dataset.id;
            let series = [];
            let label = '';

            switch (historyId) {
                case 'solar':
                    series = historyStore.solar;
                    label = 'Solar Power (W)';
                    break;
                case 'thermal':
                    series = historyStore.thermal;
                    label = 'Thermal Power (W)';
                    break;
                case 'battery':
                    series = historyStore.batterySoc;
                    label = 'Battery SoC (%)';
                    break;
                case 'load-low':
                    series = historyStore.loadLow;
                    label = 'Low Load Power (W)';
                    break;
                case 'load-med':
                    series = historyStore.loadMed;
                    label = 'Medium Load Power (W)';
                    break;
                case 'load-high':
                    series = historyStore.loadHigh;
                    label = 'High Load Power (W)';
                    break;
                default:
                    series = [];
                    label = 'Value';
            }

            const labels = series.map(s => new Date(s.t));
            const values = series.map(s => s.p ?? s.v);
            const lineColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#6a5af9';

            if (historyChartInstance) {
                historyChartInstance.destroy();
                historyChartInstance = null;
            }

            historyChartInstance = new Chart(historyChartCanvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label,
                        data: values,
                        borderColor: lineColor,
                        backgroundColor: lineColor + '33',
                        tension: 0.2,
                        pointRadius: 0,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { type: 'time', time: { unit: 'minute' } }
                    }
                }
            });

            if (historyModalTitle) {
                const h4 = btn.closest('.card')?.querySelector('h4');
                if (h4) historyModalTitle.textContent = h4.textContent + ' History';
            }
            if (historyModalBackdrop) historyModalBackdrop.style.display = 'flex';
        });
    });

    if (historyModalCloseBtn && historyModalBackdrop) {
        historyModalCloseBtn.addEventListener('click', () => {
            historyModalBackdrop.style.display = 'none';
            if (historyChartInstance) {
                historyChartInstance.destroy();
                historyChartInstance = null;
            }
        });
    }

    // Voice Alerts
    let lastAlertTime = 0;
    function speakAlert(msg) {
        const now = Date.now();
        if (now - lastAlertTime < 10000) return; // Debounce 10s
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(msg);
            window.speechSynthesis.speak(utterance);
            lastAlertTime = now;
        }
        // Also play alert sound
        if (audioAlert) {
            audioAlert.currentTime = 0;
            audioAlert.play().catch(e => console.log(e));
        }
    }

    function checkThresholds(data) {
        // Voltage > 14V
        if ((data.solar?.voltage > 14) || (data.battery?.voltage > 14)) {
            speakAlert('Warning: High Voltage Detected');
            document.querySelectorAll('.card').forEach(c => c.classList.add('alert-shake'));
            setTimeout(() => document.querySelectorAll('.card').forEach(c => c.classList.remove('alert-shake')), 500);
        }
        // Battery < 20%
        if (data.battery?.soc < 20) {
            speakAlert('Warning: Battery Low');
            const battCard = document.getElementById('home-batt-soc')?.closest('.card');
            if (battCard) {
                battCard.classList.add('alert-shake');
                setTimeout(() => battCard.classList.remove('alert-shake'), 500);
            }
        }
    }

    // ===== 9. MQTT CONNECTION & HANDLERS =====
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            const brokerUrl = brokerUrlInput.value;
            const options = {
                clientId: `webapp_${Math.random().toString(16).substr(2, 8)}`,
                username: usernameInput.value || undefined,
                password: passwordInput.value || undefined,
                clean: true,
                connectTimeout: 4000
            };

            if (statusBadge) {
                statusBadge.textContent = 'Connecting...';
                statusBadge.className = 'status-badge connecting';
            }
            client = mqtt.connect(brokerUrl, options);

            client.on('connect', () => {
                console.log('Connected to MQTT broker');
                if (statusBadge) {
                    statusBadge.textContent = 'Connected';
                    statusBadge.className = 'status-badge connected';
                }
                const namespace = namespaceInput.value;
                const deviceId = deviceIdInput.value;
                const statusTopic = `${namespace}/${deviceId}/status`;
                client.subscribe(statusTopic, (err) => {
                    if (err) console.error('Subscribe error:', err);
                    else console.log('Subscribed to:', statusTopic);
                });
            });

            client.on('error', (err) => {
                console.error('MQTT error:', err);
                if (statusBadge) {
                    statusBadge.textContent = 'Error';
                    statusBadge.className = 'status-badge disconnected';
                }
                if (client) client.end();
            });

            client.on('reconnect', () => {
                if (statusBadge) {
                    statusBadge.textContent = 'Reconnecting...';
                    statusBadge.className = 'status-badge connecting';
                }
            });

            client.on('message', (topic, message) => {
                console.log('MQTT message on:', topic);
                handleMqttMessage(topic, message.toString());
            });
        });
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', () => {
            if (client) {
                client.end();
                client = null;
                console.log('Disconnected from MQTT');
            }
            if (statusBadge) {
                statusBadge.textContent = 'Disconnected';
                statusBadge.className = 'status-badge disconnected';
            }
        });
    }

    function handleMqttMessage(topic, message) {
        const expectedTopic = `${namespaceInput.value}/${deviceIdInput.value}/status`;
        if (topic !== expectedTopic) {
            console.warn('Ignoring unexpected topic:', topic);
            return;
        }
        try {
            const data = JSON.parse(message);
            publishData(data);
        } catch (e) {
            console.error('Failed to parse MQTT JSON, raw message:', message, e);
        }
    }

    // Helper to update text content safely
    function updateElement(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        if (value === undefined || value === null || value !== value) return;
        el.textContent = value;
    }

    function publishData(data) {
        const now = Date.now();
        // Update latest
        db.ref('latest').set(data);

        // Push to history
        if (data.solar) db.ref('history/solar').push({ t: now, p: data.solar.power, v: data.solar.voltage, i: data.solar.current });
        if (data.thermal) db.ref('history/thermal').push({ t: now, p: data.thermal.power, v: data.thermal.voltage, i: data.thermal.current });
        if (data.battery) {
            db.ref('history/battery').push({ t: now, p: data.battery.power, v: data.battery.voltage, i: data.battery.current });
            if (data.battery.soc != null) db.ref('history/batterySoc').push({ t: now, v: data.battery.soc });
        }
        if (data.loads?.low) db.ref('history/loadLow').push({ t: now, p: data.loads.low.power, v: data.loads.low.voltage, i: data.loads.low.current });
        if (data.loads?.med) db.ref('history/loadMed').push({ t: now, p: data.loads.med.power, v: data.loads.med.voltage, i: data.loads.med.current });
        if (data.loads?.high) db.ref('history/loadHigh').push({ t: now, p: data.loads.high.power, v: data.loads.high.voltage, i: data.loads.high.current });
    }

    // Shared logic for MQTT, Test manual, and Random
    function renderUI(data) {
        checkThresholds(data);
        // Home
        updateElement('home-solar-power', data.solar?.power);
        updateElement('home-solar-volt', data.solar?.voltage);
        updateElement('home-thermal-power', data.thermal?.power);
        updateElement('home-thermal-volt', data.thermal?.voltage);
        updateElement('home-batt-power', data.battery?.power);
        updateElement('home-batt-soc', data.battery?.soc);

        const lowState = data.loads?.low?.state ?? (data.loads?.low?.power != null ? `${data.loads.low.power} W` : null);
        const medState = data.loads?.med?.state ?? (data.loads?.med?.power != null ? `${data.loads.med.power} W` : null);
        const highState = data.loads?.high?.state ?? (data.loads?.high?.power != null ? `${data.loads.high.power} W` : null);

        updateElement('home-load-low', lowState);
        updateElement('home-load-med', medState);
        updateElement('home-load-high', highState);

        // Control Panel
        updateElement('cp-total-sources', data.summary?.totalSources);
        updateElement('cp-total-loads', data.summary?.totalLoads);
        updateElement('cp-balance', data.summary?.balance);
        if (data.summary?.mode) {
            updateElement('cp-mode', `Mode: ${data.summary.mode}`);
        }

        updateElement('cp-solar-power', data.solar?.power);
        updateElement('cp-solar-volt', data.solar?.voltage);
        updateElement('cp-solar-curr', data.solar?.current);

        updateElement('cp-thermal-power', data.thermal?.power);
        updateElement('cp-thermal-volt', data.thermal?.voltage);
        updateElement('cp-thermal-curr', data.thermal?.current);

        updateElement('cp-batt-power', data.battery?.power);
        updateElement('cp-batt-volt', data.battery?.voltage);
        updateElement('cp-batt-curr', data.battery?.current);
        updateElement('cp-batt-soc', data.battery?.soc);

        updateElement('cp-load-low-power', data.loads?.low?.power);
        updateElement('cp-load-low-status', data.loads?.low?.state);
        updateElement('cp-load-med-power', data.loads?.med?.power);
        updateElement('cp-load-med-status', data.loads?.med?.state);
        updateElement('cp-load-high-power', data.loads?.high?.power);
        updateElement('cp-load-high-status', data.loads?.high?.state);

        // Side analytics charts - Update these from live data as they are "Real Time"
        // But history graphs update from history listener.
        // We can keep these here.
        const timestamp = Date.now(); // Use local time for UI update or data timestamp? 
        // data doesn't have timestamp in it usually, it comes from wrapper.
        // But renderUI is called from onValue(latest).
        // Let's use Date.now() for the chart X axis.
        addDataToChart(realTimeCharts.battery, { x: timestamp, y: data.battery?.soc });
        addDataToChart(realTimeCharts.lowLoad, { x: timestamp, y: data.loads?.low?.power });
        addDataToChart(realTimeCharts.medLoad, { x: timestamp, y: data.loads?.med?.power });
        addDataToChart(realTimeCharts.highLoad, { x: timestamp, y: data.loads?.high?.power });
    }

    function publishCommand(topic, message) {
        if (client && client.connected) {
            const namespace = namespaceInput.value;
            const deviceId = deviceIdInput.value;
            const fullTopic = `${namespace}/${deviceId}/${topic}`;
            client.publish(fullTopic, message, (err) => {
                if (err) console.error('Publish error:', err);
                else console.log(`Published to ${fullTopic}: ${message}`);
            });
        } else {
            console.warn('Cannot publish, MQTT not connected');
        }
    }

    loadToggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const load = btn.dataset.load;
            const cmd = btn.dataset.cmd;
            publishCommand(`loads/${load}/set`, cmd.toUpperCase());
        });
    });

    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            publishCommand('mode/set', mode.toUpperCase());
        });
    });

    // ===== 10. TEST PAGE: MANUAL APPLY =====
    if (testApplyBtn) {
        testApplyBtn.addEventListener('click', () => {
            const now = Date.now();
            const data = buildDataFromManualInputs();
            data.summary.mode = 'TEST';
            publishData(data);
        });
    }

    function buildDataFromManualInputs() {
        const data = {
            summary: {},
            solar: {},
            thermal: {},
            battery: {},
            loads: {
                low: {},
                med: {},
                high: {}
            }
        };

        const sp = parseFloat(testSolarPower?.value);
        const sv = parseFloat(testSolarVolt?.value);
        if (!Number.isNaN(sp)) data.solar.power = sp;
        if (!Number.isNaN(sv)) data.solar.voltage = sv;
        if (!Number.isNaN(sp) && !Number.isNaN(sv) && sv !== 0) data.solar.current = sp / sv;

        const tp = parseFloat(testThermalPower?.value);
        const tv = parseFloat(testThermalVolt?.value);
        if (!Number.isNaN(tp)) data.thermal.power = tp;
        if (!Number.isNaN(tv)) data.thermal.voltage = tv;
        if (!Number.isNaN(tp) && !Number.isNaN(tv) && tv !== 0) data.thermal.current = tp / tv;

        const bp = parseFloat(testBattPower?.value);
        const bv = parseFloat(testBattVolt?.value);
        const bs = parseFloat(testBattSoc?.value);
        if (!Number.isNaN(bp)) data.battery.power = bp;
        if (!Number.isNaN(bv)) data.battery.voltage = bv;
        if (!Number.isNaN(bp) && !Number.isNaN(bv) && bv !== 0) data.battery.current = bp / bv;
        if (!Number.isNaN(bs)) data.battery.soc = bs;

        const lp = parseFloat(testLoadLowPower?.value);
        const mp = parseFloat(testLoadMedPower?.value);
        const hp = parseFloat(testLoadHighPower?.value);

        if (!Number.isNaN(lp)) {
            data.loads.low.power = lp;
            data.loads.low.state = lp > 0 ? 'ON' : 'OFF';
            data.loads.low.voltage = 12;
            data.loads.low.current = 12 ? lp / 12 : 0;
        }
        if (!Number.isNaN(mp)) {
            data.loads.med.power = mp;
            data.loads.med.state = mp > 0 ? 'ON' : 'OFF';
            data.loads.med.voltage = 12;
            data.loads.med.current = 12 ? mp / 12 : 0;
        }
        if (!Number.isNaN(hp)) {
            data.loads.high.power = hp;
            data.loads.high.state = hp > 0 ? 'ON' : 'OFF';
            data.loads.high.voltage = 12;
            data.loads.high.current = 12 ? hp / 12 : 0;
        }

        const totalSources = (data.solar.power || 0) + (data.thermal.power || 0);
        const totalLoads = (lp || 0) + (mp || 0) + (hp || 0);
        const balance = totalSources + (data.battery.power || 0) - totalLoads;
        data.summary.totalSources = totalSources;
        data.summary.totalLoads = totalLoads;
        data.summary.balance = balance;
        data.summary.mode = 'TEST';

        return data;
    }

    // ===== 11. RANDOM MODE =====
    if (randomSettingsToggleBtn && randomSettingsPanel) {
        randomSettingsToggleBtn.addEventListener('click', () => {
            if (randomSettingsPanel.style.display === 'none' || randomSettingsPanel.style.display === '') {
                randomSettingsPanel.style.display = 'block';
            } else {
                randomSettingsPanel.style.display = 'none';
            }
        });
    }

    if (randomToggleBtn) {
        randomToggleBtn.addEventListener('click', () => {
            if (!randomRunning) {
                startRandomMode();
            } else {
                stopRandomMode();
            }
        });
    }

    function startRandomMode() {
        if (randomRunning) return;
        randomRunning = true;
        if (randomStatusLabel) randomStatusLabel.textContent = 'Random mode is ON (updates every 1s).';
        if (randomToggleBtn) randomToggleBtn.textContent = 'Stop Random';

        runRandomStep(); // immediate
        randomTimerId = setInterval(runRandomStep, 1000);
    }

    function stopRandomMode() {
        randomRunning = false;
        if (randomStatusLabel) randomStatusLabel.textContent = 'Random mode is OFF.';
        if (randomToggleBtn) randomToggleBtn.textContent = 'Start Random';
        if (randomTimerId) {
            clearInterval(randomTimerId);
            randomTimerId = null;
        }
    }

    function randInRange(min, max) {
        if (min > max) [min, max] = [max, min];
        return min + Math.random() * (max - min);
    }

    function getNumberOr(defaultVal, input) {
        const v = parseFloat(input?.value);
        return Number.isNaN(v) ? defaultVal : v;
    }

    function getRandomOrFixedPower(cfgEnabled, minInput, maxInput, manualInput, defaultMin, defaultMax, defaultFixed) {
        if (cfgEnabled && cfgEnabled.checked) {
            const min = getNumberOr(defaultMin, minInput);
            const max = getNumberOr(defaultMax, maxInput);
            return randInRange(min, max);
        } else {
            const manualVal = parseFloat(manualInput?.value);
            if (!Number.isNaN(manualVal)) return manualVal;
            return defaultFixed;
        }
    }

    function runRandomStep() {
        const now = Date.now();

        // Fixed voltages
        const solarV = getNumberOr(12, randSolarVoltFixed);
        const thermalV = getNumberOr(12, randThermalVoltFixed);
        const battV = getNumberOr(12, randBattVoltFixed);

        const data = {
            summary: {},
            solar: {},
            thermal: {},
            battery: {},
            loads: {
                low: {},
                med: {},
                high: {}
            }
        };

        // Solar power
        const solarP = getRandomOrFixedPower(
            randSolarPowerEnabled,
            randSolarPowerMin,
            randSolarPowerMax,
            testSolarPower,
            200,
            1500,
            800
        );
        data.solar.power = solarP;
        data.solar.voltage = solarV;
        data.solar.current = solarV ? solarP / solarV : 0;

        // Thermal power
        const thermalP = getRandomOrFixedPower(
            randThermalPowerEnabled,
            randThermalPowerMin,
            randThermalPowerMax,
            testThermalPower,
            100,
            800,
            400
        );
        data.thermal.power = thermalP;
        data.thermal.voltage = thermalV;
        data.thermal.current = thermalV ? thermalP / thermalV : 0;

        // Battery SoC
        const battSoc = (randBattSocEnabled && randBattSocEnabled.checked)
            ? randInRange(
                getNumberOr(30, randBattSocMin),
                getNumberOr(100, randBattSocMax)
            )
            : getNumberOr(80, testBattSoc);
        data.battery.soc = battSoc;
        data.battery.voltage = battV;

        // Loads
        const lowP = getRandomOrFixedPower(
            randLoadLowEnabled,
            randLoadLowMin,
            randLoadLowMax,
            testLoadLowPower,
            0,
            300,
            150
        );
        const medP = getRandomOrFixedPower(
            randLoadMedEnabled,
            randLoadMedMin,
            randLoadMedMax,
            testLoadMedPower,
            0,
            800,
            400
        );
        const highP = getRandomOrFixedPower(
            randLoadHighEnabled,
            randLoadHighMin,
            randLoadHighMax,
            testLoadHighPower,
            0,
            1500,
            700
        );

        const busV = 12;

        data.loads.low.power = lowP;
        data.loads.low.state = lowP > 1 ? 'ON' : 'OFF';
        data.loads.low.voltage = busV;
        data.loads.low.current = busV ? lowP / busV : 0;

        data.loads.med.power = medP;
        data.loads.med.state = medP > 1 ? 'ON' : 'OFF';
        data.loads.med.voltage = busV;
        data.loads.med.current = busV ? medP / busV : 0;

        data.loads.high.power = highP;
        data.loads.high.state = highP > 1 ? 'ON' : 'OFF';
        data.loads.high.voltage = busV;
        data.loads.high.current = busV ? highP / busV : 0;

        // Totals & battery power to balance
        const totalSources = solarP + thermalP;
        const totalLoads = lowP + medP + highP;
        const battPower = totalSources - totalLoads; // battery compensates difference

        data.battery.power = battPower;
        data.battery.current = battV ? battPower / battV : 0;

        data.summary.totalSources = totalSources;
        data.summary.totalLoads = totalLoads;
        data.summary.balance = totalSources + battPower - totalLoads; // should be ~0
        data.summary.mode = 'RANDOM';

        publishData(data);
    }

    // ===== 12. RESET FUNCTIONALITY =====

    // Create Reset button dynamically and add to test-footer (so HTML need not be changed)
    (function createResetButton() {
        try {
            const testFooter = document.querySelector('.test-footer');
            if (!testFooter) return;
            const btnReset = document.createElement('button');
            btnReset.className = 'btn btn-danger';
            btnReset.id = 'btn-test-reset';
            btnReset.textContent = 'Reset All Data';
            btnReset.style.marginLeft = '8px';
            testFooter.insertBefore(btnReset, testFooter.children[1] || null); // place after Apply button

            btnReset.addEventListener('click', () => {
                const confirmReset = confirm('Reset all dashboard data (history, charts, values)?');
                if (confirmReset) resetAllData();
            });
        } catch (e) {
            console.error('Failed to create reset button:', e);
        }
    })();

    function resetAllData() {
        // 1) Stop random mode
        stopRandomMode();

        // 2) Clear history store arrays
        historyStore = {
            solar: [],
            thermal: [],
            battery: [],
            batterySoc: [],
            loadLow: [],
            loadMed: [],
            loadHigh: []
        };
        saveHistoryToStorage();

        // 3) Clear side real-time charts
        try {
            Object.keys(realTimeCharts).forEach(k => {
                const ch = realTimeCharts[k];
                if (ch && ch.data && ch.data.datasets && ch.data.datasets[0]) {
                    ch.data.datasets[0].data = [];
                    ch.update('none');
                }
            });
        } catch (e) {
            console.warn('Error clearing real-time charts:', e);
        }

        // 4) Destroy main graphs & history charts
        try {
            if (graphsChart) {
                graphsChart.destroy();
                graphsChart = null;
            }
            if (historyChartInstance) {
                historyChartInstance.destroy();
                historyChartInstance = null;
            }
        } catch (e) {
            console.warn('Error destroying charts:', e);
        }

        // 5) Reset displayed elements text to default placeholders
        const resetIdsToDash = [
            'home-solar-power', 'home-solar-volt', 'home-thermal-power', 'home-thermal-volt',
            'home-batt-power', 'home-batt-soc', 'home-load-low', 'home-load-med', 'home-load-high',
            'cp-total-sources', 'cp-total-loads', 'cp-balance', 'cp-mode',
            'cp-solar-power', 'cp-solar-volt', 'cp-solar-curr',
            'cp-thermal-power', 'cp-thermal-volt', 'cp-thermal-curr',
            'cp-batt-power', 'cp-batt-volt', 'cp-batt-curr', 'cp-batt-soc',
            'cp-load-low-power', 'cp-load-low-status', 'cp-load-med-power', 'cp-load-med-status',
            'cp-load-high-power', 'cp-load-high-status',
            'hist-solar-total', 'hist-thermal-total', 'hist-batt-avg', 'hist-low-total', 'hist-med-total', 'hist-high-total'
        ];
        resetIdsToDash.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id.startsWith('hist-') || id.startsWith('cp-')) {
                // numeric-like fields set to 0.00 or specific placeholder
                if (id === 'cp-mode') el.textContent = 'Mode: --';
                else el.textContent = '--';
            } else {
                el.textContent = '--';
            }
        });

        // Reset graphs current label
        if (graphsCurrentEl) graphsCurrentEl.innerHTML = 'P: -- W &nbsp;&nbsp; V: -- V &nbsp;&nbsp; I: -- A';
        if (graphsTitleEl) graphsTitleEl.textContent = 'Solar';

        // 6) Clear any saved test inputs
        const testInputs = [
            testSolarPower, testSolarVolt, testThermalPower, testThermalVolt,
            testBattPower, testBattVolt, testBattSoc, testLoadLowPower, testLoadMedPower, testLoadHighPower
        ];
        testInputs.forEach(inp => {
            if (inp) inp.value = '';
        });

        // 7) Reset random status & UI
        if (randomStatusLabel) randomStatusLabel.textContent = 'Random mode is OFF.';
        if (randomToggleBtn) randomToggleBtn.textContent = 'Start Random';
        if (randomSettingsPanel) randomSettingsPanel.style.display = 'none';

        // 8) Reset analytics averages/peaks
        const analyticsIds = ['analytics-low-avg', 'analytics-low-peak', 'analytics-med-avg', 'analytics-med-peak', 'analytics-high-avg', 'analytics-high-peak'];
        analyticsIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0.00';
        });

        // 9) Refresh UI and graphs
        updateHistorySummary();
        refreshGraphsPanel();
        console.log('All dashboard data reset.');
        alert('Dashboard data has been reset.');
    }

    // Presentation Mode Shortcut (Shift + P)
    document.addEventListener('keydown', (e) => {
        if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
            document.body.classList.toggle('presentation-mode');
            const isPres = document.body.classList.contains('presentation-mode');
            if (isPres) {
                if (mainContainer) mainContainer.classList.add('sidebar-collapsed');
                alert('Presentation Mode: ON (Press Shift+P to exit)');
            } else {
                if (mainContainer) mainContainer.classList.remove('sidebar-collapsed');
                alert('Presentation Mode: OFF');
            }
        }
    });

    // ===== 13. START APP =====
    loadLocalPreferences();
    setupFirebaseListeners();
    // loadHistoryFromStorage(); // Removed
    // loadCustomGraphsFromStorage(); // Removed
    createRealTimeCharts();
    refreshGraphsPanel(); // initial

    // ===== 13. LAYOUT MANAGEMENT SYSTEM =====
    const LayoutManager = {
        presets: {
            'home': [],         // Populated in init
            'control-panel': [],
            'history': []
        },

        init() {
            this.definePresets();
            this.renderLayoutList();
            this.setupListeners();
        },

        definePresets() {
            // Hardcoded IDs for stability
            const homeIds = ['tile-source1', 'tile-source2', 'tile-source3', 'tile-load1', 'tile-load2', 'tile-load3'];
            const cpIds = ['cp-card-sources', 'cp-card-loads', 'cp-card-balance', 'cp-card-detailed-solar', 'cp-card-detailed-thermal', 'cp-card-detailed-battery', 'cp-card-load-mgmt'];
            const histIds = ['hist-card-bill', 'hist-card-solar', 'hist-card-thermal', 'hist-card-battery', 'hist-card-load-low', 'hist-card-load-med', 'hist-card-load-high'];

            this.presets = {
                'home': this.buildVariations(homeIds),
                'control-panel': this.buildVariations(cpIds),
                'history': this.buildVariations(histIds)
            };
        },

        buildVariations(ids) {
            // Helper to create variations from a list of IDs
            return [
                { id: 'p1', name: 'Standard Flow', icon: 'grid', data: [...ids] },
                { id: 'p2', name: 'Relaxed (Gaps)', icon: 'grid', data: ids.flatMap(id => [id, 'EMPTY']) },
                { id: 'p3', name: 'Top Priority', icon: 'grid', data: [...ids.slice(0, 3), 'EMPTY', 'EMPTY', ...ids.slice(3)] },
                { id: 'p4', name: 'Bottom Anchor', icon: 'grid', data: ['EMPTY', 'EMPTY', 'EMPTY', ...ids] },
                { id: 'p5', name: 'Centered', icon: 'grid', data: ['EMPTY', ...ids, 'EMPTY'] },
                { id: 'p6', name: 'Split View', icon: 'grid', data: [...ids.slice(0, Math.ceil(ids.length / 2)), 'EMPTY', 'EMPTY', ...ids.slice(Math.ceil(ids.length / 2))] },
                { id: 'p7', name: 'Minimalist', icon: 'grid', data: [...ids] },
                { id: 'p8', name: 'Pro Dashboard', icon: 'grid', data: ids.length > 4 ? [ids[0], 'EMPTY', ids[1], ids[2], 'EMPTY', ...ids.slice(3)] : ids },
                { id: 'p9', name: 'Engineering', icon: 'grid', data: [...ids.reverse()] },
                { id: 'p10', name: 'Cinematic', icon: 'grid', data: ['EMPTY', ids[0], 'EMPTY', ...ids.slice(1)] },

                // Custom Slots
                { id: 'c1', name: 'Custom Slot 1', icon: 'user', isCustom: true },
                { id: 'c2', name: 'Custom Slot 2', icon: 'user', isCustom: true },
                { id: 'c3', name: 'Custom Slot 3', icon: 'user', isCustom: true },
                { id: 'c4', name: 'Custom Slot 4', icon: 'user', isCustom: true }
            ];
        },

        // Removed generatePresets in favor of buildVariations
        renderLayoutList() {
            const list = document.getElementById('layout-list');
            const scope = document.getElementById('layout-scope-select').value;
            if (!list) return;

            list.innerHTML = '';
            const options = this.presets[scope] || [];

            options.forEach(opt => {
                const el = document.createElement('div');
                el.className = 'layout-option-card';
                el.dataset.id = opt.id;
                el.onclick = () => {
                    list.querySelectorAll('.layout-option-card').forEach(c => c.classList.remove('active'));
                    el.classList.add('active');
                };

                // Enhanced Wireframe Preview
                const preview = document.createElement('div');
                preview.className = 'layout-preview-wireframe';

                // data is array of IDs or 'EMPTY'
                // We need to fetch the data. If it's custom, we might not have it yet unless we read LS.
                let data = opt.data;
                if (opt.isCustom) {
                    const saved = JSON.parse(localStorage.getItem(`customLayout_${scope}_${opt.id}`));
                    if (saved) data = saved;
                    else data = ['EMPTY', 'EMPTY', 'EMPTY', 'EMPTY']; // Placeholder for empty custom
                }

                if (data) {
                    // Create a mini grid representation
                    data.forEach(item => {
                        const cell = document.createElement('div');
                        cell.className = 'mini-wireframe-cell';
                        if (item === 'EMPTY') {
                            cell.classList.add('mini-empty');
                        } else {
                            cell.classList.add('mini-filled');
                        }
                        preview.appendChild(cell);
                    });
                }

                const label = document.createElement('span');
                label.textContent = opt.name;
                if (opt.isCustom && !localStorage.getItem(`customLayout_${scope}_${opt.id}`)) {
                    label.textContent += " (Empty)";
                    label.style.opacity = '0.5';
                }

                el.appendChild(preview);
                el.appendChild(label);
                list.appendChild(el);
            });
        },

        setupListeners() {
            const scopeSel = document.getElementById('layout-scope-select');
            if (scopeSel) scopeSel.addEventListener('change', () => this.renderLayoutList());

            document.getElementById('btn-apply-layout')?.addEventListener('click', () => {
                const scope = document.getElementById('layout-scope-select').value;
                const selected = document.querySelector('.layout-option-card.active');
                if (!selected) {
                    alert("Please select a layout first.");
                    return;
                }

                const layoutId = selected.dataset.id;
                const layoutData = this.getLayoutData(scope, layoutId);

                if (layoutData) {
                    // Apply!
                    // Map scope to container ID
                    const containerId = (scope === 'home') ? 'home-grid-container' : (scope === 'control-panel' ? 'cp-grid' : 'history-grid');
                    const keySuffix = containerId; // Logic matches

                    // Save to local storage as the "current" order
                    localStorage.setItem(`tileOrder_${keySuffix}`, JSON.stringify(layoutData));

                    // Trigger restore immediately if on that page?
                    const container = document.getElementById(containerId);
                    if (container) {
                        DragManager.restoreOrder(container, keySuffix);
                        speak("Layout Applied");
                    }
                } else {
                    alert("Empty layout or not found.");
                }
            });

            document.getElementById('btn-customize-layout')?.addEventListener('click', () => {
                const scope = document.getElementById('layout-scope-select').value;
                const selected = document.querySelector('.layout-option-card.active');

                // If custom slot selected, we target saving TO that slot later.
                let targetSlot = null;
                if (selected && selected.dataset.id.startsWith('c')) {
                    targetSlot = selected.dataset.id;
                }

                this.enterCustomizeMode(scope, targetSlot);
            });
        },

        getLayoutData(scope, layoutId) {
            if (layoutId.startsWith('c')) {
                return JSON.parse(localStorage.getItem(`customLayout_${scope}_${layoutId}`));
            } else {
                return this.presets[scope]?.find(p => p.id === layoutId)?.data;
            }
        },

        enterCustomizeMode(scope, targetSlot) {
            // switch to the page
            const linkMap = { 'home': 'nav-home', 'control-panel': 'nav-control-panel', 'history': 'nav-history' };
            const navBtn = document.getElementById(linkMap[scope]);
            if (navBtn) navBtn.click();

            // Wait for display transition
            setTimeout(() => {
                // Enable Edit Mode & Show "Save Bar"
                const targetId = (scope === 'home') ? 'home-grid-container' : (scope === 'control-panel' ? 'cp-grid' : 'history-grid');
                const container = document.getElementById(targetId);

                // Unlock!
                if (!container.classList.contains('edit-mode-active')) {
                    const btn = document.querySelector(`.btn-edit-layout[data-target="${targetId}"]`);
                    if (btn) btn.click();
                    else if (scope === 'home') {
                        const toggle = document.getElementById('edit-mode-toggle');
                        if (toggle && !toggle.checked) toggle.click();
                    }
                }

                // Create Save UI - Robust
                const saveBar = document.createElement('div');
                saveBar.className = 'custom-save-bar';
                saveBar.style.cssText = `
                    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
                    background: var(--color-bg-card); border: 2px solid var(--color-primary);
                    padding: 15px; border-radius: 30px; z-index: 99999;
                    display: flex; gap: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.8);
                    transition: all 0.3s ease;
                `;

                const info = document.createElement('span');
                info.textContent = targetSlot ? `Editing ${targetSlot}` : "Custom Layout";
                info.style.color = 'var(--color-text)';
                info.style.fontWeight = 'bold';
                info.style.alignSelf = 'center';

                const btnSave = document.createElement('button');
                btnSave.className = 'btn btn-primary';
                btnSave.textContent = "💾 Save";

                // Use standard listener to avoid any weirdness
                btnSave.addEventListener('click', () => {
                    const order = Array.from(container.children).map(el => {
                        if (el.classList.contains('draggable-tile')) return el.id;
                        if (el.classList.contains('empty-slot')) return 'EMPTY';
                        return null;
                    }).filter(x => x);

                    const slot = targetSlot || 'c1';
                    localStorage.setItem(`customLayout_${scope}_${slot}`, JSON.stringify(order));

                    if ('speechSynthesis' in window) {
                        const u = new SpeechSynthesisUtterance(`Saved to ${slot}`);
                        window.speechSynthesis.speak(u);
                    }

                    saveBar.remove();
                    LayoutManager.definePresets();

                    // Exit Edit Mode (Simulate Lock Click)
                    const lockBtn = document.querySelector(`.btn-edit-layout[data-target="${targetId}"]`);
                    if (lockBtn && container.classList.contains('edit-mode-active')) lockBtn.click();
                    // Fallback for global
                    if (scope === 'home') {
                        const toggle = document.getElementById('edit-mode-toggle');
                        if (toggle && toggle.checked) toggle.click();
                    }
                });

                const btnCancel = document.createElement('button');
                btnCancel.className = 'btn btn-danger';
                btnCancel.textContent = "Exit";
                btnCancel.addEventListener('click', () => {
                    saveBar.remove();
                    // Exit Edit Mode (Simulate Lock Click)
                    const lockBtn = document.querySelector(`.btn-edit-layout[data-target="${targetId}"]`);
                    if (lockBtn && container.classList.contains('edit-mode-active')) lockBtn.click();
                    if (scope === 'home') {
                        const toggle = document.getElementById('edit-mode-toggle');
                        if (toggle && toggle.checked) toggle.click();
                    }
                });

                saveBar.appendChild(info);
                saveBar.appendChild(btnSave);
                saveBar.appendChild(btnCancel);
                document.body.appendChild(saveBar);

                // Announce
                console.log("Customization Bar Injected");
            }, 300); // slightly longer delay for safety
        }
    };

    // ===== 14. DRAG & DROP MANAGER (Virtual Smartphone Grid) =====
    const DragManager = {
        init() {
            const gridIds = ['home-grid-container', 'cp-grid', 'history-grid'];

            gridIds.forEach(id => {
                const container = document.getElementById(id);
                if (!container) return; // Skip if not found (e.g. wrong page or hidden)

                this.setupGrid(container, id);
                this.restoreOrder(); // This is global? No, let's rely on restoreOrder specific call or global one below
            });

            // Global restore for all grids (robustness)
            this.restoreOrder();

            // "Unlock Layout" Button Logic
            const editBtns = document.querySelectorAll('.btn-edit-layout');
            editBtns.forEach(btn => {
                btn.onclick = (e) => {
                    const targetId = btn.dataset.target;
                    const container = document.getElementById(targetId);
                    if (!container) return;

                    const isUnlocked = container.classList.toggle('edit-mode-active');

                    if (isUnlocked) {
                        btn.textContent = 'Lock Layout 🔒';
                        btn.classList.add('btn-danger');
                        const style = localStorage.getItem('editAnimStyle') || 'wiggle';
                        container.classList.add(`edit-mode-${style}`);
                        speak('Layout Unlocked');
                    } else {
                        btn.textContent = 'Unlock Layout 🔓';
                        btn.classList.remove('btn-danger');
                        container.classList.remove('edit-mode-active');
                        // clear animation class manually or regex
                        container.classList.forEach(c => {
                            if (c.startsWith('edit-mode-') && c !== 'edit-mode-active') container.classList.remove(c);
                        });

                        // Save State
                        this.saveOrder(container, targetId);

                        speak('Layout Locked');
                        triggerConfetti();
                    }
                };
            });
        },

        setupGrid(container, storageKeySuffix) {
            let draggedItem = null;
            let placeholder = document.createElement('div');
            placeholder.className = 'card placeholder-card';
            placeholder.style.opacity = '0.3';
            placeholder.style.border = '2px dashed var(--color-primary)';

            container.addEventListener('dragstart', (e) => {
                const inEditMode = container.classList.contains('edit-mode-active');
                const globalEdit = document.getElementById('edit-mode-toggle')?.checked;

                // Allow if local edit mode OR (home page AND global edit toggle)
                if (!inEditMode) {
                    if (storageKeySuffix === 'home-grid-container' && globalEdit) {
                        // Allow
                    } else {
                        e.preventDefault();
                        return;
                    }
                }

                draggedItem = e.target.closest('.draggable-tile');
                if (!draggedItem) return;

                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedItem.id);
                draggedItem.classList.add('dragging');

                setTimeout(() => {
                    draggedItem.style.display = 'none';
                    container.insertBefore(placeholder, draggedItem);
                }, 0);
            });

            container.addEventListener('dragend', (e) => {
                if (!draggedItem) return;
                draggedItem.style.display = 'block';
                draggedItem.classList.remove('dragging');
                if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
                draggedItem = null;

                this.saveOrder(container, storageKeySuffix);
                resizeChartsSafe();
            });

            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!draggedItem) return;
                const afterElement = getDragAfterElement(container, e.clientY, e.clientX);
                if (afterElement == null) {
                    container.appendChild(placeholder);
                } else {
                    container.insertBefore(placeholder, afterElement);
                }
            });

            container.addEventListener('drop', (e) => {
                e.preventDefault();
                if (!draggedItem) return;
                container.insertBefore(draggedItem, placeholder);
                playSnapSound();
            });
        },

        saveOrder(container, keySuffix) {
            const order = Array.from(container.children).map(el => {
                if (el.classList.contains('draggable-tile')) return el.id;
                if (el.classList.contains('empty-slot')) return 'EMPTY';
                return null;
            }).filter(x => x); // remove nulls

            localStorage.setItem(`tileOrder_${keySuffix}`, JSON.stringify(order));
            // Backwards compatibility for home
            if (keySuffix === 'home-grid-container') {
                const legacyOrder = order.filter(x => x !== 'EMPTY');
                localStorage.setItem('tileOrder', JSON.stringify(legacyOrder));
            }
        },

        restoreOrder() {
            const ids = ['home-grid-container', 'cp-grid', 'history-grid'];

            ids.forEach(keySuffix => {
                const container = document.getElementById(keySuffix);
                if (!container) return;

                let savedOrder = null;
                try {
                    savedOrder = JSON.parse(localStorage.getItem(`tileOrder_${keySuffix}`));
                } catch (e) { }

                // Fallback for home legacy
                if (!savedOrder && keySuffix === 'home-grid-container') {
                    try { savedOrder = JSON.parse(localStorage.getItem('tileOrder')); } catch (e) { }
                }

                if (!savedOrder) return;

                // Clear existing "Empty Slots" first
                container.querySelectorAll('.empty-slot').forEach(el => el.remove());

                const items = Array.from(container.children);
                const itemMap = {};
                items.forEach(item => { if (item.id) itemMap[item.id] = item; });

                // Re-append in order
                savedOrder.forEach(id => {
                    if (id === 'EMPTY') {
                        const slot = document.createElement('div');
                        slot.className = 'empty-slot locked';
                        slot.dataset.type = 'empty';
                        container.appendChild(slot);
                    } else if (itemMap[id]) {
                        container.appendChild(itemMap[id]);
                        delete itemMap[id]; // mark placed
                    }
                });

                // Append leftovers
                Object.values(itemMap).forEach(item => {
                    if (!item.classList.contains('empty-slot')) container.appendChild(item);
                });
            });
        }
    };

    function getDragAfterElement(container, y, x) {
        const draggableElements = [...container.querySelectorAll('.draggable-tile:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            // simple distance check
            const offsetX = x - box.left - box.width / 2;
            const offsetY = y - box.top - box.height / 2;
            // This logic is simplified for grid; exact index calculation is complex in raw JS 
            // but this heuristic usually works for flow layouts.
            // Using a simpler approach: finding closest element distance
            const dist = Math.hypot(box.x + box.width / 2 - x, box.y + box.height / 2 - y);

            if (dist < closest.offset) {
                return { offset: dist, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.POSITIVE_INFINITY }).element;
    }



    function resizeChartsSafe() {
        // Trigger window resize event to force Chart.js update
        window.dispatchEvent(new Event('resize'));
        // Or specifically update known charts if needed
        Object.values(realTimeCharts).forEach(c => c && c.resize());
    }

    // ===== 15. MULTIMEDIA & ENGINEERING LOGIC =====
    function playSnapSound() {
        const audio = document.getElementById('audio-snap');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log('Audio blocked', e));
        }
    }

    let voiceEnabled = localStorage.getItem('voiceEnabled') !== 'false'; // default true
    const voiceToggle = document.getElementById('voice-announcements-toggle');
    if (voiceToggle) {
        voiceToggle.checked = voiceEnabled;
        voiceToggle.addEventListener('change', (e) => {
            voiceEnabled = e.target.checked;
            localStorage.setItem('voiceEnabled', voiceEnabled);
            if (voiceEnabled) speak("Voice initialized");
        });
    }

    function speak(text) {
        if (!voiceEnabled) return;
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.1; // slightly faster
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    }

    function checkThresholds(data) {
        // Threshold Watcher
        let alert = false;

        // Battery SoC
        const soc = data.battery?.soc || 0;
        const battCard = document.getElementById('tile-source3') || document.querySelector('.card h4[data-tile-id="source3"]')?.closest('.card');
        if (soc < 20 && soc > 0) {
            battCard?.classList.add('alert-shake');
            alert = true;
        } else {
            battCard?.classList.remove('alert-shake');
        }

        // Current > 10A (Solar/Thermal/Battery)
        // Simplified check: any current > 10
        [data.solar, data.thermal, data.battery].forEach((src, idx) => {
            if (src && src.current > 10) {
                const id = idx === 0 ? 'tile-source1' : (idx === 1 ? 'tile-source2' : 'tile-source3');
                const card = document.getElementById(id);
                card?.classList.add('alert-shake');
                alert = true;
            }
        });

        if (alert) {
            // throttle sound?
        }
    }

    function updateEcoStory(data) {
        // CO2 Savings (kg) = (Solar kWh + Thermal kWh) * 0.85
        // We only have Power (W) here properly. We need Energy (kWh).
        // For a live widget, we can approximate "rate of saving" or accumulate if we had history.
        // Let's use the History Total values for this calculation.
        // Fetch from DOM hidden elements or just use live power integration (simplistic).

        // Better: Use the 'hist-solar-total' and 'hist-thermal-total' if available.
        // Since we don't have easy access to total history sum here without querying DB,
        // let's grab the text content from the history tab which is updated by history listener.
        const solTotal = parseFloat(document.getElementById('hist-solar-total')?.textContent || 0);
        const thermTotal = parseFloat(document.getElementById('hist-thermal-total')?.textContent || 0);

        if (!isNaN(solTotal) && !isNaN(thermTotal)) {
            const co2 = (solTotal + thermTotal) * 0.85;
            updateElement('co2-saved-val', co2.toFixed(2));
        }
    }

    // Call Eco Update periodically
    setInterval(() => updateEcoStory({}), 5000);

    // Initialize Drag Logic
    // DragManager.init(); // called at bottom
    // DragManager.restoreOrder();

    // Edit Mode Toggle Logic (Global Setting -> Home Grid)
    const editToggle = document.getElementById('edit-mode-toggle');
    if (editToggle) {
        editToggle.addEventListener('change', (e) => {
            const container = document.getElementById('home-grid-container');
            if (e.target.checked) {
                container.classList.add('edit-mode-active');
                const style = document.getElementById('edit-animation-style')?.value || 'wiggle';
                container.classList.add(`edit-mode-${style}`);
                speak("Edit Mode Enabled");
            } else {
                container.classList.remove('edit-mode-active');
                // Remove all edit-mode-* classes
                container.classList.forEach(c => {
                    if (c.startsWith('edit-mode-') && c !== 'edit-mode-active') container.classList.remove(c);
                });
                speak("Edit Mode Disabled");
            }
        });
    }

    // Animation Style Change (Global)
    const animSelect = document.getElementById('edit-animation-style');
    if (animSelect) {
        animSelect.addEventListener('change', (e) => {
            localStorage.setItem('editAnimStyle', e.target.value);
            // Apply to any active grid
            document.querySelectorAll('.edit-mode-active').forEach(grid => {
                grid.classList.forEach(c => {
                    if (c.startsWith('edit-mode-') && c !== 'edit-mode-active') grid.classList.remove(c);
                });
                grid.classList.add(`edit-mode-${e.target.value}`);
            });
        });
    }

    // Project Mode Select
    const modeSelect = document.getElementById('project-mode-selector');
    if (modeSelect) {
        // Apply presets logic similar to before
        modeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            // Reset base
            document.body.className = '';
            setThemeMode(localStorage.getItem('dashboardTheme') || 'light'); // restore theme base

            if (mode === 'lifi') {
                // Li-Fi: High transparency, Green/Cyan accent
                document.documentElement.style.setProperty('--card-opacity', 0.6);
                setAccentColor('#00ff9d'); // neon green
                document.body.classList.add('bg-cyber');
            } else if (mode === 'smartgrid') {
                // Smart Grid: Engineering blue, Blueprint style maybe?
                setAccentColor('#007bff');
                document.body.classList.add('bg-polka');
            } else if (mode === 'wireless') {
                setAccentColor('#8c52ff'); // purple
            }
            speak(`${mode} Mode Activated`);
        });
    }

    function triggerConfetti() {
        const colors = ['#ff4757', '#2ecc71', '#3498db', '#f1c40f', '#9b59b6'];
        for (let i = 0; i < 50; i++) {
            const conf = document.createElement('div');
            conf.style.position = 'fixed';
            conf.style.left = Math.random() * 100 + 'vw';
            conf.style.top = '-10px';
            conf.style.width = Math.random() * 10 + 5 + 'px';
            conf.style.height = Math.random() * 5 + 5 + 'px';
            conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            conf.style.zIndex = '9999';
            conf.style.transition = 'top 2s ease-out, transform 2s ease-in';
            document.body.appendChild(conf);

            setTimeout(() => {
                conf.style.top = '110vh';
                conf.style.transform = `rotate(${Math.random() * 360}deg)`;
            }, 100);

            setTimeout(() => conf.remove(), 2000);
        }
    }

    // Initialize Drag Manager
    DragManager.init();
    LayoutManager.init(); // Init Layout System after DOM

    // ===== 16. HELPER FUNCTIONS =====
    function setAccentColor(color) {
        document.documentElement.style.setProperty('--color-primary', color);
        document.documentElement.style.setProperty('--color-glow', `0 0 15px ${color}`);
    }

    function setThemeMode(mode) {
        // Simple theme reset
        document.body.classList.remove('dark-mode', 'theme-blue', 'theme-green', 'theme-orange', 'theme-purple');
        if (mode === 'dark') {
            document.body.classList.add('dark-mode');
        }
        // Save preference
        localStorage.setItem('dashboardTheme', mode);
    }

});

// ==========================================
// NEW FEATURES EXTENSION (Voice, Notification, Weather, Market)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. NOTIFICATION SYSTEM ---
    class NotificationManager {
        constructor() {
            this.drawer = document.getElementById('notification-drawer');
            this.list = document.getElementById('notification-list');
            this.badge = document.getElementById('notif-badge');
            this.toggleBtn = document.getElementById('btn-notif-toggle');
            this.closeBtn = document.getElementById('btn-close-notif');
            this.unreadCount = 0;

            this.initListeners();
        }

        initListeners() {
            if (this.toggleBtn) this.toggleBtn.addEventListener('click', () => this.toggleDrawer());
            if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.closeDrawer());
        }

        toggleDrawer() {
            this.drawer.classList.toggle('open');
            if (this.drawer.classList.contains('open')) {
                this.unreadCount = 0;
                this.updateBadge(); // Clear badge
            }
        }

        closeDrawer() {
            this.drawer.classList.remove('open');
        }

        add(message, type = 'info') {
            const item = document.createElement('div');
            item.className = `notif-item ${type}`;
            const time = new Date().toLocaleTimeString();
            item.innerHTML = `
                <div class="notif-msg">${message}</div>
                <span class="notif-time">${time}</span>
            `;

            // Add to top
            if (this.list.querySelector('.empty-state')) {
                this.list.innerHTML = '';
            }
            this.list.prepend(item);

            // Play sound if critical
            if (type === 'warning' || type === 'error') {
                const audio = document.getElementById('audio-alert');
                if (audio) { audio.currentTime = 0; audio.play().catch(() => { }); }
            } else {
                const audio = document.getElementById('audio-blip');
                if (audio) { audio.currentTime = 0; audio.play().catch(() => { }); }
            }

            // Badge
            if (!this.drawer.classList.contains('open')) {
                this.unreadCount++;
                this.updateBadge();
            }
        }

        updateBadge() {
            if (this.unreadCount > 0) {
                this.badge.style.display = 'block';
                // this.badge.textContent = this.unreadCount; // Dot style usually no number for small badge
            } else {
                this.badge.style.display = 'none';
            }
        }
    }

    const notifSystem = new NotificationManager();
    window.notifSystem = notifSystem; // Expose global

    // --- 2. ENHANCED VOICE COMMAND MODULE (Google Assistant Style) ---
    class VoiceCommander {
        constructor() {
            this.btn = document.getElementById('btn-voice-command');
            this.overlay = document.getElementById('voice-overlay');
            this.closeBtn = document.getElementById('btn-stop-voice');
            this.transcriptEl = document.getElementById('voice-transcript');
            this.suggestions = document.querySelectorAll('.suggestion-chip');

            this.recognition = null;
            this.isListening = false;

            this.init();
        }

        init() {
            // Setup Suggestions
            this.suggestions.forEach(chip => {
                chip.addEventListener('click', () => {
                    const cmd = chip.textContent.replace(/"/g, '').toLowerCase();
                    this.processCommand(cmd);
                });
            });

            if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.stopListening());

            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                this.recognition = new SpeechRecognition();
                this.recognition.continuous = false;
                this.recognition.lang = 'en-US';
                this.recognition.interimResults = true; // Show words as they are spoken

                this.recognition.onstart = () => {
                    this.isListening = true;
                    this.overlay.classList.add('active');
                    this.transcriptEl.textContent = "Listening...";
                };

                this.recognition.onend = () => {
                    this.isListening = false;
                    // Auto-close overlay after short delay if no command processed? 
                    // Or keep open showing result. For now, let's keep open briefly.
                    setTimeout(() => {
                        if (!this.isListening) this.overlay.classList.remove('active');
                    }, 2000);
                };

                this.recognition.onresult = (event) => {
                    const transcript = Array.from(event.results)
                        .map(result => result[0].transcript)
                        .join('');

                    this.transcriptEl.textContent = transcript;

                    if (event.results[0].isFinal) {
                        this.processCommand(transcript.toLowerCase());
                    }
                };

                this.btn.addEventListener('click', () => {
                    if (this.isListening) this.stopListening();
                    else this.startListening();
                });
            } else {
                console.warn("Speech Recognition API not supported.");
                this.btn.style.display = 'none';
            }
        }

        startListening() {
            try {
                this.recognition.start();
            } catch (e) {
                console.error("Mic already active");
            }
        }

        stopListening() {
            if (this.recognition) this.recognition.stop();
            this.overlay.classList.remove('active');
        }

        processCommand(cmd) {
            notifSystem.add(`Voice Command: "${cmd}"`, 'success');
            const speak = (text) => {
                const utterance = new SpeechSynthesisUtterance(text);
                window.speechSynthesis.speak(utterance);
            };

            // Command Logic
            if (cmd.includes('home')) {
                document.getElementById('nav-home').click();
                speak("Showing Home Dashboard");
            }
            else if (cmd.includes('control') || cmd.includes('panel')) {
                document.getElementById('nav-control-panel').click();
                speak("Opening Control Panel");
            }
            else if (cmd.includes('settings')) {
                document.querySelector('a[href="#settings"]').click();
                speak("Opening Settings");
            }
            else if (cmd.includes('eco mode')) {
                const ecoBtn = document.querySelector('button[data-mode="eco"]');
                if (ecoBtn) ecoBtn.click();
                speak("Eco Mode Activated");
            }
            else if (cmd.includes('boost mode') || cmd.includes('turbo')) {
                const boostBtn = document.querySelector('button[data-mode="boost"]');
                if (boostBtn) boostBtn.click();
                speak("Boost Mode Activated");
            }
            else if (cmd.includes('dark mode')) {
                document.getElementById('btn-theme-dark').click();
                speak("Dark mode enabled");
            }
            else if (cmd.includes('light mode')) {
                document.getElementById('btn-theme-light').click();
                speak("Light mode enabled");
            }
            else if (cmd.includes('status') || cmd.includes('report')) {
                const solar = document.getElementById('home-solar-power').textContent;
                const batt = document.getElementById('home-batt-soc').textContent;
                speak(`System Status. Solar power is ${solar} watts. Battery is at ${batt} percent.`);
            }
            // Graphs
            else if (cmd.includes('graph') || cmd.includes('chart')) {
                if (cmd.includes('battery')) document.querySelector('button[data-key="battery"]').click();
                else if (cmd.includes('solar')) document.querySelector('button[data-key="solar"]').click();
                document.querySelector('a[href="#graphs"]').click();
                speak("Here are the graphs you requested.");
            }
            // Load Control
            else if ((cmd.includes('turn on') || cmd.includes('enable')) && cmd.includes('low')) {
                document.querySelector('button[data-load="low"][data-cmd="on"]').click();
                speak("Low priority load turned on");
            }
            else if ((cmd.includes('turn off') || cmd.includes('disable')) && cmd.includes('low')) {
                document.querySelector('button[data-load="low"][data-cmd="off"]').click();
                speak("Low priority load turned off");
            }
            else {
                speak("I heard you, but I don't know that command yet.");
            }
        }
    }
    const voiceCmd = new VoiceCommander();


    // --- 3. ANDROID STYLE WEATHER APP BACKEND ---
    class WeatherService {
        constructor() {
            // Widget Trigger
            this.widgetEl = document.getElementById('weather-widget');

            // Full App Elements
            this.modal = document.getElementById('weather-modal');
            this.closeBtn = document.getElementById('btn-close-weather');
            this.searchBtn = document.getElementById('btn-weather-search');
            this.searchOverlay = document.getElementById('weather-search-overlay');
            this.searchInput = document.getElementById('weather-search-input');
            this.searchResults = document.getElementById('search-results');
            this.appParams = document.getElementById('weather-app-bg');

            // App Data Fields
            this.modalCity = document.getElementById('modal-city-name');
            this.modalTemp = document.getElementById('modal-temp');
            this.modalDesc = document.getElementById('modal-desc');
            this.modalH = document.getElementById('modal-h-temp');
            this.modalL = document.getElementById('modal-l-temp');
            this.forecastList = document.getElementById('forecast-list');
            this.hourlyList = document.getElementById('hourly-list');

            // Details Grid
            this.tempEl = document.getElementById('weather-temp');
            this.descEl = document.getElementById('weather-desc');
            this.cloudEl = document.getElementById('weather-cloud');
            this.iconEl = document.getElementById('weather-icon');

            this.uvEl = document.getElementById('detail-uv');
            this.sunEl = document.getElementById('detail-sunset');
            this.riseEl = document.getElementById('detail-sunrise');
            this.windEl = document.getElementById('detail-wind');
            this.humEl = document.getElementById('detail-humidity');
            this.pressEl = document.getElementById('detail-pressure');
            this.feelEl = document.getElementById('detail-feels');

            this.currentCoords = { lat: 12.97, long: 77.59, name: 'Bengaluru' }; // Default

            // NEW: Clock & Preference initialization
            this.clockWidget = document.getElementById('weather-clock-widget');
            this.clockFull = document.getElementById('weather-clock-full');
            this.weatherThemeSelect = document.getElementById('weather-theme-select');
            this.weatherClockStyleSelect = document.getElementById('weather-clock-style');
            this.weatherClockToggle = document.getElementById('weather-clock-visual-preview-toggle');
            this.btnSaveWeatherSettings = document.getElementById('btn-save-weather-settings');

            // Load saved preferences
            this.userTheme = localStorage.getItem('weatherTheme') || 'auto';
            this.clockStyle = localStorage.getItem('weatherClockStyle') || 'preset-1';
            this.showClock = localStorage.getItem('weatherShowClock') !== 'false'; // Default true

            // Apply initial settings to UI inputs
            if (this.weatherThemeSelect) this.weatherThemeSelect.value = this.userTheme;
            if (this.weatherClockStyleSelect) this.weatherClockStyleSelect.value = this.clockStyle;
            if (this.weatherClockToggle) this.weatherClockToggle.checked = this.showClock;

            this.init();
        }

        init() {
            console.log("WeatherService Initializing...");
            // Settings Listeners
            if (this.btnSaveWeatherSettings) {
                this.btnSaveWeatherSettings.addEventListener('click', () => {
                    this.userTheme = this.weatherThemeSelect.value;
                    this.clockStyle = this.weatherClockStyleSelect.value;
                    this.showClock = this.weatherClockToggle.checked;

                    localStorage.setItem('weatherTheme', this.userTheme);
                    localStorage.setItem('weatherClockStyle', this.clockStyle);
                    localStorage.setItem('weatherShowClock', this.showClock);

                    this.applyClockStyles();

                    // Re-render UI to apply theme changes immediately if data exists
                    if (this.lastData) this.updateUI(this.lastData);

                    notifSystem.add("Weather Preferences Saved!", "success");
                });
            }

            // Initial Fetch
            this.fetchWeather(this.currentCoords.lat, this.currentCoords.long);
            setInterval(() => this.fetchWeather(this.currentCoords.lat, this.currentCoords.long), 600000);

            // Open/Close App
            if (this.widgetEl) {
                this.widgetEl.addEventListener('click', () => {
                    console.log("Weather Widget Clicked");
                    this.openApp();
                });
            } else {
                console.error("Weather Widget Element Not Found!");
            }

            if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.closeApp());
            if (this.modal) {
                this.modal.addEventListener('click', (e) => {
                    if (e.target === this.modal) this.closeApp();
                });
            }

            // Search Toggle
            if (this.searchBtn) {
                this.searchBtn.addEventListener('click', () => {
                    this.searchOverlay.classList.toggle('active');
                    if (this.searchOverlay.classList.contains('active')) this.searchInput.focus();
                });
            }

            // Search Input
            if (this.searchInput) {
                let debounce;
                this.searchInput.addEventListener('input', (e) => {
                    clearTimeout(debounce);
                    debounce = setTimeout(() => this.handleSearch(e.target.value), 500);
                });
            }

            // Auto-Detect Location
            this.startClock();
            this.getUserLocation();
        }

        startClock() {
            this.applyClockStyles();

            const updateTime = () => {
                const now = new Date();
                let timeStr = now.toLocaleTimeString('en-US', { hour12: false });

                // Specific formats
                if (this.clockStyle === 'preset-4' || this.clockStyle === 'preset-1') {
                    timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                }

                // Date String
                const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const combinedString = `${timeStr}  ${dateStr}`;

                // For widget: Time + Date on one line (user requested "beside")

                if (this.showClock) {
                    if (this.clockWidget) {
                        // Using HTML to style them differently if needed, or just text
                        this.clockWidget.innerHTML = `<span style="font-size:1.1em">${timeStr}</span> <span style="font-size:0.6em; opacity:0.8; margin-left:6px">${dateStr}</span>`;
                        this.clockWidget.style.display = 'block';
                        this.clockWidget.setAttribute('data-time', timeStr);
                    }
                    if (this.clockFull) {
                        this.clockFull.textContent = combinedString;
                        this.clockFull.style.display = 'block';
                        this.clockFull.setAttribute('data-time', combinedString);
                    }
                } else {
                    if (this.clockWidget) this.clockWidget.style.display = 'none';
                    if (this.clockFull) this.clockFull.style.display = 'none';
                }
            };

            // Run immediately then interval
            updateTime();
            if (this.clockInterval) clearInterval(this.clockInterval);
            this.clockInterval = setInterval(updateTime, 1000);
        }

        applyClockStyles() {
            const presets = ['preset-1', 'preset-2', 'preset-3', 'preset-4', 'preset-5', 'preset-6', 'preset-7', 'preset-8', 'preset-9', 'preset-10'];
            // Safety check for null style
            if (!this.clockStyle) this.clockStyle = 'preset-1';

            if (this.clockWidget) {
                this.clockWidget.classList.remove(...presets);
                this.clockWidget.classList.add(this.clockStyle);
            }
            if (this.clockFull) {
                this.clockFull.classList.remove(...presets);
                this.clockFull.classList.add(this.clockStyle);
            }
        }

        getUserLocation() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const lat = position.coords.latitude;
                        const long = position.coords.longitude;
                        this.currentCoords = { lat, long, name: 'Locating...' };
                        this.reverseGeocode(lat, long);
                    },
                    (error) => {
                        console.log("Location denied/unavailable, keeping default.");
                        // Default load happens in constructor/init anyway if this fails or takes time
                        // But we might want to ensure we don't double fetch if this is fast.
                        // For now, let the initial fetch happen, then update if loc found.
                    }
                );
            }
        }

        async reverseGeocode(lat, long) {
            // Reverse Geocoding to get city name
            const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${long}&count=1&format=json&language=en`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.results && data.results[0]) {
                    this.currentCoords.name = data.results[0].name;
                } else {
                    this.currentCoords.name = "Your Location";
                }
            } catch (e) {
                console.error("Reverse geo failed", e);
                this.currentCoords.name = "Unknown Location";
            }
            // Update UI with new location
            if (this.modalCity) this.modalCity.textContent = this.currentCoords.name;
            this.fetchWeather(lat, long);
            notifSystem.add(`Weather updated to ${this.currentCoords.name}`, "success");
        }

        openApp() {
            console.log("Opening Weather App...");
            notifSystem.add("Opening Weather App...", "info");
            if (this.modal) {
                this.modal.classList.add('open');
                // Ensure data is fresh
                this.fetchWeather(this.currentCoords.lat, this.currentCoords.long);
            } else {
                console.error("Weather Modal Not Found");
                notifSystem.add("Error: Weather App Modal missing.", "danger");
            }
        }

        closeApp() {
            if (this.modal) this.modal.classList.remove('open');
            if (this.searchOverlay) this.searchOverlay.classList.remove('active');
        }

        async handleSearch(query) {
            if (query.length < 3) {
                if (this.searchResults) this.searchResults.innerHTML = '';
                return;
            }
            const url = `https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=5&language=en&format=json`;
            try {
                const res = await fetch(url);
                const data = await res.json();
                if (data.results) this.showSearchResults(data.results);
            } catch (e) { console.error('Geocoding error', e); }
        }

        showSearchResults(results) {
            if (!this.searchResults) return;
            this.searchResults.innerHTML = '';
            results.forEach(city => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.textContent = `${city.name}, ${city.country}`;
                div.addEventListener('click', () => {
                    this.currentCoords = { lat: city.latitude, long: city.longitude, name: city.name };
                    this.fetchWeather(city.latitude, city.longitude);
                    if (this.modalCity) this.modalCity.textContent = city.name;
                    if (this.searchOverlay) this.searchOverlay.classList.remove('active');
                    if (this.searchInput) this.searchInput.value = '';
                });
                this.searchResults.appendChild(div);
            });
        }

        async fetchWeather(lat, long) {
            console.log("Fetching weather for:", lat, long);
            // Detailed Call
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${long}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m&hourly=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto`;

            try {
                const response = await fetch(url);
                const data = await response.json();
                this.lastData = data; // Store for theme switching
                this.updateUI(data);
            } catch (error) {
                console.error("Weather fetch failed for coordinates:", lat, long, error);
            }
        }

        updateUI(data) {
            if (!data || !data.current) return;

            const cur = data.current;
            const daily = data.daily;
            const hourly = data.hourly;

            // 1. Current Main Stats
            const temp = Math.round(cur.temperature_2m);
            const { desc, icon, bgClass, isNight } = this.getWeatherMeta(cur.weather_code, cur.is_day);

            // Widget Update
            if (this.tempEl) this.tempEl.textContent = temp;
            if (this.cloudEl) this.cloudEl.textContent = cur.cloud_cover;
            if (this.descEl) this.descEl.textContent = desc;
            if (this.iconEl) this.iconEl.textContent = icon;

            // App Main Update
            if (this.modalTemp) this.modalTemp.textContent = temp;
            if (this.modalDesc) this.modalDesc.textContent = desc;
            if (this.modalH && daily) this.modalH.textContent = Math.round(daily.temperature_2m_max[0]);
            if (this.modalL && daily) this.modalL.textContent = Math.round(daily.temperature_2m_min[0]);
            if (this.modalCity) this.modalCity.textContent = this.currentCoords.name;

            // Background Update
            // Keep default class and add specific bg
            if (this.appParams) {
                this.appParams.className = `weather-app-window ${bgClass}`;

                // Clear old animations (simple way: remove specific children or just append if not exist)
                // Better: Toggle opacity or visibility of fixed absolute elements. 
                // For simplicity in this structure, we'll inject/remove specific divs.

                // Remove existing dynamic elements
                const existingClouds = this.appParams.querySelectorAll('.moving-cloud');
                const existingStars = this.appParams.querySelectorAll('.shooting-star');
                const existingSun = this.appParams.querySelectorAll('.sun-glare');
                existingClouds.forEach(el => el.remove());
                existingStars.forEach(el => el.remove());
                existingSun.forEach(el => el.remove());

                if (isNight) {
                    // Add Stars
                    const star = document.createElement('div');
                    star.className = 'shooting-star';
                    this.appParams.appendChild(star);
                } else {
                    // Add Sun & Clouds
                    if (desc.includes('Sun') || desc.includes('Clear')) {
                        const sun = document.createElement('div');
                        sun.className = 'sun-glare';
                        this.appParams.appendChild(sun);
                    }
                    if (desc.includes('Cloud')) {
                        const cloud = document.createElement('div');
                        cloud.className = 'moving-cloud';
                        this.appParams.appendChild(cloud);
                    }
                }
            }

            // 2. Details Grid
            if (this.uvEl && daily) this.uvEl.textContent = daily.uv_index_max[0];
            if (this.windEl) this.windEl.textContent = cur.wind_speed_10m;
            if (this.humEl) this.humEl.textContent = cur.relative_humidity_2m;
            if (this.pressEl) this.pressEl.textContent = cur.pressure_msl;
            if (this.feelEl) this.feelEl.textContent = Math.round(cur.apparent_temperature);

            if (this.riseEl && daily) this.riseEl.textContent = daily.sunrise[0].split('T')[1];
            if (this.sunEl && daily) this.sunEl.textContent = daily.sunset[0].split('T')[1];

            // 3. Hourly Forecast (Next 24h)
            this.renderHourly(hourly);

            // 4. Daily Forecast (Next 7-10 days)
            this.renderDaily(daily);
        }

        renderHourly(hourly) {
            if (!this.hourlyList || !hourly) return;
            this.hourlyList.innerHTML = '';

            const now = new Date();
            const currentHour = now.getHours();

            let count = 0;
            for (let i = 0; i < hourly.time.length; i++) {
                if (count >= 24) break;

                const timeStr = hourly.time[i];
                const date = new Date(timeStr);
                // Skip past hours (simple check, assuming sorted)
                // If same day and hour < currentHour, skip. If past day, skip.
                // Simplest: Check if date >= now (roughly)
                if (date.getDate() === now.getDate() && date.getHours() < currentHour) continue;
                if (date < now && date.getDate() !== now.getDate()) continue; // Past days

                const hourLabel = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                const temp = Math.round(hourly.temperature_2m[i]);
                const code = hourly.weather_code[i];
                const isDay = hourly.is_day[i];
                const { icon } = this.getWeatherMeta(code, isDay);

                const div = document.createElement('div');
                div.className = 'hourly-item';
                div.innerHTML = `
                    <span class="h-time">${count === 0 ? 'Now' : hourLabel}</span>
                    <span class="h-icon">${icon}</span>
                    <span class="h-temp">${temp}°</span>
                `;
                this.hourlyList.appendChild(div);
                count++;
            }
        }

        renderDaily(daily) {
            if (!this.forecastList || !daily) return;
            this.forecastList.innerHTML = '';

            for (let i = 1; i < daily.time.length; i++) { // Start from tomorrow (i=1) usually
                const date = new Date(daily.time[i]);
                const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
                const max = Math.round(daily.temperature_2m_max[i]);
                const min = Math.round(daily.temperature_2m_min[i]);
                const code = daily.weather_code[i];
                const { icon } = this.getWeatherMeta(code, 1); // Assume day icon

                const div = document.createElement('div');
                div.className = 'forecast-day';
                div.innerHTML = `
                    <span class="f-day" style="width:100px">${dayName}</span>
                    <span class="f-icon">${icon}</span>
                    <span class="f-temp" style="width:80px">${max}° / ${min}°</span>
                `;
                this.forecastList.appendChild(div);
            }
        }

        getWeatherMeta(code, isDayApi) {
            // Override isDay based on user preference
            let isDay = isDayApi;
            if (this.userTheme === 'light') isDay = 1;
            if (this.userTheme === 'dark') isDay = 0;

            let desc = 'Unknown';
            let icon = '❓';
            let bgClass = 'bg-sunny';

            // Groups
            if (code === 0) {
                desc = 'Clear';
                icon = isDay ? '☀️' : '🌙';
                bgClass = isDay ? 'bg-sunny' : 'bg-night';
            } else if (code <= 3) {
                desc = 'Cloudy';
                icon = isDay ? '⛅' : '☁️';
                bgClass = 'bg-cloudy';
            } else if (code <= 48) {
                desc = 'Foggy';
                icon = '🌫️';
                bgClass = 'bg-cloudy';
            } else if (code <= 45) { // Fixed range
                desc = 'Fog'; icon = '🌫️'; bgClass = 'bg-cloudy';
            } else if (code <= 67) {
                desc = 'Rain';
                icon = '🌧️';
                bgClass = 'bg-rain';
            } else if (code <= 77) {
                desc = 'Snow';
                icon = '❄️';
                bgClass = 'bg-rain'; // or bg-snow if we had it
            } else if (code <= 99) {
                desc = 'Storm';
                icon = '⚡';
                bgClass = 'bg-rain';
            }

            // Force night bg if logic dictates
            if (!isDay) bgClass = 'bg-night';

            return { desc, icon, bgClass, isNight: !isDay };
        }
    }
    const weatherSvc = new WeatherService();


    // --- 4. ENERGY MARKET SIMULATOR (NET METERING) ---
    class MarketSimulator {
        constructor() {
            this.priceEl = document.getElementById('ticker-price');
            this.trendEl = document.getElementById('ticker-trend');
            this.demandEl = document.getElementById('ticker-demand');

            this.price = 0.12; // Base price
            this.trend = 0; // 0=flat, 1=up, -1=down

            // Update every 5 seconds
            setInterval(() => this.updateMarket(), 5000);
        }

        updateMarket() {
            // Random fluctuation
            const change = (Math.random() - 0.5) * 0.01;
            this.price = Math.max(0.05, Math.min(0.50, this.price + change));

            this.trend = change > 0 ? 1 : -1;

            if (this.priceEl) this.priceEl.textContent = this.price.toFixed(3);
            if (this.trendEl) {
                this.trendEl.textContent = this.trend > 0 ? '▲' : '▼';
                this.trendEl.style.color = this.trend > 0 ? 'var(--color-danger)' : 'var(--color-success)';
            }

            // Demand logic
            let demand = 'NORMAL';
            if (this.price > 0.15) demand = 'HIGH';
            if (this.price < 0.08) demand = 'LOW';
            if (this.demandEl) {
                this.demandEl.textContent = demand;
                this.demandEl.style.color = demand === 'HIGH' ? 'var(--color-danger)' : (demand === 'LOW' ? 'var(--color-success)' : 'inherit');
            }

            // Trigger notification on extreme events
            if (this.price > 0.25 && demand === 'HIGH') {
                // Throttle notifications?
                if (Math.random() > 0.8) notifSystem.add(`High Grid Demand! Price: $${this.price.toFixed(2)}`, 'warning');
            }
        }
    }
    const marketSim = new MarketSimulator();

    // Initial Welcome Notification
    setTimeout(() => {
        notifSystem.add("System Online. Voice Command Ready.", "success");
    }, 3000);

});

