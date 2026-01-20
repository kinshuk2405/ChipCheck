let totalBuyIn = 0;
let players = {}; // Structure: { "Name": { buyIn: 0, cashOut: 0 } }
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

const MIN_BUYIN = 500;

function addBuyIn() {
    let nameInput = document.getElementById("playerName");
    let amountInput = document.getElementById("buyInAmount");

    let rawName = nameInput.value.trim();
    let amount = Number(amountInput.value);

    if (rawName === "") { alert("Please enter a player name"); return; }
    if (amountInput.value === "" || amount < MIN_BUYIN) {
        alert(`Minimum buy-in is ₹${MIN_BUYIN}`);
        return;
    }

    let nameKey = capitalizeName(rawName);

    // Initialize player if new
    if (!players[nameKey]) {
        players[nameKey] = { buyIn: 0, cashOut: 0 };
    }

    players[nameKey].buyIn += amount;
    totalBuyIn += amount;

    updateTotalDisplay();
    renderPlayers();

    amountInput.value = "";
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
    if (!confirm(`Add ₹${MIN_BUYIN} to ${name}'s buy-in?`)) return;

    players[name].buyIn += MIN_BUYIN;
    totalBuyIn += MIN_BUYIN;

    updateTotalDisplay();
    renderPlayers(); // Re-render to show new amount
}

function renderPlayers(skipInputRebuild = false) {
    let listContainer = document.getElementById("playerList");

    // Sort: Highest Buy-In first
    let playerArray = Object.keys(players).map(name => ({ name, ...players[name] }));
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
                <button class="mini-btn" onclick="quickTopUp('${p.name}')" title="Add ₹500">+</button>
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
        results.push({ name, net });

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
    let settlements = calculateSettlements(results);
    let settlementHTML = settlements.map(s => `<div class="settlement-item">${s}</div>`).join("");
    document.getElementById("settlementList").innerHTML = settlementHTML;

    // --- Summary List ---
    let summaryHTML = "";
    results.forEach(r => {
        summaryHTML += `
            <div class="summary-item">
                <span>${r.name}</span>
                <span class="${r.net >= 0 ? 'profit' : 'loss'}">${r.net >= 0 ? '+' : ''}₹${Math.round(r.net)}</span>
            </div>
        `;
    });
    document.getElementById("summaryList").innerHTML = summaryHTML;

    document.getElementById("summaryModal").classList.remove("hidden");

    let session = {
        date: new Date().toLocaleString(),
        shark: shark.amount !== -Infinity ? shark.name : "None",
        totalPot: totalBuyIn
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
        list.innerHTML = "<p style='color:#888;'>No history yet.</p>";
        return;
    }
    list.innerHTML = history.map(h => `
        <div class="history-item">
            <span class="date">${h.date}</span>
            <span class="shark-badge">🏆 ${h.shark}</span>
            <span>Pot: ₹${h.totalPot}</span>
        </div>
    `).join("");
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
