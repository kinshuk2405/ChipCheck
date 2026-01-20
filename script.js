let totalBuyIn = 0;
let sessionBuyIn = 500;
let chipDenominations = [];
let currentSessionName = "";
let currentLocation = "";
let isRunningBalanceMode = false;
let players = {}; // Structure: { "Name": { buyIn: 0, cashOut: 0, buyInCount: 0, isLeft: false } }
let history = JSON.parse(localStorage.getItem("pokerSessionHistory")) || [];

// Start Clock
setInterval(updateClock, 1000);
updateClock();

function updateClock() {
    let now = new Date();
    let timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let dateString = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
    let clockEl = document.getElementById("liveClock");
    if (clockEl) clockEl.innerText = `${dateString} • ${timeString}`;
}

function startSession() {
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

    currentSessionName = nameInput.value.trim() || "";
    currentLocation = locInput.value.trim() || "-";
    sessionBuyIn = val;
    chipDenominations = denomsInput.value.split(',').map(s => s.trim());
    isRunningBalanceMode = runningInput.checked;

    // Update UI
    if (currentSessionName) {
        document.querySelector(".subtitle").innerText = currentSessionName;
    }

    document.getElementById("preSession").classList.add("hidden");
    document.getElementById("preSession").style.display = "none";
    document.getElementById("gameInterface").classList.remove("hidden");

    // Update config display
    let configDisplay = document.getElementById("sessionConfigDisplay");
    if (configDisplay) {
        let locStr = currentLocation !== "-" ? `${currentLocation} | ` : "";
        configDisplay.innerText = `${locStr}Buy-In: ₹${sessionBuyIn} | Chips: ${chipDenominations.join(', ')}`;
    }
}



// const MIN_BUYIN = 500; // Deprecated, using sessionBuyIn

function addBuyIn() {
    let nameInput = document.getElementById("playerName");
    // let amountInput = document.getElementById("buyInAmount"); // Removed

    let rawName = nameInput.value.trim();
    let amount = sessionBuyIn;

    if (rawName === "") { alert("Please enter a player name"); return; }
    // Amount is now fixed to sessionBuyIn for every add/rebuy
    // if (amountInput.value === "" || amount < MIN_BUYIN) { ... }

    let nameKey = capitalizeName(rawName);

    // Initialize player if new
    if (!players[nameKey]) {
        players[nameKey] = { buyIn: 0, cashOut: 0, buyInCount: 0, isLeft: false };
    }
    // If player re-joins after leaving, mark as active
    players[nameKey].isLeft = false;

    players[nameKey].buyIn += amount;
    players[nameKey].buyInCount += 1;
    totalBuyIn += amount;

    updateTotalDisplay();
    renderPlayers();

    updateTotalDisplay();
    renderPlayers();

    // amountInput.value = ""; // Removed
    nameInput.value = "";
    nameInput.focus();
}



function updateCashOut(name, amount) {
    if (!players[name]) return;
    players[name].cashOut = Number(amount);
    renderPlayers(true); // Skip input rebuild to preserve focus
}

function updateTotalDisplay() {
    let totalDisplay = document.getElementById("totalDisplay");
    totalDisplay.innerText = "₹" + totalBuyIn;
    totalDisplay.classList.remove("pulse");
    void totalDisplay.offsetWidth;
    totalDisplay.classList.add("pulse");
}



function quickTopUp(name) {
    if (!confirm(`Add ₹${sessionBuyIn} to ${name}'s buy-in?`)) return;

    players[name].buyIn += sessionBuyIn;
    players[name].buyInCount += 1;
    totalBuyIn += sessionBuyIn;

    updateTotalDisplay();
    renderPlayers(); // Re-render to show new amount
}

function removePlayer(name) {
    if (!confirm(`Is ${name} leaving the game?`)) return;

    let p = players[name];
    let defaultCashOut = p.cashOut || 0;

    // Attempt to find the input value currently on screen if possible, but data binding is cleaner
    // Since we re-render often, best to rely on what's saved or ask.

    let amountStr = prompt(`Enter Cash Out amount for ${name}:`, defaultCashOut);
    if (amountStr === null) return; // Cancelled

    let amount = Number(amountStr);
    if (isNaN(amount)) {
        alert("Invalid amount");
        return;
    }

    players[name].cashOut = amount;
    players[name].isLeft = true;

    renderPlayers();
}

function renderPlayers(skipInputRebuild = false) {
    let listContainer = document.getElementById("playerList");

    // Sort: Highest Buy-In first
    // Sort: Highest Buy-In first, Filter out left players for display
    let playerArray = Object.keys(players)
        .map(name => ({ name, ...players[name] }))
        .filter(p => !p.isLeft);

    playerArray.sort((a, b) => b.buyIn - a.buyIn);

    if (skipInputRebuild) {
        // Just update the P/L text to avoid rebuilding the DOM and losing input focus
        playerArray.forEach(p => {
            let profit = p.cashOut - p.buyIn;
            let plElement = document.getElementById(`pl-${p.name}`);
            if (plElement) {
                plElement.innerText = (profit >= 0 ? "+" : "") + "₹" + profit;
                plElement.className = "player-pl " + (profit >= 0 ? "profit" : "loss");
            }
        });
        return;
    }

    listContainer.innerHTML = "";
    playerArray.forEach(p => {
        let profit = p.cashOut - p.buyIn;
        let item = document.createElement("div");
        item.className = "player-item grid-item";
        item.innerHTML = `
            <div class="p-name">${p.name}</div>
            <div class="p-buyin">
                Buy-In: ₹${p.buyIn}
                <button class="mini-btn" onclick="quickTopUp('${p.name}')" title="Add ₹${sessionBuyIn}">+</button>
                <button class="mini-btn delete-btn" onclick="removePlayer('${p.name}')" title="Cash Out & Leave">🗑️</button>
            </div>
            <div class="p-cashout">
                <input type="number" placeholder="Cash Out" value="${p.cashOut === 0 ? '' : p.cashOut}" 
                       oninput="updateCashOut('${p.name}', this.value)">
            </div>
            <div id="pl-${p.name}" class="player-pl ${profit >= 0 ? 'profit' : 'loss'}">
                ${profit >= 0 ? '+' : ''}₹${profit}
            </div>
        `;
        listContainer.appendChild(item);
    });
}

// --- Session & Summary Logic ---

function endSession() {
    let results = [];
    let shark = { name: "-", amount: -Infinity };
    let atm = { name: "-", amount: Infinity };
    let maxAbsVal = 0;

    Object.keys(players).forEach(name => {
        let p = players[name];
        let net = p.cashOut - p.buyIn;
        results.push({ name, net, buyInCount: p.buyInCount });

        if (net > shark.amount) shark = { name, amount: net };
        if (net < atm.amount) atm = { name, amount: net };
        if (Math.abs(net) > maxAbsVal) maxAbsVal = Math.abs(net);
    });

    // Sort results
    results.sort((a, b) => b.net - a.net);

    // Update Modal
    document.getElementById("sharkName").innerText = shark.amount !== -Infinity ? shark.name : "-";
    document.getElementById("sharkAmount").innerText = shark.amount !== -Infinity ? (shark.amount >= 0 ? "+" : "") + "₹" + Math.round(shark.amount) : "₹0";
    document.getElementById("sharkAmount").className = "profit";

    document.getElementById("atmName").innerText = atm.amount !== Infinity ? atm.name : "-";
    document.getElementById("atmAmount").innerText = atm.amount !== Infinity ? "₹" + Math.round(atm.amount) : "₹0";
    document.getElementById("atmAmount").className = "loss";

    // Perform Analytics (Bar Chart)
    // Perform Analytics (Split Chart)
    const winners = results.filter(r => r.net >= 0).sort((a, b) => b.net - a.net);
    const losers = results.filter(r => r.net < 0).sort((a, b) => a.net - b.net); // Most negative first

    // Max value for bar scaling
    let globalMax = maxAbsVal > 0 ? maxAbsVal : 1;

    const createStatItem = (r, isProfit) => {
        let width = (Math.abs(r.net) / globalMax) * 100;
        let barClass = isProfit ? "fill-profit" : "fill-loss";
        let valClass = isProfit ? "profit" : "loss";
        return `
            <div class="stat-item">
                <div class="stat-info">
                    <span class="stat-name">${r.name}</span>
                </div>
                <div class="stat-bar-container">
                    <div class="stat-bar-fill ${barClass}" style="width: ${width}%"></div>
                </div>
                <div class="stat-val ${valClass}">${isProfit ? '+' : ''}${Math.round(r.net)}</div>
            </div>`;
    };

    let chartHTML = `
        <div class="analytics-split">
            <div class="split-col col-profit">
                <h4>Winners</h4>
                ${winners.map(r => createStatItem(r, true)).join('')}
                ${winners.length === 0 ? '<div style="text-align:center; color:rgba(255,255,255,0.2); font-size:0.8rem; padding:10px;">No Gainers</div>' : ''}
            </div>
            <div class="split-col col-loss">
                <h4>Donations</h4>
                ${losers.map(r => createStatItem(r, false)).join('')}
                ${losers.length === 0 ? '<div style="text-align:center; color:rgba(255,255,255,0.2); font-size:0.8rem; padding:10px;">No Donations</div>' : ''}
            </div>
        </div>
    `;
    document.getElementById("analyticsChart").innerHTML = chartHTML;

    // --- Settlement Logic ---
    let settlements = [];
    if (isRunningBalanceMode) {
        // Tally with history
        let tally = {};

        // Add past history
        history.forEach(h => {
            if (h.results) {
                h.results.forEach(r => {
                    if (!tally[r.name]) tally[r.name] = 0;
                    tally[r.name] += r.net;
                });
            }
        });

        // Add current session
        results.forEach(r => {
            if (!tally[r.name]) tally[r.name] = 0;
            tally[r.name] += r.net;
        });

        // Convert tally to results array for settlement calc
        let cumulativeResults = Object.keys(tally).map(name => ({ name, net: tally[name] }));
        settlements = calculateSettlements(cumulativeResults);

        document.getElementById("settlementList").innerHTML =
            `<div style="color:var(--neon-cyan); font-size:0.8rem; margin-bottom:5px;">(Settling Cumulative Balance)</div>` +
            settlements.map(s => `<div class="settlement-item">${s}</div>`).join("");

    } else {
        settlements = calculateSettlements(results);
        let settlementHTML = settlements.map(s => `<div class="settlement-item">${s}</div>`).join("");
        document.getElementById("settlementList").innerHTML = settlementHTML;
    }

    // --- Summary List ---
    let summaryHTML = "";
    results.forEach(r => {
        summaryHTML += `
            <div class="summary-item">
                <span>${r.name} <small style="display:block; font-size: 0.7em; color: #888;">${r.buyInCount} Buy-in${r.buyInCount !== 1 ? 's' : ''}</small></span>
                <span class="${r.net >= 0 ? 'profit' : 'loss'}">${r.net >= 0 ? '+' : ''}₹${Math.round(r.net)}</span>
            </div>
        `;
    });
    document.getElementById("summaryList").innerHTML = summaryHTML;

    document.getElementById("summaryModal").classList.remove("hidden");

    let session = {
        date: new Date().toLocaleString(),
        name: currentSessionName,
        location: currentLocation,
        shark: shark.amount !== -Infinity ? shark.name : "None",
        totalPot: totalBuyIn,
        results: results, // Save full results for tallying and viewing details
        settlements: settlements, // Save text for quick view if needed
        isRunningBalance: isRunningBalanceMode
    };
    history.unshift(session);
    localStorage.setItem("pokerSessionHistory", JSON.stringify(history));
}

// Greedy Settlement Algorithm
function calculateSettlements(results) {
    let debtors = results.filter(r => r.net < 0).sort((a, b) => a.net - b.net); // Ascending (most negative first)
    let creditors = results.filter(r => r.net > 0).sort((a, b) => b.net - a.net); // Descending (most positive first)

    // Deep copy to avoid mutating original results if used elsewhere
    debtors = debtors.map(d => ({ ...d }));
    creditors = creditors.map(c => ({ ...c }));

    let transactions = [];
    let i = 0; // debtor index
    let j = 0; // creditor index

    while (i < debtors.length && j < creditors.length) {
        let debt = Math.abs(debtors[i].net);
        let credit = creditors[j].net;
        let amount = Math.min(debt, credit);

        if (amount > 0) {
            transactions.push(`<b>${debtors[i].name}</b> pays <b>${creditors[j].name}</b> ₹${Math.round(amount)}`);
        }

        debtors[i].net += amount;
        creditors[j].net -= amount;

        // If debt fully paid, move to next debtor
        if (Math.round(debtors[i].net) === 0) i++;
        // If credit fully received, move to next creditor
        if (Math.round(creditors[j].net) === 0) j++;
    }

    if (transactions.length === 0) return ["All settled!"];
    return transactions;
}

function shareResults() {
    let text = "🎰 ChipCheck Results 🎰\n\n";

    // Top Winner & Loser
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
}


function closeSummary() {
    document.getElementById("summaryModal").classList.add("hidden");
}

function toggleHistory() {
    let modal = document.getElementById("historyModal");
    modal.classList.toggle("hidden");

    let list = document.getElementById("historyList");
    if (history.length === 0) {
        list.innerHTML = "<p style='color:#888;'>No past sessions.</p>";
        return;
    }
    list.innerHTML = history.map((h, index) => `
        <div class="history-item" onclick="viewSessionDetails(${index})" style="cursor:pointer;">
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
}

function viewSessionDetails(index) {
    let session = history[index];
    if (!session) return;

    // Fill the summary modal with historical data
    let results = session.results || [];
    let settlements = session.settlements || []; // might be array of strings or simple strings

    // Awards (Re-calculate mostly or store them? Re-calc is safer if we have results)
    let shark = { name: "-", amount: -Infinity };
    let atm = { name: "-", amount: Infinity };
    let maxAbsVal = 0;

    results.forEach(r => {
        if (r.net > shark.amount) shark = { name: r.name, amount: r.net };
        if (r.net < atm.amount) atm = { name: r.name, amount: r.net };
        if (Math.abs(r.net) > maxAbsVal) maxAbsVal = Math.abs(r.net);
    });

    document.getElementById("sharkName").innerText = shark.amount !== -Infinity ? shark.name : "-";
    document.getElementById("sharkAmount").innerText = shark.amount !== -Infinity ? (shark.amount >= 0 ? "+" : "") + "₹" + Math.round(shark.amount) : "₹0";
    document.getElementById("atmName").innerText = atm.amount !== Infinity ? atm.name : "-";
    document.getElementById("atmAmount").innerText = atm.amount !== Infinity ? "₹" + Math.round(atm.amount) : "₹0";

    // Chart
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

    const winners = results.filter(r => r.net >= 0).sort((a, b) => b.net - a.net);
    const losers = results.filter(r => r.net < 0).sort((a, b) => a.net - b.net);

    let chartHTML = `
        <div class="analytics-split">
            <div class="split-col col-profit"><h4>Winners</h4>${winners.map(r => createStatItem(r, true)).join('')}</div>
            <div class="split-col col-loss"><h4>Donations</h4>${losers.map(r => createStatItem(r, false)).join('')}</div>
        </div>
    `;
    document.getElementById("analyticsChart").innerHTML = chartHTML;

    // Settlements
    let settlementHTML = "";
    if (Array.isArray(settlements)) {
        settlementHTML = settlements.map(s => `<div class="settlement-item">${s}</div>`).join("");
    } else {
        settlementHTML = `<div class="settlement-item">${settlements}</div>`;
    }

    // If it was a running balance session, add a note
    if (session.isRunningBalance) {
        settlementHTML = `<div style="color:var(--neon-cyan); font-size:0.8rem; margin-bottom:5px;">(Running Balance Settlement)</div>` + settlementHTML;
    }
    document.getElementById("settlementList").innerHTML = settlementHTML;

    // Summary List
    let summaryHTML = "";
    results.forEach(r => {
        let countText = r.buyInCount ? `${r.buyInCount} Buy-in${r.buyInCount !== 1 ? 's' : ''}` : '';
        summaryHTML += `
            <div class="summary-item">
                <span>${r.name} <small style="display:block; font-size: 0.7em; color: #888;">${countText}</small></span>
                <span class="${r.net >= 0 ? 'profit' : 'loss'}">${r.net >= 0 ? '+' : ''}₹${Math.round(r.net)}</span>
            </div>
        `;
    });
    document.getElementById("summaryList").innerHTML = summaryHTML;

    // Pending Text
    document.getElementById("pendingSettlements").value = "Viewing Past Session Record";

    // Show Modal
    toggleHistory(); // Close history list
    document.getElementById("summaryModal").classList.remove("hidden");

    // Hide buttons not applicable for past view or adjust behavior
    // For now we leave them, user can screenshot old results too.
}

function capitalizeName(name) {
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function downloadSummary() {
    const summaryElement = document.getElementById("summaryContent");

    const buttons = summaryElement.querySelector(".modal-actions");
    if (buttons) buttons.style.display = "none";

    html2canvas(summaryElement, {
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

function clearHistory() {
    if (confirm("Are you sure you want to delete all session history?")) {
        history = [];
        localStorage.removeItem("pokerSessionHistory");
        document.getElementById("historyList").innerHTML = "<p style='color:#888;'>No history yet.</p>";
    }
}
