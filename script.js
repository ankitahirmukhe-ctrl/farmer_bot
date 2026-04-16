// ===== STATE =====
let currentLang = "Marathi";
const sessionId = "session_" + Math.random().toString(36).slice(2, 10);
let currentUser = null;

// ===== SPEECH =====
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
const synth = window.speechSynthesis;

// ===== UI STRINGS =====
const ui = {
    "English": {
        title: "Krishi Mitra",
        status: "Online",
        greet: "Hello, I am Krishi Mitra. What would you like to ask?",
        place: "Type or speak...",
        send: "Send"
    },
    "Marathi": {
        title: "कृषी मित्र",
        status: "सज्ज आहे",
        greet: "नमस्कार, मी कृषी मित्र आहे. तुम्हाला काय विचारायचे आहे?",
        place: "येथे बोला किंवा लिहा...",
        send: "पाठवा"
    },
    "Hindi": {
        title: "कृषि मित्र",
        status: "तैयार",
        greet: "नमस्ते, मैं कृषि मित्र हूँ। आप क्या पूछना चाहते हैं?",
        place: "यहाँ बोलें या लिखें...",
        send: "भेजें"
    }
};

// ===== NUMBER LOCALIZATION =====
const digitMap = { '0':'०','1':'१','2':'२','3':'३','4':'४','5':'५','6':'६','7':'७','8':'८','9':'९' };
function localizeNumbers(text, lang) {
    if (lang === 'English') return text;
    return text.replace(/[0-9]/g, d => digitMap[d]);
}

// ===== FORMAT REPLY =====
function formatReply(text) {
    return text
        .split("\n")
        .filter(line => line.trim() !== "")
        .map(line => `<p>${line}</p>`)
        .join("");
}

// ===== CONSISTENT VOICE (FIX) =====
// Force a single female Indian/Hindi voice for all languages
// to keep voice consistent across Marathi, Hindi, English
let chosenVoice = null;

function pickVoiceByLang(lang) {
    const voices = synth.getVoices();
    if (!voices.length) return null;

    if (lang === "Marathi") {
        return voices.find(v => v.lang === "mr-IN") 
            || voices.find(v => v.lang === "hi-IN");
    }

    if (lang === "Hindi") {
        return voices.find(v => v.lang === "hi-IN");
    }

    return voices.find(v => v.lang === "en-IN") 
        || voices.find(v => v.lang.startsWith("en"));
}

function speak(text) {
    if (synth.speaking) synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();

    if (!voices.length) {
        setTimeout(() => speak(text), 200);
        return;
    }

    const voice = pickVoiceByLang(currentLang);

    if (voice) {
        utter.voice = voice;
        utter.lang = voice.lang;
    }

    utter.rate = 0.95;
    utter.pitch = 1;

    synth.speak(utter);
}

window.speechSynthesis.onvoiceschanged = () => {
    chosenVoice = pickConsistentVoice(); // Re-cache when voices load
};

// ===== LANGUAGE UPDATE =====
function updateLanguage(lang) {
    currentLang = lang;

    // Update sidebar button states
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    const btnMap = { Marathi: 'btn-mr', Hindi: 'btn-hi', English: 'btn-en' };
    document.getElementById(btnMap[lang])?.classList.add('active');

    // Update UI text
    document.getElementById("ui-title").innerText = ui[lang].title;
    document.getElementById("ai-status").innerText = ui[lang].status;
    document.getElementById("side-title").innerText = ui[lang].title;
    document.getElementById("side-status").innerText = ui[lang].status === "Online" ? "Online" : ui[lang].status;
    document.getElementById("input").placeholder = ui[lang].place;
    document.getElementById("ui-send").innerHTML = `${ui[lang].send} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

    const chatBox = document.getElementById("chatBox");
    const greeting = localizeNumbers(ui[lang].greet, lang);
    chatBox.innerHTML += `<div class="bot-msg"><b>${ui[lang].title}:</b><p>${greeting}</p></div>`;
    chatBox.scrollTop = chatBox.scrollHeight;
    speak(greeting);
}

// ===== VOICE INPUT =====
function startVoice() {
    recognition.lang = currentLang === "Marathi" ? "mr-IN" :
                       currentLang === "Hindi"   ? "hi-IN" : "en-IN";
    recognition.start();
    document.querySelector('.mic-btn').classList.add('listening');
}

recognition.onresult = (e) => {
    document.getElementById("input").value = e.results[0][0].transcript;
    document.querySelector('.mic-btn').classList.remove('listening');
    sendMessage();
};
recognition.onend = () => document.querySelector('.mic-btn').classList.remove('listening');

// ===== SEND MESSAGE =====
async function sendMessage() {
    const input = document.getElementById("input");
    const chatBox = document.getElementById("chatBox");
    const text = input.value.trim();
    if (!text) return;

    chatBox.innerHTML += `<div class="user-msg">${text}</div>`;
    input.value = "";

    // Typing indicator
    const typingId = "typing_" + Date.now();
    chatBox.innerHTML += `
        <div class="typing-msg" id="${typingId}">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const lang = (currentLang || "English").trim();

      const response = await fetch("https://farmer-bot-backend-tvva.onrender.com", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, language: lang, sessionId })
        });

        const data = await response.json();
        document.getElementById(typingId)?.remove();

        const reply = localizeNumbers(data.reply, currentLang);
        chatBox.innerHTML += `<div class="bot-msg"><b>${ui[currentLang].title}:</b>${formatReply(reply)}</div>`;
        speak(reply);

        // Weather advice
        const weather = await getWeather(18.5204, 73.8567);
        if (weather) {
            const advice = getWeatherAdvice(weather);
            const title = currentLang === "Hindi" ? "🌦️ मौसम सलाह" :
                          currentLang === "English" ? "🌦️ Weather Advice" : "🌦️ हवामान सल्ला";
            chatBox.innerHTML += `<div class="weather-msg"><b>${title}:</b> ${advice}</div>`;

            // Update topbar weather badge
            document.getElementById("weatherBadge").innerText =
                `${weather.temperature}°C · ${advice.split(".")[0]}`;
        }

    } catch {
        document.getElementById(typingId)?.remove();
        chatBox.innerHTML += `<div class="bot-msg" style="color:#c0392b;">⚠️ Error connecting. Please try again.</div>`;
    }

    chatBox.scrollTop = chatBox.scrollHeight;
}

// ===== WEATHER =====
async function getWeather(lat, lon) {
    try {
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        );
        const data = await res.json();
        return data.current_weather;
    } catch { return null; }
}

function getWeatherAdvice(w) {
    const t = w.temperature;
    const wind = w.windspeed;

    if (t >= 32) {
        if (currentLang === "Hindi")   return "तापमान अधिक है। सुबह या शाम पानी दें।";
        if (currentLang === "English") return "High temperature. Water crops in morning or evening.";
        return "तापमान जास्त आहे. सकाळी किंवा संध्याकाळी पाणी द्या.";
    }
    if (t <= 18) {
        if (currentLang === "Hindi")   return "तापमान कम है। फसल को सुरक्षित रखें।";
        if (currentLang === "English") return "Low temperature. Protect crops from cold.";
        return "तापमान कमी आहे. पिकांचे संरक्षण करा.";
    }
    if (wind >= 15) {
        if (currentLang === "Hindi")   return "हवा तेज है। फवारणी न करें।";
        if (currentLang === "English") return "Strong wind. Avoid spraying today.";
        return "वारा जास्त आहे. फवारणी टाळा.";
    }
    if (currentLang === "Hindi")   return "मौसम सामान्य है। खेती जारी रखें।";
    if (currentLang === "English") return "Weather is moderate. Continue farming normally.";
    return "हवामान सामान्य आहे. शेती सुरू ठेवा.";
}

// ===== AUTH — Simple localStorage-based =====

function getUsers() {
    return JSON.parse(localStorage.getItem("km_users") || "{}");
}
function saveUsers(users) {
    localStorage.setItem("km_users", JSON.stringify(users));
}

function handleLogin() {
    const email    = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const errEl    = document.getElementById("loginError");

    if (!email || !password) { errEl.innerText = "Please fill in all fields."; return; }

    const users = getUsers();
    if (!users[email]) { errEl.innerText = "No account found. Please sign up."; return; }
    if (users[email].password !== btoa(password)) { errEl.innerText = "Incorrect password."; return; }

    errEl.innerText = "";
    loginSuccess({ name: users[email].name, email });
}

function handleSignup() {
    const name     = document.getElementById("signupName").value.trim();
    const email    = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const errEl    = document.getElementById("signupError");

    if (!name || !email || !password) { errEl.innerText = "Please fill in all fields."; return; }
    if (password.length < 6)          { errEl.innerText = "Password must be at least 6 characters."; return; }

    const users = getUsers();
    if (users[email]) { errEl.innerText = "Account already exists. Please login."; return; }

    users[email] = { name, password: btoa(password) };
    saveUsers(users);

    errEl.innerText = "";
    loginSuccess({ name, email });
}

function guestLogin() {
    loginSuccess({ name: "Guest", email: "guest@krishi.ai" });
}

function loginSuccess(user) {
    currentUser = user;
    document.getElementById("authOverlay").classList.add("hidden");
    document.getElementById("mainApp").classList.remove("hidden");

    // Set user info in sidebar
    document.getElementById("userDisplayName").innerText = user.name;
    document.getElementById("userDisplayEmail").innerText = user.email;
    document.getElementById("userAvatarIcon").innerText = user.name === "Guest" ? "👤" : user.name[0].toUpperCase();

    // Init chat
    updateLanguage("Marathi");
}

function handleLogout() {
    currentUser = null;
    document.getElementById("authOverlay").classList.remove("hidden");
    document.getElementById("mainApp").classList.add("hidden");
    document.getElementById("chatBox").innerHTML = "";
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginPassword").value = "";
    document.getElementById("loginError").innerText = "";
    showLogin();
}

function showLogin() {
    document.getElementById("loginForm").classList.add("active");
    document.getElementById("signupForm").classList.remove("active");
}

function showSignup() {
    document.getElementById("signupForm").classList.add("active");
    document.getElementById("loginForm").classList.remove("active");
}
