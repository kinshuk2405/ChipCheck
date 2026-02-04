
// ==========================================
// ChipCheck - Single File Bundle
// ==========================================

// --- STATE MANAGEMENT ---
const state = {
    totalBuyIn: 0,
    sessionBuyIn: 500,
    chipDenominations: [],
    currentSessionName: "",
    currentLocation: "",
    sessionStartTime: null,
    isRunningBalanceMode: false,
    players: {}, // { "Name": { buyIn: 0, cashOut: 0, buyInCount: 0, isLeft: false } }
    history: [],
    registry: {}, // { "Name": { sessions: 0, profit: 0, buyIns: 0, ... } }
    templates: {} // { "TemplateName": { buyIn: 500, denoms: [], location: "", running: false } }
};

// Initial Config Defaults
const defaults = {
    sessionBuyIn: 500,
    chipDenominations: ["10", "25", "50", "100", "500"]
};

// Actions to mutate state
function setSessionConfig(name, location, buyIn, denoms, runningBalance, startTime) {
    state.currentSessionName = name;
    state.currentLocation = location;
    state.sessionBuyIn = buyIn;
    state.chipDenominations = denoms;
    state.isRunningBalanceMode = runningBalance;
    state.sessionStartTime = startTime || Date.now();
}

function resetState() {
    state.totalBuyIn = 0;
    state.players = {};
    state.currentSessionName = "";
}

function addPlayer(name, amount) {
    if (!state.players[name]) {
        state.players[name] = { buyIn: 0, cashOut: 0, buyInCount: 0, isLeft: false };
    }
    state.players[name].isLeft = false;
    state.players[name].buyIn += amount;
    state.players[name].buyInCount += 1;
    state.totalBuyIn += amount;
}

function updatePlayerCashOut(name, amount) {
    if (state.players[name]) {
        state.players[name].cashOut = Number(amount);
    }
}

function removePlayer(name, cashOutAmount) {
    if (state.players[name]) {
        state.players[name].cashOut = Number(cashOutAmount);
        state.players[name].isLeft = true;
    }
}

function setHistory(hist) {
    state.history = hist;
}

function setRegistry(reg) {
    state.registry = reg || {};
}

function setTemplates(temps) {
    state.templates = temps || {};
}

function saveTemplate(name, config) {
    state.templates[name] = config;
}

function deleteTemplate(name) {
    delete state.templates[name];
}

function updateRegistryFromSession(results, date) {
    results.forEach(r => {
        const name = r.name;
        const regKey = capitalizeName(name);

        if (!state.registry[regKey]) {
            state.registry[regKey] = {
                name: regKey,
                sessions: 0,
                totalProfit: 0,
                totalBuyIns: 0,
                totalRebuys: 0,
                biggestWin: 0,
                biggestLoss: 0,
                lastPlayed: null
            };
        }

        let p = state.registry[regKey];
        p.sessions++;
        p.totalProfit += r.net;
        p.totalBuyIns += r.buyIn;
        let rebuys = r.buyInCount ? r.buyInCount - 1 : 0;
        if (rebuys < 0) rebuys = 0;
        p.totalRebuys += rebuys;

        if (r.net > p.biggestWin) p.biggestWin = r.net;
        if (r.net < p.biggestLoss) p.biggestLoss = r.net;

        p.lastPlayed = date;
    });
}

function addToHistory(session) {
    state.history.unshift(session);
}

function capitalizeName(name) {
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// --- STORAGE MANAGEMENT ---

const STORAGE_KEYS = {
    ACTIVE_SESSION: "activePokerSession",
    HISTORY: "pokerSessionHistory",
    PLAYER_REGISTRY: "pokerPlayerRegistry",
    TEMPLATES: "pokerSessionTemplates"
};

function saveActiveSession() {
    const data = {
        totalBuyIn: state.totalBuyIn,
        sessionBuyIn: state.sessionBuyIn,
        chipDenominations: state.chipDenominations,
        currentSessionName: state.currentSessionName,
        currentLocation: state.currentLocation,
        isRunningBalanceMode: state.isRunningBalanceMode,
        players: state.players,
        sessionStarted: true
    };
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(data));
    console.log("Session saved");
}

function clearActiveSession() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
}

function loadActiveSession() {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error("Failed to parse session", e);
        return null;
    }
}

function saveHistory() {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(state.history));
}

function loadHistory() {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return raw ? JSON.parse(raw) : [];
}

function saveRegistry() {
    localStorage.setItem(STORAGE_KEYS.PLAYER_REGISTRY, JSON.stringify(state.registry));
}

function loadRegistry() {
    const raw = localStorage.getItem(STORAGE_KEYS.PLAYER_REGISTRY);
    return raw ? JSON.parse(raw) : {};
}

function saveTemplates() {
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(state.templates));
}

function loadTemplates() {
    const raw = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
    return raw ? JSON.parse(raw) : {};
}

function clearAllHistory() {
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
}

// --- ANALYTICS ---

function calculateSettlements(results, isRunningBalanceMode, history) {
    let settlements = [];
    let workingResults = results;

    if (isRunningBalanceMode && history) {
        let tally = {};
        history.forEach(h => {
            if (h.results) {
                h.results.forEach(r => {
                    if (!tally[r.name]) tally[r.name] = 0;
                    tally[r.name] += r.net;
                });
            }
        });
        results.forEach(r => {
            if (!tally[r.name]) tally[r.name] = 0;
            tally[r.name] += r.net;
        });
        workingResults = Object.keys(tally).map(name => ({ name, net: tally[name] }));
    }

    return greedySettlement(workingResults);
}

function greedySettlement(results) {
    let debtors = results.filter(r => r.net < 0).sort((a, b) => a.net - b.net);
    let creditors = results.filter(r => r.net > 0).sort((a, b) => b.net - a.net);

    debtors = debtors.map(d => ({ ...d }));
    creditors = creditors.map(c => ({ ...c }));

    let transactions = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
        let debt = Math.abs(debtors[i].net);
        let credit = creditors[j].net;
        let amount = Math.min(debt, credit);

        if (amount > 0.01) {
            transactions.push({
                from: debtors[i].name,
                to: creditors[j].name,
                amount: Math.round(amount),
                text: `💰 ${debtors[i].name} → ${creditors[j].name} ₹${Math.round(amount)}`
            });
        }

        debtors[i].net += amount;
        creditors[j].net -= amount;

        if (Math.abs(debtors[i].net) < 0.01) i++;
        if (Math.abs(creditors[j].net) < 0.01) j++;
    }

    if (transactions.length === 0) return ["All settled!"];
    return transactions.map(t => t.text);
}

function calculateSessionStats(players, startTime) {
    let results = [];
    let shark = { name: "-", amount: -Infinity };
    let atm = { name: "-", amount: Infinity };
    let maxAbsVal = 0;

    let maxRebuys = { name: "-", count: -1 };
    let tightest = { name: "-", score: Infinity, count: Infinity };

    let totalPot = 0;
    let playerCount = 0;

    Object.keys(players).forEach(name => {
        let p = players[name];
        let net = p.cashOut - p.buyIn;
        results.push({ name, net, buyInCount: p.buyInCount, buyIn: p.buyIn, cashOut: p.cashOut });

        totalPot += p.buyIn;
        playerCount++;

        if (net > shark.amount) shark = { name, amount: net };
        if (net < atm.amount) atm = { name, amount: net };
        if (Math.abs(net) > maxAbsVal) maxAbsVal = Math.abs(net);

        if (p.buyInCount > maxRebuys.count) {
            maxRebuys = { name, count: p.buyInCount };
        }

        let tightScore = p.buyInCount * 10000 + Math.abs(net);
        if (tightScore < tightest.score) {
            tightest = { name, score: tightScore, count: p.buyInCount, net: net };
        }
    });

    results.sort((a, b) => b.net - a.net);

    let duration = "-";
    if (startTime) {
        let diff = Date.now() - startTime;
        let hrs = Math.floor(diff / 3600000);
        let mins = Math.floor((diff % 3600000) / 60000);
        duration = `${hrs}h ${mins}m`;
    }

    let avgBuyIn = playerCount > 0 ? Math.round(totalPot / playerCount) : 0;

    return {
        results,
        shark,
        atm,
        maxAbsVal,
        insights: {
            biggestSwing: maxAbsVal,
            mostRebuys: maxRebuys.count > 1 ? `${maxRebuys.name} (${maxRebuys.count})` : "-",
            tightest: tightest.count < Infinity ? tightest.name : "-",
            longestSession: duration,
            avgBuyIn: `₹${avgBuyIn}`
        }
    };
}

// --- UI & RENDERING ---

function updateClock() {
    let now = new Date();
    let timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let dateString = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
    let clockEl = document.getElementById("liveClock");
    if (clockEl) clockEl.innerText = `${dateString} • ${timeString}`;
}

function updateStickyBar(count, pot, startTime) {
    const bar = document.getElementById("stickyStatusBar");
    if (!bar) return;

    document.getElementById("sbCount").innerText = count;
    document.getElementById("sbPot").innerText = "₹" + pot;

    if (startTime) {
        let diff = Math.floor((Date.now() - startTime) / 1000);
        let hrs = Math.floor(diff / 3600);
        let mins = Math.floor((diff % 3600) / 60);
        let secs = diff % 60;
        document.getElementById("sbTimer").innerText =
            `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        document.getElementById("sbTimer").innerText = "00:00";
    }
}

function toggleStickyBar(show) {
    const bar = document.getElementById("stickyStatusBar");
    if (!bar) return;
    if (show) {
        bar.classList.remove("hidden");
        bar.classList.remove("bar-hidden");
    } else {
        bar.classList.add("bar-hidden");
    }
}

function updateTotalDisplay() {
    let totalDisplay = document.getElementById("totalDisplay");
    totalDisplay.innerText = "₹" + state.totalBuyIn;
    totalDisplay.classList.remove("pulse");
    void totalDisplay.offsetWidth;
    totalDisplay.classList.add("pulse");
}

function renderPlayers(callbacks = {}) {
    let listContainer = document.getElementById("playerList");
    if (!listContainer) return;

    let playerArray = Object.keys(state.players)
        .map(name => ({ name, ...state.players[name] }))
        .filter(p => !p.isLeft);

    playerArray.sort((a, b) => b.buyIn - a.buyIn);

    listContainer.innerHTML = "";
    playerArray.forEach(p => {
        let profit = p.cashOut - p.buyIn;
        let item = document.createElement("div");
        item.className = "player-item grid-item";
        item.innerHTML = `
            <div class="p-name">${p.name}</div>
            <div class="p-buyin">
                Buy-In: ₹${p.buyIn} <span style="font-size:0.8em; color:var(--text-muted); margin-left:5px;">(${p.buyInCount})</span>
                <button class="mini-btn run-quickPlus" data-name="${p.name}" title="Add Buy-In">+</button>
                <button class="mini-btn delete-btn run-remove" data-name="${p.name}" title="Cash Out & Leave">🗑️</button>
            </div>
            <div class="p-cashout">
                <input type="number" class="cashout-input" data-name="${p.name}" placeholder="Cash Out" value="${p.cashOut === 0 ? '' : p.cashOut}">
            </div>
            <div id="pl-${p.name}" class="player-pl ${profit >= 0 ? 'profit' : 'loss'}">
                ${profit >= 0 ? '+' : ''}₹${profit}
            </div>
        `;
        listContainer.appendChild(item);
    });

    document.querySelectorAll('.run-quickPlus').forEach(btn => {
        btn.addEventListener('click', () => callbacks.onQuickTopUp(btn.dataset.name));
    });
    document.querySelectorAll('.run-remove').forEach(btn => {
        btn.addEventListener('click', () => callbacks.onRemovePlayer(btn.dataset.name));
    });
    document.querySelectorAll('.cashout-input').forEach(input => {
        input.addEventListener('input', (e) => callbacks.onUpdateCashOut(e.target.dataset.name, e.target.value));
    });
}

function updateConfigDisplay() {
    let configDisplay = document.getElementById("sessionConfigDisplay");
    if (configDisplay) {
        let locStr = state.currentLocation !== "-" ? `${state.currentLocation} | ` : "";
        configDisplay.innerText = `${locStr}Buy-In: ₹${state.sessionBuyIn} | Chips: ${state.chipDenominations.join(', ')}`;
    }
}

function renderHistoryList(history, callbacks = {}) {
    let list = document.getElementById("historyList");
    if (!list) return;

    if (history.length === 0) {
        list.innerHTML = "<p style='color:#888;'>No past sessions.</p>";
        return;
    }
    list.innerHTML = history.map((h, index) => `
        <div class="history-item" data-index="${index}" style="cursor:pointer;">
            <div style="flex-grow:1;">
                <div style="color:white; font-weight:bold;">${h.name || 'Session'}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${h.location || '-'} • ${h.date}</div>
            </div>
            <div style="text-align:right;">
                <span class="shark-badge" style="display:block;">🏆 ${h.shark}</span>
                <span style="font-size:0.8rem;">Pot: ₹${h.totalPot}</span>
            </div>
        </div>
    `).join("");

    document.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => callbacks.onViewSession(item.dataset.index));
    });
}

function renderSummary(summaryData) {
    const { results, shark, atm, maxAbsVal, settlements, insights } = summaryData;

    document.getElementById("sharkName").innerText = shark.amount !== -Infinity ? shark.name : "-";
    document.getElementById("sharkAmount").innerText = shark.amount !== -Infinity ? (shark.amount >= 0 ? "+" : "") + "₹" + Math.round(shark.amount) : "₹0";
    document.getElementById("sharkAmount").className = "profit";

    document.getElementById("atmName").innerText = atm.amount !== Infinity ? atm.name : "-";
    document.getElementById("atmAmount").innerText = atm.amount !== Infinity ? "₹" + Math.round(atm.amount) : "₹0";
    document.getElementById("atmAmount").className = "loss";

    let insightHTML = "";
    if (insights) {
        insightHTML = `
        <div class="game-card" style="margin-top: 1rem; padding: 1rem;">
            <h3>Session Insights</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem; text-align: left;">
                <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:8px;">
                    <div style="color:var(--text-muted); font-size:0.75rem;">BIGGEST SWING</div>
                    <div style="color:white; font-weight:bold;">₹${Math.round(insights.biggestSwing)}</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:8px;">
                    <div style="color:var(--text-muted); font-size:0.75rem;">MOST REBUYS</div>
                    <div style="color:white; font-weight:bold;">${insights.mostRebuys}</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:8px;">
                    <div style="color:var(--text-muted); font-size:0.75rem;">TIGHTEST PLAYER</div>
                    <div style="color:white; font-weight:bold;">${insights.tightest}</div>
                </div>
                <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:8px;">
                    <div style="color:var(--text-muted); font-size:0.75rem;">SESSION DURATION</div>
                    <div style="color:white; font-weight:bold;">${insights.longestSession}</div>
                </div>
            </div>
        </div>
        `;

        let container = document.getElementById("insightsContainer");
        if (!container) {
            let chartContainer = document.getElementById("analyticsChart").parentElement;
            let newDiv = document.createElement("div");
            newDiv.id = "insightsContainer";
            chartContainer.parentElement.insertBefore(newDiv, chartContainer);
            container = newDiv;
        }
        container.innerHTML = insightHTML;
    }

    const winners = results.filter(r => r.net >= 0).sort((a, b) => b.net - a.net);
    const losers = results.filter(r => r.net < 0).sort((a, b) => a.net - b.net);
    let globalMax = maxAbsVal > 0 ? maxAbsVal : 1;

    const createStatItem = (r, isProfit) => {
        let width = (Math.abs(r.net) / globalMax) * 100;
        let barClass = isProfit ? "fill-profit" : "fill-loss";
        let valClass = isProfit ? "profit" : "loss";
        return `
            <div class="stat-item">
                <div class="stat-info"><span class="stat-name">${r.name}</span></div>
                <div class="stat-bar-container"><div class="stat-bar-fill ${barClass}" style="width: ${width}%"></div></div>
                <div class="stat-val ${valClass}">${isProfit ? '+' : ''}${Math.round(r.net)}</div>
            </div>`;
    };

    let chartHTML = `
        <div class="analytics-split">
            <div class="split-col col-profit"><h4>Winners</h4>${winners.map(r => createStatItem(r, true)).join('')}</div>
            <div class="split-col col-loss"><h4>Donations</h4>${losers.map(r => createStatItem(r, false)).join('')}</div>
        </div>
    `;
    document.getElementById("analyticsChart").innerHTML = chartHTML;

    let settlementHTML = "";
    if (Array.isArray(settlements) && settlements.length > 0 && typeof settlements[0] === 'string') {
        settlementHTML = settlements.map(s => `<div class="settlement-item">${s}</div>`).join("");
    } else if (Array.isArray(settlements)) {
        settlementHTML = settlements.map(s => `<div class="settlement-item">${s.text || s}</div>`).join("");
    } else {
        settlementHTML = `<div class="settlement-item">${settlements}</div>`;
    }
    document.getElementById("settlementList").innerHTML = settlementHTML;

    let summaryHTML = "";
    results.forEach(r => {
        let countText = r.buyInCount ? `${r.buyInCount}` : (r.name.includes("Demo") ? '-' : '1');
        summaryHTML += `
            <div class="summary-item">
                <span class="col-name">${r.name}</span>
                <span class="col-buyins">${countText}</span>
                <span class="col-net ${r.net >= 0 ? 'profit' : 'loss'}">${r.net >= 0 ? '+' : ''}₹${Math.round(r.net)}</span>
            </div>
        `;
    });
    document.getElementById("summaryList").innerHTML = summaryHTML;
}

function downloadSummary() {
    const summaryElement = document.getElementById("summaryContent");
    const target = summaryElement;
    const buttons = target.querySelector(".modal-actions");
    if (buttons) buttons.style.display = "none";

    // eslint-disable-next-line no-undef
    html2canvas(target, {
        backgroundColor: "#0f172a",
        scale: 2
    }).then(canvas => {
        if (buttons) buttons.style.display = "flex";
        const link = document.createElement('a');
        link.download = `ChipCheck_Summary_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL();
        link.click();
    }).catch(err => {
        console.error("Screenshot failed:", err);
        if (buttons) buttons.style.display = "flex";
        alert("Could not create image. Please try again.");
    });
}

// --- MAIN LOGIC ---

// Start Clock
setInterval(() => {
    updateClock();
    if (document.getElementById("stickyStatusBar") && document.getElementById("stickyStatusBar").classList.contains("bar-hidden") === false) {
        let activeCount = Object.values(state.players).filter(p => !p.isLeft).length;
        updateStickyBar(activeCount, state.totalBuyIn, state.sessionStartTime);
    }
}, 1000);
updateClock();

// Load History
setHistory(loadHistory());
// Load Registry
setRegistry(loadRegistry());
// Load Templates
setTemplates(loadTemplates());

// Restore Session?
window.addEventListener('load', () => {
    const restored = loadActiveSession();
    if (restored) {
        // Restore State
        setSessionConfig(
            restored.currentSessionName,
            restored.currentLocation,
            restored.sessionBuyIn,
            restored.chipDenominations,
            restored.isRunningBalanceMode
        );
        state.totalBuyIn = restored.totalBuyIn;
        state.players = restored.players; // JSON.parse handles deep copy structure for simple objs

        // Restore UI
        if (restored.sessionStarted) {
            transitionToGame();
            updateTotalDisplay();
            renderPlayers(playerCallbacks);
        }
    }
});

// Warn on close if active
window.addEventListener('beforeunload', (e) => {
    const setupHidden = document.getElementById("setupSection").classList.contains("hidden");
    const summaryHidden = document.getElementById("summaryModal").classList.contains("hidden");

    if (setupHidden && summaryHidden) {
        e.preventDefault();
        e.returnValue = '';
    }
});

const playerCallbacks = {
    onQuickTopUp: (name) => {
        if (!confirm(`Add ₹${state.sessionBuyIn} to ${name}'s buy-in?`)) return;
        addPlayer(name, state.sessionBuyIn);
        updateTotalDisplay();
        renderPlayers(playerCallbacks);
        saveActiveSession();
    },
    onRemovePlayer: (name) => {
        if (!confirm(`Is ${name} leaving the game?`)) return;
        let p = state.players[name];
        let defaultCashOut = p.cashOut || 0;
        let amountStr = prompt(`Enter Cash Out amount for ${name}:`, defaultCashOut);
        if (amountStr === null) return;
        let amount = Number(amountStr);
        if (isNaN(amount)) { alert("Invalid amount"); return; }

        removePlayer(name, amount);
        renderPlayers(playerCallbacks);
        saveActiveSession();
    },
    onUpdateCashOut: (name, val) => {
        updatePlayerCashOut(name, val);
        saveActiveSession();
        // Manually update P/L display
        let p = state.players[name];
        if (!p) return;
        let profit = p.cashOut - p.buyIn;
        let plElement = document.getElementById(`pl-${name}`);
        if (plElement) {
            plElement.innerText = (profit >= 0 ? "+" : "") + "₹" + profit;
            plElement.className = "player-pl " + (profit >= 0 ? "profit" : "loss");
        }
    }
};

const historyCallbacks = {
    onViewSession: (index) => {
        let session = state.history[index];
        if (!session) return;

        let maxAbs = 0;
        let shark = { name: "-", amount: -Infinity };
        let atm = { name: "-", amount: Infinity };
        let results = session.results || [];

        results.forEach(r => {
            if (r.net > shark.amount) shark = { name: r.name, amount: r.net };
            if (r.net < atm.amount) atm = { name: r.name, amount: r.net };
            if (Math.abs(r.net) > maxAbs) maxAbs = Math.abs(r.net);
        });

        renderSummary({
            results: results,
            shark,
            atm,
            maxAbsVal: maxAbs,
            settlements: session.settlements || [],
            insights: session.insights // Pass insights if stored in history (may need update to storing logic if we want this feature for old sessions)
        });

        document.getElementById("pendingSettlements").value = "Viewing Past Session Record";
        document.getElementById("historyModal").classList.add("hidden");
        document.getElementById("summaryModal").classList.remove("hidden");
    }
};

// Global Exposure for HTML OnClick
window.startSession = () => {
    let nameInput = document.getElementById("sessionNameInput");
    let locInput = document.getElementById("locationInput");
    let buyInInput = document.getElementById("sessionBuyInInput");
    let denomsInput = document.getElementById("chipDenomsInput");
    let runningInput = document.getElementById("runningBalanceInput");

    let val = Number(buyInInput.value);
    if (!val || val <= 0) {
        alert("Please enter a valid Session Buy-In amount.");
        return;
    }

    setSessionConfig(
        nameInput.value.trim(),
        locInput.value.trim() || "-",
        val,
        denomsInput.value.split(',').map(s => s.trim()),
        runningInput.checked
    );

    transitionToGame();
    saveActiveSession();
};

function transitionToGame() {
    if (state.currentSessionName) {
        document.querySelector(".subtitle").innerText = state.currentSessionName;
    }
    document.getElementById("setupSection").classList.add("hidden");
    document.getElementById("gameInterface").classList.remove("hidden");
    document.getElementById("summaryModal").classList.add("hidden");
    updateConfigDisplay();
    renderPlayers(playerCallbacks);

    toggleStickyBar(true);
    document.body.classList.add("game-active");
}

window.addBuyIn = () => {
    let nameInput = document.getElementById("playerName");
    let rawName = nameInput.value.trim();
    if (rawName === "") { alert("Please enter a player name"); return; }

    let nameKey = capitalizeName(rawName);
    addPlayer(nameKey, state.sessionBuyIn);

    updateTotalDisplay();
    renderPlayers(playerCallbacks);
    nameInput.value = "";
    nameInput.focus();
    saveActiveSession();
};

window.endSession = () => {
    let stats = calculateSessionStats(state.players, state.sessionStartTime);
    let settlements = calculateSettlements(stats.results, state.isRunningBalanceMode, state.history);

    renderSummary({ ...stats, settlements });
    document.getElementById("summaryModal").classList.remove("hidden");

    let fullSession = {
        date: new Date().toLocaleString(),
        name: state.currentSessionName,
        location: state.currentLocation,
        shark: stats.shark.amount !== -Infinity ? stats.shark.name : "None",
        totalPot: state.totalBuyIn,
        results: stats.results,
        settlements: settlements,
        isRunningBalance: state.isRunningBalanceMode,
        insights: stats.insights // Store insights too!
    };

    addToHistory(fullSession);
    saveHistory();

    updateRegistryFromSession(stats.results, new Date().toLocaleString());
    saveRegistry();

    clearActiveSession();

    toggleStickyBar(false);
    document.body.classList.remove("game-active");
};

window.toggleHistory = () => {
    let modal = document.getElementById("historyModal");
    modal.classList.toggle("hidden");
    if (!modal.classList.contains("hidden")) {
        renderHistoryList(state.history, historyCallbacks);
    }
};

window.clearHistory = () => {
    if (confirm("Are you sure you want to delete all session history?")) {
        clearAllHistory();
        setHistory([]);
        renderHistoryList([], historyCallbacks);
    }
};

window.restartApp = () => {
    resetState();
    updateTotalDisplay();
    renderPlayers(playerCallbacks);

    document.getElementById("summaryModal").classList.add("hidden");
    document.getElementById("gameInterface").classList.add("hidden");
    document.getElementById("setupSection").classList.remove("hidden");

    toggleStickyBar(false);
    document.body.classList.remove("game-active");
};

window.shareResults = () => {
    let text = "🎰 ChipCheck Results 🎰\n\n";

    let sharkName = document.getElementById("sharkName").innerText;
    let sharkAmt = document.getElementById("sharkAmount").innerText;
    let atmName = document.getElementById("atmName").innerText;
    let atmAmt = document.getElementById("atmAmount").innerText;

    text += `🏆 SHARK: ${sharkName} (${sharkAmt})\n`;
    text += `💀 DONATED: ${atmName} (${atmAmt})\n\n`;

    text += "--- Settlements ---\n";
    let settlements = document.querySelectorAll(".settlement-item");
    settlements.forEach(s => text += s.innerText + "\n");

    text += "\n--- Full Tally ---\n";
    let summaryItems = document.querySelectorAll(".summary-item");
    summaryItems.forEach(item => {
        let name = item.querySelector("span:first-child").innerText;
        let val = item.querySelector("span:last-child").innerText;
        text += `${name}: ${val}\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        alert("Results copied to clipboard! Share it on WhatsApp.");
    }).catch(err => {
        console.error("Failed to copy:", err);
    });
};

window.downloadSummary = downloadSummary;

function initTemplates() {
    const select = document.getElementById("templateSelect");
    const saveBtn = document.getElementById("saveTemplateBtn");
    const deleteBtn = document.getElementById("deleteTemplateBtn");

    if (!select || !saveBtn || !deleteBtn) return;

    const renderOptions = () => {
        select.innerHTML = '<option value="">-- Load Preset --</option>';
        Object.keys(state.templates).forEach(name => {
            let opt = document.createElement("option");
            opt.value = name;
            opt.innerText = name;
            select.appendChild(opt);
        });
    };
    renderOptions();

    select.addEventListener("change", (e) => {
        const name = e.target.value;
        if (!name || !state.templates[name]) return;
        const t = state.templates[name];

        document.getElementById("locationInput").value = t.location || "";
        document.getElementById("sessionBuyInInput").value = t.buyIn;
        document.getElementById("chipDenomsInput").value = t.denoms.join(', ');
        document.getElementById("runningBalanceInput").checked = t.running;
    });

    saveBtn.addEventListener("click", () => {
        const name = prompt("Enter a name for this template:");
        if (!name) return;

        const config = {
            location: document.getElementById("locationInput").value,
            buyIn: Number(document.getElementById("sessionBuyInInput").value),
            denoms: document.getElementById("chipDenomsInput").value.split(',').map(s => s.trim()),
            running: document.getElementById("runningBalanceInput").checked
        };

        saveTemplate(name, config);
        saveTemplates();
        renderOptions();
        select.value = name;
    });

    deleteBtn.addEventListener("click", () => {
        const name = select.value;
        if (!name) {
            alert("Please select a preset to delete.");
            return;
        }

        if (confirm(`Are you sure you want to delete the preset "${name}"?`)) {
            deleteTemplate(name);
            saveTemplates();
            renderOptions();
            document.getElementById("locationInput").value = "";
            document.getElementById("sessionBuyInInput").value = defaults.sessionBuyIn;
            document.getElementById("chipDenomsInput").value = defaults.chipDenominations.join(', ');
            document.getElementById("runningBalanceInput").checked = false;
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initTemplates();

    document.getElementById("sessionNameInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("locationInput").focus();
    });
    document.getElementById("locationInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("sessionBuyInInput").focus();
    });
    document.getElementById("sessionBuyInInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("chipDenomsInput").focus();
    });
    document.getElementById("chipDenomsInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter") window.startSession();
    });
    document.getElementById("playerName").addEventListener("keydown", (e) => {
        if (e.key === "Enter") window.addBuyIn();
    });
    document.getElementById("demoModeBtn").addEventListener("click", runDemo);
});

function runDemo() {
    resetState();
    setSessionConfig("Poker Night Demo", "Virtual Casino", 1000, ["5", "10", "25", "100"], true, Date.now() - 7200000); // 2 hours ago

    const names = ["Rahul", "Amit", "Sneha", "Vikram", "Priya", "Arjun"];
    names.forEach(n => {
        addPlayer(n, 1000);
        if (Math.random() > 0.6) addPlayer(n, 1000);
        if (Math.random() > 0.8) addPlayer(n, 1000);
    });

    Object.keys(state.players).forEach(n => {
        let buyin = state.players[n].buyIn;
        let outcome = Math.random();
        let cashout = 0;
        if (outcome > 0.7) cashout = buyin + (Math.random() * 2000);
        else if (outcome > 0.4) cashout = buyin - (Math.random() * 500);
        else cashout = 0;
        updatePlayerCashOut(n, Math.round(cashout));
    });

    if (state.currentSessionName) {
        document.querySelector(".subtitle").innerText = state.currentSessionName;
    }
    document.getElementById("setupSection").classList.add("hidden");
    document.getElementById("gameInterface").classList.remove("hidden");
    document.getElementById("summaryModal").classList.add("hidden"); // Ensure summary is hidden
    updateConfigDisplay();
    renderPlayers(playerCallbacks);
    toggleStickyBar(true);
    document.body.classList.add("game-active");

    // Immediately end for demo effect
    window.endSession();
}
