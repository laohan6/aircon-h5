const app = document.querySelector(".app-shell");
const powerButton = document.querySelector("#powerButton");
const modeButtons = document.querySelectorAll(".mode-button");
const tempRange = document.querySelector("#tempRange");
const fanRange = document.querySelector("#fanRange");
const tempDown = document.querySelector("#tempDown");
const tempUp = document.querySelector("#tempUp");
const displayMode = document.querySelector("#displayMode");
const displayTemp = document.querySelector("#displayTemp");
const panelTemp = document.querySelector("#panelTemp");
const runningAudio = document.querySelector("#runningAudio");

const modeLabels = {
  cool: "制冷",
  heat: "制热",
  dry: "除湿",
  fan: "送风",
  auto: "自动",
};

const fanLabels = {
  1: "低风",
  2: "中风",
  3: "高风",
};

const fanAudio = {
  1: { frequency: 64, volume: 0.003 },
  2: { frequency: 76, volume: 0.005 },
  3: { frequency: 92, volume: 0.008 },
};

const RUNNING_LOOP_START = 4;
const LOOP_GUARD_SECONDS = 0.18;
const runningVolumes = {
  1: 0.055,
  2: 0.085,
  3: 0.12,
};

let audioContext;
let masterGain;
let compressor;
let isPowerOn = false;
let currentMode = "cool";
let currentTemp = Number(tempRange.value);
let currentFan = Number(fanRange.value);
let hasPlayedSound = false;
let runningFadeTimer = null;
let runningLoopReady = false;
let isSeekingLoop = false;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioContext.createGain();
    compressor = audioContext.createDynamicsCompressor();
    masterGain.gain.setValueAtTime(0, audioContext.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.22, audioContext.currentTime + 0.45);
    compressor.threshold.setValueAtTime(-28, audioContext.currentTime);
    compressor.knee.setValueAtTime(18, audioContext.currentTime);
    compressor.ratio.setValueAtTime(10, audioContext.currentTime);
    compressor.attack.setValueAtTime(0.006, audioContext.currentTime);
    compressor.release.setValueAtTime(0.16, audioContext.currentTime);
    masterGain.connect(compressor);
    compressor.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function getSafeStartTime(delay = 0) {
  const context = getAudioContext();
  return context.currentTime + delay;
}

function playTone(frequency, startTime, duration, volume = 0.045, type = "sine") {
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

function vibrate(pattern = 18) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function setRunningVolume(target, rampMs = 280) {
  if (!runningAudio) {
    return;
  }

  if (runningFadeTimer) {
    clearTimeout(runningFadeTimer);
    runningFadeTimer = null;
  }

  const start = runningAudio.volume;
  const end = Math.max(0, Math.min(0.22, target));
  const steps = 12;
  const stepMs = Math.max(16, Math.round(rampMs / steps));
  let currentStep = 0;

  const tick = () => {
    currentStep += 1;
    const t = currentStep / steps;
    runningAudio.volume = start + (end - start) * t;
    if (currentStep < steps) {
      runningFadeTimer = setTimeout(tick, stepMs);
    } else {
      runningFadeTimer = null;
    }
  };

  tick();
}

async function startRunningSound(isStartup = false) {
  if (!runningAudio) {
    return;
  }

  if (isStartup) {
    runningAudio.currentTime = 0;
    runningLoopReady = false;
  } else if (runningAudio.currentTime < RUNNING_LOOP_START && runningLoopReady) {
    runningAudio.currentTime = RUNNING_LOOP_START;
  }

  runningAudio.loop = false;
  runningAudio.playbackRate = currentFan === 1 ? 0.96 : currentFan === 2 ? 1 : 1.04;
  if (runningAudio.paused || isStartup) {
    runningAudio.volume = 0;
  }

  try {
    await runningAudio.play();
    setRunningVolume(runningVolumes[currentFan], isStartup ? 700 : 240);
  } catch {
    runningAudio.volume = 0;
  }
}

function stopRunningSound() {
  if (!runningAudio) {
    return;
  }

  setRunningVolume(0, 180);
  runningFadeTimer = setTimeout(() => {
    runningAudio.pause();
    runningLoopReady = false;
  }, 220);
}

function playPowerBeep(volumeScale = 1) {
  const now = getSafeStartTime();
  const volume = 0.045 * volumeScale;

  playTone(1040, now, 0.09, volume, "sine");
  playTone(1560, now + 0.01, 0.035, volume * 0.28, "triangle");
}

function playButtonClick(strength = 1) {
  const now = getSafeStartTime();
  const volume = 0.03 * strength;

  playTone(740, now, 0.04, volume, "sine");
}

function playSound(type) {
  const firstSound = !hasPlayedSound;
  hasPlayedSound = true;

  if (type === "power-on") {
    vibrate([28, 18, 36]);
    playPowerBeep(firstSound ? 0.55 : 1);
    startRunningSound(true);
    return;
  }

  if (type === "power-off") {
    vibrate([36, 18, 24]);
    playPowerBeep(firstSound ? 0.55 : 1);
    stopRunningSound();
    return;
  }

  if (type === "mode") {
    vibrate([18, 12, 18]);
    const now = getSafeStartTime();
    playTone(620, now, 0.045, 0.038, "sine");
    playTone(920, now + 0.045, 0.055, 0.036, "sine");
    return;
  }

  if (type === "fan") {
    vibrate([14, 10, 22]);
    const now = getSafeStartTime();
    const base = 520 + currentFan * 90;
    playTone(base, now, 0.045, 0.035, "sine");
    playTone(base + 130, now + 0.045, 0.05, 0.032, "sine");
    if (isPowerOn) {
      startRunningSound();
    }
    return;
  }

  vibrate(14);
  playButtonClick();
}

function updateUi() {
  app.dataset.power = isPowerOn ? "on" : "off";
  app.dataset.mode = currentMode;
  app.dataset.fan = String(currentFan);
  powerButton.setAttribute("aria-pressed", String(isPowerOn));

  displayMode.textContent = isPowerOn ? modeLabels[currentMode] : "待机";
  displayTemp.textContent = currentTemp;
  panelTemp.textContent = currentTemp;

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === currentMode);
  });

  updateHum();
}

function setTemperature(value) {
  currentTemp = Math.min(30, Math.max(16, value));
  tempRange.value = currentTemp;
  updateUi();
}

function setFan(value) {
  currentFan = Math.min(3, Math.max(1, value));
  fanRange.value = currentFan;
  if (!isPowerOn) {
    isPowerOn = true;
  }
  updateUi();
}

powerButton.addEventListener("click", () => {
  isPowerOn = !isPowerOn;
  playSound(isPowerOn ? "power-on" : "power-off");
  updateUi();
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const isModeChanged = currentMode !== button.dataset.mode;
    currentMode = button.dataset.mode;
    isPowerOn = true;
    startRunningSound(!runningAudio || runningAudio.paused);
    playSound(isModeChanged ? "mode" : "tap");
    updateUi();
  });
});

tempRange.addEventListener("input", (event) => {
  playSound("tap");
  setTemperature(Number(event.target.value));
});

fanRange.addEventListener("input", (event) => {
  setFan(Number(event.target.value));
  playSound("fan");
});

tempDown.addEventListener("click", () => {
  playSound("tap");
  setTemperature(currentTemp - 1);
});

tempUp.addEventListener("click", () => {
  playSound("tap");
  setTemperature(currentTemp + 1);
});

if (runningAudio) {
  runningAudio.addEventListener("timeupdate", () => {
    if (runningAudio.currentTime >= RUNNING_LOOP_START) {
      runningLoopReady = true;
    }

    if (
      isPowerOn &&
      runningLoopReady &&
      Number.isFinite(runningAudio.duration) &&
      runningAudio.duration > RUNNING_LOOP_START + LOOP_GUARD_SECONDS &&
      runningAudio.currentTime >= runningAudio.duration - LOOP_GUARD_SECONDS &&
      !isSeekingLoop
    ) {
      isSeekingLoop = true;
      runningAudio.currentTime = RUNNING_LOOP_START;
      setTimeout(() => {
        isSeekingLoop = false;
      }, 80);
    }
  });

  runningAudio.addEventListener("ended", () => {
    if (!isPowerOn) {
      return;
    }

    runningAudio.currentTime = RUNNING_LOOP_START;
    isSeekingLoop = false;
    runningAudio.play().catch(() => {
      runningAudio.volume = 0;
    });
  });
}

updateUi();
