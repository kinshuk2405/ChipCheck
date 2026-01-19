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

function addBuyIn() {
    let nameInput = document.getElementById("playerName");
    let amountInput = document.getElementById("buyInAmount");

    let rawName = nameInput.value.trim();
    let amount = Number(amountInput.value);

    if (rawName === "") { alert("Please enter a player name"); return; }
    if (amountInput.value === "" || amount <= 0) { alert("Enter a valid buy-in amount"); return; }

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
            <div class="p-buyin">Buy-In: ₹${p.buyIn}</div>
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
    document.getElementById("sharkAmount").innerText = shark.amount !== -Infinity ? (shark.amount >= 0 ? "+" : "") + "₹" + shark.amount : "₹0";
    document.getElementById("sharkAmount").className = "profit";

    document.getElementById("atmName").innerText = atm.amount !== Infinity ? atm.name : "-";
    document.getElementById("atmAmount").innerText = atm.amount !== Infinity ? "₹" + atm.amount : "₹0";
    document.getElementById("atmAmount").className = "loss";

    // Perform Analytics (Bar Chart)
    let chartHTML = "";
    results.forEach(r => {
        let width = maxAbsVal > 0 ? (Math.abs(r.net) / maxAbsVal) * 100 : 0;
        let barClass = r.net >= 0 ? "bar-positive" : "bar-negative";
        chartHTML += `
            <div class="chart-row">
                <div class="chart-label">${r.name}</div>
                <div class="bar-container">
                    <div class="bar-fill ${barClass}" style="width: ${width}%"></div>
                </div>
            </div>
        `;
    });
    document.getElementById("analyticsChart").innerHTML = chartHTML;

    let summaryHTML = "";
    results.forEach(r => {
        summaryHTML += `
            <div class="summary-item">
                <span>${r.name}</span>
                <span class="${r.net >= 0 ? 'profit' : 'loss'}">${r.net >= 0 ? '+' : ''}₹${r.net}</span>
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
